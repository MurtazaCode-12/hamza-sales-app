"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { getOrder } from "@/app/actions";

export function OrderPoller({ orderId, initialStatus }: { orderId: string, initialStatus: string }) {
  const router = useRouter();

  useEffect(() => {
    // If already approved, no need to check anymore
    if (initialStatus === "APPROVED") return;

    // Check status every 4 seconds
    const interval = setInterval(async () => {
      const freshOrder = await getOrder(orderId);
      
      // If the status in DB is different from what we see, REFRESH the page
      if (freshOrder && freshOrder.status !== initialStatus) {
        router.refresh();
      }
    }, 4000);

    return () => clearInterval(interval);
  }, [orderId, initialStatus, router]);

  return null; // This component is invisible
}