"use server";

import { revalidatePath } from "next/cache";
import prisma from "@/lib/prisma";
import { uploadInvoiceToSupabase } from "@/lib/invoice";

// 1. Save Order to Supabase
export async function createOrder(formData: any, cartItems: any[], profileId?: string) {
  try {
    const targetProfileId = profileId || formData.profileId || null;
    const clientId = formData.clientId || null;

    // Calculate total amount
    const totalAmount = cartItems.reduce((sum: number, item: any) => {
      const rate = Number(item.rate || 0);
      const qty = Number(item.qty || 1);
      return sum + (item.totalPrice ? Number(item.totalPrice) : rate * qty);
    }, 0);

    const order = await prisma.order.create({
      data: {
        shopName: formData.shopName,
        ownerName: formData.ownerName || "",
        phone: formData.phone,
        address: formData.address || "",
        profileId: targetProfileId,
        clientId: clientId,
        totalItems: cartItems.reduce((acc: number, item: any) => acc + (Number(item.qty) || 1), 0),
        totalAmount: totalAmount,
        items: {
          create: cartItems.map((item: any) => {
            const rate = Number(item.rate || 0);
            const qty = Number(item.qty || 1);
            const unit = item.unit || "Pcs";
            const totalPrice = item.totalPrice !== undefined ? Number(item.totalPrice) : rate * qty;
            return {
              productName: item.productName,
              variantDetail: item.variantDetail || "",
              qty: qty,
              rate: rate,
              unit: unit,
              totalPrice: totalPrice,
            };
          }),
        },
      },
      include: { items: true },
    });

    // Try generating invoice and uploading to Supabase Storage
    try {
      await uploadInvoiceToSupabase(order as any);
    } catch (e) {
      console.warn("Invoice upload on order creation skipped:", e);
    }

    return { success: true, orderId: order.id };
  } catch (error) {
    console.error("Database Error in createOrder:", error);
    return { success: false, error: "Failed to save order" };
  }
}

// 2. Approve Order
export async function approveOrder(orderId: string) {
  try {
    const existing = await prisma.order.findUnique({
      where: { id: orderId },
      include: { items: true },
    });

    let invoiceUrl = existing?.invoiceUrl;
    if (existing) {
      try {
        invoiceUrl = await uploadInvoiceToSupabase(existing as any);
      } catch (invErr) {
        console.warn("Could not upload invoice on approve:", invErr);
        invoiceUrl = `/api/orders/${orderId}/invoice`;
      }
    }

    await prisma.order.update({
      where: { id: orderId },
      data: {
        status: "APPROVED",
        ...(invoiceUrl ? { invoiceUrl } : {}),
      },
    });
  } catch (err) {
    console.error("Error approving order:", err);
  }
  revalidatePath(`/order/${orderId}`);
}

// 3. Get Order Details
export async function getOrder(orderId: string) {
  return await prisma.order.findUnique({
    where: { id: orderId },
    include: { items: true, profile: true },
  });
}

// 4. Mark order as sent to warehouse
export async function markAsDispatched(orderId: string) {
  await prisma.order.update({
    where: { id: orderId },
    data: { status: "DISPATCHED" },
  });
  revalidatePath(`/order/${orderId}`);
}

// 5. Get All Orders (Recent First, optionally filtered by profileId)
export async function getRecentOrders(profileId?: string) {
  try {
    const where = profileId ? { profileId } : {};
    const orders = await prisma.order.findMany({
      where,
      include: { profile: true },
      orderBy: { createdAt: 'desc' },
      take: 50, // Up to 50 recent orders
    });
    return orders;
  } catch (error) {
    console.error("Database error in getRecentOrders:", error);
    return [];
  }
}

// 6. Save Hotspot Coordinate
export async function saveHotspot(data: any) {
  try {
    const hotspot = await prisma.catalogHotspot.create({
      data: {
        imageId: data.imageId,
        name: data.name,
        types: data.types || [],
        sizes: data.sizes || [],
        top: data.top,
        left: data.left,
        width: data.width,
        height: data.height,
        price: data.price
      }
    });
    revalidatePath('/');
    return { success: true, hotspot };
  } catch (error) {
    console.error("Failed to save hotspot", error);
    return { success: false };
  }
}

// 7. Get Hotspots by Image ID
export async function getHotspotsByImage(imageId: string) {
  try {
    return await prisma.catalogHotspot.findMany({
      where: { imageId }
    });
  } catch (error) {
    console.error("Failed to fetch hotspots", error);
    return [];
  }
}

// 8. Delete Hotspot
export async function deleteHotspot(id: string) {
  try {
    await prisma.catalogHotspot.delete({ where: { id } });
    revalidatePath('/');
    return { success: true };
  } catch (error) {
    console.error("Failed to delete hotspot", error);
    return { success: false };
  }
}

// 8b. Update Hotspot
export async function updateHotspot(id: string, data: any) {
  try {
    const hotspot = await prisma.catalogHotspot.update({
      where: { id },
      data: {
        name: data.name !== undefined ? data.name : undefined,
        types: data.types !== undefined ? data.types : undefined,
        sizes: data.sizes !== undefined ? data.sizes : undefined,
        top: data.top !== undefined ? data.top : undefined,
        left: data.left !== undefined ? data.left : undefined,
        width: data.width !== undefined ? data.width : undefined,
        height: data.height !== undefined ? data.height : undefined,
        price: data.price !== undefined ? data.price : undefined,
      }
    });
    revalidatePath('/');
    return { success: true, hotspot };
  } catch (error) {
    console.error("Failed to update hotspot", error);
    return { success: false };
  }
}

// 8c. Save Multiple Hotspots
export async function saveMultipleHotspots(hotspotsList: any[]) {
  try {
    if (!hotspotsList || hotspotsList.length === 0) return { success: true, count: 0, hotspots: [] };
    const created: any[] = [];
    for (const data of hotspotsList) {
      const item = await prisma.catalogHotspot.create({
        data: {
          imageId: data.imageId,
          name: data.name || "Product",
          types: data.types || [],
          sizes: data.sizes || [],
          top: data.top,
          left: data.left,
          width: data.width,
          height: data.height,
          price: data.price || ""
        }
      });
      created.push(item);
    }
    revalidatePath('/');
    return { success: true, hotspots: created, count: created.length };
  } catch (error) {
    console.error("Failed to save multiple hotspots", error);
    return { success: false, error: "Failed to batch save hotspots" };
  }
}

// 9. Get All Hotspots
export async function getAllHotspots() {
  try {
    return await prisma.catalogHotspot.findMany();
  } catch (error) {
    console.error("Failed to get all hotspots", error);
    return [];
  }
}

export async function getCatalogImages() {
  // Generate the array of the new 56 brochure pages
  return Array.from({ length: 56 }, (_, i) => `Hamza Draft 4-images-${i}.jpg`);
}