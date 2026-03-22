"use client";

import { useState, useEffect } from "react";
import { CATALOG, Product, Variant } from "@/lib/data";
import { useStore } from "@/context/StoreContext";
import { Search, ShoppingCart, LayoutDashboard, Plus, ChevronDown, ChevronUp, Package } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import ShoppableCatalogImage from "@/components/ShoppableCatalogImage";
import { getAllHotspots, getCatalogImages } from "@/app/actions";

export default function Home() {
  const [activeCategory, setActiveCategory] = useState("All");
  const [search, setSearch] = useState("");
  const { cart } = useStore();
  const [allHotspots, setAllHotspots] = useState<any[]>([]);
  const [catalogPages, setCatalogPages] = useState<string[]>([]);

  useEffect(() => {
    getAllHotspots().then(setAllHotspots);
    getCatalogImages().then(setCatalogPages);
  }, []);

  const categories = ["All", ...Array.from(new Set(CATALOG.map((p) => p.category)))];

  const filteredProducts = CATALOG.filter((product) => {
    const matchesCategory = activeCategory === "All" || product.category === activeCategory;
    const matchesSearch = product.name.toLowerCase().includes(search.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  const cartCount = cart.reduce((acc, item) => acc + item.qty, 0);

  return (
    <div className="min-h-screen bg-slate-50/50 dark:bg-zinc-950 pb-32 transition-colors duration-300 font-sans">
      
      {/* === GLASS HEADER === */}
      <div className="sticky top-0 z-20 bg-white/80 dark:bg-zinc-950/80 backdrop-blur-md border-b border-slate-200/50 dark:border-zinc-800/50">
        <div className="px-4 py-3 flex justify-between items-center">
          <div>
            <h1 className="text-lg font-bold text-slate-900 dark:text-slate-100 tracking-tight">Hamza Trading</h1>
            <p className="text-[10px] text-slate-500 font-medium uppercase tracking-wider">Field Sales Portal</p>
          </div>
          
          <Link href="/dashboard">
            <button className="p-2 bg-slate-100 dark:bg-zinc-800 hover:bg-blue-50 dark:hover:bg-zinc-700 rounded-full transition-all text-slate-600 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400">
              <LayoutDashboard size={18} />
            </button>
          </Link>
        </div>

        {/* SEARCH & FILTER */}
        <div className="px-4 pb-3 space-y-3">
          <div className="relative group">
            <Search className="absolute left-3 top-2.5 text-slate-400 group-focus-within:text-blue-500 transition-colors" size={16} />
            <input 
              type="text" 
              placeholder="Search products..." 
              className="w-full pl-9 h-9 bg-slate-100 dark:bg-zinc-900 border-none rounded-lg focus:ring-2 focus:ring-blue-500/20 outline-none transition-all text-sm font-medium text-slate-900 dark:text-slate-100 placeholder:text-slate-400"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          
          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide mask-fade-right">
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                className={cn(
                  "px-3.5 py-1.5 rounded-full text-[11px] font-bold whitespace-nowrap transition-all border",
                  activeCategory === cat 
                    ? "bg-slate-900 dark:bg-white text-white dark:text-black border-slate-900 dark:border-white shadow-lg shadow-slate-900/20" 
                    : "bg-white dark:bg-zinc-900 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-zinc-800 hover:border-slate-300 dark:hover:border-zinc-700"
                )}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* === HERO HOTSPOT === */}
      <div className="px-4 pt-6 pb-2 max-w-5xl mx-auto space-y-8">
        {catalogPages.map((page, i) => {
          const pageHotspots = allHotspots.filter(h => h.imageId === page);
          
          // Only show pages that have hotspots, or always show the first page so it's not totally empty!
          if (pageHotspots.length === 0 && i !== 2) return null; // Force showing index 2 (0004.jpg) as placeholder if DB is totally empty
          
          return (
            <ShoppableCatalogImage 
              key={page}
              imageSrc={`/product/${page}`}
              hotspots={pageHotspots}
            />
          );
        })}
      </div>

      {/* === PRODUCT GRID === */}
      <div className="p-4 grid grid-cols-2 gap-3 sm:gap-4">
        {filteredProducts.map((product) => (
          <ProductCard key={product.id} product={product} />
        ))}
        
        {filteredProducts.length === 0 && (
          <div className="col-span-2 text-center py-20 flex flex-col items-center opacity-50">
             <Package size={48} className="mb-3 text-slate-300 dark:text-zinc-700" strokeWidth={1} />
             <p className="text-sm font-medium text-slate-500">No products found</p>
          </div>
        )}
      </div>

      {/* === FLOATING CART === */}
      {cartCount > 0 && (
        <div className="fixed bottom-6 inset-x-4 z-30">
          <Link href="/cart">
            <button className="w-full bg-blue-600 hover:bg-blue-700 text-white h-13 rounded-2xl shadow-xl shadow-blue-600/30 flex items-center justify-between px-5 font-bold text-base animate-in slide-in-from-bottom-5 active:scale-[0.98] transition-all backdrop-blur-sm">
              <div className="flex items-center gap-3">
                <span className="bg-white/20 px-2.5 py-0.5 rounded-md text-xs font-mono">
                  {cartCount}
                </span>
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

// === COMPONENT: Polished Product Card ===
function ProductCard({ product }: { product: Product }) {
  const [isExpanded, setIsExpanded] = useState(false);
  
  const visibleVariants = isExpanded ? product.variants : product.variants.slice(0, 2);
  const hiddenCount = product.variants.length - 2;

  return (
    <div className="group bg-white dark:bg-zinc-900 border border-slate-100 dark:border-zinc-800 rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-all duration-300 flex flex-col justify-between">
      
      {/* Image Area */}
      <div className="relative aspect-[1.1] bg-white p-4 flex items-center justify-center">
        <Image 
          src={product.image} 
          alt={product.name} 
          fill 
          className="object-contain p-2 mix-blend-multiply transition-transform duration-500 group-hover:scale-110"
          unoptimized
        />
      </div>

      {/* Content Area */}
      <div className="p-3 bg-white dark:bg-zinc-900 relative">
        {/* Soft gradient divider */}
        <div className="absolute top-0 left-0 right-0 h-4 bg-gradient-to-b from-slate-50/50 to-transparent dark:from-zinc-800/20 pointer-events-none" />
        
        <h3 className="font-bold text-slate-800 dark:text-slate-100 text-xs leading-snug mb-3 line-clamp-2 min-h-[2rem]">
          {product.name}
        </h3>
        
        <div className="space-y-2">
          {visibleVariants.map((variant) => (
            <VariantRow 
              key={variant.id} 
              product={product} 
              variant={variant} 
            />
          ))}
          
          {/* Expand Toggle */}
          {product.variants.length > 2 && (
            <button 
              onClick={() => setIsExpanded(!isExpanded)}
              className="w-full text-[10px] flex items-center justify-center gap-1.5 text-slate-400 font-semibold hover:text-blue-500 transition-colors pt-1 pb-1"
            >
              {isExpanded ? (
                <>Less <ChevronUp size={10} /></>
              ) : (
                <>+{hiddenCount} more <ChevronDown size={10} /></>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// === COMPONENT: Sleek Variant Row ===
function VariantRow({ product, variant }: { product: Product, variant: Variant }) {
  const { addToCart } = useStore();
  const [qty, setQty] = useState<string>(""); 

  const handleAdd = () => {
    const finalQty = parseInt(qty) || 1; 
    
    addToCart({ 
      productId: product.id, 
      productName: product.name, 
      variantId: variant.id, 
      variantDetail: `${variant.size} ${variant.finish || ''}`, 
      qty: finalQty 
    });

    toast.success(`Added ${finalQty}x`, {
      description: `${product.name} (${variant.size})`,
      position: 'bottom-center',
      duration: 1500,
    });
    setQty(""); 
  };

  return (
    <div className="bg-slate-50 dark:bg-zinc-800/50 rounded-lg p-2 border border-slate-100 dark:border-zinc-800">
      
      {/* Label Row */}
      <div className="flex justify-between items-center mb-1.5">
        <span className="text-[11px] font-bold text-slate-700 dark:text-slate-300">
          {variant.size}
        </span>
        {variant.finish && (
          <span className="text-[9px] text-slate-400 font-medium px-1 bg-white dark:bg-zinc-800 rounded border border-slate-100 dark:border-zinc-700">
            {variant.finish}
          </span>
        )}
      </div>

      {/* Unified Input Control */}
      <div className="flex h-7 shadow-sm rounded-md overflow-hidden ring-1 ring-slate-200 dark:ring-zinc-700 focus-within:ring-2 focus-within:ring-blue-500/50 transition-all">
        <input 
          type="number" 
          placeholder="1"
          className="w-full min-w-0 bg-white dark:bg-zinc-900 text-center text-xs font-bold text-slate-900 dark:text-white outline-none placeholder:text-slate-300 dark:placeholder:text-zinc-600"
          value={qty}
          onChange={(e) => setQty(e.target.value)}
        />
        <button 
          onClick={handleAdd}
          className="bg-slate-900 dark:bg-white text-white dark:text-black px-3 flex items-center justify-center hover:bg-blue-600 dark:hover:bg-blue-400 dark:hover:text-white transition-colors active:scale-95"
        >
          <Plus size={12} strokeWidth={3} />
        </button>
      </div>
    </div>
  );
}