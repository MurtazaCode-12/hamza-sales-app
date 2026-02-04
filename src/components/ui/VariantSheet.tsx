"use client";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Minus, Plus } from "lucide-react";
import { Product, Variant } from "@/lib/data";
import { useStore } from "@/context/StoreContext";

export function VariantSheet({ 
  product, 
  isOpen, 
  onClose 
}: { 
  product: Product | null, 
  isOpen: boolean, 
  onClose: () => void 
}) {
  const { cart, addToCart } = useStore();

  if (!product) return null;

  const getQty = (variantId: string) => 
    cart.find(i => i.variantId === variantId)?.qty || 0;

  const handleUpdate = (variant: Variant, delta: number) => {
    const currentQty = getQty(variant.id);
    const newQty = Math.max(0, currentQty + delta);
    
    addToCart({
      productId: product.id,
      productName: product.name,
      variantId: variant.id,
      variantDetail: `${variant.size} ${variant.finish || ''}`,
      qty: newQty
    });
  };

  return (
    <Sheet open={isOpen} onOpenChange={onClose}>
      <SheetContent side="bottom" className="h-[85vh] overflow-y-auto rounded-t-xl px-4 pb-20 bg-white">
        <SheetHeader className="mb-6 border-b pb-4">
          <SheetTitle className="text-2xl font-bold text-slate-900">
            {product.name}
          </SheetTitle>
          <p className="text-sm text-slate-500">{product.category}</p>
        </SheetHeader>

        <div className="space-y-4">
          {product.variants.map((variant) => (
            <div key={variant.id} className="flex items-center justify-between border rounded-lg p-3 bg-slate-50">
              <div className="flex-1">
                <div className="font-mono text-sm font-bold text-slate-900">
                  {variant.size}
                </div>
                <div className="flex gap-2 text-xs text-slate-500">
                  {variant.finish && <span>{variant.finish}</span>}
                  {variant.weight && <span>• {variant.weight}</span>}
                  {variant.packSize && <span>• {variant.packSize}</span>}
                </div>
              </div>

              {/* Stepper Control */}
              <div className="flex items-center gap-3 bg-white rounded-md border shadow-sm p-1">
                <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-500" onClick={() => handleUpdate(variant, -1)}>
                  <Minus size={18} />
                </Button>
                <span className="w-8 text-center font-bold text-lg">{getQty(variant.id)}</span>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-green-600" onClick={() => handleUpdate(variant, 1)}>
                  <Plus size={18} />
                </Button>
              </div>
            </div>
          ))}
        </div>
        
        <div className="mt-8 sticky bottom-0 bg-white pt-4">
           <Button className="w-full h-12 text-lg bg-slate-900 text-white hover:bg-slate-800" onClick={onClose}>
             Done Adding
           </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}