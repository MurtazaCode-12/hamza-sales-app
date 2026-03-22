"use client";
import React, { useState, useEffect, useRef } from 'react';
import Image from 'next/image';
import { saveHotspot, getHotspotsByImage, deleteHotspot, getCatalogImages } from '@/app/actions';
import { toast } from 'sonner';
import { Trash2, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function CatalogStudio() {
  const [catalogPages, setCatalogPages] = useState<string[]>([]);
  const [selectedImage, setSelectedImage] = useState<string>('');
  const [hotspots, setHotspots] = useState<any[]>([]);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const imageRef = useRef<HTMLDivElement>(null);

  // Drawing State
  const [isDrawing, setIsDrawing] = useState(false);
  const [startPos, setStartPos] = useState({ x: 0, y: 0 });
  const [tempBox, setTempBox] = useState<{top: number, left: number, width: number, height: number} | null>(null);

  // Form State
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [formData, setFormData] = useState({ name: '', price: '', types: '', sizes: '' });
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    getCatalogImages().then(pages => {
      setCatalogPages(pages);
      if (pages.length > 0) setSelectedImage(pages[0]);
    });
  }, []);

  useEffect(() => {
    if (selectedImage) loadHotspots(selectedImage);
  }, [selectedImage]);

  const loadHotspots = async (imageId: string) => {
    const data = await getHotspotsByImage(imageId);
    setHotspots(data);
  };

  const getPointerPos = (e: React.PointerEvent) => {
    const rect = imageRef.current!.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100)),
      y: Math.max(0, Math.min(100, ((e.clientY - rect.top) / rect.height) * 100)),
    };
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    if (!imageRef.current || isFormOpen) return;
    const pos = getPointerPos(e);
    setStartPos(pos);
    setIsDrawing(true);
    setTempBox({ top: pos.y, left: pos.x, width: 0, height: 0 });
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDrawing || !imageRef.current) return;
    const pos = getPointerPos(e);
    setTempBox({
      top: Math.min(startPos.y, pos.y),
      left: Math.min(startPos.x, pos.x),
      width: Math.abs(pos.x - startPos.x),
      height: Math.abs(pos.y - startPos.y)
    });
  };

  const handlePointerUp = () => {
    if (!isDrawing) return;
    setIsDrawing(false);
    if (tempBox && tempBox.width > 2 && tempBox.height > 2) {
      setIsFormOpen(true);
    } else {
      setTempBox(null);
    }
  };

  const handleSave = async () => {
    if (!tempBox || !formData.name) return;
    setIsSaving(true);
    const res = await saveHotspot({
      imageId: selectedImage,
      name: formData.name,
      price: formData.price,
      types: formData.types.split(',').map((s: string) => s.trim()).filter(Boolean),
      sizes: formData.sizes.split(',').map((s: string) => s.trim()).filter(Boolean),
      top: tempBox.top, left: tempBox.left, width: tempBox.width, height: tempBox.height
    });
    setIsSaving(false);
    if (res.success) {
      toast.success('Hotspot Saved!');
      setHotspots(prev => [...prev, res.hotspot]);
      setIsFormOpen(false);
      setTempBox(null);
      setFormData({ name: '', price: '', types: '', sizes: '' });
    } else {
      toast.error('Failed to save hotspot');
    }
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const res = await deleteHotspot(id);
    if (res.success) {
      setHotspots(prev => prev.filter(h => h.id !== id));
      toast.success('Deleted');
    }
  };

  const cancelDraw = () => { setIsFormOpen(false); setTempBox(null); setFormData({ name: '', price: '', types: '', sizes: '' }); };

  return (
    <div className="min-h-screen bg-slate-100 font-sans text-slate-900 flex flex-col">

      {/* ====== STICKY TOP HEADER ====== */}
      <div className="sticky top-0 z-30 bg-white border-b border-slate-200 shadow-sm">
        <div className="px-4 py-3 flex items-center justify-between gap-3">
          <div>
            <h1 className="text-base font-bold font-serif text-slate-800 leading-tight">🎯 Hotspot Studio</h1>
            <p className="text-[10px] text-slate-400 font-medium">{hotspots.length} hotspot{hotspots.length !== 1 ? 's' : ''} on this page</p>
          </div>

          {/* Page Selector */}
          <div className="flex-1 max-w-xs">
            <select
              className="w-full p-2 border border-slate-300 rounded-lg text-xs font-medium focus:ring-2 focus:ring-blue-500 outline-none bg-white truncate"
              value={selectedImage}
              onChange={(e) => setSelectedImage(e.target.value)}
            >
              {catalogPages.map(page => (
                <option key={page} value={page}>{page.replace('Hamza-Trading-CoPune-', 'Page ')}</option>
              ))}
            </select>
          </div>

          {/* Mobile toggle for hotspot list */}
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="md:hidden flex items-center gap-1 text-xs font-bold text-blue-600 bg-blue-50 px-3 py-2 rounded-lg"
          >
            List {sidebarOpen ? <ChevronUp size={14}/> : <ChevronDown size={14}/>}
          </button>
        </div>

        {/* Instruction banner */}
        <div className="px-4 pb-3">
          <div className="text-xs text-center text-slate-600 bg-blue-50 py-2 rounded-lg border border-blue-100 font-medium">
            👆 Tap and drag on the catalog image to draw a product hotspot
          </div>
        </div>
      </div>

      {/* ====== MOBILE COLLAPSIBLE HOTSPOT LIST ====== */}
      {sidebarOpen && (
        <div className="md:hidden bg-white border-b border-slate-200 px-4 py-3 space-y-2">
          {hotspots.length === 0
            ? <p className="text-xs text-slate-400 text-center py-2">No hotspots on this page yet.</p>
            : hotspots.map(h => (
              <div key={h.id} className="flex items-center justify-between p-2.5 bg-slate-50 border border-slate-200 rounded-lg">
                <div>
                  <p className="text-sm font-bold text-slate-800">{h.name}</p>
                  <p className="text-[10px] text-slate-400 font-mono">T:{h.top.toFixed(1)}% L:{h.left.toFixed(1)}%</p>
                </div>
                <button onClick={(e) => handleDelete(h.id, e)} className="text-slate-400 hover:text-red-500 p-2 rounded">
                  <Trash2 size={15} />
                </button>
              </div>
            ))
          }
        </div>
      )}

      {/* ====== MAIN CONTENT ====== */}
      <div className="flex flex-1 overflow-hidden">

        {/* Desktop Sidebar */}
        <div className="hidden md:flex w-72 bg-white border-r border-slate-200 flex-col h-[calc(100vh-110px)] sticky top-[110px] overflow-y-auto shadow-sm">
          <div className="p-5 flex flex-col gap-3">
            <h2 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Active Hotspots ({hotspots.length})</h2>
            {hotspots.length === 0
              ? <p className="text-xs text-slate-400">No hotspots drawn on this page.</p>
              : hotspots.map(h => (
                <div key={h.id} className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between">
                  <div>
                    <p className="text-sm font-bold text-slate-800 truncate max-w-[160px]">{h.name}</p>
                    <p className="text-[10px] text-slate-400 font-mono mt-0.5">T:{h.top.toFixed(1)}% L:{h.left.toFixed(1)}%</p>
                  </div>
                  <button onClick={(e) => handleDelete(h.id, e)} className="text-slate-300 hover:text-red-500 hover:bg-red-50 p-2 rounded-lg transition-colors">
                    <Trash2 size={15} />
                  </button>
                </div>
              ))
            }
          </div>
        </div>

        {/* Canvas Area */}
        <div className="flex-1 p-3 md:p-6 overflow-y-auto flex justify-center items-start">
          <div className="w-full max-w-3xl bg-white shadow-lg rounded-xl overflow-hidden">
            {selectedImage ? (
              <div
                ref={imageRef}
                className="relative w-full cursor-crosshair select-none touch-none bg-slate-50"
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerLeave={handlePointerUp}
              >
                <Image
                  src={`/product/${selectedImage}`}
                  alt="Catalog Page Canvas"
                  width={1000}
                  height={1414}
                  className="w-full h-auto pointer-events-none block"
                  draggable={false}
                  priority
                />
                {/* Saved hotspot overlays */}
                {hotspots.map(h => (
                  <div
                    key={h.id}
                    className="absolute border-2 border-emerald-500/80 bg-emerald-500/10 pointer-events-none"
                    style={{ top: `${h.top}%`, left: `${h.left}%`, width: `${h.width}%`, height: `${h.height}%` }}
                  >
                    <span className="absolute -top-5 left-0 bg-emerald-500 text-white text-[9px] px-1.5 py-0.5 whitespace-nowrap font-bold rounded-sm">
                      {h.name}
                    </span>
                  </div>
                ))}
                {/* Box being drawn */}
                {tempBox && (
                  <div
                    className="absolute border-2 border-blue-500 border-dashed bg-blue-500/20 pointer-events-none"
                    style={{ top: `${tempBox.top}%`, left: `${tempBox.left}%`, width: `${tempBox.width}%`, height: `${tempBox.height}%` }}
                  />
                )}
              </div>
            ) : (
              <div className="p-16 text-center text-slate-400 text-sm">Loading catalog images...</div>
            )}
          </div>
        </div>
      </div>

      {/* ====== SAVE HOTSPOT FORM MODAL ====== */}
      {isFormOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-white w-full sm:max-w-sm sm:rounded-2xl rounded-t-2xl p-5 shadow-2xl animate-in slide-in-from-bottom-4 sm:zoom-in-95 duration-200">
            <div className="w-12 h-1 bg-slate-200 rounded-full mx-auto mb-4 sm:hidden" />
            <h3 className="text-lg font-bold font-serif mb-4 text-slate-900">Configure Hotspot</h3>
            <div className="space-y-3">
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Product Name *</label>
                <input autoFocus type="text" className="w-full border-2 border-slate-200 focus:border-blue-500 outline-none p-2.5 rounded-xl text-sm mt-1 bg-slate-50 transition-colors" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} placeholder="e.g. Mortice Lock" />
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Price (Optional)</label>
                <input type="text" className="w-full border-2 border-slate-200 focus:border-blue-500 outline-none p-2.5 rounded-xl text-sm mt-1 bg-slate-50 transition-colors" value={formData.price} onChange={e => setFormData({...formData, price: e.target.value})} placeholder="e.g. ₹ 850" />
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Types / Finishes</label>
                <input type="text" className="w-full border-2 border-slate-200 focus:border-blue-500 outline-none p-2.5 rounded-xl text-sm mt-1 bg-slate-50 transition-colors" value={formData.types} onChange={e => setFormData({...formData, types: e.target.value})} placeholder="Antic, Brass (comma separated)" />
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Sizes</label>
                <input type="text" className="w-full border-2 border-slate-200 focus:border-blue-500 outline-none p-2.5 rounded-xl text-sm mt-1 bg-slate-50 transition-colors" value={formData.sizes} onChange={e => setFormData({...formData, sizes: e.target.value})} placeholder="Small, Big, 25mm (comma separated)" />
              </div>
              <div className="flex gap-2 pt-3 border-t border-slate-100">
                <Button disabled={isSaving} className="flex-1 bg-blue-600 hover:bg-blue-700 h-12 rounded-xl text-sm font-bold" onClick={handleSave}>
                  {isSaving ? 'Saving...' : 'Save Hotspot'}
                </Button>
                <Button className="flex-1 h-12 rounded-xl text-sm" variant="outline" onClick={cancelDraw}>Cancel</Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
