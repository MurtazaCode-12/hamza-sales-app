import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { supabaseAdmin } from './supabaseAdmin';
import prisma from './prisma';

export interface InvoiceItem {
  productName: string;
  variantDetail?: string;
  qty: number;
  rate?: number;
  unit?: string;
  totalPrice?: number;
}

export interface InvoiceOrderData {
  id: string;
  createdAt: string | Date;
  shopName: string;
  ownerName?: string | null;
  phone: string;
  address?: string | null;
  status: string;
  totalItems: number;
  totalAmount?: number | null;
  items: InvoiceItem[];
}

/**
 * Generate a clean, branded PDF invoice document using jsPDF
 */
export function createInvoiceDoc(order: InvoiceOrderData): jsPDF {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const invoiceNo = `INV-${order.id.slice(-6).toUpperCase()}`;
  const dateStr = new Date(order.createdAt).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });

  // Top header brand banner
  doc.setFillColor(30, 41, 59); // slate-800
  doc.rect(0, 0, 210, 36, 'F');

  // Company Name & Title
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.setTextColor(255, 255, 255);
  doc.text('HAMZA TRADING CO.', 15, 18);

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(203, 213, 225); // slate-300
  doc.text('Wholesale Hardware, Locks, Hinges & Architectural Fittings', 15, 25);
  doc.text('Pune, Maharashtra | Phone: +91 9921015227', 15, 30);

  // Invoice Title right aligned
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.setTextColor(255, 255, 255);
  doc.text('TAX INVOICE', 195, 20, { align: 'right' });

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(226, 232, 240);
  doc.text(`Invoice #: ${invoiceNo}`, 195, 27, { align: 'right' });
  doc.text(`Date: ${dateStr}`, 195, 32, { align: 'right' });

  // Bill To / Customer Details Section
  doc.setFillColor(248, 250, 252); // slate-50
  doc.setDrawColor(226, 232, 240); // slate-200
  doc.roundedRect(15, 43, 180, 28, 2, 2, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(71, 85, 105);
  doc.text('BILLED TO / CUSTOMER DETAILS:', 20, 50);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(15, 23, 42); // slate-900
  doc.text(order.shopName || 'Retail Customer', 20, 57);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(100, 116, 139);
  const contactText = order.ownerName ? `Contact Person: ${order.ownerName} | Tel: ${order.phone}` : `Phone: ${order.phone}`;
  doc.text(contactText, 20, 62);
  doc.text(`Delivery Address: ${order.address || 'Local Dispatch / Counter Pick-up'}`, 20, 67);

  // Status Badge
  const isApproved = order.status?.toUpperCase() === 'APPROVED';
  doc.setFillColor(isApproved ? 220 : 254, isApproved ? 252 : 243, isApproved ? 231 : 199); // green-100 or amber-100
  doc.setDrawColor(isApproved ? 134 : 251, isApproved ? 239 : 191, isApproved ? 172 : 36);
  doc.roundedRect(150, 48, 40, 8, 1, 1, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(isApproved ? 22 : 180, isApproved ? 101 : 83, isApproved ? 52 : 9);
  doc.text(`STATUS: ${order.status.toUpperCase()}`, 170, 53.5, { align: 'center' });

  // Items Table
  let grandTotal = 0;
  const tableRows = order.items.map((item, index) => {
    const rate = Number(item.rate || 0);
    const qty = Number(item.qty || 1);
    const lineTotal = item.totalPrice && item.totalPrice > 0 ? Number(item.totalPrice) : rate * qty;
    grandTotal += lineTotal;

    const unit = item.unit || 'Pcs';
    const desc = item.variantDetail ? `${item.productName}\n(${item.variantDetail})` : item.productName;

    return [
      (index + 1).toString(),
      desc,
      unit,
      qty.toString(),
      rate > 0 ? `₹${rate.toFixed(2)}` : '-',
      lineTotal > 0 ? `₹${lineTotal.toFixed(2)}` : '-',
    ];
  });

  autoTable(doc, {
    startY: 76,
    head: [['#', 'Item Description', 'Unit', 'Qty', 'Rate (₹)', 'Amount (₹)']],
    body: tableRows,
    theme: 'striped',
    headStyles: {
      fillColor: [30, 41, 59],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      halign: 'left',
      fontSize: 9,
    },
    columnStyles: {
      0: { cellWidth: 10, halign: 'center' },
      1: { cellWidth: 85 },
      2: { cellWidth: 20, halign: 'center' },
      3: { cellWidth: 15, halign: 'center' },
      4: { cellWidth: 25, halign: 'right' },
      5: { cellWidth: 25, halign: 'right' },
    },
    styles: {
      fontSize: 8.5,
      cellPadding: 3,
      textColor: [30, 41, 59],
    },
    margin: { left: 15, right: 15 },
  });

  // Summary and Totals Box
  const finalY = (doc as any).lastAutoTable?.finalY || 140;

  // Total summary card on the right
  const calcTotal = order.totalAmount && order.totalAmount > 0 ? order.totalAmount : grandTotal;
  const totalQty = order.items.reduce((sum, item) => sum + (Number(item.qty) || 0), 0);

  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(203, 213, 225);
  doc.roundedRect(120, finalY + 8, 75, 30, 2, 2, 'FD');

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(71, 85, 105);
  doc.text('Total Items:', 125, finalY + 15);
  doc.text(`${order.totalItems || order.items.length} items (${totalQty} units)`, 190, finalY + 15, { align: 'right' });

  doc.text('Subtotal:', 125, finalY + 22);
  doc.text(`₹${calcTotal.toFixed(2)}`, 190, finalY + 22, { align: 'right' });

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(15, 23, 42);
  doc.text('Grand Total:', 125, finalY + 31);
  doc.setTextColor(16, 185, 129); // emerald-600
  doc.text(`₹${calcTotal.toFixed(2)}`, 190, finalY + 31, { align: 'right' });

  // Notes and Terms on the left
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(71, 85, 105);
  doc.text('Terms & Instructions:', 15, finalY + 15);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(148, 163, 184);
  doc.text('1. Goods once sold will not be returned or exchanged without prior authorization.', 15, finalY + 20);
  doc.text('2. Please check and verify physical count upon delivery.', 15, finalY + 25);
  doc.text('3. Payment due within standard credit cycle as agreed.', 15, finalY + 30);

  // Bottom Footer & Signatures
  doc.setDrawColor(226, 232, 240);
  doc.line(15, 260, 195, 260);

  doc.setFont('helvetica', 'italic');
  doc.setFontSize(8);
  doc.setTextColor(148, 163, 184);
  doc.text('Thank you for your business! - Hamza Trading Co.', 15, 266);

  doc.setFont('helvetica', 'normal');
  doc.text('Authorized Signatory: _________________________', 195, 266, { align: 'right' });

  return doc;
}

/**
 * Upload generated PDF to Supabase Storage bucket 'invoices' and update the order record
 */
export async function uploadInvoiceToSupabase(order: InvoiceOrderData): Promise<string> {
  const doc = createInvoiceDoc(order);
  const pdfOutput = doc.output('arraybuffer');
  const buffer = Buffer.from(pdfOutput);
  const fileName = `order_${order.id}_invoice.pdf`;

  const bucketName = 'invoices';

  try {
    // Ensure bucket exists
    const { data: buckets } = await supabaseAdmin.storage.listBuckets();
    const bucketExists = buckets?.some(b => b.name === bucketName);

    if (!bucketExists) {
      await supabaseAdmin.storage.createBucket(bucketName, {
        public: true,
      });
    }

    // Upload PDF file
    const { data: uploadData, error: uploadError } = await supabaseAdmin.storage
      .from(bucketName)
      .upload(fileName, buffer, {
        contentType: 'application/pdf',
        upsert: true,
      });

    if (uploadError) {
      console.warn('Supabase storage upload error:', uploadError);
      throw uploadError;
    }

    // Get Public URL
    const { data: urlData } = supabaseAdmin.storage
      .from(bucketName)
      .getPublicUrl(fileName);

    const publicUrl = urlData.publicUrl;

    // Save to Database
    try {
      await prisma.order.update({
        where: { id: order.id },
        data: {
          invoiceUrl: publicUrl,
          totalAmount: order.totalAmount || undefined,
        },
      });
    } catch (e) {
      console.warn('Could not update order with invoiceUrl in database:', e);
    }

    return publicUrl;
  } catch (err: any) {
    console.error('Failed to upload invoice to Supabase Storage:', err);
    // Return a fallback direct API download URL
    const fallbackUrl = `/api/orders/${order.id}/invoice`;
    try {
      await prisma.order.update({
        where: { id: order.id },
        data: { invoiceUrl: fallbackUrl },
      });
    } catch {}
    return fallbackUrl;
  }
}
