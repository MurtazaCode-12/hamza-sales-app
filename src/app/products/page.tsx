"use client";

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useProfile } from '@/context/ProfileContext';
import { useStore, ALLOWED_UNITS, UnitType } from '@/context/StoreContext';
import { 
  ArrowLeft, Plus, Search, Edit2, Trash2, Tag, Layers, 
  Package, ShoppingCart, Image as ImageIcon, ExternalLink, 
  Check, Store, ShieldCheck, UserCheck, Eye, EyeOff, X 
} from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

interface ProductItem {
  id: string;
  name: string;
  category?: string;
  rate?: number;
  unit?: string;
  image?: string;
  catalogPage?: string;
  types?: string[];
  sizes?: string[];
  createdAt?: string;
}

export default function ProductsPage() {
  const { profile: activeProfile, isLoading: isProfileLoading } = useProfile();
  const { addToCart, showRates, toggleShowRates, cart } = useStore();

  const [products, setProducts] = useState<ProductItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [isLoading, setIsLoading] = useState(true);

  // Form Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<ProductItem | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    category: 'General Hardware',
    rate: '',
    unit: 'Pcs' as UnitType,
    catalogPage: '',
    image: '',
    types: '',
    sizes: '',
  });
  const [isSaving, setIsSaving] = useState(false);

  // Fetch Products
  const fetchProducts = async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/products?search=${encodeURIComponent(searchQuery)}`);
      const data = await res.json();
      if (data.success && Array.isArray(data.products)) {
        setProducts(data.products);
      }
    } catch (err) {
      console.warn('Error fetching products:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    const timer = setTimeout(fetchProducts, 250);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const categories = ['All', ...Array.from(new Set(products.map(p => p.category).filter(Boolean)))];

  const filteredProducts = products.filter(p => {
    const matchesCategory = selectedCategory === 'All' || p.category === selectedCategory;
    return matchesCategory;
  });

  const handleOpenAddModal = () => {
    setEditingProduct(null);
    setFormData({
      name: '',
      category: 'General Hardware',
      rate: '',
      unit: 'Pcs',
      catalogPage: '',
      image: '',
      types: '',
      sizes: '',
    });
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (p: ProductItem) => {
    setEditingProduct(p);
    setFormData({
      name: p.name,
      category: p.category || 'General Hardware',
      rate: p.rate ? String(p.rate) : '',
      unit: (p.unit as UnitType) || 'Pcs',
      catalogPage: p.catalogPage || '',
      image: p.image || '',
      types: Array.isArray(p.types) ? p.types.join(', ') : '',
      sizes: Array.isArray(p.sizes) ? p.sizes.join(', ') : '',
    });
    setIsModalOpen(true);
  };

  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      toast.error('Please enter product name');
      return;
    }

    setIsSaving(true);
    try {
      const payload = {
        name: formData.name.trim(),
        category: formData.category.trim(),
        rate: formData.rate ? parseFloat(formData.rate) : null,
        unit: formData.unit,
        catalogPage: formData.catalogPage.trim() || null,
        image: formData.image.trim() || null,
        types: formData.types.split(',').map(s => s.trim()).filter(Boolean),
        sizes: formData.sizes.split(',').map(s => s.trim()).filter(Boolean),
      };

      if (editingProduct) {
        // PUT update
        const res = await fetch('/api/products', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: editingProduct.id, ...payload }),
        });
        const data = await res.json();
        if (!data.success) throw new Error(data.error || 'Failed to update');
        toast.success(`Updated "${formData.name}"`);
      } else {
        // POST create
        const res = await fetch('/api/products', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (!data.success) throw new Error(data.error || 'Failed to create');
        toast.success(`Created "${formData.name}"`);
      }

      setIsModalOpen(false);
      fetchProducts();
    } catch (err: any) {
      toast.error(err.message || 'Failed to save product');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteProduct = async (id: string, name: string) => {
    if (!confirm(`Are you sure you want to delete "${name}"?`)) return;
    try {
      const res = await fetch(`/api/products?id=${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (data.success) {
        toast.success(`Deleted "${name}"`);
        setProducts(prev => prev.filter(p => p.id !== id));
      }
    } catch {
      toast.error('Failed to delete product');
    }
  };

  const handleQuickAddToCart = (p: ProductItem) => {
    const rate = Number(p.rate || 0);
    const unit = p.unit || 'Pcs';
    addToCart({
      productId: p.id,
      productName: p.name,
      variantId: `prod-${p.id}`,
      variantDetail: p.category || 'Standard',
      qty: 1,
      unit: unit,
      rate: rate,
      totalPrice: rate,
    });
    toast.success(`Added 1 ${unit} of "${p.name}" to cart`);
  };

  const cartCount = cart.reduce((acc, it) => acc + (Number(it.qty) || 1), 0);

  // Require logged-in profile
  if (!isProfileLoading && !activeProfile) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 text-center">
        <div className="w-16 h-16 rounded-2xl bg-indigo-50 border border-indigo-100 text-indigo-600 flex items-center justify-center mb-4">
          <UserCheck size={32} />
        </div>
        <h1 className="text-xl font-bold text-slate-900 mb-2">Profile Required</h1>
        <p className="text-sm text-slate-500 max-w-sm mb-6">
          Please select your sales profile to add or edit products in the catalog.
        </p>
        <Link href="/select-profile">
          <Button className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl">
            Select / Log In Profile
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 pb-28 font-sans">
      {/* Header */}
      <div className="bg-white px-4 py-3.5 sticky top-0 z-20 border-b border-slate-200/80 shadow-sm flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/">
            <button className="p-2 -ml-2 hover:bg-slate-100 rounded-full text-slate-700 transition-colors">
              <ArrowLeft size={20} />
            </button>
          </Link>
          <div>
            <h1 className="text-base font-bold text-slate-900 leading-tight">Product Catalog &amp; Rates</h1>
            <p className="text-[10px] text-slate-400 font-medium">
              Manage items with or without catalog image
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Rate visibility button */}
          <button
            onClick={toggleShowRates}
            title={showRates ? "Hide Rates" : "Show Rates"}
            className="p-2 text-slate-500 hover:bg-slate-100 rounded-xl transition-colors border border-slate-200"
          >
            {showRates ? <Eye size={16} /> : <EyeOff size={16} />}
          </button>

          {/* Add Product Button */}
          <Button
            onClick={handleOpenAddModal}
            size="sm"
            className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold h-9 px-3 flex items-center gap-1.5 shadow-sm"
          >
            <Plus size={15} /> Add Product
          </Button>

          {cartCount > 0 && (
            <Link href="/cart">
              <button className="relative p-2 bg-slate-900 text-white rounded-xl">
                <ShoppingCart size={16} />
                <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[9px] font-black w-4 h-4 rounded-full flex items-center justify-center">
                  {cartCount}
                </span>
              </button>
            </Link>
          )}
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 pt-4 space-y-4">
        {/* Search bar & Category chips */}
        <div className="bg-white p-3 rounded-2xl border border-slate-200 shadow-sm space-y-3">
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input
              type="text"
              placeholder="Search products by name or category..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 h-11 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-900 placeholder:text-slate-400 focus:bg-white focus:border-indigo-500 outline-none transition-all"
            />
          </div>

          {/* Category Filter Scroll */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat as string)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all ${
                  selectedCategory === cat
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        {/* Product Count & Info */}
        <div className="flex items-center justify-between text-xs text-slate-500 px-1">
          <span>Showing {filteredProducts.length} products</span>
          <span className="text-[11px] font-medium text-slate-400">
            Rates are {showRates ? 'Visible' : 'Hidden'}
          </span>
        </div>

        {/* Products Grid / Cards */}
        {isLoading && (
          <div className="py-16 text-center text-xs text-slate-400 animate-pulse">
            Loading products...
          </div>
        )}

        {!isLoading && filteredProducts.length === 0 && (
          <div className="py-16 bg-white rounded-2xl border border-dashed border-slate-200 text-center p-6">
            <Package size={40} className="mx-auto text-slate-300 mb-2" />
            <p className="text-sm font-bold text-slate-700">No products found</p>
            <p className="text-xs text-slate-400 mt-1 mb-4">
              Add a new product with rates, units, and custom finishes.
            </p>
            <Button onClick={handleOpenAddModal} className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs">
              <Plus size={14} className="mr-1" /> Add First Product
            </Button>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {filteredProducts.map((p) => {
            const unit = p.unit || 'Pcs';
            const rate = Number(p.rate || 0);

            return (
              <div
                key={p.id}
                className="bg-white rounded-2xl border border-slate-200/90 shadow-sm p-4 flex flex-col justify-between hover:border-slate-300 transition-all group"
              >
                <div>
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <span className="text-[10px] font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-md uppercase tracking-wider">
                      {p.category || 'General'}
                    </span>
                    <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100">
                      <button
                        onClick={() => handleOpenEditModal(p)}
                        className="p-1.5 text-slate-400 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors"
                        title="Edit Product"
                      >
                        <Edit2 size={13} />
                      </button>
                      <button
                        onClick={() => handleDeleteProduct(p.id, p.name)}
                        className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        title="Delete Product"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>

                  <h3 className="font-bold text-slate-900 text-sm leading-snug">{p.name}</h3>

                  {p.catalogPage && (
                    <p className="text-[11px] text-slate-400 mt-1 flex items-center gap-1">
                      <span>📄 Page:</span> <span className="font-medium text-slate-600">{p.catalogPage}</span>
                    </p>
                  )}

                  {/* Types / Finishes */}
                  {Array.isArray(p.types) && p.types.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {p.types.slice(0, 4).map((t, idx) => (
                        <span key={idx} className="text-[9px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-medium">
                          {t}
                        </span>
                      ))}
                      {p.types.length > 4 && (
                        <span className="text-[9px] text-slate-400">+{p.types.length - 4}</span>
                      )}
                    </div>
                  )}
                </div>

                {/* Rate & Quick Add Action */}
                <div className="pt-3 mt-3 border-t border-slate-100 flex items-center justify-between">
                  <div>
                    {showRates && rate > 0 ? (
                      <div>
                        <span className="text-base font-black text-slate-900 font-serif">₹{rate.toFixed(2)}</span>
                        <span className="text-[10px] text-slate-400 font-medium"> / {unit}</span>
                      </div>
                    ) : (
                      <span className="text-xs font-semibold text-slate-400">{unit} pack</span>
                    )}
                  </div>

                  <Button
                    onClick={() => handleQuickAddToCart(p)}
                    size="sm"
                    className="bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs h-8 px-2.5 font-bold flex items-center gap-1"
                  >
                    <Plus size={13} /> Add
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* === PRODUCT EDIT / CREATE MODAL === */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="max-w-md bg-white p-6 rounded-2xl shadow-2xl border-0">
          <DialogHeader className="text-left">
            <DialogTitle className="text-lg font-bold text-slate-900">
              {editingProduct ? 'Edit Product' : 'Add New Product'}
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              Save product rates, units, and categories with or without catalog image.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSaveProduct} className="space-y-3.5 pt-2">
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">Product Name *</label>
              <input
                type="text"
                required
                placeholder="e.g. Mortice Handle Brass Antique"
                value={formData.name}
                onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                className="w-full h-11 px-3.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-900 outline-none focus:bg-white focus:border-indigo-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Category</label>
                <input
                  type="text"
                  placeholder="e.g. Hinges, Locks, Screws"
                  value={formData.category}
                  onChange={(e) => setFormData(prev => ({ ...prev, category: e.target.value }))}
                  className="w-full h-11 px-3.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-900 outline-none focus:bg-white focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Packaging Unit *</label>
                <select
                  value={formData.unit}
                  onChange={(e) => setFormData(prev => ({ ...prev, unit: e.target.value as UnitType }))}
                  className="w-full h-11 px-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 outline-none focus:bg-white focus:border-indigo-500"
                >
                  {ALLOWED_UNITS.map((u) => (
                    <option key={u} value={u}>{u}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Rate (₹ / {formData.unit})
                </label>
                <input
                  type="number"
                  step="any"
                  placeholder="0.00"
                  value={formData.rate}
                  onChange={(e) => setFormData(prev => ({ ...prev, rate: e.target.value }))}
                  className="w-full h-11 px-3.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-900 outline-none focus:bg-white focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Catalog Page (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. Page 4"
                  value={formData.catalogPage}
                  onChange={(e) => setFormData(prev => ({ ...prev, catalogPage: e.target.value }))}
                  className="w-full h-11 px-3.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-900 outline-none focus:bg-white focus:border-indigo-500"
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">
                Finishes / Types (Comma separated)
              </label>
              <input
                type="text"
                placeholder="e.g. Antique, SS Matt, Black, Rose Gold"
                value={formData.types}
                onChange={(e) => setFormData(prev => ({ ...prev, types: e.target.value }))}
                className="w-full h-11 px-3.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-900 outline-none focus:bg-white focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">
                Sizes (Comma separated)
              </label>
              <input
                type="text"
                placeholder="e.g. 3 inch, 4 inch, 5 inch"
                value={formData.sizes}
                onChange={(e) => setFormData(prev => ({ ...prev, sizes: e.target.value }))}
                className="w-full h-11 px-3.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-900 outline-none focus:bg-white focus:border-indigo-500"
              />
            </div>

            <div className="flex gap-2 pt-3">
              <Button type="button" variant="outline" onClick={() => setIsModalOpen(false)} className="w-1/2 rounded-xl">
                Cancel
              </Button>
              <Button type="submit" disabled={isSaving} className="w-1/2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold">
                {isSaving ? 'Saving...' : editingProduct ? 'Save Changes' : 'Create Product'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
