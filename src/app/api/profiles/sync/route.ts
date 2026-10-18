import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { email, name, role = 'user', avatar } = body;

    if (!email) {
      return NextResponse.json(
        { success: false, error: 'Email is required to sync profile' },
        { status: 400 }
      );
    }

    const cleanEmail = email.trim().toLowerCase();
    const cleanRole = role === 'admin' ? 'admin' : 'user';

    // Find profile by email
    let profile = await prisma.profile.findFirst({
      where: {
        email: { equals: cleanEmail, mode: 'insensitive' }
      },
      include: {
        _count: {
          select: { orders: true }
        }
      }
    });

    if (!profile) {
      // Create new profile for this authenticated Supabase user
      profile = await prisma.profile.create({
        data: {
          email: cleanEmail,
          name: name ? name.trim() : cleanEmail.split('@')[0],
          role: cleanRole,
          avatar: avatar || (cleanRole === 'admin' ? '👑' : '💼'),
        },
        include: {
          _count: {
            select: { orders: true }
          }
        }
      });
    }

    return NextResponse.json({ success: true, profile });
  } catch (error: any) {
    console.error('Failed to sync profile:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to sync profile' },
      { status: 500 }
    );
  }
}
