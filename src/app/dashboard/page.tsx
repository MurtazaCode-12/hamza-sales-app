import { getRecentOrders } from "@/app/actions";
import { CheckCircle, Clock, PackageCheck, ArrowRight, Home } from "lucide-react";
import Link from "next/link";

export default async function Dashboard() {
  const orders = await getRecentOrders();

  return (
    <div className="min-h-screen bg-slate-50 pb-20">
      <div className="bg-slate-900 text-white p-6 shadow-md">
        <div className="flex justify-between items-center mb-4">
           <h1 className="text-2xl font-bold">Sales Dashboard</h1>
           <Link href="/">
             <button className="bg-white/10 p-2 rounded-full hover:bg-white/20 transition">
               <Home size={20} />
             </button>
           </Link>
        </div>
        <div className="grid grid-cols-2 gap-4">
           <div className="bg-white/10 p-4 rounded-xl backdrop-blur-sm">
              <p className="text-xs text-slate-300 uppercase font-bold">Total Orders</p>
              <p className="text-3xl font-bold">{orders.length}</p>
           </div>
           <div className="bg-green-500/20 p-4 rounded-xl backdrop-blur-sm border border-green-500/30">
              <p className="text-xs text-green-100 uppercase font-bold">Approved</p>
              <p className="text-3xl font-bold text-green-300">
                {/* Fixed: Added (o: any) */}
                {orders.filter((o: any) => o.status === 'APPROVED' || o.status === 'DISPATCHED').length}
              </p>
           </div>
        </div>
      </div>

      <div className="p-4">
        <h2 className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-4">Recent Activity</h2>
        
        <div className="space-y-3">
          {/* Fixed: Added (order: any) */}
          {orders.map((order: any) => (
            <Link key={order.id} href={`/order/${order.id}?view=agent`}>
              <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex justify-between items-center active:scale-[0.98] transition-transform">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                     <span className="font-bold text-slate-900">{order.shopName}</span>
                     {order.status === 'APPROVED' && <CheckCircle size={14} className="text-green-500" />}
                     {order.status === 'DISPATCHED' && <PackageCheck size={14} className="text-blue-500" />}
                     {order.status === 'PENDING' && <Clock size={14} className="text-amber-500" />}
                  </div>
                  <p className="text-xs text-slate-500">
                    {order.totalItems} Items • {new Date(order.createdAt).toLocaleDateString()}
                  </p>
                </div>
                <ArrowRight size={18} className="text-slate-300" />
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}