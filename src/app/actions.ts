"use server";

import { PrismaClient } from "@prisma/client";
import { revalidatePath } from "next/cache";

// Prevent multiple instances in development
const globalForPrisma = global as unknown as { prisma: PrismaClient };
const prisma = globalForPrisma.prisma || new PrismaClient();
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

// 1. Save Order to Supabase
export async function createOrder(formData: any, cartItems: any[]) {
  try {
    const order = await prisma.order.create({
      data: {
        shopName: formData.shopName,
        ownerName: formData.ownerName || "",
        phone: formData.phone,
        address: formData.address,
        totalItems: cartItems.reduce((acc: any, item: any) => acc + item.qty, 0),
        items: {
          create: cartItems.map((item: any) => ({
            productName: item.productName,
            variantDetail: item.variantDetail,
            qty: item.qty,
          })),
        },
      },
    });
    return { success: true, orderId: order.id };
  } catch (error) {
    console.error("Database Error:", error);
    return { success: false, error: "Failed to save order" };
  }
}

// 2. Approve Order
export async function approveOrder(orderId: string) {
  await prisma.order.update({
    where: { id: orderId },
    data: { status: "APPROVED" },
  });
  revalidatePath(`/order/${orderId}`);
}

// 3. Get Order Details
export async function getOrder(orderId: string) {
  return await prisma.order.findUnique({
    where: { id: orderId },
    include: { items: true },
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

// 5. Get All Orders (Recent First)
export async function getRecentOrders() {
  try {
    const orders = await prisma.order.findMany({
      orderBy: { createdAt: 'desc' },
      take: 20, // Last 20 orders
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

// 9. Get All Hotspots
export async function getAllHotspots() {
  try {
    return await prisma.catalogHotspot.findMany();
  } catch (error) {
    console.error("Failed to get all hotspots", error);
    return [];
  }
}

// 10. Catalog image list (static for Vercel serverless compatibility)
export async function getCatalogImages() {
  // Hardcoded list of all images in public/product.
  // Add new filenames here whenever you add more catalog pages.
  return [
    "Hamza-Trading-CoPune-New_page-0002.jpg",
    "Hamza-Trading-CoPune-New_page-0003.jpg",
    "Hamza-Trading-CoPune-New_page-0004.jpg",
    "Hamza-Trading-CoPune-New_page-0005.jpg",
    "Hamza-Trading-CoPune-New_page-0006.jpg",
    "Hamza-Trading-CoPune-New_page-0007.jpg",
    "Hamza-Trading-CoPune-New_page-0008.jpg",
    "Hamza-Trading-CoPune-New_page-0009.jpg",
    "Hamza-Trading-CoPune-New_page-0010.jpg",
    "Hamza-Trading-CoPune-New_page-0011.jpg",
    "Hamza-Trading-CoPune-New_page-0012.jpg",
    "Hamza-Trading-CoPune-New_page-0013.jpg",
    "Hamza-Trading-CoPune-New_page-0014.jpg",
    "Hamza-Trading-CoPune-New_page-0015.jpg",
    "Hamza-Trading-CoPune-New_page-0016.jpg",
    "Hamza-Trading-CoPune-New_page-0017.jpg",
    "Hamza-Trading-CoPune-New_page-0018.jpg",
    "Hamza-Trading-CoPune-New_page-0019.jpg",
    "Hamza-Trading-CoPune-New_page-0020.jpg",
    "Hamza-Trading-CoPune-New_page-0021.jpg",
    "Hamza-Trading-CoPune-New_page-0022.jpg",
    "Hamza-Trading-CoPune-New_page-0023.jpg",
    "Hamza-Trading-CoPune-New_page-0024.jpg",
    "Hamza-Trading-CoPune-New_page-0025.jpg",
    "Hamza-Trading-CoPune-New_page-0026.jpg",
    "Hamza-Trading-CoPune-New_page-0027.jpg",
    "Hamza-Trading-CoPune-New_page-0028.jpg",
    "Hamza-Trading-CoPune-New_page-0029.jpg",
    "Hamza-Trading-CoPune-New_page-0030.jpg",
    "Hamza-Trading-CoPune-New_page-0031.jpg",
    "Hamza-Trading-CoPune-New_page-0032.jpg",
    "Hamza-Trading-CoPune-New_page-0033.jpg",
    "Hamza-Trading-CoPune-New_page-0034.jpg",
    "Hamza-Trading-CoPune-New_page-0035.jpg",
    "Hamza-Trading-CoPune-New_page-0036.jpg",
    "Hamza-Trading-CoPune-New_page-0037.jpg",
    "Hamza-Trading-CoPune-New_page-0038.jpg",
    "Hamza-Trading-CoPune-New_page-0039.jpg",
    "Hamza-Trading-CoPune-New_page-0040.jpg",
    "Hamza-Trading-CoPune-New_page-0041.jpg",
    "Hamza-Trading-CoPune-New_page-0042.jpg",
    "Hamza-Trading-CoPune-New_page-0043.jpg",
    "Hamza-Trading-CoPune-New_page-0044.jpg",
    "Hamza-Trading-CoPune-New_page-0045.jpg",
    "Hamza-Trading-CoPune-New_page-0046.jpg",
    "Hamza-Trading-CoPune-New_page-0047.jpg",
    "Hamza-Trading-CoPune-New_page-0048.jpg",
    "Hamza-Trading-CoPune-New_page-0049.jpg",
    "Hamza-Trading-CoPune-New_page-0050.jpg",
    "Hamza-Trading-CoPune-New_page-0051.jpg",
  ];
}