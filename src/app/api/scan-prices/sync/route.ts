import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import prisma from '@/lib/prisma';
import {
  normalizeProductName,
  isValidPositiveRate,
  findMatchingProduct,
  findMatchingHotspots,
} from '@/lib/productMatcher';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

interface ExtractedPriceItem {
  name: string;
  matchedCatalogName?: string | null;
  rate: number | string;
  unit?: string;
  category?: string;
  size?: string | null;
  type?: string | null;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const items: ExtractedPriceItem[] = body?.items || [];

    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json(
        { success: false, error: 'No price items provided to sync', warnings: [], Warnings: [] },
        { status: 400 }
      );
    }

    const warnings: string[] = [];

    // Step 1: Pre-fetch all products and hotspots in ONE parallel roundtrip
    const [existingProducts, existingHotspots] = await Promise.all([
      prisma.product.findMany({
        select: { id: true, name: true, category: true, rate: true, unit: true, sizes: true, types: true },
      }),
      prisma.catalogHotspot.findMany({
        select: { id: true, name: true, types: true, sizes: true, price: true },
      }),
    ]);

    // Step 2: Process items with Case-Insensitive Matching and 0.00 Failsafe
    const productsToUpdate: { id: string; rate: number; unit: string; category: string }[] = [];
    const newProducts: any[] = [];
    const processedProductIds = new Set<string>();
    const processedNewNames = new Set<string>();
    const successfullyMatchedItems: ExtractedPriceItem[] = [];

    for (const item of items) {
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

    // Execute product updates in 1 single SQL query (<1s)
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

    // Insert new products in 1 single bulk insert
    if (newProducts.length > 0) {
      await prisma.product.createMany({ data: newProducts, skipDuplicates: true });
    }

    // Step 3: Match & bulk update CatalogHotspots case-insensitively
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
          priceStr = String(matchingItems[0].rate);
        } else {
          const priceMap: Record<string, number> = {};
          matchingItems.forEach((m) => {
            if (m.size) priceMap[m.size] = Number(m.rate);
            if (m.type) priceMap[m.type] = Number(m.rate);
          });
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

    // Step 4: Revalidate caches
    try {
      revalidatePath('/');
      revalidatePath('/products');
      revalidatePath('/studio');
    } catch {}

    return NextResponse.json({
      success: true,
      scannedCount: items.length,
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
    console.error('Price sync database error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Failed to sync prices to database',
        warnings: [error.message || 'Database error occurred during sync.'],
        Warnings: [error.message || 'Database error occurred during sync.'],
      },
      { status: 500 }
    );
  }
}
