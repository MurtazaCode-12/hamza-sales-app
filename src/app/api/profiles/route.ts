import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

// Default initial profiles to seed if none exist
const DEFAULT_PROFILES = [
  { name: 'Hamza Admin', email: 'admin@hamzatrading.com', role: 'admin', avatar: '👑' },
  { name: 'Ali (Sales Rep)', email: 'ali@hamzatrading.com', role: 'user', avatar: '💼' },
  { name: 'Tariq (Pune Field)', email: 'tariq@hamzatrading.com', role: 'user', avatar: '📍' },
];

// GET /api/profiles - List all profiles with order counts
export async function GET() {
  try {
    let profiles = await prisma.profile.findMany({
      include: {
        _count: {
          select: { orders: true },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    // Auto-seed initial profiles if none exist
    if (profiles.length === 0) {
      for (const p of DEFAULT_PROFILES) {
        await prisma.profile.create({ data: p });
      }

      profiles = await prisma.profile.findMany({
        include: {
          _count: {
            select: { orders: true },
          },
        },
        orderBy: { createdAt: 'asc' },
      });
    }

    return NextResponse.json({ success: true, profiles });
  } catch (error: any) {
    console.error('Failed to fetch profiles:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to fetch profiles' },
      { status: 500 }
    );
  }
}

// POST /api/profiles - Create new profile with Supabase Auth
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { name, email, password, role, avatar } = body;

    if (!name || !name.trim()) {
      return NextResponse.json(
        { success: false, error: 'Profile name is required' },
        { status: 400 }
      );
    }

    const cleanRole = role === 'admin' ? 'admin' : 'user';
    const cleanEmail = email ? email.trim().toLowerCase() : null;

    // If email and password provided, create user in Supabase Auth
    if (cleanEmail && password) {
      try {
        const { error: authError } = await supabaseAdmin.auth.admin.createUser({
          email: cleanEmail,
          password: password,
          email_confirm: true,
          user_metadata: { name: name.trim(), role: cleanRole },
        });

        if (authError && !authError.message.includes('already registered')) {
          return NextResponse.json(
            { success: false, error: `Supabase Auth error: ${authError.message}` },
            { status: 400 }
          );
        }
      } catch (authErr: any) {
        console.warn('Supabase admin create user notice:', authErr?.message);
      }
    }

    // Check if profile already exists with this email
    let profile = null;
    if (cleanEmail) {
      profile = await prisma.profile.findFirst({
        where: { email: { equals: cleanEmail, mode: 'insensitive' } },
        include: {
          _count: { select: { orders: true } },
        },
      });
    }

    if (profile) {
      profile = await prisma.profile.update({
        where: { id: profile.id },
        data: {
          name: name.trim(),
          role: cleanRole,
          avatar: avatar || profile.avatar || (cleanRole === 'admin' ? '👑' : '💼'),
        },
        include: {
          _count: { select: { orders: true } },
        },
      });
    } else {
      profile = await prisma.profile.create({
        data: {
          name: name.trim(),
          email: cleanEmail,
          role: cleanRole,
          avatar: avatar || (cleanRole === 'admin' ? '👑' : '💼'),
        },
        include: {
          _count: {
            select: { orders: true },
          },
        },
      });
    }

    return NextResponse.json({ success: true, profile });
  } catch (error: any) {
    console.error('Failed to create profile:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to create profile' },
      { status: 500 }
    );
  }
}

// DELETE /api/profiles?id=... - Delete profile
export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json(
        { success: false, error: 'Profile ID is required' },
        { status: 400 }
      );
    }

    const existing = await prisma.profile.findUnique({
      where: { id },
    });

    if (!existing) {
      return NextResponse.json(
        { success: false, error: 'Profile not found' },
        { status: 404 }
      );
    }

    // Safety guard: ensure at least one admin remains
    if (existing.role === 'admin') {
      const adminCount = await prisma.profile.count({
        where: { role: 'admin' },
      });
      if (adminCount <= 1) {
        return NextResponse.json(
          { success: false, error: 'Cannot delete the only remaining admin profile' },
          { status: 400 }
        );
      }
    }

    if (existing.email) {
      try {
        const { data: usersData } = await supabaseAdmin.auth.admin.listUsers();
        const authUser = usersData?.users?.find(
          (u) => u.email?.toLowerCase() === existing.email?.toLowerCase()
        );
        if (authUser) {
          await supabaseAdmin.auth.admin.deleteUser(authUser.id);
        }
      } catch (authErr: any) {
        console.warn('Could not delete from Supabase Auth:', authErr?.message);
      }
    }

    await prisma.profile.delete({
      where: { id },
    });

    return NextResponse.json({ success: true, deletedId: id });
  } catch (error: any) {
    console.error('Failed to delete profile:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to delete profile' },
      { status: 500 }
    );
  }
}
