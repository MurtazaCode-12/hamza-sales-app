import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import prisma from '@/lib/prisma';
import { getDefaultGeminiKey } from '@/lib/geminiKey';
import { repairAndParseJsonArray } from '@/lib/jsonRepair';
import {
  ExtractedCatalogItem,
  matchExtractedHierarchy,
  calculatePriceVariance,
  normalizeKey,
} from '@/lib/rateSyncUtils';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Structured Output Schema for Gemini 1.5 Flash / Pro
 */
const DOCUMENT_EXTRACTION_SCHEMA = {
  type: 'ARRAY',
  description: 'A list of all products, categories, and their specific variants and prices from the price sheet.',
  items: {
    type: 'OBJECT',
    properties: {
      category_name: {
        type: 'STRING',
        description: 'Header, category title, or section name (e.g., Locks, Hinges, Hardware).',
      },
      product_name: {
        type: 'STRING',
        description: 'The main product title (e.g., "CYCLE LOCK", "PAD LOCK", "SS BUTT HINGE").',
      },
      variants: {
        type: 'ARRAY',
        description: 'List of specific variants, types, finishes, sizes, or weights and their rates.',
        items: {
          type: 'OBJECT',
          properties: {
            variant_name: {
              type: 'STRING',
              description: 'Variant name, model, finish, or type (e.g., "Standard", "Heavy", "ALTO", "CP", "50mm").',
            },
            size: {
              type: 'STRING',
              description: 'Size or specification if present (e.g., "25mm", "3 inch", "75mm").',
            },
            rate: {
              type: 'NUMBER',
              description: 'The exact numeric wholesale rate/price associated with this variant.',
            },
          },
          required: ['variant_name', 'rate'],
        },
      },
    },
    required: ['product_name', 'variants'],
  },
};

const SYSTEM_PROMPT = `You are an expert catalog and price list digitizer. Read and understand the entire document layout, including tables, multi-column price tiers, headers, and sub-items. For every single item in this price sheet, extract:

category_name (optional header or section title)

product_name (the main title, e.g., "CYCLE LOCK", "PAD LOCK")

variants: an array of objects containing variant_name (e.g., "Standard", "Heavy", "50mm"), size/spec (if present), and rate (the numeric price associated with it).
Ensure that rates directly correspond to the exact horizontal row/column cell alignment in the table.`;

