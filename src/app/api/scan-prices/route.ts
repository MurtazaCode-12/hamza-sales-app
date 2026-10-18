import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import prisma from '@/lib/prisma';
import { extractTextFromPdf } from '@/lib/pdfHelper';
import { getDefaultGeminiKey } from '@/lib/geminiKey';
import { repairAndParseJsonArray } from '@/lib/jsonRepair';
import {
  normalizeProductName,
  isValidPositiveRate,
  findMatchingProduct,
  findMatchingHotspots,
} from '@/lib/productMatcher';

export const maxDuration = 60; // 60 seconds execution limit

interface ExtractedPriceItem {
  name: string;
  matchedCatalogName?: string | null;
  rate: number;
  unit?: string;
  category?: string;
  size?: string | null;
  type?: string | null;
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const clientApiKey = formData.get('apiKey') as string | null;

    if (!file) {
      return NextResponse.json(
        { success: false, error: 'No price list file provided' },
        { status: 400 }
      );
    }

    const apiKey = clientApiKey || getDefaultGeminiKey();
    if (!apiKey) {
      return NextResponse.json(
        {
          success: false,
          error: 'MISSING_API_KEY',
          message: 'Gemini API key is required to scan price lists.',
        },
        { status: 401 }
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    if (buffer.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Uploaded file is empty' },
        { status: 400 }
      );
    }

    // Determine MIME type
    let mimeType = file.type || 'application/pdf';
    const lowerName = file.name.toLowerCase();
    if (lowerName.endsWith('.pdf')) mimeType = 'application/pdf';
    else if (lowerName.endsWith('.png')) mimeType = 'image/png';
    else if (lowerName.endsWith('.jpg') || lowerName.endsWith('.jpeg')) mimeType = 'image/jpeg';
    else if (lowerName.endsWith('.webp')) mimeType = 'image/webp';

    // Fetch existing catalog hotspots so Gemini can match names intelligently
    let existingHotspots: any[] = [];
    try {
      existingHotspots = await prisma.catalogHotspot.findMany({
        select: { id: true, name: true, types: true, sizes: true, price: true },
      });
    } catch (err) {
      console.warn('Could not load existing hotspots for matching:', err);
    }

    const catalogContextSnippet = existingHotspots.slice(0, 60).map((h) => ({
      name: h.name,
      types: h.types || [],
      sizes: h.sizes || [],
    }));

    const prompt = `You are an expert price-list parser for hardware, locks, hinges, building materials, and architectural fittings.
Analyze this entire price list document thoroughly.
Extract EVERY product, item, variant, size, packaging unit, and its wholesale price / rate.

CRITICAL INSTRUCTIONS FOR PRODUCT NAMES AND PRICES:
1. The PDF text may have spatial formatting issues. Product names (like "CYCLE LOCK") and their numeric prices (like "51.00") might appear on separate lines, have large gaps between them, or be separated by underscores/dashes. Carefully associate the correct price to the nearest preceding product name.
2. Standard packaging units must be mapped to one of: "Packet", "Pcs", "Box", "Dozen", "Set" (default to "Pcs" if not stated).
3. "rate" must be a positive number in INR (e.g. 51.00, 65, 120, 280.50). Remove currency symbols like Rs, ₹, /-, etc.
   NEVER set a rate of 0 or 0.00 if a price or number is printed near or associated with the product name.
4. Normalize product names to clean title case (e.g. "CYCLE LOCK" -> "Cycle Lock"), and set "matchedCatalogName" to the best matching known product from our catalog.
5. If a product has multiple size dimensions (e.g., 25mm, 35mm, 45mm, 50mm, 60mm, 70mm, 3 inch, 4 inch), extract a separate entry for each size with its specific rate.
6. If a product has a type/finish (e.g., ALTO, RECO, Ultra Key, Regular, Brass, Antique), extract it into "type".

Known products currently in our catalog:
${JSON.stringify(catalogContextSnippet, null, 2)}

Return ONLY a valid JSON array of objects with this exact schema:
[
  {
    "name": "Cycle Lock",
    "matchedCatalogName": "Cycle Lock",
    "rate": 51.0,
    "unit": "Pcs",
    "category": "Locks",
    "size": "",
    "type": ""
  }
]`;

    let parsedItems: ExtractedPriceItem[] = [];

    // --- STEP 1: Attempt native multimodal document understanding with Gemini ---
    const base64Data = buffer.toString('base64');
    const multimodalPayload = {
      contents: [
        {
          parts: [
            {
              inlineData: {
                mimeType: mimeType,
                data: base64Data,
              },
            },
            { text: prompt },
          ],
        },
      ],
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: 0.1,
        maxOutputTokens: 8192,
      },
    };

