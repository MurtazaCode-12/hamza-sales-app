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
  return await prisma.order.findMany({
    orderBy: { createdAt: 'desc' },
    take: 20, // Last 20 orders
  });
}