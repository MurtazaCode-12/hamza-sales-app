import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createInvoiceDoc, uploadInvoiceToSupabase } from '@/lib/invoice';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const order = await prisma.order.findUnique({
      where: { id },
      include: {
        items: true,
      },
    });

    if (!order) {
      return NextResponse.json(
        { success: false, error: 'Order not found' },
        { status: 404 }
      );
    }

    const doc = createInvoiceDoc(order as any);
    const pdfBuffer = Buffer.from(doc.output('arraybuffer'));

    return new NextResponse(pdfBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="invoice_${order.id.slice(-6)}.pdf"`,
      },
    });
  } catch (error: any) {
    console.error('Invoice generate error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to generate invoice' },
      { status: 500 }
    );
  }
}

// POST: Trigger Supabase storage upload and return public URL
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const order = await prisma.order.findUnique({
      where: { id },
      include: {
        items: true,
      },
    });

    if (!order) {
      return NextResponse.json(
        { success: false, error: 'Order not found' },
        { status: 404 }
      );
    }

    const publicUrl = await uploadInvoiceToSupabase(order as any);

    return NextResponse.json({
      success: true,
      invoiceUrl: publicUrl,
    });
  } catch (error: any) {
    console.error('Invoice upload error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to upload invoice' },
      { status: 500 }
    );
  }
}
