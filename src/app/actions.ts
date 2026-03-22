"use server";

import { PrismaClient } from "@prisma/client";
import { revalidatePath } from "next/cache";
import fs from 'fs';
import path from 'path';

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

// 10. Automatically Fetch all local images in public/product
export async function getCatalogImages() {
  try {
    const dir = path.join(process.cwd(), 'public', 'product');
    const files = fs.readdirSync(dir);
    // Sort array alphanumerically
    const sorted = files.filter(f => f.match(/\.(jpg|jpeg|png|webp)$/i)).sort((a,b) => a.localeCompare(b));
    return sorted;
  } catch (error) {
    console.error("Error reading product images folder", error);
    return [];
  }
}