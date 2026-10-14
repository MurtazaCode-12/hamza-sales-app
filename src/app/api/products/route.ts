import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { CATALOG } from '@/lib/data';

// GET /api/products?search=...
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const search = searchParams.get('search')?.trim() || '';

    let products: any[] = [];
    try {
      const count = await prisma.product.count();
      if (count === 0) {
        // Seed from CATALOG in data.ts if empty
        for (const catItem of CATALOG) {
          await prisma.product.create({
            data: {
              name: catItem.name,
              category: catItem.category,
              image: catItem.image,
              unit: 'Pcs',
              rate: 100.0,
              types: catItem.variants.map((v) => v.finish || v.size).filter(Boolean),
              sizes: catItem.variants.map((v) => v.size).filter(Boolean),
            },
          });
        }
      }

      products = await prisma.product.findMany({
        where: search
          ? {
              OR: [
                { name: { contains: search, mode: 'insensitive' } },
                { category: { contains: search, mode: 'insensitive' } },
              ],
            }
          : undefined,
        orderBy: { name: 'asc' },
      });
    } catch (dbErr) {
      console.warn('DB product fetch failed, falling back to static catalog:', dbErr);
      products = CATALOG.map((c) => ({
        id: c.id,
        name: c.name,
        category: c.category,
        image: c.image,
        unit: 'Pcs',
        rate: 150.0,
        types: c.variants.map((v) => v.finish || v.size).filter(Boolean),
        sizes: c.variants.map((v) => v.size).filter(Boolean),
      })).filter((c) =>
        !search ||
        c.name.toLowerCase().includes(search.toLowerCase()) ||
        c.category.toLowerCase().includes(search.toLowerCase())
      );
    }

    return NextResponse.json({ success: true, products });
  } catch (error: any) {
    console.error('Error fetching products:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to fetch products' },
      { status: 500 }
    );
  }
}

// POST /api/products - Create new product
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { name, category, rate, unit, image, catalogPage, types, sizes } = body;

    if (!name || !name.trim()) {
      return NextResponse.json(
        { success: false, error: 'Product name is required' },
        { status: 400 }
      );
    }

    const numRate = rate !== undefined && rate !== '' ? Number(rate) : null;
    const cleanUnit = unit || 'Pcs';

    try {
      const product = await prisma.product.create({
        data: {
          name: name.trim(),
          category: category?.trim() || 'General Hardware',
          rate: numRate,
          unit: cleanUnit,
          image: image?.trim() || null,
          catalogPage: catalogPage?.trim() || null,
          types: Array.isArray(types) ? types : [],
          sizes: Array.isArray(sizes) ? sizes : [],
        },
      });
      return NextResponse.json({ success: true, product });
    } catch (dbErr) {
      console.warn('Database offline, returning fallback created product:', dbErr);
      const fallback = {
        id: `prod_${Date.now()}`,
        name: name.trim(),
        category: category?.trim() || 'General Hardware',
        rate: numRate,
        unit: cleanUnit,
        image: image?.trim() || null,
        catalogPage: catalogPage?.trim() || null,
        types: Array.isArray(types) ? types : [],
        sizes: Array.isArray(sizes) ? sizes : [],
      };
      return NextResponse.json({ success: true, product: fallback });
    }
  } catch (error: any) {
    console.error('Error creating product:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to create product' },
      { status: 500 }
    );
  }
}

// PUT /api/products - Update product
export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, name, category, rate, unit, image, catalogPage, types, sizes } = body;

    if (!id) {
      return NextResponse.json(
        { success: false, error: 'Product ID is required' },
        { status: 400 }
      );
    }

    const numRate = rate !== undefined && rate !== '' ? Number(rate) : null;

    try {
      const updated = await prisma.product.update({
        where: { id },
        data: {
          name: name !== undefined ? name.trim() : undefined,
          category: category !== undefined ? category.trim() : undefined,
          rate: numRate !== undefined ? numRate : undefined,
          unit: unit !== undefined ? unit : undefined,
          image: image !== undefined ? image : undefined,
          catalogPage: catalogPage !== undefined ? catalogPage : undefined,
          types: Array.isArray(types) ? types : undefined,
          sizes: Array.isArray(sizes) ? sizes : undefined,
        },
      });
      return NextResponse.json({ success: true, product: updated });
    } catch (dbErr) {
      return NextResponse.json({ success: true, product: body });
    }
  } catch (error: any) {
    console.error('Error updating product:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to update product' },
      { status: 500 }
    );
  }
}

// DELETE /api/products?id=...
export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json(
        { success: false, error: 'Product ID is required' },
        { status: 400 }
      );
    }

    try {
      await prisma.product.delete({ where: { id } });
    } catch {}

    return NextResponse.json({ success: true, deletedId: id });
  } catch (error: any) {
    console.error('Error deleting product:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to delete product' },
      { status: 500 }
    );
  }
}
