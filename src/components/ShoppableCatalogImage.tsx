"use client";
import React, { useState } from 'react';
import Image from 'next/image';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ShoppingCart, ChevronDown, Plus, Minus } from 'lucide-react';
import { useStore } from '@/context/StoreContext';
import { toast } from 'sonner';

export type ProductHotspot = {
  id: string;
  name: string;
  types: string[];
  sizes: string[];
  top: number; // percentage
  left: number; // percentage
  width: number; // percentage
  height: number; // percentage
  price?: string;
};

interface ShoppableCatalogImageProps {
  imageSrc: string;
  hotspots: ProductHotspot[];
  priority?: boolean;
  highlightProductId?: string;
  onHighlightClear?: () => void;
}

export default function ShoppableCatalogImage({ 
  imageSrc, 
  hotspots, 
  priority = false,
  highlightProductId,
  onHighlightClear
}: ShoppableCatalogImageProps) {
  const [selectedProduct, setSelectedProduct] = useState<ProductHotspot | null>(null);
  const [selectedType, setSelectedType] = useState<string>('');
  const [selectedSize, setSelectedSize] = useState<string>('');
  const [quantity, setQuantity] = useState<number>(1);
  const { addToCart } = useStore();

  const handleOpen = (product: ProductHotspot) => {
    setSelectedProduct(product);
    const validTypes = (product.types || []).filter(t => t && t.trim() !== '');
    const validSizes = (product.sizes || []).filter(s => s && s.trim() !== '');
    setSelectedType(validTypes[0] || '');
    setSelectedSize(validSizes[0] || '');
    setQuantity(1);
  };

  React.useEffect(() => {
    if (highlightProductId) {
      const match = hotspots.find(h => h.id === highlightProductId);
      if (match) {
        handleOpen(match);
        onHighlightClear?.();
      }
    }
  }, [highlightProductId, hotspots, onHighlightClear]);

  const handleAddToCart = () => {
    if (selectedProduct) {
      const variantParts = [selectedType, selectedSize].filter(Boolean);
      const variantDetail = variantParts.length > 0 ? variantParts.join(' | ') : 'Standard';
      addToCart({
        productId: selectedProduct.id,
        productName: selectedProduct.name,
        variantId: `${selectedProduct.id}-${selectedType || 'std'}-${selectedSize || 'std'}`,
        variantDetail: variantDetail,
        qty: quantity
      });
      toast.success(`${selectedProduct.name} (x${quantity}) added to cart`);
      setSelectedProduct(null);
    }
  };

  const validTypes = (selectedProduct?.types || []).filter(t => t && t.trim() !== '');
  const validSizes = (selectedProduct?.sizes || []).filter(s => s && s.trim() !== '');
  const hasVariants = validTypes.length > 0 || validSizes.length > 0;

  return (
    <div className="relative w-full max-w-4xl mx-auto rounded-xl overflow-hidden shadow-sm border border-slate-200 bg-white">
      {/* Background Catalog Image */}
      <Image 
        src={`/product/${imageSrc.replace('/product/', '')}`} 
        alt="Interactive Shoppable Catalog" 
        width={1000} 
        height={1414} 
        className="w-full h-auto object-contain block"
        priority={priority}
      />

      {/* Transparent Clickable Overlays */}
      {hotspots.map((product) => (
        <button
          key={product.id}
          onClick={() => handleOpen(product)}
          className="absolute z-10 cursor-pointer transition-all duration-300 hover:bg-black/10 active:bg-black/20 focus:ring-2 focus:ring-[#4A2B1D]/50 rounded-lg group"
          style={{
            top: `${product.top}%`,
            left: `${product.left}%`,
            width: `${product.width}%`,
            height: `${product.height}%`
          }}
          aria-label={`Select ${product.name}`}
        >
          {/* Subtle hover icon */}
          <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
            <span className="w-10 h-10 bg-white/95 text-[#4A2B1D] rounded-full flex items-center justify-center shadow-[0_4px_12px_rgba(0,0,0,0.15)] scale-75 group-hover:scale-100 transition-transform duration-300">
               <ShoppingCart size={18} />
            </span>
          </div>
        </button>
      ))}

      {/* Product Selection Modal */}
      <Dialog open={!!selectedProduct} onOpenChange={(open: boolean) => !open && setSelectedProduct(null)}>
        <DialogContent className="w-[calc(100%-2rem)] max-w-md bg-white p-6 shadow-2xl rounded-2xl border-0 overflow-hidden">
          {selectedProduct && (
            <>
              <DialogHeader className="text-left">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <DialogTitle className="text-xl sm:text-2xl font-serif text-slate-900 leading-tight">
                      {selectedProduct.name}
                    </DialogTitle>
                    <DialogDescription className="text-slate-500 text-xs sm:text-sm mt-1">
                      {hasVariants ? 'Select options to configure this product.' : 'Ready to add to your order.'}
                    </DialogDescription>
                  </div>
                  {selectedProduct.price && (
                    <span className="shrink-0 text-base sm:text-lg font-bold font-serif text-[#4A2B1D] bg-amber-50 px-2.5 py-1 rounded-lg border border-amber-200/50">
                      {selectedProduct.price.startsWith('₹') ? selectedProduct.price : `₹${selectedProduct.price}`}
                    </span>
                  )}
                </div>
              </DialogHeader>
              
              <div className="space-y-4 py-3 mt-1">
                {/* Type / Finish (Only rendered when non-empty options exist) */}
                {validTypes.length > 0 && (
                  <div className="space-y-2">
                    <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
                      Type / Finish
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {validTypes.map((t) => (
                        <button
                          key={t}
                          type="button"
                          onClick={() => setSelectedType(t)}
                          className={`px-3.5 py-2 rounded-xl text-xs font-semibold border transition-all ${
                            selectedType === t
                              ? 'bg-[#4A2B1D] text-white border-[#4A2B1D] shadow-sm shadow-[#4A2B1D]/25'
                              : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                          }`}
                        >
                          {t}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Size Dimensions (Only rendered when non-empty options exist) */}
                {validSizes.length > 0 && (
                  <div className="space-y-2">
                    <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
                      Size Dimensions
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {validSizes.map((s) => (
                        <button
                          key={s}
                          type="button"
                          onClick={() => setSelectedSize(s)}
                          className={`px-3.5 py-2 rounded-xl text-xs font-semibold border transition-all ${
                            selectedSize === s
                              ? 'bg-[#4A2B1D] text-white border-[#4A2B1D] shadow-sm shadow-[#4A2B1D]/25'
                              : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                          }`}
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Standard Item Badge if neither type nor size is applicable */}
                {!hasVariants && (
                  <div className="bg-amber-50/70 border border-amber-200/70 rounded-xl p-3 flex items-center justify-between text-xs text-amber-900">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-amber-600" />
                      <span className="font-semibold">Standard Edition</span>
                    </div>
                    <span className="text-[10px] font-bold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-md uppercase tracking-wider">
                      Single Variant
                    </span>
                  </div>
                )}

                {/* Quantity Selector */}
                <div className="flex items-center justify-between pt-1 border-t border-slate-100">
                  <div>
                    <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Quantity</span>
                    <span className="text-[11px] text-slate-400">Order units</span>
                  </div>
                  <div className="flex items-center border border-slate-200 bg-slate-50 rounded-xl p-1">
                    <button
                      type="button"
                      onClick={() => setQuantity(Math.max(1, quantity - 1))}
                      className="w-8 h-8 rounded-lg bg-white border border-slate-200 text-slate-700 flex items-center justify-center font-bold shadow-sm hover:bg-slate-100 active:scale-95 transition-all disabled:opacity-30 disabled:pointer-events-none"
                      disabled={quantity <= 1}
                      aria-label="Decrease quantity"
                    >
                      <Minus size={14} />
                    </button>
                    <span className="w-10 text-center text-sm font-bold text-slate-900">{quantity}</span>
                    <button
                      type="button"
                      onClick={() => setQuantity(quantity + 1)}
                      className="w-8 h-8 rounded-lg bg-white border border-slate-200 text-slate-700 flex items-center justify-center font-bold shadow-sm hover:bg-slate-100 active:scale-95 transition-all"
                      aria-label="Increase quantity"
                    >
                      <Plus size={14} />
                    </button>
                  </div>
                </div>
              </div>

              <div className="flex pt-3 mt-1 border-t border-slate-100">
                <Button 
                  onClick={handleAddToCart}
                  className="w-full bg-[#4A2B1D] hover:bg-[#321C10] text-white h-12 rounded-xl text-sm font-bold shadow-lg shadow-[#4A2B1D]/20 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
                >
                  <ShoppingCart size={16} />
                  <span>Add {quantity > 1 ? `${quantity} Units` : 'to Cart'}</span>
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
