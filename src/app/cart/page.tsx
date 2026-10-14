"use client";

import { useState, useEffect, useRef } from "react";
import { useStore, ALLOWED_UNITS, UnitType } from "@/context/StoreContext";
import { useProfile } from "@/context/ProfileContext";
import { 
  Trash2, ArrowLeft, CheckCircle, X, Plus, Minus, Store, ClipboardList, 
  ShoppingCart, User, MapPin, Phone, Zap, Send, Briefcase, PlusCircle, 
  Search, UserPlus, Upload, FileUp, Sparkles, Building2, Tag, Eye, EyeOff
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { createOrder, approveOrder } from "@/app/actions";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface ClientOption {
  id: string;
  name: string;
  ownerName?: string;
  phone: string;
  address?: string;
  city?: string;
}

export default function CartPage() {
  const { 
    cart, 
    removeFromCart, 
    updateCartQty, 
    updateCartRate,
    updateCartUnit,
    addCustomItem,
    clearCart, 
    showRates,
    toggleShowRates,
    selectedClient,
    setClient
  } = useStore();
  const { profile: activeProfile } = useProfile();
  const router = useRouter();

  // Client Selection / Autocomplete State
  const [clientSearch, setClientSearch] = useState(selectedClient?.shopName || "");
  const [clientList, setClientList] = useState<ClientOption[]>([]);
  const [isClientDropdownOpen, setIsClientDropdownOpen] = useState(false);
  const [isLoadingClients, setIsLoadingClients] = useState(false);
  const [selectedClientId, setSelectedClientId] = useState<string | null>(selectedClient?.id || null);

  const [details, setDetails] = useState({
    shopName: selectedClient?.shopName || "",
    ownerName: selectedClient?.ownerName || "",
    phone: selectedClient?.phone || "",
    address: selectedClient?.city || "",
  });

  // Modals state
  const [isNewClientModalOpen, setIsNewClientModalOpen] = useState(false);
  const [newClientData, setNewClientData] = useState({
    name: "",
    ownerName: "",
    phone: "",
    address: "",
    city: "Pune",
  });
  const [isCreatingClient, setIsCreatingClient] = useState(false);

  // Manual Item Modal State
  const [isManualItemModalOpen, setIsManualItemModalOpen] = useState(false);
  const [manualItemData, setManualItemData] = useState({
    name: "",
    detail: "Standard",
    unit: "Pcs" as UnitType,
    rate: "",
    qty: 1,
  });

  // PDF Client Import Modal State
  const [isPdfImportOpen, setIsPdfImportOpen] = useState(false);
  const [isUploadingPdf, setIsUploadingPdf] = useState(false);

  // Submitting Order State
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitMode, setSubmitMode] = useState<'send' | 'self' | null>(null);

  const clientDropdownRef = useRef<HTMLDivElement>(null);

  // Sync client state with selectedClient from store
  useEffect(() => {
    if (selectedClient) {
      setClientSearch(selectedClient.shopName);
      setSelectedClientId(selectedClient.id);
      setDetails({
        shopName: selectedClient.shopName,
        ownerName: selectedClient.ownerName || "",
        phone: selectedClient.phone,
        address: selectedClient.city || "",
      });
    }
  }, [selectedClient]);

  // Fetch clients on search change
  useEffect(() => {
    let active = true;
    const fetchClients = async () => {
      setIsLoadingClients(true);
      try {
        const res = await fetch(`/api/clients?search=${encodeURIComponent(clientSearch)}`);
        const data = await res.json();
        if (active && data.success && Array.isArray(data.clients)) {
          setClientList(data.clients);
        }
      } catch (err) {
        console.warn("Error searching clients:", err);
      } finally {
        if (active) setIsLoadingClients(false);
      }
    };

    const timer = setTimeout(fetchClients, 200);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [clientSearch]);

  // Handle outside click for client dropdown
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (clientDropdownRef.current && !clientDropdownRef.current.contains(e.target as Node)) {
        setIsClientDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const totalItems = cart.reduce((acc, item) => acc + (Number(item.qty) || 1), 0);
  const grandTotal = cart.reduce((acc, item) => {
    const rate = Number(item.rate || 0);
    const qty = Number(item.qty || 1);
    return acc + (item.totalPrice !== undefined ? Number(item.totalPrice) : rate * qty);
  }, 0);

  const isFormValid = details.shopName.trim() && details.phone.trim() && details.address.trim();

  // Select an existing client
  const handleSelectClient = (c: ClientOption) => {
    setSelectedClientId(c.id);
    setClientSearch(c.name);
    setDetails({
      shopName: c.name,
      ownerName: c.ownerName || "",
      phone: c.phone,
      address: c.address || c.city || "Pune",
    });
    setClient({
      id: c.id,
      shopName: c.name,
      ownerName: c.ownerName || "",
      city: c.city || c.address || "Pune",
      phone: c.phone,
    });
    setIsClientDropdownOpen(false);
    toast.success(`Selected ${c.name}`);
  };

  // Create new client
  const handleCreateNewClient = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newClientData.name.trim() || !newClientData.phone.trim()) {
      toast.error("Please enter Client/Shop Name and Phone number.");
      return;
    }

    setIsCreatingClient(true);
    try {
      const res = await fetch("/api/clients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newClientData),
      });
      const data = await res.json();
      if (!data.success || !data.client) {
        throw new Error(data.error || "Failed to create client");
      }

      const created: ClientOption = data.client;
      handleSelectClient(created);
      setIsNewClientModalOpen(false);
      setNewClientData({ name: "", ownerName: "", phone: "", address: "", city: "Pune" });
      toast.success("New Client Added & Selected!");
    } catch (err: any) {
      toast.error(err.message || "Could not save client.");
    } finally {
      setIsCreatingClient(false);
    }
  };

  // Add Manual Item
  const handleAddManualItem = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualItemData.name.trim()) {
      toast.error("Please enter item name");
      return;
    }

    const rateNum = parseFloat(manualItemData.rate) || 0;
    addCustomItem({
      productName: manualItemData.name.trim(),
      variantDetail: manualItemData.detail.trim() || "Manual Item",
      unit: manualItemData.unit,
      rate: rateNum,
      qty: Math.max(1, manualItemData.qty),
    });

    toast.success(`Added ${manualItemData.name} to order`);
    setIsManualItemModalOpen(false);
    setManualItemData({
      name: "",
      detail: "Standard",
      unit: "Pcs",
      rate: "",
      qty: 1,
    });
  };

  // PDF Client Import
  const handleImportClientPdf = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploadingPdf(true);
    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch("/api/clients/import-pdf", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || "Failed to parse PDF");

      toast.success(`Imported ${data.importedCount || 0} clients from PDF!`);
      setIsPdfImportOpen(false);
      // Refresh list
      const updatedRes = await fetch("/api/clients");
      const updatedData = await updatedRes.json();
      if (updatedData.success) setClientList(updatedData.clients);
    } catch (err: any) {
      toast.error(err.message || "Could not import PDF");
    } finally {
      setIsUploadingPdf(false);
    }
  };

  const handleSubmit = async (mode: 'send' | 'self') => {
    if (!isFormValid) {
      toast.error("Missing Details", { description: "Please enter Shop Name, Phone, and Address." });
      return;
    }
    setIsSubmitting(true);
    setSubmitMode(mode);
    try {
      const orderPayload = {
        ...details,
        clientId: selectedClientId,
      };

      const result = await createOrder(orderPayload, cart, activeProfile?.id);
      if (!result.success || !result.orderId) {
        toast.error("Database Error", { description: "Could not save the order." });
        return;
      }

      if (mode === 'send') {
        // Send WhatsApp approval link
        const clientLink = `${window.location.origin}/order/${result.orderId}`;
        const phone = details.phone.replace(/\D/g, '');
        const invoiceDownloadUrl = `${window.location.origin}/api/orders/${result.orderId}/invoice`;

        let message = `*🚀 ORDER APPROVAL REQUEST - ${details.shopName}*\n\n`;
        message += `👤 Contact: ${details.ownerName || "N/A"}\n`;
        message += `📦 Total Items: ${totalItems} (${cart.length} products)\n`;
        if (showRates && grandTotal > 0) {
          message += `💰 Grand Total: ₹${grandTotal.toFixed(2)}\n`;
        }
        message += `\n*Please review and approve your order:*\n${clientLink}\n\n`;
        message += `*Download Invoice PDF:*\n${invoiceDownloadUrl}`;

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
          <h1 className="font-bold text-slate-900 text-base leading-tight">Order Creation</h1>
          <p className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">
            {totalItems} units {showRates && grandTotal > 0 ? `• ₹${grandTotal.toFixed(2)}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <button 
            onClick={toggleShowRates}
            title={showRates ? "Hide Rates" : "Show Rates"}
            className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-full transition-colors"
          >
            {showRates ? <Eye size={18} /> : <EyeOff size={18} />}
          </button>
          <button 
            onClick={clearCart} 
            title="Clear Cart"
            className="p-2 -mr-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-full transition-colors"
          >
            <Trash2 size={18} />
          </button>
        </div>
      </div>

      <div className="px-4 pt-5 max-w-lg mx-auto space-y-4">

        {/* Action Header: Manually Add Item Button */}
        <div className="flex items-center justify-between bg-white rounded-2xl p-3 border border-slate-200/80 shadow-sm">
          <div>
            <p className="text-xs font-bold text-slate-800">Add Items to Order</p>
            <p className="text-[11px] text-slate-400">Add catalog items or custom items</p>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/">
              <Button variant="outline" size="sm" className="rounded-xl text-xs h-9 border-slate-200">
                Browse Catalog
              </Button>
            </Link>
            <Button 
              onClick={() => setIsManualItemModalOpen(true)}
              size="sm" 
              className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs h-9 font-bold flex items-center gap-1 shadow-sm"
            >
              <PlusCircle size={14} /> Manually Add Item
            </Button>
          </div>
        </div>

        {/* Cart empty state */}
        {cart.length === 0 && (
          <div className="text-center py-16 bg-white rounded-2xl border border-dashed border-slate-200 flex flex-col items-center">
            <ShoppingCart size={48} className="mb-3 text-slate-300" strokeWidth={1.5} />
            <p className="font-bold text-slate-700 text-base">Your cart is empty</p>
            <p className="text-xs text-slate-400 max-w-xs mt-1 mb-4">
              Add products from the catalog or tap &apos;Manually Add Item&apos; to create an order item on the fly.
            </p>
            <div className="flex gap-2">
              <Button onClick={() => setIsManualItemModalOpen(true)} className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs">
                <PlusCircle size={14} className="mr-1" /> Add Custom Product
              </Button>
              <Link href="/">
                <Button variant="outline" className="rounded-xl text-xs">Browse Catalog</Button>
              </Link>
            </div>
          </div>
        )}

        {/* === CART ITEMS LIST === */}
        {cart.map((item) => {
          const itemUnit = item.unit || "Pcs";
          const itemRate = Number(item.rate || 0);
          const lineTotal = item.totalPrice !== undefined ? Number(item.totalPrice) : itemRate * item.qty;

          return (
            <div key={item.variantId} className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
              <div className="flex gap-3 p-4">
                <div className="h-14 w-14 bg-gradient-to-br from-slate-800 to-slate-900 rounded-xl flex items-center justify-center shrink-0 text-white">
                  <Store size={22} className="opacity-40" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-bold text-slate-900 text-sm leading-snug truncate">{item.productName}</h3>
                    <button 
                      onClick={() => removeFromCart(item.variantId)} 
                      className="text-slate-300 hover:text-red-500 transition-colors p-1"
                      title="Remove Item"
                    >
                      <X size={16} />
                    </button>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-0.5 font-medium">{item.variantDetail}</p>
                  
                  {/* Inline editable rate indicator */}
                  {showRates && (
                    <div className="flex items-center gap-1.5 mt-2">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Rate:</span>
                      <div className="relative inline-flex items-center">
                        <span className="absolute left-2 text-xs font-bold text-slate-400">₹</span>
                        <input
                          type="number"
                          step="any"
                          value={item.rate !== undefined ? item.rate : ""}
                          placeholder="0.00"
                          onChange={(e) => updateCartRate(item.variantId, parseFloat(e.target.value) || 0)}
                          className="w-24 pl-5 pr-2 py-1 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-slate-800 focus:bg-white focus:border-indigo-400 outline-none"
                        />
                      </div>
                      <span className="text-[11px] text-slate-400 font-medium">/ {itemUnit}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Bottom bar: Packaging Unit Dropdown + Quantity Selector + Line Total */}
              <div className="border-t border-slate-50 px-4 py-3 bg-slate-50/50 flex flex-wrap items-center justify-between gap-2">
                {/* Unit Selector Dropdown */}
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] text-slate-400 font-bold uppercase tracking-wider">Unit:</span>
                  <select
                    value={itemUnit}
                    onChange={(e) => updateCartUnit(item.variantId, e.target.value)}
                    className="h-8 px-2.5 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-700 outline-none focus:border-indigo-400"
                  >
                    {ALLOWED_UNITS.map((u) => (
                      <option key={u} value={u}>{u}</option>
                    ))}
                  </select>
                </div>

                {/* Quantity Controls */}
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => updateCartQty(item.variantId, Math.max(1, item.qty - 1))}
                      className="w-7 h-7 rounded-lg bg-white border border-slate-200 flex items-center justify-center text-slate-600 hover:border-slate-400 transition-all active:scale-95"
                    >
                      <Minus size={12} />
                    </button>
                    <span className="w-8 text-center font-bold text-slate-900 text-sm">{item.qty}</span>
                    <button
                      onClick={() => updateCartQty(item.variantId, item.qty + 1)}
                      className="w-7 h-7 rounded-lg bg-slate-900 text-white flex items-center justify-center hover:bg-slate-700 transition-all active:scale-95"
                    >
                      <Plus size={12} />
                    </button>
                  </div>

                  {/* Line Total */}
                  {showRates && lineTotal > 0 && (
                    <div className="text-right pl-2 border-l border-slate-200">
                      <span className="text-[10px] text-slate-400 block font-medium">Total</span>
                      <span className="text-xs font-extrabold text-slate-900 font-serif">
                        ₹{lineTotal.toFixed(2)}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}

        {/* === CLIENT MANAGEMENT (CRM) SECTION === */}
        {cart.length > 0 && (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Client &amp; Destination (CRM)</h2>
                <p className="text-[11px] text-slate-400">Search existing client or add a new shop</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsPdfImportOpen(true)}
                  className="text-[11px] font-bold text-slate-600 hover:text-slate-900 flex items-center gap-1 bg-slate-100 hover:bg-slate-200 px-2.5 py-1 rounded-lg transition-all"
                  title="Import Clients from PDF"
                >
                  <FileUp size={12} /> PDF
                </button>
                <button
                  type="button"
                  onClick={() => setIsNewClientModalOpen(true)}
                  className="text-[11px] font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1 bg-indigo-50 hover:bg-indigo-100 px-2.5 py-1 rounded-lg transition-all"
                >
                  <UserPlus size={12} /> + Add Client
                </button>
              </div>
            </div>

            {/* Searchable Autocomplete Dropdown */}
            <div className="relative" ref={clientDropdownRef}>
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                Search Client Directory
              </label>
              <div className="relative">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                <input
                  type="text"
                  placeholder="Type shop name, owner, or phone..."
                  value={clientSearch}
                  onFocus={() => setIsClientDropdownOpen(true)}
                  onChange={(e) => {
                    setClientSearch(e.target.value);
                    setDetails(prev => ({ ...prev, shopName: e.target.value }));
                    setIsClientDropdownOpen(true);
                  }}
                  className="w-full pl-10 pr-10 h-12 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none text-sm font-semibold text-slate-900 placeholder:text-slate-400 transition-all"
                />
                {clientSearch && (
                  <button 
                    onClick={() => {
                      setClientSearch("");
                      setSelectedClientId(null);
                      setDetails({ shopName: "", ownerName: "", phone: "", address: "" });
                    }} 
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-300 hover:text-slate-600"
                  >
                    <X size={16} />
                  </button>
                )}
              </div>

              {/* Autocomplete Menu */}
              {isClientDropdownOpen && (
                <div className="absolute left-0 right-0 top-full mt-1.5 bg-white border border-slate-200 rounded-2xl shadow-xl z-50 max-h-60 overflow-y-auto divide-y divide-slate-50">
                  {isLoadingClients && (
                    <div className="p-3 text-center text-xs text-slate-400 animate-pulse">Searching clients...</div>
                  )}

                  {!isLoadingClients && clientList.length === 0 && (
                    <div className="p-4 text-center">
                      <p className="text-xs text-slate-500 font-medium">No matching clients found</p>
                      <button
                        type="button"
                        onClick={() => {
                          setIsClientDropdownOpen(false);
                          setNewClientData(prev => ({ ...prev, name: clientSearch }));
                          setIsNewClientModalOpen(true);
                        }}
                        className="mt-2 text-xs font-bold text-indigo-600 hover:underline"
                      >
                        + Create &quot;{clientSearch}&quot; as New Client
                      </button>
                    </div>
                  )}

                  {!isLoadingClients && clientList.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => handleSelectClient(c)}
                      className="w-full p-3.5 text-left hover:bg-slate-50 flex items-center justify-between transition-colors group"
                    >
                      <div>
                        <p className="text-sm font-bold text-slate-900 group-hover:text-indigo-600">{c.name}</p>
                        <p className="text-xs text-slate-400">
                          {c.ownerName ? `${c.ownerName} • ` : ""}{c.phone} • {c.city || c.address}
                        </p>
                      </div>
                      <span className="text-[10px] bg-slate-100 text-slate-500 font-bold px-2 py-1 rounded-md group-hover:bg-indigo-50 group-hover:text-indigo-600">
                        Select
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Client Details Editable Fields */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
              <div className="relative">
                <Phone className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-300" size={15} />
                <input
                  type="tel"
                  placeholder="Phone Number *"
                  className="w-full pl-10 h-11 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-indigo-400 outline-none text-xs font-semibold text-slate-800"
                  value={details.phone}
                  onChange={(e) => setDetails(prev => ({ ...prev, phone: e.target.value }))}
                />
              </div>

              <div className="relative">
                <User className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-300" size={15} />
                <input
                  type="text"
                  placeholder="Proprietor / Contact Name"
                  className="w-full pl-10 h-11 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-indigo-400 outline-none text-xs font-semibold text-slate-800"
                  value={details.ownerName}
                  onChange={(e) => setDetails(prev => ({ ...prev, ownerName: e.target.value }))}
                />
              </div>

              <div className="relative sm:col-span-2">
                <MapPin className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-300" size={15} />
                <input
                  type="text"
                  placeholder="Delivery Address / City *"
                  className="w-full pl-10 h-11 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-indigo-400 outline-none text-xs font-semibold text-slate-800"
                  value={details.address}
                  onChange={(e) => setDetails(prev => ({ ...prev, address: e.target.value }))}
                />
              </div>
            </div>
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
              {showRates && (
                <div className="flex justify-between items-center pt-2 border-t border-slate-100 text-slate-900">
                  <span className="font-bold text-sm">Grand Total Amount</span>
                  <span className="text-xl font-black text-emerald-600 font-serif">
                    ₹{grandTotal.toFixed(2)}
                  </span>
                </div>
              )}
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
                  ? <span className="animate-pulse">Generating Link &amp; Invoice...</span>
                  : <><Send size={16} /> Send for Approval &amp; PDF (WhatsApp)</>}
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
                  ? <span className="animate-pulse">Approving Order...</span>
                  : <><Zap size={16} /> Self Approve &amp; Generate Invoice</>}
              </button>

              <p className="text-center text-[10px] text-slate-400 font-medium">
                Generates printable PDF invoice stored in Supabase with WhatsApp link
              </p>
            </div>
          </div>
        )}
      </div>

      {/* === MODAL: ADD MANUAL ITEM === */}
      <Dialog open={isManualItemModalOpen} onOpenChange={setIsManualItemModalOpen}>
        <DialogContent className="max-w-md bg-white p-6 rounded-2xl shadow-2xl border-0">
          <DialogHeader className="text-left">
            <DialogTitle className="text-lg font-bold text-slate-900">Manually Add Item</DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              Add custom products on the fly with packaging unit, custom rate, and quantity.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleAddManualItem} className="space-y-4 pt-2">
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">Product Name *</label>
              <input
                type="text"
                placeholder="e.g. Mortice Handle Brass Antique"
                required
                value={manualItemData.name}
                onChange={(e) => setManualItemData(prev => ({ ...prev, name: e.target.value }))}
                className="w-full h-11 px-3.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-900 outline-none focus:bg-white focus:border-indigo-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Variant / Spec</label>
                <input
                  type="text"
                  placeholder="e.g. 200mm Heavy"
                  value={manualItemData.detail}
                  onChange={(e) => setManualItemData(prev => ({ ...prev, detail: e.target.value }))}
                  className="w-full h-11 px-3.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-900 outline-none focus:bg-white focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Packaging Unit *</label>
                <select
                  value={manualItemData.unit}
                  onChange={(e) => setManualItemData(prev => ({ ...prev, unit: e.target.value as UnitType }))}
                  className="w-full h-11 px-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 outline-none focus:bg-white focus:border-indigo-500"
                >
                  {ALLOWED_UNITS.map((u) => (
                    <option key={u} value={u}>{u}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Rate (₹ / {manualItemData.unit})
                </label>
                <input
                  type="number"
                  step="any"
                  placeholder="0.00"
                  value={manualItemData.rate}
                  onChange={(e) => setManualItemData(prev => ({ ...prev, rate: e.target.value }))}
                  className="w-full h-11 px-3.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-900 outline-none focus:bg-white focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Quantity *</label>
                <input
                  type="number"
                  min="1"
                  required
                  value={manualItemData.qty}
                  onChange={(e) => setManualItemData(prev => ({ ...prev, qty: parseInt(e.target.value) || 1 }))}
                  className="w-full h-11 px-3.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-900 outline-none focus:bg-white focus:border-indigo-500"
                />
              </div>
            </div>

            {Number(manualItemData.rate) > 0 && (
              <div className="p-3 bg-indigo-50 rounded-xl text-xs flex justify-between items-center text-indigo-950 font-bold">
                <span>Calculated Line Total:</span>
                <span className="text-sm font-black">
                  ₹{(Number(manualItemData.rate) * manualItemData.qty).toFixed(2)}
                </span>
              </div>
            )}

            <div className="flex gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setIsManualItemModalOpen(false)} className="w-1/2 rounded-xl">
                Cancel
              </Button>
              <Button type="submit" className="w-1/2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold">
                Add to Cart
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* === MODAL: ADD NEW CLIENT === */}
      <Dialog open={isNewClientModalOpen} onOpenChange={setIsNewClientModalOpen}>
        <DialogContent className="max-w-md bg-white p-6 rounded-2xl shadow-2xl border-0">
          <DialogHeader className="text-left">
            <DialogTitle className="text-lg font-bold text-slate-900">Add New Client (CRM)</DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              Save client details directly to the database for this and future orders.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCreateNewClient} className="space-y-3 pt-2">
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">Shop / Business Name *</label>
              <input
                type="text"
                placeholder="e.g. Royal Hardware &amp; Tools"
                required
                value={newClientData.name}
                onChange={(e) => setNewClientData(prev => ({ ...prev, name: e.target.value }))}
                className="w-full h-11 px-3.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-900 outline-none focus:bg-white focus:border-indigo-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Proprietor Name</label>
                <input
                  type="text"
                  placeholder="e.g. Ramesh Bhai"
                  value={newClientData.ownerName}
                  onChange={(e) => setNewClientData(prev => ({ ...prev, ownerName: e.target.value }))}
                  className="w-full h-11 px-3.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-900 outline-none focus:bg-white focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Phone Number *</label>
                <input
                  type="tel"
                  placeholder="e.g. 9822000000"
                  required
                  value={newClientData.phone}
                  onChange={(e) => setNewClientData(prev => ({ ...prev, phone: e.target.value }))}
                  className="w-full h-11 px-3.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-900 outline-none focus:bg-white focus:border-indigo-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">City / Region</label>
                <input
                  type="text"
                  placeholder="Pune"
                  value={newClientData.city}
                  onChange={(e) => setNewClientData(prev => ({ ...prev, city: e.target.value }))}
                  className="w-full h-11 px-3.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-900 outline-none focus:bg-white focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Address / Landmark</label>
                <input
                  type="text"
                  placeholder="Market Yard, Timber Market"
                  value={newClientData.address}
                  onChange={(e) => setNewClientData(prev => ({ ...prev, address: e.target.value }))}
                  className="w-full h-11 px-3.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-900 outline-none focus:bg-white focus:border-indigo-500"
                />
              </div>
            </div>

            <div className="flex gap-2 pt-3">
              <Button type="button" variant="outline" onClick={() => setIsNewClientModalOpen(false)} className="w-1/2 rounded-xl">
                Cancel
              </Button>
              <Button type="submit" disabled={isCreatingClient} className="w-1/2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold">
                {isCreatingClient ? "Saving..." : "Save & Select"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* === MODAL: IMPORT CLIENT PDF === */}
      <Dialog open={isPdfImportOpen} onOpenChange={setIsPdfImportOpen}>
        <DialogContent className="max-w-md bg-white p-6 rounded-2xl shadow-2xl border-0">
          <DialogHeader className="text-left">
            <DialogTitle className="text-lg font-bold text-slate-900">Import Client Directory PDF</DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              Upload any PDF containing contact or shop lists. AI and regex parser will extract and seed them into Supabase.
            </DialogDescription>
          </DialogHeader>

          <div className="py-6 border-2 border-dashed border-slate-200 rounded-2xl text-center bg-slate-50 flex flex-col items-center justify-center">
            <FileUp className="w-10 h-10 text-indigo-500 mb-2" />
            <p className="text-xs font-bold text-slate-800">Select PDF File</p>
            <p className="text-[10px] text-slate-400 mb-3">Accepts .pdf files</p>
            <label className="cursor-pointer">
              <span className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-sm transition-all inline-block">
                {isUploadingPdf ? "Analyzing & Importing..." : "Choose File"}
              </span>
              <input
                type="file"
                accept=".pdf,application/pdf"
                disabled={isUploadingPdf}
                onChange={handleImportClientPdf}
                className="hidden"
              />
            </label>
          </div>
        </DialogContent>
      </Dialog>

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
        <div className="flex flex-col items-center gap-0.5 text-indigo-600 w-full">
          <ShoppingCart size={20} />
          <span className="text-[9px] font-bold tracking-wide uppercase">Cart</span>
        </div>
        <Link href="/select-profile" className="flex flex-col items-center gap-0.5 text-slate-400 hover:text-slate-700 transition-colors w-full">
          <User size={20} />
          <span className="text-[9px] font-bold tracking-wide uppercase">Profile</span>
        </Link>
      </div>
    </div>
  );
}