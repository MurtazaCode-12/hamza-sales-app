import { getOrder, approveOrder, markAsDispatched } from "@/app/actions";
import { CheckCircle, Clock, MapPin, PackageCheck, Home, Phone } from "lucide-react";
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
        <div className="min-h-screen flex items-center justify-center bg-background">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-red-500 mb-2">Order Not Found</h1>
            <p className="text-muted-foreground">The database returned nothing for ID: {id}</p>
            <Link href="/">
              <Button className="mt-4" variant="outline">Go Home</Button>
            </Link>
          </div>
        </div>
      );
    }

    async function dispatchAndRedirect() {
      "use server";
      await markAsDispatched(id);
    }

    return (
      <div className="min-h-screen bg-background font-sans pb-20">
        <div className="bg-slate-900 text-white p-6 text-center shadow-lg sticky top-0 z-10 dark:bg-slate-950 dark:border-b dark:border-slate-800">
          <h1 className="text-xl font-bold tracking-tight">Hamza Trading Co.</h1>
          <p className="text-slate-400 text-xs uppercase tracking-wider">Official Invoice</p>
          {isAgent && (
            <span className="absolute top-4 right-4 text-[10px] bg-white/20 px-2 py-1 rounded">
              AGENT
            </span>
          )}
        </div>

        <div className="max-w-md mx-auto px-4 mt-6">
          <div className={`p-4 rounded-xl text-center font-bold mb-6 border shadow-sm ${
            order.status === 'APPROVED' ? 'bg-green-100 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800' :
            order.status === 'DISPATCHED' ? 'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-800' :
            'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800'
          }`}>
            {order.status === 'PENDING' && "⏳ Pending Client Approval"}
            {order.status === 'APPROVED' && "✅ Order Approved"}
            {order.status === 'DISPATCHED' && "📦 Sent to Shop"}
          </div>

          <div className="bg-card rounded-xl shadow-sm border border-border overflow-hidden mb-6">
            <div className="p-5 border-b border-border bg-muted/30">
              <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">Client Details</h3>
              <p className="font-bold text-foreground text-lg leading-tight">{order.shopName}</p>
              <div className="mt-3 space-y-1">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <MapPin size={14} className="text-muted-foreground" />
                  {order.address}
                </div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Phone size={14} className="text-muted-foreground" />
                  {order.phone}
                </div>
              </div>
            </div>

            <div className="divide-y divide-border">
              <div className="bg-muted/30 px-5 py-2 border-b border-border flex justify-between">
                 <span className="text-[10px] font-bold text-muted-foreground uppercase">Item</span>
                 <span className="text-[10px] font-bold text-muted-foreground uppercase">Qty</span>
              </div>
              {order.items.map((item: any) => (
                <div key={item.id} className="p-4 flex justify-between items-start hover:bg-muted/50 transition-colors">
                  <div>
                    <p className="font-bold text-foreground text-sm">{item.productName}</p>
                    <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded mt-1 inline-block border border-border">
                      {item.variantDetail}
                    </span>
                  </div>
                  <span className="font-bold text-foreground bg-muted h-8 w-8 flex items-center justify-center rounded-full text-xs">
                    {item.qty}
                  </span>
                </div>
              ))}
              <div className="p-4 bg-muted/30 flex justify-between items-center border-t border-border">
                <span className="font-bold text-muted-foreground text-sm">Total Quantity</span>
                <span className="font-extrabold text-foreground text-lg">{order.totalItems}</span>
              </div>
            </div>
          </div>

          <div className="pb-10">
            {!isAgent && order.status === 'PENDING' && (
              <form action={approveOrder.bind(null, order.id)}>
                <Button className="w-full h-14 text-lg font-bold bg-green-600 hover:bg-green-700 text-white shadow-xl rounded-xl">
                  <CheckCircle className="mr-2" /> Approve Order
                </Button>
              </form>
            )}

            {isAgent && (
              <>
                {order.status === 'PENDING' && (
                   <div className="bg-card border border-amber-200 dark:border-amber-900 rounded-xl p-6 text-center shadow-sm">
                     <Clock className="w-10 h-10 text-amber-400 mx-auto mb-3" />
                     <h3 className="font-bold text-foreground">Waiting for Approval</h3>
                     <Link href={`/order/${order.id}?view=agent`}>
                       <Button variant="outline" size="sm" className="mt-4">Refresh Status</Button>
                     </Link>
                   </div>
                )}
                {order.status === 'APPROVED' && (
                  <form action={dispatchAndRedirect}>
                    <WhatsAppButton order={order} />
                  </form>
                )}
                {order.status === 'DISPATCHED' && (
                  <Link href="/">
                    <Button className="w-full h-14 text-lg font-bold bg-slate-900 hover:bg-slate-800 text-white rounded-xl shadow-lg dark:bg-slate-700 dark:hover:bg-slate-600">
                      <Home className="mr-2" /> Return to Home
                    </Button>
                  </Link>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    );
  } catch (error) {
    return <div className="p-10 text-center">Error loading order.</div>;
  }
}