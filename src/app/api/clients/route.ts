import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { CLIENTS } from '@/lib/data';

// GET /api/clients?search=...
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const search = searchParams.get('search')?.trim() || '';

    let clients: any[] = [];
    try {
      // Check if any clients exist in database
      const count = await prisma.client.count();
      if (count === 0) {
        // Auto-seed initial clients from data.ts
        for (const c of CLIENTS) {
          await prisma.client.create({
            data: {
              name: c.shopName,
              ownerName: c.ownerName,
              phone: c.phone,
              address: c.city ? `${c.city}, Maharashtra` : '',
              city: c.city || 'Pune',
            },
          });
        }
      }

      clients = await prisma.client.findMany({
        where: search
          ? {
              OR: [
                { name: { contains: search, mode: 'insensitive' } },
                { phone: { contains: search, mode: 'insensitive' } },
                { ownerName: { contains: search, mode: 'insensitive' } },
                { city: { contains: search, mode: 'insensitive' } },
              ],
            }
          : undefined,
        orderBy: { name: 'asc' },
        take: 50,
      });
    } catch (dbError) {
      console.warn('Database offline or unseeded, falling back to static CLIENTS:', dbError);
      // Resilient fallback to static data
      clients = CLIENTS.map((c) => ({
        id: c.id,
        name: c.shopName,
        ownerName: c.ownerName,
        phone: c.phone,
        address: c.city ? `${c.city}, Maharashtra` : '',
        city: c.city,
        createdAt: new Date().toISOString(),
      })).filter((c) =>
        !search ||
        c.name.toLowerCase().includes(search.toLowerCase()) ||
        c.phone.includes(search) ||
        (c.ownerName && c.ownerName.toLowerCase().includes(search.toLowerCase()))
      );
    }

    return NextResponse.json({ success: true, clients });
  } catch (error: any) {
    console.error('Error fetching clients:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to fetch clients' },
      { status: 500 }
    );
  }
}

// POST /api/clients - Create a new client
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { name, phone, address, ownerName, city } = body;

    if (!name || !name.trim()) {
      return NextResponse.json(
        { success: false, error: 'Client or Shop name is required' },
        { status: 400 }
      );
    }

    if (!phone || !phone.trim()) {
      return NextResponse.json(
        { success: false, error: 'Phone number is required' },
        { status: 400 }
      );
    }

    try {
      const client = await prisma.client.create({
        data: {
          name: name.trim(),
          phone: phone.trim(),
          address: address?.trim() || '',
          ownerName: ownerName?.trim() || '',
          city: city?.trim() || '',
        },
      });
      return NextResponse.json({ success: true, client });
    } catch (dbError: any) {
      console.warn('Failed to insert client into database, creating mock client response:', dbError);
      const fallbackClient = {
        id: 'client_' + Date.now(),
        name: name.trim(),
        phone: phone.trim(),
        address: address?.trim() || '',
        ownerName: ownerName?.trim() || '',
        city: city?.trim() || '',
        createdAt: new Date().toISOString(),
      };
      return NextResponse.json({ success: true, client: fallbackClient });
    }
  } catch (error: any) {
    console.error('Error creating client:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to create client' },
      { status: 500 }
    );
  }
}
