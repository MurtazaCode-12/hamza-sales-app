import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import prisma from '@/lib/prisma';
import { extractTextFromPdf } from '@/lib/pdfHelper';
import { getDefaultGeminiKey } from '@/lib/geminiKey';

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

Rules:
1. Standard packaging units must be mapped to one of: "Packet", "Pcs", "Box", "Dozen", "Set" (default to "Pcs" if not stated).
2. "rate" must be a positive number in INR (e.g. 65, 120, 280.50). Remove currency symbols like Rs, ₹, /-, etc.
3. Match each item to the closest product from our catalog database if applicable.
4. If a product has multiple size dimensions (e.g., 25mm, 35mm, 45mm, 50mm, 60mm, 70mm, 3 inch, 4 inch), extract a separate entry for each size with its specific rate.
5. If a product has a type/finish (e.g., ALTO, RECO, Ultra Key, Regular, Brass, Antique), extract it into "type".

Known products currently in our catalog:
${JSON.stringify(catalogContextSnippet, null, 2)}

Return ONLY a valid JSON array of objects with this exact schema:
[
  {
    "name": "Pad Lock",
    "matchedCatalogName": "Pad Lock",
    "rate": 65,
    "unit": "Pcs",
    "category": "Locks",
    "size": "25mm",
    "type": "ALTO"
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
      },
    };

    const modelEndpoints = [
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-lite-latest:generateContent?key=${apiKey}`,
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent?key=${apiKey}`,
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${apiKey}`,
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
    ];

    for (const url of modelEndpoints) {
      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(multimodalPayload),
        });

        if (response.ok) {
          const geminiData = await response.json();
          const rawContent = geminiData.candidates?.[0]?.content?.parts?.[0]?.text;
          if (rawContent) {
            try {
              parsedItems = JSON.parse(rawContent);
            } catch {
              const cleaned = rawContent.replace(/```json/g, '').replace(/```/g, '').trim();
              parsedItems = JSON.parse(cleaned);
            }
            if (Array.isArray(parsedItems) && parsedItems.length > 0) {
              break; // Success!
            }
          }
        } else {
          const errText = await response.text();
          console.warn(`Gemini multimodal attempt failed at ${url.split('?')[0]}:`, response.status, errText);
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
            },
          };

          for (const url of modelEndpoints) {
            try {
              const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(textPayload),
              });
              if (response.ok) {
                const data = await response.json();
                const rawContent = data.candidates?.[0]?.content?.parts?.[0]?.text;
                if (rawContent) {
                  try {
                    parsedItems = JSON.parse(rawContent);
                  } catch {
                    const cleaned = rawContent.replace(/```json/g, '').replace(/```/g, '').trim();
                    parsedItems = JSON.parse(cleaned);
                  }
                  if (Array.isArray(parsedItems) && parsedItems.length > 0) {
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

    // Filter valid items with numeric rates
    const validItems = parsedItems.filter(
      (it) => it && it.name && !isNaN(Number(it.rate)) && Number(it.rate) > 0
    );

    if (validItems.length === 0) {
      return NextResponse.json({
        success: false,
        error: 'No price rates could be detected in this document. Please check the file and try again.',
        scannedCount: 0,
        updatedCount: 0,
        products: [],
      });
    }

    // --- STEP 3: Upsert into Product table with single bulk SQL query ---
    const existingProducts = await prisma.product.findMany({
      select: { id: true, name: true, category: true, rate: true, unit: true },
    });
    const prodMap = new Map<string, any>();
    for (const p of existingProducts) {
      prodMap.set(p.name.toLowerCase().trim(), p);
    }

    const productsToUpdate: { id: string; rate: number; unit: string; category: string }[] = [];
    const newProducts: any[] = [];
    const processedNames = new Set<string>();

    for (const item of validItems) {
      const numRate = Number(item.rate);
      const unit = item.unit || 'Pcs';
      const cleanName = item.name.trim();
      const lower = cleanName.toLowerCase();
      if (processedNames.has(lower)) continue;
      processedNames.add(lower);

      const existing = prodMap.get(lower);
      if (existing) {
        productsToUpdate.push({
          id: existing.id,
          rate: numRate,
          unit: unit || existing.unit || 'Pcs',
          category: item.category || existing.category || 'Hardware',
        });
      } else {
        newProducts.push({
          name: cleanName,
          rate: numRate,
          unit: unit,
          category: item.category || 'Hardware',
          sizes: item.size ? [item.size] : [],
          types: item.type ? [item.type] : [],
        });
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

    // --- STEP 4: Intelligently update CatalogHotspot records with single bulk SQL query ---
    let updatedHotspotsCount = 0;
    const hotspotsToUpdate: { id: string; price: string }[] = [];

    for (const hotspot of existingHotspots) {
      const hName = hotspot.name.toLowerCase().trim();
      const hTypes = (hotspot.types || []).map((t: string) => t.toLowerCase().trim());

      // Find all extracted items that match this hotspot
      const matches = validItems.filter((item) => {
        const iMatched = (item.matchedCatalogName || '').toLowerCase().trim();
        const iName = (item.name || '').toLowerCase().trim();

        // Direct name match or substring match
        const nameMatch =
          iMatched === hName ||
          iName === hName ||
          iName.includes(hName) ||
          hName.includes(iName);

        if (!nameMatch) return false;

        // If item specifies a finish/type and hotspot specifies types, check match
        if (item.type && hTypes.length > 0) {
          const iType = item.type.toLowerCase().trim();
          return hTypes.some((ht: string) => ht.includes(iType) || iType.includes(ht));
        }

        return true;
      });

      if (matches.length > 0) {
        let priceStr = '';

        if (matches.length === 1 && !matches[0].size) {
          // Single flat price
          priceStr = String(matches[0].rate);
        } else {
          // Variant price map
          const priceMap: Record<string, number> = {};
          matches.forEach((m) => {
            if (m.size) priceMap[m.size] = Number(m.rate);
            if (m.type) priceMap[m.type] = Number(m.rate);
          });
          // Default fallback rate
          priceMap.default = Number(matches[0].rate);
          priceStr = JSON.stringify(priceMap);
        }

        if (priceStr !== hotspot.price) {
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
      scannedCount: validItems.length,
      updatedCount: updatedHotspotsCount,
      products: validItems.map((it) => ({
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
