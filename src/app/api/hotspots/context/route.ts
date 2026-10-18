import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const hotspots = await prisma.catalogHotspot.findMany({
      select: {
        name: true,
        types: true,
        sizes: true,
      },
      take: 70,
      orderBy: { createdAt: 'desc' },
    });

    const products = await prisma.product.findMany({
      select: {
        name: true,
        types: true,
        sizes: true,
        category: true,
      },
      take: 50,
      orderBy: { updatedAt: 'desc' },
    });

    // Merge unique names
    const seen = new Set<string>();
    const contextList: any[] = [];

    for (const h of hotspots) {
      const lower = (h.name || '').trim().toLowerCase();
      if (lower && !seen.has(lower)) {
        seen.add(lower);
        contextList.push({
          name: h.name,
          types: h.types || [],
          sizes: h.sizes || [],
        });
      }
    }

    for (const p of products) {
      const lower = (p.name || '').trim().toLowerCase();
      if (lower && !seen.has(lower)) {
        seen.add(lower);
        contextList.push({
          name: p.name,
          types: p.types || [],
          sizes: p.sizes || [],
          category: p.category || undefined,
        });
      }
    }

    return NextResponse.json({
      success: true,
      context: contextList,
    });
  } catch (error: any) {
    console.warn('Failed to load hotspot context:', error);
    return NextResponse.json({
      success: false,
      context: [],
    });
  }
}
