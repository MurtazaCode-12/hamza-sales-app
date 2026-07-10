"use client";

import { useState, useEffect } from "react";
import { useStore } from "@/context/StoreContext";
import { ShoppingCart, LayoutDashboard, Layers, BookOpen, User, Sparkles, ExternalLink, ChevronLeft, ChevronRight, SlidersHorizontal, Search, X } from "lucide-react";
import Link from "next/link";
import ShoppableCatalogImage from "@/components/ShoppableCatalogImage";

interface CatalogClientViewProps {
  initialHotspots: any[];
  catalogPages: string[];
}

export default function CatalogClientView({ initialHotspots, catalogPages }: CatalogClientViewProps) {
  const { cart } = useStore();
  const cartCount = cart.reduce((acc, item) => acc + item.qty, 0);

  // States
  const [selectedPage, setSelectedPage] = useState<string>(catalogPages[0] || "");
  const [filterHasHotspots, setFilterHasHotspots] = useState<boolean>(true);
  const [viewMode, setViewMode] = useState<"reader" | "scroll">("reader");
  const [isBumping, setIsBumping] = useState<boolean>(false);

  // Search states
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [isSearchOpen, setIsSearchOpen] = useState<boolean>(false);
  const [highlightProductId, setHighlightProductId] = useState<string | null>(null);

  // Transition states for the reader
  const [displayedPage, setDisplayedPage] = useState<string>(selectedPage);
  const [isTransitioning, setIsTransitioning] = useState<boolean>(false);

  // Filter hotspots by search query
  const filteredHotspots = searchQuery.trim() === "" 
    ? [] 
    : initialHotspots.filter(h => h.name.toLowerCase().includes(searchQuery.toLowerCase()));

  const handleSearchSelect = (hotspot: any) => {
    setSearchQuery("");
    setIsSearchOpen(false);
    setSelectedPage(hotspot.imageId);
    setHighlightProductId(hotspot.id);
  };

  // Cart bump micro-interaction
  useEffect(() => {
    if (cartCount > 0) {
      setIsBumping(true);
      const timer = setTimeout(() => setIsBumping(false), 200);
      return () => clearTimeout(timer);
    }
  }, [cartCount]);

  // Page change transition effect
  useEffect(() => {
    setIsTransitioning(true);
    const timer = setTimeout(() => {
      setDisplayedPage(selectedPage);
      setIsTransitioning(false);
    }, 150); // duration of fade-out
    return () => clearTimeout(timer);
  }, [selectedPage]);

  // List of pages that have hotspots
  const pagesWithHotspots = catalogPages.filter((p) =>
    initialHotspots.some((h) => h.imageId === p)
  );

  // Determine active list of pages based on filter
  const activePagesList = filterHasHotspots
    ? pagesWithHotspots.length > 0 ? pagesWithHotspots : catalogPages
    : catalogPages;

  // Sync selected page if active pages list changes and selectedPage is no longer in it
  useEffect(() => {
    if (activePagesList.length > 0 && !activePagesList.includes(selectedPage)) {
      setSelectedPage(activePagesList[0]);
    }
  }, [activePagesList, selectedPage]);

  // Page index helper
  const currentPageIndex = activePagesList.indexOf(selectedPage);

  const handlePrev = () => {
    if (currentPageIndex > 0) {
      setSelectedPage(activePagesList[currentPageIndex - 1]);
    }
  };

  const handleNext = () => {
    if (currentPageIndex < activePagesList.length - 1) {
      setSelectedPage(activePagesList[currentPageIndex + 1]);
    }
  };

  // Helper to format catalog name
  const formatPageName = (filename: string) => {
    // Hamza-Trading-CoPune-New_page-0002.jpg -> Page 2
    const match = filename.match(/page-(\d+)/i);
    if (match && match[1]) {
      return `Page ${parseInt(match[1], 10)}`;
    }
    return filename.replace("Hamza-Trading-CoPune-New_", "").replace(".jpg", "");
  };

  const pageHotspots = initialHotspots.filter((h) => h.imageId === displayedPage);

  return (
    <div className="min-h-screen pb-32 font-sans" style={{ background: "#F7F9FB", fontFamily: "'Inter', 'Manrope', sans-serif" }}>

      {/* ============ STICKY HEADER ============ */}
      <div className="sticky top-0 z-30 backdrop-blur-xl border-b border-white/60" style={{ background: "rgba(247,249,251,0.85)" }}>
        {/* Indigo accent line at very top */}
        <div className="h-0.5 w-full" style={{ background: "linear-gradient(90deg, #4F46E5 0%, #7C3AED 50%, #4F46E5 100%)" }} />

        <div className="px-4 py-3 flex justify-between items-center">
          {/* Logo + Brand */}
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center text-white font-extrabold text-sm tracking-tight" style={{ background: "linear-gradient(135deg, #0F172A 0%, #1E3A5F 100%)" }}>
              HT
            </div>
            <div>
              <h1 className="font-extrabold text-sm leading-tight tracking-tight" style={{ color: "#0F172A", fontFamily: "Manrope, sans-serif" }}>Hamza Trading</h1>
              <p className="text-[9px] font-bold uppercase tracking-widest" style={{ color: "#94A3B8" }}>Product Catalog</p>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2">
            {cartCount > 0 && (
              <Link href="/cart">
                <button 
                  className="relative p-2.5 rounded-xl text-white shadow-lg shadow-indigo-500/25 active:scale-95" 
                  style={{ 
                    background: "linear-gradient(135deg, #4F46E5 0%, #6366F1 100%)",
                    transform: isBumping ? "scale(1.2)" : "scale(1)",
                    transition: "transform 0.15s cubic-bezier(0.175, 0.885, 0.32, 1.275)"
                  }}
                >
                  <ShoppingCart size={17} />
                  <span className="absolute -top-1 -right-1 text-white text-[9px] font-black w-4 h-4 rounded-full flex items-center justify-center" style={{ background: "#EF4444" }}>
                    {cartCount}
                  </span>
                </button>
              </Link>
            )}
            <Link href="/dashboard">
              <button className="p-2.5 rounded-xl transition-all active:scale-95 border" style={{ background: "#FFFFFF", borderColor: "#E2E8F0", color: "#475569" }}>
                <LayoutDashboard size={17} />
              </button>
            </Link>
          </div>
        </div>
      </div>

      {/* ============ HERO BANNER ============ */}
      <div className="mx-4 mt-4 rounded-2xl overflow-hidden relative" style={{ background: "linear-gradient(135deg, #0F172A 0%, #1E1B4B 60%, #0F172A 100%)", minHeight: "130px" }}>
        {/* Radial glow overlay */}
        <div className="absolute inset-0" style={{ background: "radial-gradient(ellipse at 70% 50%, rgba(99,102,241,0.35) 0%, transparent 65%)" }} />
        {/* Grid texture overlay */}
        <div className="absolute inset-0 opacity-10" style={{ backgroundImage: "linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)", backgroundSize: "24px 24px" }} />

        <div className="relative p-5 pt-6">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[9px] font-bold uppercase tracking-wider mb-3" style={{ background: "rgba(99,102,241,0.2)", border: "1px solid rgba(99,102,241,0.4)", color: "#A5B4FC" }}>
            <Sparkles size={9} />
            {catalogPages.length} Pages • Interactive
          </div>
          <h2 className="font-extrabold text-white leading-tight mb-1" style={{ fontSize: "1.35rem", fontFamily: "Manrope, sans-serif", letterSpacing: "-0.02em" }}>
            Shop the Catalog
          </h2>
          <p style={{ color: "#94A3B8", fontSize: "0.75rem", lineHeight: "1.4" }}>
            Tap any highlighted product hotspot to select options and add to your order.
          </p>
        </div>
      </div>

      {/* ============ SEARCH BAR ============ */}
      <div className="mx-4 mt-4 relative">
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
          <input
            type="text"
            placeholder="Search products in catalog..."
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setIsSearchOpen(true);
            }}
            onFocus={() => setIsSearchOpen(true)}
            className="w-full pl-10 pr-10 h-12 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none text-sm font-medium text-slate-800 placeholder:text-slate-400 shadow-sm transition-all"
          />
          {searchQuery && (
            <button 
              onClick={() => {
                setSearchQuery("");
                setIsSearchOpen(false);
              }}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            >
              <X size={16} />
            </button>
          )}
        </div>

        {/* Search Results Dropdown */}
        {isSearchOpen && searchQuery && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setIsSearchOpen(false)} />
            <div className="absolute left-0 right-0 mt-2 bg-white/95 backdrop-blur-md border border-slate-100 rounded-2xl shadow-xl z-50 overflow-hidden max-h-60 overflow-y-auto animate-in fade-in slide-in-from-top-2 duration-200">
              {filteredHotspots.length > 0 ? (
                <div className="divide-y divide-slate-50">
                  {filteredHotspots.map((hotspot) => (
                    <button
                      key={hotspot.id}
                      onClick={() => handleSearchSelect(hotspot)}
                      className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-slate-50/80 transition-colors"
                    >
                      <div>
                        <p className="text-sm font-bold text-slate-800">{hotspot.name}</p>
                        <p className="text-[10px] text-slate-400 font-semibold uppercase mt-0.5">
                          {formatPageName(hotspot.imageId)} {hotspot.price ? `• ${hotspot.price}` : ""}
                        </p>
                      </div>
                      <span className="text-[10px] font-bold text-indigo-600 bg-indigo-50 px-2.5 py-1 rounded-lg">
                        Go to page
                      </span>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="p-4 text-center text-xs font-semibold text-slate-400">
                  No products found matching &ldquo;{searchQuery}&rdquo;
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* ============ VIEWER CONTROLS DOCK ============ */}
      <div className="mx-4 mt-4 bg-white rounded-2xl border border-slate-100 p-4 shadow-sm space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* View Mode Toggle */}
          <div className="flex bg-slate-100 p-1 rounded-xl text-xs font-semibold text-slate-500">
            <button 
              onClick={() => setViewMode("reader")} 
              className={`px-3 py-1.5 rounded-lg transition-all ${viewMode === "reader" ? "bg-white text-slate-900 shadow-sm font-bold" : "hover:text-slate-900"}`}
            >
              Reader Mode
            </button>
            <button 
              onClick={() => setViewMode("scroll")} 
              className={`px-3 py-1.5 rounded-lg transition-all ${viewMode === "scroll" ? "bg-white text-slate-900 shadow-sm font-bold" : "hover:text-slate-900"}`}
            >
              Scroll Feed
            </button>
          </div>

          <div className="flex items-center gap-3">
            <Link href="/studio">
              <span className="text-[11px] font-bold flex items-center gap-1 transition-all text-indigo-600 hover:text-indigo-800">
                Studio <ExternalLink size={11} />
              </span>
            </Link>
          </div>
        </div>

        {/* Filters and Search select */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2 border-t border-slate-50">
          {/* Dropdown page selector (For Reader Mode) */}
          {viewMode === "reader" && activePagesList.length > 0 && (
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <button 
                onClick={handlePrev} 
                disabled={currentPageIndex <= 0}
                className="p-2 border border-slate-200 rounded-xl bg-white hover:bg-slate-50 disabled:opacity-30 disabled:hover:bg-white text-slate-600 transition-colors"
              >
                <ChevronLeft size={16} />
              </button>

              <select 
                value={selectedPage} 
                onChange={(e) => setSelectedPage(e.target.value)}
                className="flex-1 sm:flex-initial h-10 border border-slate-200 rounded-xl bg-slate-50 px-3 outline-none text-xs font-bold text-slate-800 focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400"
              >
                {activePagesList.map((p) => {
                  const hasProducts = pagesWithHotspots.includes(p);
                  return (
                    <option key={p} value={p}>
                      {formatPageName(p)} {hasProducts ? "★" : ""}
                    </option>
                  );
                })}
              </select>

              <button 
                onClick={handleNext} 
                disabled={currentPageIndex >= activePagesList.length - 1}
                className="p-2 border border-slate-200 rounded-xl bg-white hover:bg-slate-50 disabled:opacity-30 disabled:hover:bg-white text-slate-600 transition-colors"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          )}

          {/* Toggle show only product pages */}
          <div className="flex items-center gap-2">
            <input 
              type="checkbox" 
              id="hotspot-only-toggle" 
              checked={filterHasHotspots} 
              onChange={(e) => setFilterHasHotspots(e.target.checked)}
              className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-400"
            />
            <label htmlFor="hotspot-only-toggle" className="text-xs font-semibold text-slate-500 cursor-pointer select-none">
              Only show pages with products ({pagesWithHotspots.length})
            </label>
          </div>
        </div>
      </div>

      {/* ============ MAIN CATALOG DISPLAY ============ */}
      <div className="px-4 mt-6">
        {viewMode === "reader" ? (
          /* Paginated Reader View */
          activePagesList.length > 0 ? (
            <div 
              className="rounded-2xl overflow-hidden shadow-lg border border-slate-100 bg-white" 
              style={{ boxShadow: "0 10px 30px -10px rgba(15,23,42,0.12)" }}
            >
              <div 
                className="transition-all duration-300 ease-out transform"
                style={{
                  opacity: isTransitioning ? 0 : 1,
                  transform: isTransitioning ? "scale(0.985)" : "scale(1)"
                }}
              >
                <ShoppableCatalogImage
                  imageSrc={`/product/${displayedPage}`}
                  hotspots={pageHotspots}
                  priority={true}
                  highlightProductId={highlightProductId || undefined}
                  onHighlightClear={() => setHighlightProductId(null)}
                />
              </div>
            </div>
          ) : (
            <div className="text-center py-16 bg-white border border-slate-100 rounded-2xl">
              <p className="text-sm font-semibold text-slate-400">No matching pages found</p>
              <button 
                onClick={() => setFilterHasHotspots(false)} 
                className="mt-2 text-xs font-bold text-indigo-600 underline"
              >
                Show all pages
              </button>
            </div>
          )
        ) : (
          /* Infinite Scroll Feed View */
          <div className="space-y-6">
            {activePagesList.length > 0 ? (
              activePagesList.map((page, idx) => {
                const hotspots = initialHotspots.filter((h) => h.imageId === page);
                return (
                  <div 
                    key={page} 
                    className="rounded-2xl overflow-hidden shadow-lg border border-slate-100 bg-white" 
                    style={{ boxShadow: "0 10px 30px -10px rgba(15,23,42,0.12)" }}
                  >
                    <ShoppableCatalogImage
                      imageSrc={`/product/${page}`}
                      hotspots={hotspots}
                      priority={idx === 0} // Only first page loads with priority
                    />
                  </div>
                );
              })
            ) : (
              <div className="text-center py-16 bg-white border border-slate-100 rounded-2xl">
                <p className="text-sm font-semibold text-slate-400">No matching pages found</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ============ FLOATING CART BAR ============ */}
      {cartCount > 0 && (
        <div className="fixed bottom-20 inset-x-4 z-30">
          <Link href="/cart">
            <button className="w-full rounded-2xl flex items-center justify-between px-5 py-3.5 font-bold text-white shadow-2xl transition-all active:scale-[0.98]" style={{ background: "linear-gradient(135deg, #4F46E5 0%, #6366F1 100%)", boxShadow: "0 8px 32px rgba(79,70,229,0.4)" }}>
              <div className="flex items-center gap-3">
                <span className="bg-white/20 px-2.5 py-0.5 rounded-lg text-xs font-black font-mono">{cartCount}</span>
                <span className="text-sm font-bold">View Order Cart</span>
              </div>
              <ShoppingCart size={17} />
            </button>
          </Link>
        </div>
      )}

      {/* ============ BOTTOM NAV ============ */}
      <div className="fixed bottom-0 inset-x-0 z-20 border-t bg-white/95 backdrop-blur-md border-slate-100">
        <div className="flex justify-around items-center px-4 py-3">
          {[
            { icon: <Layers size={20} />, label: "Catalog", href: "/", active: true },
            { icon: <LayoutDashboard size={20} />, label: "Orders", href: "/dashboard", active: false },
            { icon: <BookOpen size={20} />, label: "Studio", href: "/studio", active: false },
            { icon: <User size={20} />, label: "Profile", href: "#", active: false },
          ].map(({ icon, label, href, active }) => (
            <Link key={label} href={href} className="flex flex-col items-center gap-0.5 w-full transition-all">
              <span style={{ color: active ? "#4F46E5" : "#94A3B8" }}>{icon}</span>
              <span className="text-[9px] font-bold uppercase tracking-wider" style={{ color: active ? "#4F46E5" : "#94A3B8" }}>{label}</span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