export async function POST(req: NextRequest) {
  try {
    const contentType = req.headers.get('content-type') || '';

    // Check for JSON action: "confirm_review_items"
    if (contentType.includes('application/json')) {
      const body = await req.json();

      if (body.action === 'sync_deterministic_rows' || body.action === 'confirm_review_items') {
        const items = body.rows || body.items || [];
        if (!Array.isArray(items) || items.length === 0) {
          return NextResponse.json({ success: false, error: 'No items to sync' }, { status: 400 });
        }

        let updatedCount = 0;

        for (const item of items) {
          const { productId, hotspotId, variantKey, rate, aliasToAdd } = item;
          const numRate = Number(rate);
          if (isNaN(numRate) || numRate <= 0) continue;

          // 1. Update Product table
          if (productId) {
            try {
              const currentProd = await prisma.product.findUnique({
                where: { id: productId },
                select: { aliases: true, name: true },
              });

              let updatedAliases = currentProd?.aliases || [];
              if (aliasToAdd && typeof aliasToAdd === 'string') {
                const cleanAlias = aliasToAdd.trim();
                const cleanLower = cleanAlias.toLowerCase();
                const existingLowers = (currentProd?.aliases || []).map((a) => a.toLowerCase().trim());
                if (
                  cleanLower.length >= 2 &&
                  cleanLower !== (currentProd?.name || '').toLowerCase().trim() &&
                  !existingLowers.includes(cleanLower)
                ) {
                  updatedAliases = [...updatedAliases, cleanAlias];
                }
              }

              await prisma.product.update({
                where: { id: productId },
                data: {
                  rate: numRate,
                  aliases: updatedAliases,
                },
              });
              updatedCount++;
            } catch (pErr) {
              console.warn(`Could not update product ${productId}:`, pErr);
            }
          }

          // 2. Update CatalogHotspot table
          if (hotspotId) {
            try {
              const hotspot = await prisma.catalogHotspot.findUnique({
                where: { id: hotspotId },
              });
              if (hotspot) {
                let priceMap: Record<string, number> = {};
                if (hotspot.price) {
                  const trimmed = hotspot.price.trim();
                  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
                    try {
                      priceMap = JSON.parse(trimmed);
                    } catch {}
                  } else {
                    const existingFlat = parseFloat(hotspot.price);
                    if (!isNaN(existingFlat)) priceMap.default = existingFlat;
                  }
                }
                const vKey = variantKey || 'Standard';
                priceMap[vKey] = numRate;
                if (!priceMap.default) priceMap.default = numRate;

                await prisma.catalogHotspot.update({
                  where: { id: hotspotId },
                  data: { price: JSON.stringify(priceMap) },
                });
              }
            } catch (hErr) {
              console.warn(`Could not update hotspot ${hotspotId}:`, hErr);
            }
          }
        }

        revalidatePath('/');
        revalidatePath('/products');
        revalidatePath('/studio');

        return NextResponse.json({ success: true, updatedCount });
      }
    }

    // Otherwise, handle 2-phase PDF Extraction & Sync
    let buffer: Buffer | null = null;
    let mimeType = 'application/pdf';
    let clientApiKey = '';

    if (contentType.includes('multipart/form-data')) {
      const formData = await req.formData();
      const file = formData.get('file') as File | null;
      clientApiKey = (formData.get('apiKey') as string) || '';

      if (!file) {
        return NextResponse.json({ success: false, error: 'No price list file provided' }, { status: 400 });
      }

      const lowerName = file.name.toLowerCase();
      if (lowerName.endsWith('.pdf')) mimeType = 'application/pdf';
      else if (lowerName.endsWith('.png')) mimeType = 'image/png';
      else if (lowerName.endsWith('.jpg') || lowerName.endsWith('.jpeg')) mimeType = 'image/jpeg';
      else if (lowerName.endsWith('.webp')) mimeType = 'image/webp';

      const arrayBuffer = await file.arrayBuffer();
      buffer = Buffer.from(arrayBuffer);
    } else if (contentType.includes('application/json')) {
      const body = await req.json();
      clientApiKey = body.apiKey || '';
      if (body.fileBase64) {
        buffer = Buffer.from(body.fileBase64, 'base64');
        mimeType = body.mimeType || 'application/pdf';
      }
    }

    if (!buffer || buffer.length === 0) {
      return NextResponse.json({ success: false, error: 'Empty file payload received' }, { status: 400 });
    }

    const apiKey = clientApiKey || getDefaultGeminiKey();
    if (!apiKey) {
      return NextResponse.json(
        { success: false, error: 'Gemini API key is required to scan price lists' },
        { status: 401 }
      );
    }

    // ==========================================
    // PHASE 1: Full Document Understanding (Gemini File / Multimodal)
    // ==========================================
    const base64Data = buffer.toString('base64');

    const geminiPayload = {
      contents: [
        {
          parts: [
            {
              inlineData: {
                mimeType,
                data: base64Data,
              },
            },
            {
              text: `${SYSTEM_PROMPT}\n\nReturn the complete extracted catalog and all pricing as a strict JSON array following the provided schema.`,
            },
          ],
        },
      ],
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: DOCUMENT_EXTRACTION_SCHEMA,
        temperature: 0.1,
        maxOutputTokens: 8192,
      },
    };

    const modelEndpoints = [
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent?key=${apiKey}`,
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent?key=${apiKey}`,
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${apiKey}`,
    ];

    let extractedList: ExtractedCatalogItem[] = [];
    let rawApiResponseText = '';

    for (const url of modelEndpoints) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 45000);

        const gRes = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(geminiPayload),
          signal: controller.signal,
        });
        clearTimeout(timeoutId);

        if (gRes.ok) {
          const gData = await gRes.json();
          const textPart = gData.candidates?.[0]?.content?.parts?.[0]?.text;
          if (textPart) {
            rawApiResponseText = textPart;
            const parsed = repairAndParseJsonArray(textPart);
            if (Array.isArray(parsed) && parsed.length > 0) {
              extractedList = parsed;
              break;
            }
          }
        } else {
          const errBody = await gRes.text();
          console.warn(`Gemini call to ${url.split('?')[0]} failed (${gRes.status}):`, errBody);
          if (gRes.status === 429 || gRes.status === 401 || gRes.status === 403) {
            break;
          }
        }
      } catch (endpointErr: any) {
        console.warn('Gemini endpoint error, trying next fallback:', endpointErr.message);
      }
    }

    if (!Array.isArray(extractedList) || extractedList.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: 'Could not extract structured products or prices from this PDF document.',
          rawResponse: rawApiResponseText.slice(0, 500),
        },
        { status: 422 }
      );
    }

    // ==========================================
    // PHASE 2: Sync & Update against Supabase
    // ==========================================
    // Pre-fetch all products and hotspots
    const [existingProducts, existingHotspots] = await Promise.all([
      prisma.product.findMany({
        select: { id: true, name: true, category: true, rate: true, types: true, sizes: true },
      }),
      prisma.catalogHotspot.findMany({
        select: { id: true, name: true, price: true, types: true, sizes: true },
      }),
    ]);

    // Match hierarchy and test 50% price variance
    const { autoUpdateItems, reviewItems } = matchExtractedHierarchy(
      extractedList,
      existingProducts,
      existingHotspots
    );

    // Apply auto-updates to Supabase
    // Group updates by hotspotId and productId
    const hotspotUpdates = new Map<string, Record<string, number>>();
    const productBaseUpdates = new Map<string, number>();

    for (const item of autoUpdateItems) {
      if (item.matchedHotspotId) {
        const currentMap = hotspotUpdates.get(item.matchedHotspotId) || {};
        currentMap[item.matchedVariantKey] = item.newRate;
        if (!currentMap.default) currentMap.default = item.newRate;
        hotspotUpdates.set(item.matchedHotspotId, currentMap);
      }

      if (item.matchedProductId) {
        // If product has no variants or this is the first variant, set base rate
        productBaseUpdates.set(item.matchedProductId, item.newRate);
      }
    }

    // Execute bulk updates in Supabase
    let autoUpdatedCount = 0;

    // 1. Bulk update hotspots
    for (const [hotspotId, priceMap] of hotspotUpdates.entries()) {
      try {
        const existing = existingHotspots.find((h) => h.id === hotspotId);
        let merged = { ...priceMap };
        if (existing?.price) {
          const trimmed = existing.price.trim();
          if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
            try {
              merged = { ...JSON.parse(trimmed), ...merged };
            } catch {}
          }
        }

        await prisma.catalogHotspot.update({
          where: { id: hotspotId },
          data: { price: JSON.stringify(merged) },
        });
        autoUpdatedCount += Object.keys(priceMap).length;
      } catch (err) {
        console.warn(`Failed to update hotspot ${hotspotId}:`, err);
      }
    }

    // 2. Bulk update products
    for (const [productId, rate] of productBaseUpdates.entries()) {
      try {
        await prisma.product.update({
          where: { id: productId },
          data: { rate },
        });
      } catch (err) {
        console.warn(`Failed to update product ${productId}:`, err);
      }
    }

    revalidatePath('/');
    revalidatePath('/products');
    revalidatePath('/studio');

    return NextResponse.json({
      success: true,
      autoUpdatedCount,
      totalScannedProducts: extractedList.length,
      totalScannedVariants: autoUpdateItems.length + reviewItems.length,
      reviewItems: reviewItems.map((r, idx) => ({
        id: `rev-${idx}-${Date.now()}`,
        productName: r.extractedProduct.product_name,
        variantName: r.extractedVariant.variant_name,
        size: r.extractedVariant.size || '',
        variantKey: r.matchedVariantKey,
        currentRate: r.currentRate,
        extractedRate: r.newRate,
        variancePercent: r.variance.variancePercent,
        reason: r.variance.reason,
        description: r.variance.description,
        matchedProductId: r.matchedProductId,
        matchedHotspotId: r.matchedHotspotId,
      })),
    });
  } catch (error: any) {
    console.error('2-phase sync-rates fatal error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to execute rate sync pipeline' },
      { status: 500 }
    );
  }
}
