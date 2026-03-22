"use client";

import { useState } from "react";
import { useStore } from "@/context/StoreContext";
import { Trash2, ArrowLeft, CheckCircle, X, Plus, Minus, Store, ClipboardList, ShoppingCart, User, MapPin, Phone, Zap, Send } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { createOrder, approveOrder } from "@/app/actions";
import { toast } from "sonner";

export default function CartPage() {
  const { cart, removeFromCart, updateCartQty, clearCart, selectedClient } = useStore();
  const router = useRouter();

  const [details, setDetails] = useState({
    shopName: selectedClient?.shopName || "",
    phone: selectedClient?.phone || "",
    address: selectedClient?.city || "",
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitMode, setSubmitMode] = useState<'send' | 'self' | null>(null);

  const totalItems = cart.reduce((acc, item) => acc + item.qty, 0);
  const isFormValid = details.shopName && details.phone && details.address;

  const handleSubmit = async (mode: 'send' | 'self') => {
    if (!isFormValid) {
      toast.error("Missing Details", { description: "Please enter Shop Name, Phone, and Address." });
      return;
    }
    setIsSubmitting(true);
    setSubmitMode(mode);
    try {
      const result = await createOrder(details, cart);
      if (!result.success || !result.orderId) {
        toast.error("Database Error", { description: "Could not save the order." });
        return;
      }

      if (mode === 'send') {
        // Send WhatsApp approval link
        const clientLink = `${window.location.origin}/order/${result.orderId}`;
        const message = `*ORDER APPROVAL*\nHello ${details.shopName},\nPlease review and approve your order:\n\n${clientLink}\n\nTotal: ${totalItems} items`;
        const phone = details.phone.replace(/\D/g, '');
        toast.success("Order Created!", { description: "Opening WhatsApp..." });
        window.open(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`, '_blank');
      } else {
        // Self-approve immediately
        await approveOrder(result.orderId);
        toast.success("Order Self-Approved!", { description: "Order confirmed and ready to dispatch." });
      }
      clearCart();
      router.push(`/order/${result.orderId}?view=agent`);
    } catch (err) {
      console.error(err);
      toast.error("Error", { description: "Something went wrong." });
    } finally {
      setIsSubmitting(false);
      setSubmitMode(null);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 pb-32 font-sans">

      {/* === HEADER === */}
      <div className="bg-white px-4 py-4 sticky top-0 z-20 border-b border-slate-100 flex items-center justify-between shadow-sm">
        <Link href="/">
          <button className="p-2 -ml-2 hover:bg-slate-50 rounded-full transition-colors text-slate-700">
            <ArrowLeft size={22} />
          </button>
        </Link>
        <div className="text-center">
          <h1 className="font-bold text-slate-900 text-base leading-tight">Your Cart</h1>
          <p className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">{totalItems} items</p>
        </div>
        <button onClick={clearCart} className="p-2 -mr-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-full transition-colors">
          <Trash2 size={18} />
        </button>
      </div>

      <div className="px-4 pt-5 max-w-lg mx-auto space-y-4">

        {/* Cart empty state */}
        {cart.length === 0 && (
          <div className="text-center py-20 flex flex-col items-center opacity-50">
            <ShoppingCart size={52} className="mb-4 text-slate-300" strokeWidth={1} />
            <p className="font-semibold text-slate-500">Your cart is empty</p>
            <Link href="/" className="mt-4 text-sm text-blue-500 font-medium underline">Browse catalog</Link>
          </div>
        )}

        {/* === CART ITEMS === */}
        {cart.map((item) => (
          <div key={item.variantId} className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
            <div className="flex gap-3 p-4">
              <div className="h-16 w-16 bg-gradient-to-br from-slate-800 to-slate-900 rounded-xl flex items-center justify-center shrink-0">
                <Store className="text-white/30" size={24} />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-bold text-slate-900 text-sm leading-snug truncate">{item.productName}</h3>
                <p className="text-[11px] text-slate-400 mt-0.5 font-medium">{item.variantDetail}</p>
              </div>
              <button onClick={() => removeFromCart(item.variantId)} className="self-start text-slate-200 hover:text-red-400 transition-colors p-1">
                <X size={16} />
              </button>
            </div>
            <div className="border-t border-slate-50 px-4 py-3 flex items-center justify-between bg-slate-50/50">
              <span className="text-xs text-slate-400 font-medium">Quantity</span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => updateCartQty(item.variantId, Math.max(1, item.qty - 1))}
                  className="w-8 h-8 rounded-lg bg-white border border-slate-200 flex items-center justify-center text-slate-600 hover:border-slate-400 transition-all active:scale-95"
                >
                  <Minus size={13} />
                </button>
                <span className="w-8 text-center font-bold text-slate-900 text-sm">{item.qty}</span>
                <button
                  onClick={() => updateCartQty(item.variantId, item.qty + 1)}
                  className="w-8 h-8 rounded-lg bg-slate-900 text-white flex items-center justify-center hover:bg-slate-700 transition-all active:scale-95"
                >
                  <Plus size={13} />
                </button>
              </div>
            </div>
          </div>
        ))}

        {/* === CLIENT DETAILS === */}
        {cart.length > 0 && (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5 space-y-3">
            <h2 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Client Details</h2>
            {[
              { icon: Store, placeholder: "Shop Name", field: "shopName", type: "text" },
              { icon: Phone, placeholder: "Phone Number", field: "phone", type: "tel" },
              { icon: MapPin, placeholder: "Delivery Address", field: "address", type: "text" },
            ].map(({ icon: Icon, placeholder, field, type }) => (
              <div key={field} className="relative">
                <Icon className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-300" size={15} />
                <input
                  type={type}
                  placeholder={placeholder}
                  className="w-full pl-10 h-12 bg-slate-50 border border-slate-150 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 outline-none text-sm font-medium text-slate-900 placeholder:text-slate-300 transition-all"
                  value={(details as any)[field]}
                  onChange={(e) => setDetails(prev => ({ ...prev, [field]: e.target.value }))}
                />
              </div>
            ))}
          </div>
        )}

        {/* === ORDER SUMMARY + ACTION BUTTONS === */}
        {cart.length > 0 && (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5 space-y-4">
            <div className="space-y-2 text-sm">
              <div className="flex justify-between text-slate-500">
                <span>Unique Products</span>
                <span className="font-bold text-slate-900">{cart.length}</span>
              </div>
              <div className="flex justify-between text-slate-500">
                <span>Total Quantity</span>
                <span className="font-bold text-slate-900">{totalItems} units</span>
              </div>
            </div>

            <div className="border-t border-slate-100 pt-4 space-y-3">
              {/* Send for Approval via WhatsApp */}
              <button
                onClick={() => handleSubmit('send')}
                disabled={!isFormValid || isSubmitting}
                className={cn(
                  "w-full h-13 rounded-xl flex items-center justify-center gap-2.5 font-bold text-sm transition-all py-3.5",
                  isFormValid
                    ? "bg-[#25D366] hover:bg-[#1ebe59] text-white shadow-lg shadow-green-500/20 active:scale-[0.98]"
                    : "bg-slate-100 text-slate-300 cursor-not-allowed"
                )}
              >
                {isSubmitting && submitMode === 'send'
                  ? <span className="animate-pulse">Generating Link...</span>
                  : <><Send size={16} /> Send for Approval (WhatsApp)</>}
              </button>

              {/* Self Approve */}
              <button
                onClick={() => handleSubmit('self')}
                disabled={!isFormValid || isSubmitting}
                className={cn(
                  "w-full h-13 rounded-xl flex items-center justify-center gap-2.5 font-bold text-sm transition-all py-3.5",
                  isFormValid
                    ? "bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-500/20 active:scale-[0.98]"
                    : "bg-slate-100 text-slate-300 cursor-not-allowed"
                )}
              >
                {isSubmitting && submitMode === 'self'
                  ? <span className="animate-pulse">Approving...</span>
                  : <><Zap size={16} /> Self Approve &amp; Confirm</>}
              </button>

              <p className="text-center text-[10px] text-slate-400 font-medium">
                Self Approve instantly marks the order as confirmed
              </p>
            </div>
          </div>
        )}
      </div>

      {/* === BOTTOM NAV === */}
      <div className="fixed bottom-0 inset-x-0 bg-white/90 backdrop-blur-md border-t border-slate-100 px-6 py-3 flex justify-between items-center z-40">
        <Link href="/" className="flex flex-col items-center gap-0.5 text-slate-400 hover:text-slate-700 transition-colors w-full">
          <Store size={20} />
          <span className="text-[9px] font-bold tracking-wide uppercase">Catalog</span>
        </Link>
        <Link href="/dashboard" className="flex flex-col items-center gap-0.5 text-slate-400 hover:text-slate-700 transition-colors w-full">
          <ClipboardList size={20} />
          <span className="text-[9px] font-bold tracking-wide uppercase">Orders</span>
        </Link>
        <div className="flex flex-col items-center gap-0.5 text-blue-600 w-full">
          <ShoppingCart size={20} />
          <span className="text-[9px] font-bold tracking-wide uppercase">Cart</span>
        </div>
        <div className="flex flex-col items-center gap-0.5 text-slate-300 w-full">
          <User size={20} />
          <span className="text-[9px] font-bold tracking-wide uppercase">Profile</span>
        </div>
      </div>
    </div>
  );
}