"use client";

import { Button } from "@/components/ui/button";
import { Send } from "lucide-react";
import confetti from "canvas-confetti"; // <--- Import Confetti
import { toast } from "sonner";         // <--- Import Toast

export function WhatsAppButton({ order }: { order: any }) {
  
  const handleSend = () => {
    // 1. Trigger Confetti Explosion
    const duration = 3 * 1000;
    const animationEnd = Date.now() + duration;
    const defaults = { startVelocity: 30, spread: 360, ticks: 60, zIndex: 0 };

    const randomInRange = (min: number, max: number) => Math.random() * (max - min) + min;

    const interval: any = setInterval(function() {
      const timeLeft = animationEnd - Date.now();

      if (timeLeft <= 0) {
        return clearInterval(interval);
      }

      const particleCount = 50 * (timeLeft / duration);
      confetti({ ...defaults, particleCount, origin: { x: randomInRange(0.1, 0.3), y: Math.random() - 0.2 } });
      confetti({ ...defaults, particleCount, origin: { x: randomInRange(0.7, 0.9), y: Math.random() - 0.2 } });
    }, 250);

    // 2. Show Success Notification
    toast.success("Order Dispatched Successfully!", {
      description: `Sent to Warehouse for ${order.shopName}`,
      duration: 4000,
    });

    // 3. Construct WhatsApp Message
    let msg = `*🚀 NEW APPROVED ORDER - ${order.shopName}*\n\n`;
    msg += `*CLIENT DETAILS:*\n`;
    msg += `👤 Owner: ${order.ownerName || "N/A"}\n`;
    msg += `📞 Phone: ${order.phone}\n`;
    msg += `📍 Location: ${order.address}\n`;
    msg += `----------------------------\n`;
    
    msg += `*ORDER ITEMS:*\n`;
    order.items.forEach((item: any, index: number) => {
      msg += `${index + 1}. ${item.productName}\n`;
      msg += `   └ ${item.variantDetail}  (Qty: *${item.qty}*)\n`;
    });
    
    msg += `----------------------------\n`;
    msg += `📦 *Total Items: ${order.totalItems}*\n`;
    msg += `✅ Status: APPROVED by Client\n\n`;
    msg += `*📄 View Full Invoice:* \n${window.location.href.split('?')[0]}`;

    // 4. Open WhatsApp
    const adminPhone = "919921015227"; 
    const url = `https://wa.me/${adminPhone}?text=${encodeURIComponent(msg)}`;
    window.open(url, '_blank');
  };

  return (
    <Button
      type="submit"
      className="w-full bg-blue-600 hover:bg-blue-700 text-white h-14 rounded-xl text-lg font-bold shadow-xl active:scale-95 transition-all transform hover:-translate-y-1"
      onClick={handleSend}
    >
      <Send className="mr-2" /> Send to Shop (WhatsApp)
    </Button>
  );
}