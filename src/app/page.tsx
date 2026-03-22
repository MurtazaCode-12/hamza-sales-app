"use client";

import { useState, useEffect } from "react";
import { useStore } from "@/context/StoreContext";
import { ShoppingCart, LayoutDashboard } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import ShoppableCatalogImage from "@/components/ShoppableCatalogImage";
import { getAllHotspots, getCatalogImages } from "@/app/actions";

export default function Home() {
  const { cart } = useStore();
  const [allHotspots, setAllHotspots] = useState<any[]>([]);
  const [catalogPages, setCatalogPages] = useState<string[]>([]);

  useEffect(() => {
    getAllHotspots().then(setAllHotspots);
    getCatalogImages().then(setCatalogPages);
  }, []);

  const cartCount = cart.reduce((acc, item) => acc + item.qty, 0);

  return (
    <div className="min-h-screen bg-slate-50 pb-32 font-sans">

      {/* === HEADER === */}
      <div className="sticky top-0 z-20 bg-white/90 backdrop-blur-md border-b border-slate-200/50">
        <div className="px-4 py-3 flex justify-between items-center">
          <div>
            <h1 className="text-lg font-bold text-slate-900 tracking-tight">Hamza Trading</h1>
            <p className="text-[10px] text-slate-500 font-medium uppercase tracking-wider">Product Catalog</p>
          </div>
          <div className="flex items-center gap-2">
            {cartCount > 0 && (
              <Link href="/cart">
                <button className="relative p-2 bg-blue-600 text-white rounded-full shadow-md hover:bg-blue-700 transition-all">
                  <ShoppingCart size={18} />
                  <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center">
                    {cartCount}
                  </span>
                </button>
              </Link>
            )}
            <Link href="/dashboard">
              <button className="p-2 bg-slate-100 hover:bg-blue-50 rounded-full transition-all text-slate-600 hover:text-blue-600">
                <LayoutDashboard size={18} />
              </button>
            </Link>
          </div>
        </div>
      </div>

      {/* === SHOPPABLE CATALOG PAGES === */}
      <div className="px-4 pt-6 pb-2 max-w-5xl mx-auto space-y-8">
        {catalogPages.length === 0 && (
          <div className="text-center py-20 text-slate-400 text-sm">Loading catalog...</div>
        )}
        {catalogPages.map((page) => {
          const pageHotspots = allHotspots.filter(h => h.imageId === page);
          if (pageHotspots.length === 0) return null;
          return (
            <ShoppableCatalogImage
              key={page}
              imageSrc={`/product/${page}`}
              hotspots={pageHotspots}
            />
          );
        })}
        {catalogPages.length > 0 && allHotspots.length === 0 && (
          <div className="text-center py-16 text-slate-400">
            <p className="text-sm font-medium">No hotspots mapped yet.</p>
            <p className="text-xs mt-1">Visit the <Link href="/studio" className="text-blue-500 underline">Studio</Link> to start drawing product hotspots.</p>
          </div>
        )}
      </div>

      {/* === FLOATING CART BUTTON === */}
      {cartCount > 0 && (
        <div className="fixed bottom-6 inset-x-4 z-30">
          <Link href="/cart">
            <button className="w-full bg-blue-600 hover:bg-blue-700 text-white h-13 rounded-2xl shadow-xl shadow-blue-600/30 flex items-center justify-between px-5 font-bold text-base active:scale-[0.98] transition-all">
              <div className="flex items-center gap-3">
                <span className="bg-white/20 px-2.5 py-0.5 rounded-md text-xs font-mono">{cartCount}</span>
                <span>View Cart</span>
              </div>
              <ShoppingCart size={18} />
            </button>
          </Link>
        </div>
      )}
    </div>
  );
}