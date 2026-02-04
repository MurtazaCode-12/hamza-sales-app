"use client";

import { useState } from "react";
import { useStore } from "@/context/StoreContext";
import { Trash2, ArrowLeft, Send, User, Store, MapPin, Phone } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { createOrder } from "@/app/actions"; 
import { toast } from "sonner"; 

export default function CartPage() {
  const { cart, removeFromCart, clearCart, selectedClient } = useStore();
  const router = useRouter();

  const [guestDetails, setGuestDetails] = useState({
    shopName: selectedClient?.shopName || "",
    phone: selectedClient?.phone || "",
    address: selectedClient?.city || "",
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const totalItems = cart.reduce((acc, item) => acc + item.qty, 0);

  const handleInputChange = (field: string, value: string) => {
    setGuestDetails(prev => ({ ...prev, [field]: value }));
  };

  const isFormValid = guestDetails.shopName && guestDetails.phone && guestDetails.address;

  const handleApprovalRequest = async () => {
    if (!isFormValid) {
      toast.error("Missing Details", { description: "Please enter Shop Name, Phone, and Address." });
      return;
    }

    setIsSubmitting(true);

    try {
      const result = await createOrder(guestDetails, cart);

      if (result.success && result.orderId) {
        const protocol = window.location.protocol;
        const host = window.location.host;
        const clientLink = `${protocol}//${host}/order/${result.orderId}`;

        let message = `*APPROVAL REQUEST*\n`;
        message += `Hello ${guestDetails.shopName},\n`;
        message += `Please review and approve your order using this secure link:\n\n`;
        message += `${clientLink}\n\n`;
        message += `Total Items: ${totalItems}`;

        toast.success("Order Created!", { description: "Opening WhatsApp now..." });

        const targetPhone = guestDetails.phone.replace(/\D/g, ''); 
        const url = `https://wa.me/${targetPhone}?text=${encodeURIComponent(message)}`;
        window.open(url, '_blank');
        
        clearCart();
        router.push(`/order/${result.orderId}?view=agent`); 

      } else {
        toast.error("Database Error", { description: "Could not save the order. Please try again." });
      }
    } catch (error) {
      console.error(error);
      toast.error("System Error", { description: "Something went wrong." });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background pb-32">
      {/* Header */}
      <div className="bg-card border-b border-border p-4 sticky top-0 z-10 flex items-center gap-4 shadow-sm">
        <Link href="/">
           <button className="p-2 -ml-2 hover:bg-muted rounded-full transition-colors">
             <ArrowLeft className="text-foreground" />
           </button>
        </Link>
        <h1 className="font-bold text-xl text-foreground">Checkout</h1>
      </div>

      <div className="p-4 space-y-6 max-w-2xl mx-auto">
        
        {/* === CUSTOMER DETAILS === */}
        <div className="space-y-3">
          <h2 className="text-sm font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
            <User size={14} /> Client Details
          </h2>
          
          <div className="bg-card border border-border rounded-xl p-5 shadow-sm space-y-4">
            <div>
              <label className="text-xs font-semibold text-muted-foreground mb-1 block">Shop / Client Name</label>
              <div className="relative">
                <Store className="absolute left-3 top-3.5 text-muted-foreground" size={18} />
                <input 
                  type="text" 
                  placeholder="e.g. Ganesh Hardware"
                  className="w-full pl-10 h-12 bg-muted/50 border border-input rounded-lg focus:ring-2 focus:ring-primary focus:bg-background outline-none transition-all text-foreground font-medium"
                  value={guestDetails.shopName}
                  onChange={(e) => handleInputChange("shopName", e.target.value)}
                />
              </div>
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground mb-1 block">Phone Number</label>
              <div className="relative">
                <Phone className="absolute left-3 top-3.5 text-muted-foreground" size={18} />
                <input 
                  type="tel" 
                  placeholder="e.g. 982266..."
                  className="w-full pl-10 h-12 bg-muted/50 border border-input rounded-lg focus:ring-2 focus:ring-primary focus:bg-background outline-none transition-all text-foreground font-medium"
                  value={guestDetails.phone}
                  onChange={(e) => handleInputChange("phone", e.target.value)}
                />
              </div>
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground mb-1 block">Location / Address</label>
              <div className="relative">
                <MapPin className="absolute left-3 top-3.5 text-muted-foreground" size={18} />
                <input 
                  type="text" 
                  placeholder="e.g. Raviwar Peth, Pune"
                  className="w-full pl-10 h-12 bg-muted/50 border border-input rounded-lg focus:ring-2 focus:ring-primary focus:bg-background outline-none transition-all text-foreground font-medium"
                  value={guestDetails.address}
                  onChange={(e) => handleInputChange("address", e.target.value)}
                />
              </div>
            </div>
          </div>
        </div>

        {/* === ORDER ITEMS === */}
        <div className="space-y-3">
           <h2 className="text-sm font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
             <Store size={14} /> Order Items
           </h2>
           <div className="bg-card border border-border rounded-xl shadow-sm divide-y divide-border">
             {cart.map((item) => (
                <div key={item.variantId} className="flex justify-between items-start p-4 hover:bg-muted/30 transition-colors">
                  <div className="pr-4">
                    <p className="font-bold text-sm text-foreground">{item.productName}</p>
                    <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded border border-border inline-block mt-1">
                      {item.variantDetail}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                     <span className="font-bold text-lg text-primary">x{item.qty}</span>
                     <button 
                        onClick={() => removeFromCart(item.variantId)}
                        className="p-1 text-muted-foreground hover:text-red-500 transition-colors"
                     >
                        <Trash2 size={16} />
                     </button>
                  </div>
                </div>
             ))}
             {cart.length === 0 && (
               <div className="p-8 text-center text-muted-foreground flex flex-col items-center gap-2">
                 <Store size={32} className="opacity-20" />
                 <p>Your cart is empty</p>
               </div>
             )}
           </div>
        </div>
      </div>

      {/* FOOTER ACTION BUTTON */}
      <div className="fixed bottom-0 inset-x-0 bg-card border-t border-border p-4 z-20 pb-8">
        <button 
          onClick={handleApprovalRequest}
          disabled={!isFormValid || cart.length === 0 || isSubmitting}
          className={cn(
            "w-full h-14 text-lg font-bold rounded-xl flex items-center justify-center gap-3 shadow-lg transition-all",
            isFormValid && cart.length > 0
              ? "bg-primary hover:bg-primary/90 text-primary-foreground shadow-primary/20 active:scale-[0.98]"
              : "bg-muted text-muted-foreground cursor-not-allowed opacity-70"
          )}
        >
          {isSubmitting ? "Generating Link..." : <> <Send size={20} /> Send for Approval </>}
        </button>
      </div>
    </div>
  );
}