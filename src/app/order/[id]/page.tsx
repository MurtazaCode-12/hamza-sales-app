import { getOrder, approveOrder, markAsDispatched } from "@/app/actions";
import { CheckCircle, Clock, MapPin, PackageCheck, Home, Phone, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { WhatsAppButton } from "@/components/ui/WhatsAppButton";

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

export default async function OrderPage({ params, searchParams }: Props) {
  const { id } = await params;
  const { view } = await searchParams;
  const isAgent = view === 'agent';

  try {
    const order = await getOrder(id);

    if (!order) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50">
          <div className="text-center p-8">
            <div className="text-5xl mb-4">🔍</div>
            <h1 className="text-xl font-bold text-slate-900 mb-2">Order Not Found</h1>
            <p className="text-slate-400 text-sm mb-6">No order found for ID: {id}</p>
            <Link href="/"><Button variant="outline" className="rounded-xl">Go Home</Button></Link>
          </div>
        </div>
      );
    }

    async function dispatchAndRedirect() {
      "use server";
      await markAsDispatched(id);
    }

    const statusConfig = {
      PENDING:    { bg: 'bg-amber-50',  border: 'border-amber-200',  text: 'text-amber-700',  icon: '⏳', label: 'Awaiting Approval' },
      APPROVED:   { bg: 'bg-green-50',  border: 'border-green-200',  text: 'text-green-700',  icon: '✅', label: 'Order Approved' },
      DISPATCHED: { bg: 'bg-blue-50',   border: 'border-blue-200',   text: 'text-blue-700',   icon: '📦', label: 'Sent to Warehouse' },
    };
    const status = statusConfig[order.status as keyof typeof statusConfig] || statusConfig.PENDING;

    return (
      <div className="min-h-screen bg-slate-50 font-sans pb-12">

        {/* === HEADER === */}
        <div className="bg-gradient-to-br from-slate-900 to-slate-800 text-white px-5 pt-10 pb-8 shadow-xl relative overflow-hidden">
          <div className="absolute inset-0 opacity-10" style={{backgroundImage: 'radial-gradient(circle at 80% 20%, #6366f1 0%, transparent 60%)'}} />
          <div className="relative text-center">
            <p className="text-slate-400 text-[10px] uppercase tracking-widest font-semibold mb-1">Hamza Trading Co.</p>
            <h1 className="text-xl font-bold">Order Details</h1>
            {isAgent && (
              <span className="mt-2 inline-block text-[9px] bg-white/10 border border-white/20 px-3 py-1 rounded-full text-slate-300 font-bold tracking-widest uppercase">Agent View</span>
            )}
          </div>
          <Link href="/" className="absolute top-10 right-5">
            <button className="p-2.5 bg-white/10 hover:bg-white/20 rounded-xl transition-all">
              <Home size={16} />
            </button>
          </Link>
        </div>

        <div className="max-w-md mx-auto px-4 pt-5 space-y-4">

          {/* Status Badge */}
          <div className={`${status.bg} ${status.border} ${status.text} border rounded-2xl p-4 flex items-center gap-3 shadow-sm`}>
            <span className="text-2xl">{status.icon}</span>
            <div>
              <p className="font-bold text-sm">{status.label}</p>
              <p className="text-xs opacity-70 mt-0.5">Order #{id.slice(0, 8).toUpperCase()}</p>
            </div>
          </div>

          {/* Client Info Card */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
            <div className="bg-slate-50 px-5 py-3 border-b border-slate-100">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Client</p>
            </div>
            <div className="p-5">
              <p className="font-bold text-slate-900 text-lg mb-3">{order.shopName}</p>
              <div className="space-y-2">
                <div className="flex items-center gap-2.5 text-sm text-slate-500">
                  <MapPin size={14} className="text-slate-300 shrink-0" />
                  <span>{order.address}</span>
                </div>
                <div className="flex items-center gap-2.5 text-sm text-slate-500">
                  <Phone size={14} className="text-slate-300 shrink-0" />
                  <span>{order.phone}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Order Items */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
            <div className="bg-slate-50 px-5 py-3 border-b border-slate-100 flex justify-between items-center">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Items</p>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Qty</p>
            </div>
            <div className="divide-y divide-slate-50">
              {order.items.map((item: any) => (
                <div key={item.id} className="px-5 py-3.5 flex justify-between items-center">
                  <div className="min-w-0 flex-1 pr-4">
                    <p className="font-semibold text-slate-900 text-sm truncate">{item.productName}</p>
                    <span className="text-[10px] text-slate-400 bg-slate-50 border border-slate-100 px-1.5 py-0.5 rounded mt-1 inline-block font-medium">
                      {item.variantDetail}
                    </span>
                  </div>
                  <span className="font-bold text-slate-900 bg-slate-100 h-8 w-8 rounded-full flex items-center justify-center text-sm shrink-0">
                    {item.qty}
                  </span>
                </div>
              ))}
              <div className="px-5 py-4 flex justify-between items-center bg-slate-50">
                <span className="text-sm font-bold text-slate-600">Total Quantity</span>
                <span className="text-lg font-extrabold text-slate-900">{order.totalItems}</span>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="space-y-3 pt-2 pb-4">
            {/* Client View: Approve button */}
            {!isAgent && order.status === 'PENDING' && (
              <form action={approveOrder.bind(null, order.id)}>
                <button type="submit" className="w-full h-14 bg-green-600 hover:bg-green-700 text-white rounded-2xl font-bold text-base shadow-xl shadow-green-600/20 flex items-center justify-center gap-2.5 transition-all active:scale-[0.98]">
                  <CheckCircle size={20} /> Approve This Order
                </button>
              </form>
            )}

            {/* Client: already approved */}
            {!isAgent && order.status !== 'PENDING' && (
              <div className="text-center py-4 text-sm text-slate-400 font-medium">
                This order has been {order.status.toLowerCase()}.
              </div>
            )}

            {/* Agent View: Waiting */}
            {isAgent && order.status === 'PENDING' && (
              <div className="bg-amber-50 border border-amber-200 rounded-2xl p-6 text-center">
                <Clock className="w-10 h-10 text-amber-400 mx-auto mb-3" />
                <h3 className="font-bold text-amber-800 mb-1">Waiting for Approval</h3>
                <p className="text-xs text-amber-600 mb-4">Page refreshes automatically. Share the order link with the client.</p>
                <form action={approveOrder.bind(null, order.id)}>
                  <button type="submit" className="w-full h-11 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all active:scale-95">
                    <Zap size={15} /> Self-Approve Now
                  </button>
                </form>
              </div>
            )}

            {/* Agent View: Approved — dispatch */}
            {isAgent && order.status === 'APPROVED' && (
              <form action={dispatchAndRedirect}>
                <WhatsAppButton order={order} />
              </form>
            )}

            {/* Agent View: Dispatched */}
            {isAgent && order.status === 'DISPATCHED' && (
              <Link href="/dashboard">
                <button className="w-full h-14 bg-slate-900 hover:bg-slate-800 text-white rounded-2xl font-bold text-base flex items-center justify-center gap-2 transition-all active:scale-[0.98]">
                  <PackageCheck size={20} /> Back to Dashboard
                </button>
              </Link>
            )}
          </div>
        </div>
      </div>
    );
  } catch (error) {
    return (
      <div className="p-10 text-center text-slate-500">
        <p className="text-lg font-bold text-red-500 mb-2">Something went wrong</p>
        <p className="text-sm">Could not load order details.</p>
      </div>
    );
  }
}