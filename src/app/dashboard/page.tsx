"use client";

import { useState, useEffect, useCallback } from "react";
import { getRecentOrders } from "@/app/actions";
import { useProfile } from "@/context/ProfileContext";
import { 
  CheckCircle, 
  Clock, 
  PackageCheck, 
  ArrowRight, 
  Home, 
  RotateCw, 
  TrendingUp, 
  ShoppingBag, 
  Users, 
  ShieldCheck, 
  Briefcase, 
  ExternalLink,
  Package,
  FileText,
  LogOut
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import UploadPriceListModal from "@/components/UploadPriceListModal";

export default function Dashboard() {
  const router = useRouter();
  const { profile: activeProfile, isLoading: isProfileLoading, isAdmin, switchProfile, signOut } = useProfile();

  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [adminFilterScope, setAdminFilterScope] = useState<"all" | "mine">("all");
  const [isPriceModalOpen, setIsPriceModalOpen] = useState(false);

  // Auth / Profile check: Redirect to /select-profile if no profile chosen
  useEffect(() => {
    if (!isProfileLoading && !activeProfile) {
      toast.info("Please select who is using the app");
      router.push("/select-profile");
    }
  }, [isProfileLoading, activeProfile, router]);

  const fetchOrders = useCallback(async (showRefreshAnim = false) => {
    if (!activeProfile) return;
    if (showRefreshAnim) setIsRefreshing(true);

    // If standard user: only fetch their orders (profileId).
    // If admin: fetch all orders by default, or only theirs if toggled.
    const filterId = activeProfile.role === "admin" && adminFilterScope === "all" 
      ? undefined 
      : activeProfile.id;

    const data = await getRecentOrders(filterId);
    setOrders(data as any[]);
    setLastUpdated(new Date());
    setLoading(false);
    if (showRefreshAnim) setTimeout(() => setIsRefreshing(false), 500);
  }, [activeProfile, adminFilterScope]);

  // Initial load & when profile or filter changes
  useEffect(() => {
    if (activeProfile) {
      fetchOrders();
    }
  }, [activeProfile, adminFilterScope, fetchOrders]);

  // Auto-refresh every 12 seconds
  useEffect(() => {
    if (!activeProfile) return;
    const interval = setInterval(() => fetchOrders(), 12000);
    return () => clearInterval(interval);
  }, [activeProfile, fetchOrders]);

  const total = orders.length;
  const approved = orders.filter((o: any) => o.status === 'APPROVED' || o.status === 'DISPATCHED').length;
  const pending = orders.filter((o: any) => o.status === 'PENDING').length;

  if (isProfileLoading || !activeProfile) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center text-slate-400">
        <RotateCw className="animate-spin mr-2" size={20} />
        <span>Loading sales dashboard...</span>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 pb-24 font-sans">
      {/* === HEADER === */}
      <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white px-5 pt-8 pb-7 shadow-xl relative overflow-hidden">
        <div className="absolute inset-0 opacity-10" style={{backgroundImage: 'radial-gradient(circle at 80% 20%, #3b82f6 0%, transparent 50%)'}} />
        <div className="relative">
          {/* Top user bar */}
          <div className="flex justify-between items-start mb-5">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xl">{activeProfile.avatar || (isAdmin ? "👑" : "💼")}</span>
                <span className="text-slate-300 text-xs font-semibold">
                  {isAdmin ? "Admin View" : "Sales Representative"}
                </span>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md uppercase tracking-wider ${
                  isAdmin 
                    ? "bg-rose-500/20 text-rose-300 border border-rose-500/30" 
                    : "bg-indigo-500/20 text-indigo-300 border border-indigo-500/30"
                }`}>
                  {activeProfile.role}
                </span>
              </div>
              <h1 className="text-2xl font-bold tracking-tight">
                {activeProfile.name}
              </h1>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => fetchOrders(true)}
                className="p-2.5 bg-white/10 hover:bg-white/20 rounded-xl transition-all active:scale-95"
                title="Refresh orders"
              >
                <RotateCw size={15} className={isRefreshing ? 'animate-spin' : ''} />
              </button>
              
              <button
                onClick={switchProfile}
                className="p-2.5 bg-white/10 hover:bg-white/20 text-slate-200 rounded-xl transition-all active:scale-95 flex items-center gap-1.5 text-xs font-semibold"
                title="Switch active profile"
              >
                <Users size={15} />
                <span className="hidden sm:inline">Switch</span>
              </button>

              {isAdmin && (
                <Link href="/admin">
                  <button className="p-2.5 bg-rose-600 hover:bg-rose-500 text-white rounded-xl transition-all active:scale-95 flex items-center gap-1 text-xs font-bold shadow-md shadow-rose-900/40">
                    <ShieldCheck size={15} />
                    <span className="hidden sm:inline">Admin</span>
                  </button>
                </Link>
              )}

              <button
                onClick={() => setIsPriceModalOpen(true)}
                className="p-2.5 bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 border border-amber-400/30 rounded-xl transition-all active:scale-95 flex items-center gap-1.5 text-xs font-semibold"
                title="Upload Price List (PDF)"
              >
                <FileText size={15} />
                <span className="hidden sm:inline">Price List</span>
              </button>

              <Link href="/products">
                <button className="p-2.5 bg-white/10 hover:bg-white/20 text-slate-200 rounded-xl transition-all active:scale-95 flex items-center gap-1.5 text-xs font-semibold" title="Products & Rates">
                  <Package size={15} />
                  <span className="hidden sm:inline">Products</span>
                </button>
              </Link>

              <Link href="/">
                <button className="p-2.5 bg-white/10 hover:bg-white/20 rounded-xl transition-all active:scale-95" title="Catalog">
                  <Home size={15} />
                </button>
              </Link>

              <button
                onClick={() => signOut()}
                className="p-2.5 bg-white/10 hover:bg-red-500/20 text-slate-300 hover:text-red-300 rounded-xl transition-all active:scale-95"
                title="Sign Out"
              >
                <LogOut size={15} />
              </button>
            </div>
          </div>

          {/* Admin toggle for all vs personal orders */}
          {isAdmin && (
            <div className="mb-4 flex items-center gap-2 bg-slate-950/60 p-1.5 rounded-xl border border-white/10 max-w-xs">
              <button
                onClick={() => setAdminFilterScope("all")}
                className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-bold transition-all ${
                  adminFilterScope === "all"
                    ? "bg-indigo-600 text-white shadow-sm"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                All Company Orders
              </button>
              <button
                onClick={() => setAdminFilterScope("mine")}
                className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-bold transition-all ${
                  adminFilterScope === "mine"
                    ? "bg-indigo-600 text-white shadow-sm"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                My Orders
              </button>
            </div>
          )}

          {/* Stats Grid */}
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-3 border border-white/10">
              <p className="text-[10px] text-slate-400 uppercase font-bold tracking-wider mb-1">
                {isAdmin && adminFilterScope === "all" ? "Total Orders" : "My Orders"}
              </p>
              <p className="text-2xl font-bold">{loading ? '—' : total}</p>
            </div>
            <div className="bg-amber-500/20 backdrop-blur-sm rounded-2xl p-3 border border-amber-400/20">
              <p className="text-[10px] text-amber-300 uppercase font-bold tracking-wider mb-1">Pending</p>
              <p className="text-2xl font-bold text-amber-200">{loading ? '—' : pending}</p>
            </div>
            <div className="bg-green-500/20 backdrop-blur-sm rounded-2xl p-3 border border-green-400/20">
              <p className="text-[10px] text-green-300 uppercase font-bold tracking-wider mb-1">Done</p>
              <p className="text-2xl font-bold text-green-200">{loading ? '—' : approved}</p>
            </div>
          </div>

          <p className="text-[10px] text-slate-500 mt-3 text-right">
            Auto-refreshes every 12s · Last: {lastUpdated.toLocaleTimeString()}
          </p>
        </div>
      </div>

      {/* === ORDER LIST === */}
      <div className="px-4 pt-5 max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">
              {isAdmin && adminFilterScope === "all" ? "All Field Orders" : `Orders by ${activeProfile.name}`}
            </h2>
          </div>
          <span className="text-[11px] text-slate-500 font-semibold">{orders.length} orders listed</span>
        </div>

        {loading ? (
          <div className="space-y-3">
            {[1,2,3].map(i => (
              <div key={i} className="bg-white rounded-2xl h-20 animate-pulse border border-slate-100" />
            ))}
          </div>
        ) : orders.length === 0 ? (
          <div className="text-center py-20 flex flex-col items-center bg-white rounded-3xl border border-slate-100 p-8 shadow-sm">
            <ShoppingBag size={48} strokeWidth={1} className="text-slate-300 mb-3" />
            <p className="text-base font-bold text-slate-700">No orders placed yet</p>
            <p className="text-xs text-slate-400 mt-1 max-w-xs">
              {isAdmin && adminFilterScope === "all" 
                ? "No field sales orders have been submitted across the team."
                : "Browse the interactive catalog and add items to your cart to submit your first order."}
            </p>
            <Link href="/" className="mt-5 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-indigo-600/20">
              Browse Catalog
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {orders.map((order: any) => (
              <Link key={order.id} href={`/order/${order.id}?view=agent`}>
                <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden flex active:scale-[0.98] transition-all hover:shadow-md hover:border-slate-200">
                  {/* Status Stripe */}
                  <div className={`w-1.5 shrink-0 ${
                    order.status === 'APPROVED' ? 'bg-green-500' :
                    order.status === 'DISPATCHED' ? 'bg-blue-500' : 'bg-amber-400'
                  }`} />
                  
                  <div className="flex flex-1 justify-between items-center px-4 py-4">
                    <div>
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className="font-bold text-slate-900 text-sm">{order.shopName}</span>
                        {order.status === 'APPROVED' && <CheckCircle size={13} className="text-green-500" />}
                        {order.status === 'DISPATCHED' && <PackageCheck size={13} className="text-blue-500" />}
                        {order.status === 'PENDING' && <Clock size={13} className="text-amber-500" />}
                        
                        {/* If admin viewing all, show who placed it */}
                        {isAdmin && adminFilterScope === "all" && (
                          <span className="text-[10px] font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md flex items-center gap-1">
                            <Briefcase size={10} />
                            {order.profile?.name || "Unassigned"}
                          </span>
                        )}
                      </div>

                      <p className="text-[11px] text-slate-400 font-medium">
                        {order.totalItems} items ·{' '}
                        <span className={`font-bold ${
                          order.status === 'APPROVED' ? 'text-green-600' :
                          order.status === 'DISPATCHED' ? 'text-blue-600' : 'text-amber-600'
                        }`}>
                          {order.status}
                        </span>
                        {' '}· {new Date(order.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                        {order.ownerName ? ` · ${order.ownerName}` : ''}
                      </p>
                    </div>

                    <ArrowRight size={16} className="text-slate-300" />
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Upload Price List Modal */}
      <UploadPriceListModal
        isOpen={isPriceModalOpen}
        onClose={() => setIsPriceModalOpen(false)}
      />
    </div>
  );
}