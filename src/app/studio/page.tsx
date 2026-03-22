"use client";
import React, { useState, useEffect, useRef } from 'react';
import Image from 'next/image';
import { saveHotspot, getHotspotsByImage, deleteHotspot, getCatalogImages } from '@/app/actions';
import { toast } from 'sonner';
import { Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function CatalogStudio() {
  const [catalogPages, setCatalogPages] = useState<string[]>([]);
  const [selectedImage, setSelectedImage] = useState<string>(''); 
  const [hotspots, setHotspots] = useState<any[]>([]);
  const imageRef = useRef<HTMLDivElement>(null);

  // Drawing State
  const [isDrawing, setIsDrawing] = useState(false);
  const [startPos, setStartPos] = useState({ x: 0, y: 0 });
  const [tempBox, setTempBox] = useState<{top: number, left: number, width: number, height: number} | null>(null);

  // Form State
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [formData, setFormData] = useState({ name: '', price: '', types: '', sizes: '' });

  useEffect(() => {
    getCatalogImages().then(pages => {
      setCatalogPages(pages);
      if (pages.length > 0) setSelectedImage(pages[0]);
    });
  }, []);

  useEffect(() => {
    if (selectedImage) {
      loadHotspots(selectedImage);
    }
  }, [selectedImage]);

  const loadHotspots = async (imageId: string) => {
    const data = await getHotspotsByImage(imageId);
    setHotspots(data);
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    if (!imageRef.current || isFormOpen) return;
    const rect = imageRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    setStartPos({ x, y });
    setIsDrawing(true);
    setTempBox({ top: y, left: x, width: 0, height: 0 });
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDrawing || !imageRef.current) return;
    const rect = imageRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
    const y = Math.max(0, Math.min(100, ((e.clientY - rect.top) / rect.height) * 100));

    setTempBox({
      top: Math.min(startPos.y, y),
      left: Math.min(startPos.x, x),
      width: Math.abs(x - startPos.x),
      height: Math.abs(y - startPos.y)
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
    
    const payload = {
      imageId: selectedImage,
      name: formData.name,
      price: formData.price,
      types: formData.types.split(',').map(s => s.trim()).filter(Boolean),
      sizes: formData.sizes.split(',').map(s => s.trim()).filter(Boolean),
      top: tempBox.top,
      left: tempBox.left,
      width: tempBox.width,
      height: tempBox.height
    };

    const res = await saveHotspot(payload);
    if (res.success) {
      toast.success('Hotspot Saved!');
      setHotspots([...hotspots, res.hotspot]);
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
      setHotspots(hotspots.filter(h => h.id !== id));
      toast.success('Deleted hotspot');
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 flex pb-32 font-sans text-slate-900">
      {/* Sidebar Controls */}
      <div className="w-80 bg-white border-r border-slate-200 p-6 flex flex-col h-screen sticky top-0 overflow-y-auto z-20 shadow-lg">
        <h1 className="text-xl font-bold font-serif mb-6 text-slate-800">Visual Hotspot Studio</h1>
        
        <label className="text-[11px] font-bold text-slate-500 mb-2 uppercase tracking-wide">Select Catalog Page</label>
        <select 
          className="w-full p-2 border border-slate-300 rounded mb-8 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
          value={selectedImage}
          onChange={(e) => setSelectedImage(e.target.value)}
        >
          {catalogPages.map(page => (
            <option key={page} value={page}>{page}</option>
          ))}
        </select>

        <div className="flex flex-col gap-3">
          <h2 className="text-[11px] font-bold text-slate-500 uppercase tracking-wide">Active Hotspots ({hotspots.length})</h2>
          {hotspots.length === 0 && <p className="text-xs text-slate-400">No hotspots drawn on this page.</p>}
          {hotspots.map(h => (
            <div key={h.id} className="p-3 bg-slate-50 border border-slate-200 rounded-lg flex items-center justify-between group">
              <div>
                <p className="text-sm font-bold text-slate-800 truncate max-w-[180px]">{h.name}</p>
                <p className="text-[10px] text-slate-500 font-mono mt-0.5">T: {h.top.toFixed(1)}% L: {h.left.toFixed(1)}%</p>
              </div>
              <button onClick={(e) => handleDelete(h.id, e)} className="text-slate-400 hover:text-red-600 hover:bg-red-50 p-2 rounded transition-colors">
                <Trash2 size={16} />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Main Drawing Canvas */}
      <div className="flex-1 p-8 flex justify-center items-start overflow-y-auto">
        <div className="max-w-4xl w-full bg-white shadow-xl rounded-xl p-4">
          <div className="text-sm text-center text-slate-600 mb-4 bg-blue-50 py-3 rounded-lg border border-blue-100 font-medium">
             Click and drag directly on the image below to draw a bounding box over a product.
          </div>
          
          {selectedImage ? (
            <div 
              ref={imageRef}
              className="relative w-full cursor-crosshair select-none touch-none bg-slate-50 border border-slate-200"
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
            >
              <Image 
                src={`/product/${encodeURIComponent(selectedImage)}`} 
                alt="Catalog Page Canvas" 
                width={1000} 
                height={1414} 
                className="w-full h-auto pointer-events-none"
                draggable={false}
                priority
              />

              {/* Render saved hotspots */}
              {hotspots.map(h => (
                <div 
                  key={h.id}
                  className="absolute border-2 border-emerald-500/80 bg-emerald-500/10 pointer-events-none transition-all"
                  style={{ top: `${h.top}%`, left: `${h.left}%`, width: `${h.width}%`, height: `${h.height}%` }}
                >
                  <span className="absolute -top-6 left-0 bg-emerald-500 text-white text-[10px] px-2 py-0.5 whitespace-nowrap font-bold rounded-sm shadow-md">
                    {h.name}
                  </span>
                </div>
              ))}

              {/* Render box currently being drawn */}
              {tempBox && (
                <div 
                  className="absolute border-2 border-blue-500 border-dashed bg-blue-500/20"
                  style={{ top: `${tempBox.top}%`, left: `${tempBox.left}%`, width: `${tempBox.width}%`, height: `${tempBox.height}%` }}
                />
              )}
            </div>
          ) : (
             <div className="p-12 text-center text-slate-400">Loading catalog images...</div>
          )}
        </div>
      </div>

      {/* Form Modal overlay */}
      {isFormOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white p-6 rounded-2xl w-full max-w-sm shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            <h3 className="text-lg font-bold font-serif mb-5 text-slate-900 border-b pb-3">Configure Hotspot</h3>
            <div className="space-y-4">
              <div>
                <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wide">Product Name</label>
                <input autoFocus type="text" className="w-full border-2 focus:border-blue-500 outline-none p-2.5 rounded-lg text-sm mt-1 bg-slate-50 transition-colors" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} placeholder="e.g. Mortice Lock" />
              </div>
              <div>
                <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wide">Price (Optional)</label>
                <input type="text" className="w-full border-2 focus:border-blue-500 outline-none p-2.5 rounded-lg text-sm mt-1 bg-slate-50 transition-colors" value={formData.price} onChange={e => setFormData({...formData, price: e.target.value})} placeholder="e.g. ₹ 850" />
              </div>
              <div>
                <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wide">Types / Finishes</label>
                <input type="text" className="w-full border-2 focus:border-blue-500 outline-none p-2.5 rounded-lg text-sm mt-1 bg-slate-50 transition-colors" value={formData.types} onChange={e => setFormData({...formData, types: e.target.value})} placeholder="Antic, Brass, Steel (comma separated)" />
              </div>
              <div>
                <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wide">Sizes</label>
                <input type="text" className="w-full border-2 focus:border-blue-500 outline-none p-2.5 rounded-lg text-sm mt-1 bg-slate-50 transition-colors" value={formData.sizes} onChange={e => setFormData({...formData, sizes: e.target.value})} placeholder="Small, Big, 25mm (comma separated)" />
              </div>

              <div className="flex gap-3 pt-4 border-t mt-4">
                <Button className="flex-1 bg-blue-600 hover:bg-blue-700 h-11" onClick={handleSave}>Save Hotspot</Button>
                <Button className="flex-1 h-11 border-slate-200" variant="outline" onClick={() => { setIsFormOpen(false); setTempBox(null); setFormData({ name: '', price: '', types: '', sizes: '' }); }}>Cancel</Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
