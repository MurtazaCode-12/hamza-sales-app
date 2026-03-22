"use client";

import { useState } from "react";
import { useStore } from "@/context/StoreContext";
import { Trash2, ArrowLeft, CheckCircle, X, Plus, Minus, Store, ClipboardList, ShoppingCart, User, MapPin, Phone } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { createOrder } from "@/app/actions"; 
import { toast } from "sonner"; 

const BRAND_BROWN = "bg-[#4A2B1D]";
const BRAND_TEXT = "text-[#4A2B1D]";

export default function CartPage() {
  const { cart, removeFromCart, updateCartQty, clearCart, selectedClient } = useStore();
  const router = useRouter();

  const [guestDetails, setGuestDetails] = useState({
    shopName: selectedClient?.shopName || "",
    phone: selectedClient?.phone || "",
    address: selectedClient?.city || "",
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const totalItems = cart.reduce((acc, item) => acc + item.qty, 0);
  const uniqueItems = cart.length;

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
        toast.error("Database Error", { description: "Could not save the order." });
      }
    } catch (error) {
      console.error(error);
      toast.error("System Error", { description: "Something went wrong." });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F9F9F9] pb-32 font-sans selection:bg-[#4A2B1D] selection:text-white">
      
      {/* === HEADER === */}
      <div className="bg-white px-4 py-4 sticky top-0 z-20 shadow-sm flex items-center justify-between border-b border-slate-100">
        <Link href="/">
           <button className="p-2 -ml-2 text-slate-900 hover:bg-slate-50 rounded-full transition-colors">
             <ArrowLeft size={24} />
           </button>
        </Link>
        <h1 className="font-serif font-bold text-xl text-slate-900">Shopping Cart</h1>
        <button onClick={clearCart} className="p-2 -mr-2 text-red-500 hover:bg-red-50 rounded-full transition-colors">
          <Trash2 size={20} />
        </button>
      </div>

      <div className="px-4 pt-6 max-w-2xl mx-auto space-y-6">
        
        {/* === CART ITEMS === */}
        <div className="space-y-4">
          {cart.map((item) => (
            <div key={item.variantId} className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100 flex flex-col gap-4">
              <div className="flex gap-4">
                {/* Simulated Image Box matching your mockup */}
                <div className="h-20 w-20 bg-zinc-900 rounded-xl p-2 shrink-0 shadow-inner flex items-center justify-center relative overflow-hidden">
                   <Store className="text-white/20" size={32} />
                </div>
                
                <div className="pt-1 flex-1">
                  <h3 className="font-serif font-bold text-slate-900 text-[16px] leading-tight mb-1">
                    {item.productName}
                  </h3>
                  <p className="text-[11px] text-slate-500 uppercase tracking-wider">
                    SKU: {item.productId.substring(0, 6)} | {item.variantDetail}
                  </p>
                </div>
              </div>

              {/* Bottom Row: Remove & Quantity */}
              <div className="flex justify-between items-center pt-2 border-t border-slate-50">
                <button 
                  onClick={() => removeFromCart(item.variantId)}
                  className="flex items-center gap-1.5 text-slate-400 hover:text-red-500 text-[12px] font-semibold transition-colors"
                >
                  <X size={14} /> Remove
                </button>

                <div className="flex items-center gap-2">
                  <div className="flex h-10 bg-white rounded-lg border border-slate-200 items-center overflow-hidden w-[90px]">
                    <button 
                      onClick={() => updateCartQty(item.variantId, Math.max(1, item.qty - 1))}
                      className="w-8 h-full flex justify-center items-center text-slate-400 hover:text-slate-800 transition-colors"
                    >
                      <Minus size={14} />
                    </button>
                    <span className="flex-1 text-center font-bold text-[13px] text-slate-900">
                      {item.qty}
                    </span>
                  </div>
                  
                  <button 
                    onClick={() => updateCartQty(item.variantId, item.qty + 1)}
                    className={`${BRAND_BROWN} text-white h-10 w-10 rounded-lg flex items-center justify-center hover:bg-[#321C10] shadow-md shadow-[#4A2B1D]/20 active:scale-95 transition-all`}
                  >
                    <Plus size={18} strokeWidth={2.5} />
                  </button>
                </div>
              </div>
            </div>
          ))}

          {cart.length === 0 && (
            <div className="text-center py-16 flex flex-col items-center opacity-50 bg-white rounded-2xl border border-slate-100">
               <ShoppingCart size={48} className="mb-3 text-slate-300" strokeWidth={1} />
               <p className="text-sm font-medium text-slate-500">Your cart is empty</p>
            </div>
          )}
        </div>

        {/* === CLIENT DETAILS FORM === */}
        {cart.length > 0 && (
          <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm space-y-4">
             <h2 className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.15em]">Client Information</h2>
             
             <div className="space-y-3">
                <div className="relative">
                  <Store className="absolute left-3 top-3.5 text-slate-400" size={16} />
                  <input 
                    type="text" placeholder="Shop Name"
                    className="w-full pl-10 h-12 bg-slate-50 border border-slate-100 rounded-xl focus:ring-2 focus:ring-[#4A2B1D]/20 focus:border-[#4A2B1D] outline-none text-sm font-medium text-slate-900"
                    value={guestDetails.shopName} onChange={(e) => handleInputChange("shopName", e.target.value)}
                  />
                </div>
                <div className="relative">
                  <Phone className="absolute left-3 top-3.5 text-slate-400" size={16} />
                  <input 
                    type="tel" placeholder="Phone Number"
                    className="w-full pl-10 h-12 bg-slate-50 border border-slate-100 rounded-xl focus:ring-2 focus:ring-[#4A2B1D]/20 focus:border-[#4A2B1D] outline-none text-sm font-medium text-slate-900"
                    value={guestDetails.phone} onChange={(e) => handleInputChange("phone", e.target.value)}
                  />
                </div>
                <div className="relative">
                  <MapPin className="absolute left-3 top-3.5 text-slate-400" size={16} />
                  <input 
                    type="text" placeholder="Delivery Address"
                    className="w-full pl-10 h-12 bg-slate-50 border border-slate-100 rounded-xl focus:ring-2 focus:ring-[#4A2B1D]/20 focus:border-[#4A2B1D] outline-none text-sm font-medium text-slate-900"
                    value={guestDetails.address} onChange={(e) => handleInputChange("address", e.target.value)}
                  />
                </div>
             </div>
          </div>
        )}

        {/* === ORDER SUMMARY === */}
        {cart.length > 0 && (
          <div className="bg-white border-t border-slate-200 mt-8 pt-6 pb-2 px-2">
            <div className="space-y-3 text-sm text-slate-500 font-medium mb-6">
              <div className="flex justify-between">
                <span>Unique Products</span>
                <span className="text-slate-900">{uniqueItems}</span>
              </div>
              <div className="flex justify-between">
                <span>Total Quantity</span>
                <span className="text-slate-900">{totalItems} Units</span>
              </div>
              <div className="flex justify-between">
                <span>Shipping (Freight)</span>
                <span className="text-green-600 font-bold">To be calculated</span>
              </div>
            </div>

            <div className="flex justify-between items-center mb-6">
              <h2 className="font-serif font-bold text-xl text-slate-900">Total Order</h2>
              <span className="font-serif font-bold text-2xl text-[#4A2B1D]">{totalItems} Items</span>
            </div>

            <button 
              onClick={handleApprovalRequest}
              disabled={!isFormValid || isSubmitting}
              className={cn(
                "w-full h-14 rounded-xl flex items-center justify-center gap-2 font-bold text-[15px] transition-all",
                isFormValid 
                  ? `${BRAND_BROWN} hover:bg-[#321C10] text-white shadow-lg shadow-[#4A2B1D]/30 active:scale-[0.98]`
                  : "bg-slate-200 text-slate-400 cursor-not-allowed"
              )}
            >
              {isSubmitting ? "Generating Secure Link..." : (
                <>
                  <CheckCircle size={20} /> Place Order
                </>
              )}
            </button>
          </div>
        )}
      </div>

      {/* === BOTTOM NAVIGATION === */}
      <div className="fixed bottom-0 inset-x-0 bg-white border-t border-slate-100 px-6 py-3 flex justify-between items-center z-40 pb-safe shadow-[0_-10px_20px_-10px_rgba(0,0,0,0.05)]">
         <Link href="/" className="w-full">
            <NavIcon icon={<Store size={22} />} label="Catalog" />
         </Link>
         <Link href="/dashboard" className="w-full">
            <NavIcon icon={<ClipboardList size={22} />} label="Orders" />
         </Link>
         <NavIcon icon={<ShoppingCart size={22} />} label="Cart" active />
         <NavIcon icon={<User size={22} />} label="Profile" />
      </div>
    </div>
  );
}

// === SUB-COMPONENT: Navigation Icon ===
function NavIcon({ icon, label, active = false }: { icon: React.ReactNode, label: string, active?: boolean }) {
  return (
    <div className={cn(
      "flex flex-col items-center gap-1 w-full",
      active ? BRAND_TEXT : "text-slate-400 hover:text-slate-600"
    )}>
      {icon}
      <span className="text-[10px] font-bold tracking-wide">{label}</span>
    </div>
  );
}