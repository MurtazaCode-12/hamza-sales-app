import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

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
    const body = await req.json();
    const items: ExtractedPriceItem[] = body?.items || [];

    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json(
        { success: false, error: 'No price items provided to sync' },
        { status: 400 }
      );
    }

    // Filter valid items
    const validItems = items.filter(
      (it) => it && it.name && !isNaN(Number(it.rate)) && Number(it.rate) > 0
    );

    if (validItems.length === 0) {
      return NextResponse.json(
        { success: false, error: 'No valid products with numeric rates were found.' },
        { status: 400 }
      );
    }

    // Step 1: Pre-fetch all products and hotspots in ONE parallel roundtrip
    const [existingProducts, existingHotspots] = await Promise.all([
      prisma.product.findMany({
        select: { id: true, name: true, category: true, rate: true, unit: true, sizes: true, types: true },
      }),
      prisma.catalogHotspot.findMany({
        select: { id: true, name: true, types: true, sizes: true, price: true },
      }),
    ]);

    // Build in-memory lookup map for products
    const prodMap = new Map<string, any>();
    for (const p of existingProducts) {
      prodMap.set(p.name.toLowerCase().trim(), p);
    }

    // Step 2: Bulk update existing products & insert new products
    const productsToUpdate: { id: string; rate: number; unit: string; category: string }[] = [];
    const newProducts: any[] = [];
    const processedProductNames = new Set<string>();

    for (const item of validItems) {
      const cleanName = item.name.trim();
      const lower = cleanName.toLowerCase();
      if (processedProductNames.has(lower)) continue;
      processedProductNames.add(lower);

      const existing = prodMap.get(lower);
      const numRate = Number(item.rate);
      const unit = item.unit || 'Pcs';
      const category = item.category || 'Hardware';

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
          category: category,
          sizes: item.size ? [item.size] : [],
          types: item.type ? [item.type] : [],
        });
      }
    }

    // Execute product updates in 1 single SQL query (takes <1s, uses 1 connection)
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

    // Step 3: Match & bulk update CatalogHotspots in 1 single SQL query
    let updatedHotspotsCount = 0;
    const hotspotsToUpdate: { id: string; price: string }[] = [];

    for (const hotspot of existingHotspots) {
      const hName = hotspot.name.toLowerCase().trim();
      const hTypes = (hotspot.types || []).map((t: string) => t.toLowerCase().trim());

      // Find all extracted items that match this hotspot
      const matches = validItems.filter((item) => {
        const iMatched = (item.matchedCatalogName || '').toLowerCase().trim();
        const iName = (item.name || '').toLowerCase().trim();

        const nameMatch =
          iMatched === hName ||
          iName === hName ||
          iName.includes(hName) ||
          hName.includes(iName);

        if (!nameMatch) return false;

        if (item.type && hTypes.length > 0) {
          const iType = item.type.toLowerCase().trim();
          return hTypes.some((ht: string) => ht.includes(iType) || iType.includes(ht));
        }

        return true;
      });

      if (matches.length > 0) {
        let priceStr = '';
        if (matches.length === 1 && !matches[0].size) {
          priceStr = String(matches[0].rate);
        } else {
          const priceMap: Record<string, number> = {};
          matches.forEach((m) => {
            if (m.size) priceMap[m.size] = Number(m.rate);
            if (m.type) priceMap[m.type] = Number(m.rate);
          });
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

    // Step 4: Revalidate caches
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
    console.error('Price sync database error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to sync prices to database' },
      { status: 500 }
    );
  }
}