    const modelEndpoints = [
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent?key=${apiKey}`,
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-lite-latest:generateContent?key=${apiKey}`,
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent?key=${apiKey}`,
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${apiKey}`,
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${apiKey}`,
    ];

    for (const url of modelEndpoints) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 8000); // 8s timeout per model

        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(multimodalPayload),
          signal: controller.signal,
        });
        clearTimeout(timeoutId);

        if (response.ok) {
          const geminiData = await response.json();
          const rawContent = geminiData.candidates?.[0]?.content?.parts?.[0]?.text;
          if (rawContent) {
            const items = repairAndParseJsonArray(rawContent);
            if (Array.isArray(items) && items.length > 0) {
              parsedItems = items;
              break; // Success!
            }
          }
        } else {
          const errText = await response.text();
          console.warn(`Gemini multimodal attempt failed at ${url.split('?')[0]}:`, response.status, errText);
          if (response.status === 429) break;
        }
      } catch (callErr) {
        console.warn('Multimodal call error:', callErr);
      }
    }

    // --- STEP 2: Fallback to text extraction if multimodal returned 0 items ---
    if (!Array.isArray(parsedItems) || parsedItems.length === 0) {
      try {
        const extractedText = await extractTextFromPdf(buffer);
        if (extractedText && extractedText.trim().length > 20) {
          const textPayload = {
            contents: [
              {
                parts: [
                  {
                    text: `${prompt}\n\nDocument Text Content:\n${extractedText.slice(0, 30000)}`,
                  },
                ],
              },
            ],
            generationConfig: {
              responseMimeType: 'application/json',
              temperature: 0.1,
              maxOutputTokens: 8192,
            },
          };

          for (const url of modelEndpoints) {
            try {
              const controller = new AbortController();
              const timeoutId = setTimeout(() => controller.abort(), 8000);

              const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(textPayload),
                signal: controller.signal,
              });
              clearTimeout(timeoutId);

              if (response.ok) {
                const data = await response.json();
                const rawContent = data.candidates?.[0]?.content?.parts?.[0]?.text;
                if (rawContent) {
                  const items = repairAndParseJsonArray(rawContent);
                  if (Array.isArray(items) && items.length > 0) {
                    parsedItems = items;
                    break;
                  }
                }
              }
            } catch {}
          }
        }
      } catch (textErr) {
        console.warn('Text fallback failed:', textErr);
      }
    }

    if (!Array.isArray(parsedItems)) {
      if ((parsedItems as any)?.products && Array.isArray((parsedItems as any).products)) {
        parsedItems = (parsedItems as any).products;
      } else {
        parsedItems = [];
      }
    }

    const warnings: string[] = [];

    // --- STEP 3: Upsert into Product table with Case-Insensitive Matching & 0.00 Failsafe ---
    const existingProducts = await prisma.product.findMany({
      select: { id: true, name: true, category: true, rate: true, unit: true, sizes: true, types: true },
    });

    const productsToUpdate: { id: string; rate: number; unit: string; category: string }[] = [];
    const newProducts: any[] = [];
    const processedProductIds = new Set<string>();
    const processedNewNames = new Set<string>();
    const successfullyMatchedItems: ExtractedPriceItem[] = [];

    for (const item of parsedItems) {
      if (!item || !item.name || typeof item.name !== 'string') {
        warnings.push('Skipped item with missing or invalid product name.');
        continue;
      }

      const rawName = item.name.trim();
      const hasValidRate = isValidPositiveRate(item.rate);
      const numRate = hasValidRate ? Number(item.rate) : 0;
      const unit = item.unit || 'Pcs';
      const category = item.category || 'Hardware';

      // 1. Case-Insensitive Match against existing products
      const matchedProduct = findMatchingProduct(item, existingProducts);

      if (matchedProduct) {
        if (!hasValidRate) {
          // Failsafe: DO NOT set rate to 0.00! Keep existing database rate
          const existingRateDisplay = matchedProduct.rate != null ? `₹${matchedProduct.rate}` : 'unset';
          warnings.push(
            `Product "${matchedProduct.name}" (matched from "${rawName}"): Rate could not be parsed or was 0.00 (received: "${item.rate}"). Preserved existing rate (${existingRateDisplay}).`
          );
        } else {
          // Valid positive rate -> Update
          if (!processedProductIds.has(matchedProduct.id)) {
            processedProductIds.add(matchedProduct.id);
            productsToUpdate.push({
              id: matchedProduct.id,
              rate: numRate,
              unit: unit || matchedProduct.unit || 'Pcs',
              category: item.category || matchedProduct.category || 'Hardware',
            });
            successfullyMatchedItems.push({ ...item, rate: numRate });
          }
        }
      } else {
        // Product is not yet in the products table
        if (!hasValidRate) {
          // Failsafe: DO NOT insert new product with 0.00 rate!
          warnings.push(
            `Product "${rawName}": Not found in database and extracted rate was 0.00 or missing (received: "${item.rate}"). Skipped.`
          );
        } else {
          const normKey = normalizeProductName(rawName);
          if (!processedNewNames.has(normKey)) {
            processedNewNames.add(normKey);
            newProducts.push({
              name: rawName,
              rate: numRate,
              unit: unit,
              category: category,
              sizes: item.size ? [item.size] : [],
              types: item.type ? [item.type] : [],
            });
            successfullyMatchedItems.push({ ...item, rate: numRate });
            warnings.push(
              `Product "${rawName}": Not found in existing products table. Created as new catalog product with rate ₹${numRate}.`
            );
          }
        }
      }
    }

    if (productsToUpdate.length > 0) {
      const valuesSql = productsToUpdate
        .map(
          (p) =>
            `('${p.id}', ${Number(p.rate)}, '${p.unit.replace(/'/g, "''")}', '${p.category.replace(/'/g, "''")}')`
        )
        .join(', ');
      await prisma.$executeRawUnsafe(
        `UPDATE "Product" AS p SET rate = v.rate::float8, unit = v.unit, category = v.category FROM (VALUES ${valuesSql}) AS v(id, rate, unit, category) WHERE p.id = v.id;`
      );
    }

    if (newProducts.length > 0) {
      await prisma.product.createMany({ data: newProducts, skipDuplicates: true });
    }

    // --- STEP 4: Intelligently update CatalogHotspot records case-insensitively ---
    let updatedHotspotsCount = 0;
    const hotspotsToUpdate: { id: string; price: string }[] = [];

    for (const hotspot of existingHotspots) {
      // Find all successfully extracted items that match this hotspot case-insensitively
      const matchingItems = successfullyMatchedItems.filter((item) => {
        const matchingHotspots = findMatchingHotspots(item, [hotspot]);
        return matchingHotspots.length > 0;
      });

      if (matchingItems.length > 0) {
        let priceStr = '';

        if (matchingItems.length === 1 && !matchingItems[0].size) {
          // Single flat price
          priceStr = String(matchingItems[0].rate);
        } else {
          // Variant price map
          const priceMap: Record<string, number> = {};
          matchingItems.forEach((m) => {
            if (m.size) priceMap[m.size] = Number(m.rate);
            if (m.type) priceMap[m.type] = Number(m.rate);
          });
          // Default fallback rate
          priceMap.default = Number(matchingItems[0].rate);
          priceStr = JSON.stringify(priceMap);
        }

        // Failsafe: Never set price to empty string or '0'
        if (priceStr && priceStr !== '0' && priceStr !== '0.00' && priceStr !== hotspot.price) {
          hotspotsToUpdate.push({ id: hotspot.id, price: priceStr });
        }
      }
    }

    if (hotspotsToUpdate.length > 0) {
      const valuesSql = hotspotsToUpdate
        .map((h) => `('${h.id}', '${h.price.replace(/'/g, "''")}')`)
        .join(', ');
      await prisma.$executeRawUnsafe(
        `UPDATE "CatalogHotspot" AS h SET price = v.price FROM (VALUES ${valuesSql}) AS v(id, price) WHERE h.id = v.id;`
      );
      updatedHotspotsCount = hotspotsToUpdate.length;
    }

    // Revalidate cached paths
    try {
      revalidatePath('/');
      revalidatePath('/products');
      revalidatePath('/studio');
    } catch {}

    return NextResponse.json({
      success: true,
      scannedCount: parsedItems.length,
      updatedCount: productsToUpdate.length + updatedHotspotsCount,
      warnings: warnings,
      Warnings: warnings, // Provided for case-insensitive client access
      products: successfullyMatchedItems.map((it) => ({
        name: it.name,
        rate: Number(it.rate),
        unit: it.unit || 'Pcs',
        category: it.category || 'Hardware',
        size: it.size || undefined,
        type: it.type || undefined,
      })),
    });
  } catch (error: any) {
    console.error('Scan prices fatal error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to scan price list' },
      { status: 500 }
    );
  }
}
