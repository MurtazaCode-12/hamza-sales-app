import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { revalidatePath } from 'next/cache';

// GET /api/hotspots?imageId=...
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const imageId = searchParams.get('imageId');

    if (imageId) {
      const hotspots = await prisma.catalogHotspot.findMany({
        where: { imageId },
        orderBy: { createdAt: 'asc' },
      });
      return NextResponse.json({ success: true, hotspots });
    }

    const hotspots = await prisma.catalogHotspot.findMany({
      orderBy: { createdAt: 'desc' },
    });
    return NextResponse.json({ success: true, hotspots });
  } catch (error: any) {
    console.error('Failed to get hotspots:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to fetch hotspots' },
      { status: 500 }
    );
  }
}

// POST /api/hotspots - Save single hotspot or batch hotspots
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // Check if batch save
    if (Array.isArray(body.hotspots)) {
      const created = [];
      for (const item of body.hotspots) {
        const h = await prisma.catalogHotspot.create({
          data: {
            imageId: item.imageId,
            name: item.name || 'Product',
            types: item.types || [],
            sizes: item.sizes || [],
            top: item.top,
            left: item.left,
            width: item.width,
            height: item.height,
            price: item.price || '',
          },
        });
        created.push(h);
      }
      revalidatePath('/');
      return NextResponse.json({ success: true, hotspots: created, count: created.length });
    }

    // Single hotspot save
    const { imageId, name, price, types, sizes, top, left, width, height } = body;

    if (!imageId || !name) {
      return NextResponse.json(
        { success: false, error: 'Missing required imageId or name' },
        { status: 400 }
      );
    }

    const hotspot = await prisma.catalogHotspot.create({
      data: {
        imageId,
        name,
        price: price || '',
        types: types || [],
        sizes: sizes || [],
        top,
        left,
        width,
        height,
      },
    });

    revalidatePath('/');
    return NextResponse.json({ success: true, hotspot });
  } catch (error: any) {
    console.error('Failed to save hotspot:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to save hotspot' },
      { status: 500 }
    );
  }
}

// PUT /api/hotspots - Update existing hotspot
export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, name, price, types, sizes, top, left, width, height } = body;

    if (!id) {
      return NextResponse.json(
        { success: false, error: 'Missing hotspot id' },
        { status: 400 }
      );
    }

    const hotspot = await prisma.catalogHotspot.update({
      where: { id },
      data: {
        name: name !== undefined ? name : undefined,
        price: price !== undefined ? price : undefined,
        types: types !== undefined ? types : undefined,
        sizes: sizes !== undefined ? sizes : undefined,
        top: top !== undefined ? top : undefined,
        left: left !== undefined ? left : undefined,
        width: width !== undefined ? width : undefined,
        height: height !== undefined ? height : undefined,
      },
    });

    revalidatePath('/');
    return NextResponse.json({ success: true, hotspot });
  } catch (error: any) {
    console.error('Failed to update hotspot:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to update hotspot' },
      { status: 500 }
    );
  }
}

// DELETE /api/hotspots?id=...
export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json(
        { success: false, error: 'Missing hotspot id parameter' },
        { status: 400 }
      );
    }

    await prisma.catalogHotspot.delete({
      where: { id },
    });

    revalidatePath('/');
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Failed to delete hotspot:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to delete hotspot' },
      { status: 500 }
    );
  }
}
