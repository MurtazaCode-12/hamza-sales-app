"use client";
import React, { useState } from 'react';
import Image from 'next/image';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ShoppingCart, ChevronDown } from 'lucide-react';
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
};

interface ShoppableCatalogImageProps {
  imageSrc: string;
  hotspots: ProductHotspot[];
}

export default function ShoppableCatalogImage({ imageSrc, hotspots }: ShoppableCatalogImageProps) {
  const [selectedProduct, setSelectedProduct] = useState<ProductHotspot | null>(null);
  const [selectedType, setSelectedType] = useState<string>('');
  const [selectedSize, setSelectedSize] = useState<string>('');
  const { addToCart } = useStore();

  const handleOpen = (product: ProductHotspot) => {
    setSelectedProduct(product);
    setSelectedType(product.types[0] || '');
    setSelectedSize(product.sizes[0] || '');
  };

  const handleAddToCart = () => {
    if (selectedProduct) {
      addToCart({
        productId: selectedProduct.id,
        productName: selectedProduct.name,
        variantId: `${selectedProduct.id}-${selectedType}-${selectedSize}`,
        variantDetail: `${selectedType} | ${selectedSize}`,
        qty: 1
      });
      toast.success(`${selectedProduct.name} added to cart`);
      setSelectedProduct(null);
    }
  };

  return (
    <div className="relative w-full max-w-4xl mx-auto rounded-xl overflow-hidden shadow-sm border border-slate-200 bg-white">
      {/* Background Catalog Image */}
      <Image 
        src={imageSrc} 
        alt="Interactive Shoppable Catalog" 
        width={1000} 
        height={1414} 
        className="w-full h-auto object-contain block"
        priority
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

      {/* Shadcn UI Modal */}
      <Dialog open={!!selectedProduct} onOpenChange={(open: boolean) => !open && setSelectedProduct(null)}>
        <DialogContent className="sm:max-w-md bg-white p-6 shadow-2xl rounded-2xl border-0">
          {selectedProduct && (
            <>
              <DialogHeader>
                <DialogTitle className="text-2xl font-serif text-slate-900 leading-tight">
                  {selectedProduct.name}
                </DialogTitle>
                <DialogDescription className="text-slate-500 text-sm mt-1">
                  Specify the details to configure this product.
                </DialogDescription>
              </DialogHeader>
              
              <div className="space-y-5 py-4 mt-2">
                 <div className="space-y-2">
                   <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Type / Finish</label>
                   <div className="relative">
                     <select 
                       className="w-full appearance-none bg-slate-50 border border-slate-200 text-slate-900 text-sm h-12 rounded-xl focus:ring-2 focus:ring-[#4A2B1D]/20 focus:border-[#4A2B1D] block pl-4 pr-10 outline-none font-medium transition-all cursor-pointer"
                       value={selectedType}
                       onChange={(e) => setSelectedType(e.target.value)}
                     >
                       {selectedProduct.types.map(t => <option key={t} value={t}>{t}</option>)}
                     </select>
                     <ChevronDown className="absolute right-4 top-3.5 text-slate-400 pointer-events-none" size={16} />
                   </div>
                 </div>

                 {selectedProduct.sizes.length > 0 && selectedProduct.sizes[0] !== '' && (
                   <div className="space-y-2">
                     <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Size Dimensions</label>
                     <div className="relative">
                       <select 
                         className="w-full appearance-none bg-slate-50 border border-slate-200 text-slate-900 text-sm h-12 rounded-xl focus:ring-2 focus:ring-[#4A2B1D]/20 focus:border-[#4A2B1D] block pl-4 pr-10 outline-none font-medium transition-all cursor-pointer"
                         value={selectedSize}
                         onChange={(e) => setSelectedSize(e.target.value)}
                       >
                         {selectedProduct.sizes.map(s => <option key={s} value={s}>{s}</option>)}
                       </select>
                       <ChevronDown className="absolute right-4 top-3.5 text-slate-400 pointer-events-none" size={16} />
                     </div>
                   </div>
                 )}
              </div>

              <div className="flex pt-4 mt-2 border-t border-slate-100">
                <Button 
                  onClick={handleAddToCart}
                  className="w-full bg-[#4A2B1D] hover:bg-[#321C10] text-white h-12 rounded-xl text-sm font-bold shadow-lg shadow-[#4A2B1D]/20 active:scale-[0.98] transition-all"
                >
                  <ShoppingCart className="mr-2 h-4 w-4" /> Add to Cart
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
