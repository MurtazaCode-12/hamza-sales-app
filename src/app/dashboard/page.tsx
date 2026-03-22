"use client";

import { useState, useEffect, useCallback } from "react";
import { getRecentOrders } from "@/app/actions";
import { CheckCircle, Clock, PackageCheck, ArrowRight, Home, RotateCw, TrendingUp, ShoppingBag } from "lucide-react";
import Link from "next/link";

export default function Dashboard() {
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
  const [isRefreshing, setIsRefreshing] = useState(false);

  const fetchOrders = useCallback(async (showRefreshAnim = false) => {
    if (showRefreshAnim) setIsRefreshing(true);
    const data = await getRecentOrders();
    setOrders(data as any[]);
    setLastUpdated(new Date());
    setLoading(false);
    if (showRefreshAnim) setTimeout(() => setIsRefreshing(false), 600);
  }, []);

  // Initial load + auto-refresh every 10 seconds
  useEffect(() => {
    fetchOrders();
    const interval = setInterval(() => fetchOrders(), 10000);
    return () => clearInterval(interval);
  }, [fetchOrders]);

  const total = orders.length;
  const approved = orders.filter((o: any) => o.status === 'APPROVED' || o.status === 'DISPATCHED').length;
  const pending = orders.filter((o: any) => o.status === 'PENDING').length;

  return (
    <div className="min-h-screen bg-slate-50 pb-20 font-sans">

      {/* === HEADER === */}
      <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white px-5 pt-10 pb-8 shadow-xl relative overflow-hidden">
        <div className="absolute inset-0 opacity-10" style={{backgroundImage: 'radial-gradient(circle at 80% 20%, #3b82f6 0%, transparent 50%)'}} />
        <div className="relative">
          <div className="flex justify-between items-start mb-6">
            <div>
              <p className="text-slate-400 text-xs uppercase tracking-widest font-semibold mb-1">Hamza Trading</p>
              <h1 className="text-2xl font-bold tracking-tight">Sales Dashboard</h1>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => fetchOrders(true)}
                className="p-2.5 bg-white/10 hover:bg-white/20 rounded-xl transition-all active:scale-95"
              >
                <RotateCw size={16} className={isRefreshing ? 'animate-spin' : ''} />
              </button>
              <Link href="/">
                <button className="p-2.5 bg-white/10 hover:bg-white/20 rounded-xl transition-all active:scale-95">
                  <Home size={16} />
                </button>
              </Link>
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-3 border border-white/10">
              <p className="text-[10px] text-slate-400 uppercase font-bold tracking-wider mb-1">Total</p>
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
            Auto-refreshes every 10s · Last: {lastUpdated.toLocaleTimeString()}
          </p>
        </div>
      </div>

      {/* === ORDER LIST === */}
      <div className="px-4 pt-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Recent Activity</h2>
          <span className="text-[10px] text-slate-400 font-medium">{orders.length} orders</span>
        </div>

        {loading ? (
          <div className="space-y-3">
            {[1,2,3].map(i => (
              <div key={i} className="bg-white rounded-2xl h-20 animate-pulse border border-slate-100" />
            ))}
          </div>
        ) : orders.length === 0 ? (
          <div className="text-center py-20 flex flex-col items-center opacity-40">
            <ShoppingBag size={48} strokeWidth={1} className="text-slate-300 mb-3" />
            <p className="text-sm font-medium text-slate-500">No orders yet</p>
            <p className="text-xs text-slate-400 mt-1">Orders appear here in real-time</p>
          </div>
        ) : (
          <div className="space-y-3">
            {orders.map((order: any) => (
              <Link key={order.id} href={`/order/${order.id}?view=agent`}>
                <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden flex active:scale-[0.98] transition-all hover:shadow-md hover:border-slate-200">
                  {/* Status Stripe */}
                  <div className={`w-1 shrink-0 ${
                    order.status === 'APPROVED' ? 'bg-green-500' :
                    order.status === 'DISPATCHED' ? 'bg-blue-500' : 'bg-amber-400'
                  }`} />
                  <div className="flex flex-1 justify-between items-center px-4 py-4">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-bold text-slate-900 text-sm">{order.shopName}</span>
                        {order.status === 'APPROVED' && <CheckCircle size={13} className="text-green-500" />}
                        {order.status === 'DISPATCHED' && <PackageCheck size={13} className="text-blue-500" />}
                        {order.status === 'PENDING' && <Clock size={13} className="text-amber-500" />}
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
    </div>
  );
}