"use client";

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  saveHotspot,
  getHotspotsByImage,
  deleteHotspot,
  updateHotspot,
  saveMultipleHotspots,
  getCatalogImages
} from '@/app/actions';
import {
  autoDetectProducts,
  loadCocoSsdModel,
  DetectedBox
} from '@/lib/autoDetector';
import { toast } from 'sonner';
import {
  Trash2,
  ChevronDown,
  ChevronUp,
  Sparkles,
  Check,
  Edit2,
  Move,
  Layers,
  RefreshCw,
  Plus,
  Save,
  X,
  Scan,
  Cpu,
  HelpCircle,
  Eye,
  SlidersHorizontal
} from 'lucide-react';
import { Button } from '@/components/ui/button';

export interface StudioHotspot {
  id: string; // generated client-side id for drafts, cuid for saved
  imageId: string;
  name: string;
  types: string[];
  sizes: string[];
  top: number;
  left: number;
  width: number;
  height: number;
  price?: string | null;
  isDraft?: boolean;
  confidence?: number;
  source?: 'ai' | 'contour' | 'manual';
  isDirty?: boolean; // edited position but not yet saved to DB
}

type ResizeHandle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';

export default function CatalogStudio() {
  const [catalogPages, setCatalogPages] = useState<string[]>([]);
  const [selectedImage, setSelectedImage] = useState<string>('');
  const [savedHotspots, setSavedHotspots] = useState<StudioHotspot[]>([]);
  const [draftHotspots, setDraftHotspots] = useState<StudioHotspot[]>([]);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Model & Detection State
  const [modelStatus, setModelStatus] = useState<'unloaded' | 'loading' | 'ready' | 'error'>('unloaded');
  const [modelStatusText, setModelStatusText] = useState('Initializing AI...');
  const [isDetecting, setIsDetecting] = useState(false);
  const [autoDetectOnSwitch, setAutoDetectOnSwitch] = useState(true);
  const [detectionMode, setDetectionMode] = useState<'hybrid' | 'ai' | 'contour'>('hybrid');

  // Canvas Refs & Dimensions
  const canvasContainerRef = useRef<HTMLDivElement>(null);
  const imageElementRef = useRef<HTMLImageElement>(null);

  // Selected Box & Interaction State
  const [selectedHotspotId, setSelectedHotspotId] = useState<string | null>(null);
  const [interactionMode, setInteractionMode] = useState<'none' | 'drawing' | 'moving' | 'resizing'>('none');
  const [activeHandle, setActiveHandle] = useState<ResizeHandle | null>(null);
  const [startPos, setStartPos] = useState({ x: 0, y: 0 });
  const [initialBoxRect, setInitialBoxRect] = useState<{ top: number; left: number; width: number; height: number } | null>(null);
  const [tempDrawingBox, setTempDrawingBox] = useState<{ top: number; left: number; width: number; height: number } | null>(null);

  // Form Modal State
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [targetEditHotspot, setTargetEditHotspot] = useState<StudioHotspot | null>(null);
  const [formData, setFormData] = useState({ name: '', price: '', types: '', sizes: '' });
  const [isSaving, setIsSaving] = useState(false);

  // Preload AI model in background
  useEffect(() => {
    setModelStatus('loading');
    loadCocoSsdModel((text) => setModelStatusText(text))
      .then(() => {
        setModelStatus('ready');
        setModelStatusText('AI Ready (COCO-SSD)');
      })
      .catch((err) => {
        console.error('Model failed to load:', err);
        setModelStatus('error');
        setModelStatusText('Model Error (Contour Only)');
      });
  }, []);

  // Fetch catalog pages list
  useEffect(() => {
    getCatalogImages().then((pages) => {
      setCatalogPages(pages);
      if (pages.length > 0) setSelectedImage(pages[0]);
    });
  }, []);

  // Load saved hotspots whenever selected image changes
  useEffect(() => {
    if (selectedImage) {
      loadSavedHotspots(selectedImage);
    }
  }, [selectedImage]);

  const loadSavedHotspots = async (imageId: string) => {
    const data = await getHotspotsByImage(imageId);
    const mapped: StudioHotspot[] = (data || []).map((h: any) => ({
      ...h,
      isDraft: false,
    }));
    setSavedHotspots(mapped);
    setDraftHotspots([]); // clear drafts for new page
    setSelectedHotspotId(null);
  };

  // Run Auto Detection on the current image
  const handleRunAutoDetect = useCallback(async () => {
    if (!imageElementRef.current) {
      toast.error('Image element not loaded yet');
      return;
    }

    setIsDetecting(true);
    toast.info('Analyzing catalog page for products...', { duration: 2000 });

    try {
      const results: DetectedBox[] = await autoDetectProducts(
        imageElementRef.current,
        detectionMode
      );

      if (results.length === 0) {
        toast.info('No new distinct products identified automatically on this page.');
        setIsDetecting(false);
        return;
      }

      // Convert detected boxes to draft hotspots (filter out overlaps with already saved hotspots)
      const newDrafts: StudioHotspot[] = results
        .filter((detected) => {
          // Check if it significantly overlaps with any existing saved hotspot
          return !savedHotspots.some((saved) => {
            const xOverlap = Math.max(0, Math.min(detected.left + detected.width, saved.left + saved.width) - Math.max(detected.left, saved.left));
            const yOverlap = Math.max(0, Math.min(detected.top + detected.height, saved.top + saved.height) - Math.max(detected.top, saved.top));
            const overlapArea = xOverlap * yOverlap;
            const detArea = detected.width * detected.height;
            return detArea > 0 && overlapArea / detArea > 0.5;
          });
        })
        .map((detected, idx) => ({
          id: `draft-${Date.now()}-${idx}`,
          imageId: selectedImage,
          name: detected.name || `Product #${idx + 1}`,
          types: [],
          sizes: [],
          top: detected.top,
          left: detected.left,
          width: detected.width,
          height: detected.height,
          price: '',
          isDraft: true,
          confidence: detected.confidence,
          source: detected.source,
        }));

      if (newDrafts.length === 0) {
        toast.info('All detected products are already tagged on this page.');
      } else {
        setDraftHotspots(newDrafts);
        toast.success(`✨ Auto-detected ${newDrafts.length} product highlight${newDrafts.length > 1 ? 's' : ''}!`, {
          description: 'You can now adjust, resize, edit or save them.',
        });
      }
    } catch (err) {
      console.error('Detection error:', err);
      toast.error('Auto-detection encountered an error');
    } finally {
      setIsDetecting(false);
    }
  }, [detectionMode, selectedImage, savedHotspots]);

  // Run auto detection when image finishes loading (if auto-detect enabled & no saved hotspots yet)
  const handleImageLoaded = () => {
    if (autoDetectOnSwitch && savedHotspots.length === 0 && draftHotspots.length === 0) {
      handleRunAutoDetect();
    }
  };

  // Convert client pointer event into percentage coordinates (0 - 100)
  const getPointerPercentage = (e: React.PointerEvent): { x: number; y: number } => {
    if (!canvasContainerRef.current) return { x: 0, y: 0 };
    const rect = canvasContainerRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
    const y = Math.max(0, Math.min(100, ((e.clientY - rect.top) / rect.height) * 100));
    return {
      x: Number(x.toFixed(2)),
      y: Number(y.toFixed(2)),
    };
  };

  // Find active hotspot being edited or selected
  const allCurrentHotspots = [...savedHotspots, ...draftHotspots];
  const selectedHotspot = allCurrentHotspots.find((h) => h.id === selectedHotspotId) || null;

  // Handle Canvas Pointer Down: Start moving, resizing, or drawing new box
  const handleCanvasPointerDown = (e: React.PointerEvent) => {
    if (isFormOpen || isDetecting) return;
    const target = e.target as HTMLElement;

    // Check if clicked on a resize handle
    const resizeHandle = target.dataset.handle as ResizeHandle | undefined;
    if (resizeHandle && selectedHotspot) {
      e.stopPropagation();
      setInteractionMode('resizing');
      setActiveHandle(resizeHandle);
      const pos = getPointerPercentage(e);
      setStartPos(pos);
      setInitialBoxRect({
        top: selectedHotspot.top,
        left: selectedHotspot.left,
        width: selectedHotspot.width,
        height: selectedHotspot.height,
      });
      target.setPointerCapture(e.pointerId);
      return;
    }

    // Check if clicked on a hotspot box body
    const clickedHotspotId = target.dataset.hotspotId;
    if (clickedHotspotId) {
      e.stopPropagation();
      setSelectedHotspotId(clickedHotspotId);
      const clicked = allCurrentHotspots.find((h) => h.id === clickedHotspotId);
      if (clicked) {
        setInteractionMode('moving');
        const pos = getPointerPercentage(e);
        setStartPos(pos);
        setInitialBoxRect({
          top: clicked.top,
          left: clicked.left,
          width: clicked.width,
          height: clicked.height,
        });
      }
      target.setPointerCapture(e.pointerId);
      return;
    }

    // Clicked empty canvas space -> Start drawing a new manual box & deselect
    setSelectedHotspotId(null);
    const pos = getPointerPercentage(e);
    setStartPos(pos);
    setInteractionMode('drawing');
    setTempDrawingBox({ top: pos.y, left: pos.x, width: 0, height: 0 });
    target.setPointerCapture(e.pointerId);
  };

  // Handle Pointer Move: Update box position or size
  const handleCanvasPointerMove = (e: React.PointerEvent) => {
    if (interactionMode === 'none') return;
    const pos = getPointerPercentage(e);

    if (interactionMode === 'drawing') {
      const left = Math.min(startPos.x, pos.x);
      const top = Math.min(startPos.y, pos.y);
      const width = Math.abs(pos.x - startPos.x);
      const height = Math.abs(pos.y - startPos.y);
      setTempDrawingBox({ top, left, width, height });
      return;
    }

    if (interactionMode === 'moving' && selectedHotspot && initialBoxRect) {
      const dx = pos.x - startPos.x;
      const dy = pos.y - startPos.y;

      const newLeft = Math.max(0, Math.min(100 - initialBoxRect.width, initialBoxRect.left + dx));
      const newTop = Math.max(0, Math.min(100 - initialBoxRect.height, initialBoxRect.top + dy));

      updateActiveHotspotCoordinates(selectedHotspot.id, {
        left: Number(newLeft.toFixed(2)),
        top: Number(newTop.toFixed(2)),
      });
      return;
    }

    if (interactionMode === 'resizing' && selectedHotspot && initialBoxRect && activeHandle) {
      const dx = pos.x - startPos.x;
      const dy = pos.y - startPos.y;

      let { top, left, width, height } = initialBoxRect;

      // Handle horizontal sizing
      if (activeHandle.includes('e')) {
        width = Math.max(2, Math.min(100 - left, initialBoxRect.width + dx));
      } else if (activeHandle.includes('w')) {
        const potentialLeft = Math.max(0, Math.min(initialBoxRect.left + initialBoxRect.width - 2, initialBoxRect.left + dx));
        width = initialBoxRect.width + (initialBoxRect.left - potentialLeft);
        left = potentialLeft;
      }

      // Handle vertical sizing
      if (activeHandle.includes('s')) {
        height = Math.max(2, Math.min(100 - top, initialBoxRect.height + dy));
      } else if (activeHandle.includes('n')) {
        const potentialTop = Math.max(0, Math.min(initialBoxRect.top + initialBoxRect.height - 2, initialBoxRect.top + dy));
        height = initialBoxRect.height + (initialBoxRect.top - potentialTop);
        top = potentialTop;
      }

      updateActiveHotspotCoordinates(selectedHotspot.id, {
        top: Number(top.toFixed(2)),
        left: Number(left.toFixed(2)),
        width: Number(width.toFixed(2)),
        height: Number(height.toFixed(2)),
      });
    }
  };

  // Helper to update hotspot coordinates locally in state
  const updateActiveHotspotCoordinates = (id: string, coords: Partial<StudioHotspot>) => {
    if (draftHotspots.some((h) => h.id === id)) {
      setDraftHotspots((prev) =>
        prev.map((h) => (h.id === id ? { ...h, ...coords } : h))
      );
    } else {
      setSavedHotspots((prev) =>
        prev.map((h) => (h.id === id ? { ...h, ...coords, isDirty: true } : h))
      );
    }
  };

  // Handle Pointer Up: Commit adjustments or trigger modal for newly drawn box
  const handleCanvasPointerUp = () => {
    if (interactionMode === 'drawing') {
      if (tempDrawingBox && tempDrawingBox.width > 2 && tempDrawingBox.height > 2) {
        // Open modal to configure and save this newly drawn box
        const newManualDraft: StudioHotspot = {
          id: `draft-manual-${Date.now()}`,
          imageId: selectedImage,
          name: '',
          price: '',
          types: [],
          sizes: [],
          top: Number(tempDrawingBox.top.toFixed(2)),
          left: Number(tempDrawingBox.left.toFixed(2)),
          width: Number(tempDrawingBox.width.toFixed(2)),
          height: Number(tempDrawingBox.height.toFixed(2)),
          isDraft: true,
          source: 'manual',
        };
        openEditModal(newManualDraft);
      }
      setTempDrawingBox(null);
    }

    setInteractionMode('none');
    setActiveHandle(null);
    setInitialBoxRect(null);
  };

  // Open Edit/Configure Modal for a hotspot
  const openEditModal = (hotspot: StudioHotspot) => {
    setTargetEditHotspot(hotspot);
    setFormData({
      name: hotspot.name || '',
      price: hotspot.price || '',
      types: (hotspot.types || []).join(', '),
      sizes: (hotspot.sizes || []).join(', '),
    });
    setIsFormOpen(true);
  };

  // Save/Update Modal Submit
  const handleFormSubmit = async () => {
    if (!targetEditHotspot || !formData.name.trim()) {
      toast.error('Please enter a product name');
      return;
    }

    setIsSaving(true);
    const parsedTypes = formData.types.split(',').map((s) => s.trim()).filter(Boolean);
    const parsedSizes = formData.sizes.split(',').map((s) => s.trim()).filter(Boolean);

    try {
      if (targetEditHotspot.isDraft) {
        // Save new hotspot to DB
        const res = await saveHotspot({
          imageId: selectedImage,
          name: formData.name.trim(),
          price: formData.price.trim(),
          types: parsedTypes,
          sizes: parsedSizes,
          top: targetEditHotspot.top,
          left: targetEditHotspot.left,
          width: targetEditHotspot.width,
          height: targetEditHotspot.height,
        });

        if (res.success && res.hotspot) {
          toast.success(`Hotspot "${formData.name}" saved!`);
          // Remove from drafts and add to saved
          setDraftHotspots((prev) => prev.filter((h) => h.id !== targetEditHotspot.id));
          const newSaved: StudioHotspot = {
            ...res.hotspot,
            price: res.hotspot.price ?? null,
            isDraft: false,
          };
          setSavedHotspots((prev) => [...prev, newSaved]);
          setSelectedHotspotId(res.hotspot.id);
          setIsFormOpen(false);
          setTargetEditHotspot(null);
        } else {
          toast.error('Failed to save hotspot to database');
        }
      } else {
        // Update existing saved hotspot
        const res = await updateHotspot(targetEditHotspot.id, {
          name: formData.name.trim(),
          price: formData.price.trim(),
          types: parsedTypes,
          sizes: parsedSizes,
          top: targetEditHotspot.top,
          left: targetEditHotspot.left,
          width: targetEditHotspot.width,
          height: targetEditHotspot.height,
        });

        if (res.success) {
          toast.success(`Updated "${formData.name}"!`);
          setSavedHotspots((prev) =>
            prev.map((h) =>
              h.id === targetEditHotspot.id
                ? {
                    ...h,
                    name: formData.name.trim(),
                    price: formData.price.trim(),
                    types: parsedTypes,
                    sizes: parsedSizes,
                    isDirty: false,
                  }
                : h
            )
          );
          setIsFormOpen(false);
          setTargetEditHotspot(null);
        } else {
          toast.error('Failed to update hotspot');
        }
      }
    } catch (err) {
      console.error(err);
      toast.error('An error occurred while saving');
    } finally {
      setIsSaving(false);
    }
  };

  // Quick Save an individual Draft Hotspot with its default name
  const handleQuickSaveDraft = async (draft: StudioHotspot, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setIsSaving(true);
    const res = await saveHotspot({
      imageId: selectedImage,
      name: draft.name || 'Product',
      price: draft.price || '',
      types: draft.types || [],
      sizes: draft.sizes || [],
      top: draft.top,
      left: draft.left,
      width: draft.width,
      height: draft.height,
    });
    setIsSaving(false);

    if (res.success && res.hotspot) {
      toast.success(`Saved "${draft.name}"`);
      setDraftHotspots((prev) => prev.filter((h) => h.id !== draft.id));
      const newSaved: StudioHotspot = {
        ...res.hotspot,
        price: res.hotspot.price ?? null,
        isDraft: false,
      };
      setSavedHotspots((prev) => [...prev, newSaved]);
    } else {
      toast.error('Failed to save hotspot');
    }
  };

  // Save updated coordinates of an adjusted saved hotspot
  const handleSaveAdjustedPosition = async (hotspot: StudioHotspot, e?: React.MouseEvent) => {
    e?.stopPropagation();
    const res = await updateHotspot(hotspot.id, {
      top: hotspot.top,
      left: hotspot.left,
      width: hotspot.width,
      height: hotspot.height,
    });
    if (res.success) {
      toast.success('Updated hotspot position');
      setSavedHotspots((prev) =>
        prev.map((h) => (h.id === hotspot.id ? { ...h, isDirty: false } : h))
      );
    } else {
      toast.error('Failed to save position');
    }
  };

  // Batch Save all auto-detected draft highlights
  const handleSaveAllDrafts = async () => {
    if (draftHotspots.length === 0) return;
    setIsSaving(true);
    toast.info(`Saving ${draftHotspots.length} hotspots to database...`);

    const res = await saveMultipleHotspots(
      draftHotspots.map((d) => ({
        imageId: selectedImage,
        name: d.name,
        price: d.price || '',
        types: d.types || [],
        sizes: d.sizes || [],
        top: d.top,
        left: d.left,
        width: d.width,
        height: d.height,
      }))
    );
    setIsSaving(false);

    if (res.success) {
      toast.success(`🎉 Successfully saved ${res.count} products!`);
      loadSavedHotspots(selectedImage);
    } else {
      toast.error('Failed to batch save');
    }
  };

  // Delete a hotspot (Draft or Saved)
  const handleDeleteHotspot = async (id: string, isDraft: boolean, e?: React.MouseEvent) => {
    e?.stopPropagation();

    if (isDraft) {
      setDraftHotspots((prev) => prev.filter((h) => h.id !== id));
      if (selectedHotspotId === id) setSelectedHotspotId(null);
      toast.success('Draft removed');
      return;
    }

    const res = await deleteHotspot(id);
    if (res.success) {
      setSavedHotspots((prev) => prev.filter((h) => h.id !== id));
      if (selectedHotspotId === id) setSelectedHotspotId(null);
      toast.success('Hotspot deleted from database');
    } else {
      toast.error('Failed to delete');
    }
  };

  // Clear all drafts
  const handleClearAllDrafts = () => {
    setDraftHotspots([]);
    if (selectedHotspot?.isDraft) setSelectedHotspotId(null);
    toast.info('Drafts cleared');
  };

  return (
    <div className="min-h-screen bg-slate-900 font-sans text-slate-100 flex flex-col select-none">
      {/* ====== TOP HEADER & TOOLBAR ====== */}
      <div className="sticky top-0 z-30 bg-slate-950/90 backdrop-blur-md border-b border-slate-800 shadow-xl">
        <div className="px-4 py-2.5 flex flex-wrap items-center justify-between gap-3">
          {/* Logo & Title */}
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center text-white shadow-md shadow-indigo-600/30">
              <Scan size={17} />
            </div>
            <div>
              <h1 className="text-sm font-extrabold tracking-tight text-white flex items-center gap-1.5">
                Catalog Studio <span className="text-[10px] bg-indigo-500/20 text-indigo-300 px-1.5 py-0.5 rounded font-mono border border-indigo-500/30">AI Powered</span>
              </h1>
              <p className="text-[10px] text-slate-400 font-medium">
                {savedHotspots.length} saved • {draftHotspots.length} drafts
              </p>
            </div>
          </div>

          {/* Model Status Pill */}
          <div className="flex items-center gap-1.5 text-xs bg-slate-900 px-3 py-1.5 rounded-full border border-slate-800">
            {modelStatus === 'loading' && <RefreshCw size={13} className="text-amber-400 animate-spin" />}
            {modelStatus === 'ready' && <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />}
            {modelStatus === 'error' && <span className="w-2 h-2 rounded-full bg-amber-500" />}
            <span className="text-[11px] font-semibold text-slate-300">
              {isDetecting ? 'Scanning with AI...' : modelStatusText}
            </span>
          </div>

          {/* Page Selector */}
          <div className="flex-1 max-w-xs min-w-[180px]">
            <select
              className="w-full p-2 bg-slate-900 border border-slate-700 rounded-xl text-xs font-semibold text-slate-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none truncate"
              value={selectedImage}
              onChange={(e) => setSelectedImage(e.target.value)}
            >
              {catalogPages.map((page, idx) => (
                <option key={page} value={page}>
                  Page {idx + 1} ({page.replace('Hamza Draft 4-images-', '').replace('.jpg', '')})
                </option>
              ))}
            </select>
          </div>

          {/* Detection Actions Toolbar */}
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              disabled={isDetecting}
              onClick={handleRunAutoDetect}
              className="bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold shadow-md shadow-indigo-600/20 h-9 px-3 gap-1.5"
            >
              <Sparkles size={14} className={isDetecting ? 'animate-spin' : ''} />
              {isDetecting ? 'Detecting...' : 'Auto-Detect'}
            </Button>

            {draftHotspots.length > 0 && (
              <>
                <Button
                  size="sm"
                  disabled={isSaving}
                  onClick={handleSaveAllDrafts}
                  className="bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold shadow-md shadow-emerald-600/20 h-9 px-3 gap-1.5"
                >
                  <Save size={14} />
                  Save All ({draftHotspots.length})
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleClearAllDrafts}
                  className="border-slate-700 bg-slate-900 text-slate-400 hover:text-red-400 hover:bg-red-500/10 rounded-xl text-xs h-9 px-2.5"
                  title="Clear all auto-detected drafts"
                >
                  <Trash2 size={14} />
                </Button>
              </>
            )}

            {/* Mobile list drawer toggle */}
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="md:hidden flex items-center gap-1 text-xs font-bold text-slate-300 bg-slate-800 px-3 py-2 rounded-xl"
            >
              List ({allCurrentHotspots.length}) {sidebarOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>
          </div>
        </div>

        {/* Secondary Sub-toolbar: Settings & Detection Mode */}
        <div className="px-4 py-1.5 bg-slate-950 border-t border-slate-800/60 flex flex-wrap items-center justify-between text-xs text-slate-400">
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-1.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={autoDetectOnSwitch}
                onChange={(e) => setAutoDetectOnSwitch(e.target.checked)}
                className="w-3.5 h-3.5 rounded border-slate-700 text-indigo-600 focus:ring-indigo-500 bg-slate-900"
              />
              <span className="text-[11px] font-medium text-slate-300">Auto-detect when selecting blank page</span>
            </label>

            <div className="hidden sm:flex items-center gap-1.5 pl-3 border-l border-slate-800">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Engine:</span>
              <select
                value={detectionMode}
                onChange={(e: any) => setDetectionMode(e.target.value)}
                className="bg-slate-900 border border-slate-800 rounded-lg px-2 py-0.5 text-[11px] text-slate-300 outline-none font-medium"
              >
                <option value="hybrid">Hybrid (COCO-SSD + Layout Contour)</option>
                <option value="ai">AI Only (COCO-SSD)</option>
                <option value="contour">Layout Contour Only (Tools/Hardware)</option>
              </select>
            </div>
          </div>

          <div className="text-[11px] text-slate-400 flex items-center gap-3">
            <span>🖱️ Click to select &amp; resize</span>
            <span>✋ Drag to move</span>
            <span>➕ Drag empty area to add</span>
          </div>
        </div>
      </div>

      {/* ====== MOBILE COLLAPSIBLE DRAWER ====== */}
      {sidebarOpen && (
        <div className="md:hidden bg-slate-950 border-b border-slate-800 px-4 py-3 space-y-2 max-h-60 overflow-y-auto">
          {allCurrentHotspots.length === 0 ? (
            <p className="text-xs text-slate-500 text-center py-2">No highlights on this page.</p>
          ) : (
            allCurrentHotspots.map((h) => (
              <div
                key={h.id}
                onClick={() => setSelectedHotspotId(h.id)}
                className={`flex items-center justify-between p-2.5 rounded-xl border transition-all ${
                  selectedHotspotId === h.id
                    ? 'bg-indigo-950/60 border-indigo-500'
                    : h.isDraft
                    ? 'bg-slate-900/60 border-indigo-500/30'
                    : 'bg-slate-900 border-slate-800'
                }`}
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-white">{h.name || 'Unnamed Product'}</span>
                    {h.isDraft && (
                      <span className="text-[9px] bg-indigo-500/20 text-indigo-300 px-1.5 rounded font-mono">
                        Draft
                      </span>
                    )}
                  </div>
                  <p className="text-[10px] text-slate-400 font-mono">
                    T:{h.top}% L:{h.left}% W:{h.width}% H:{h.height}%
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  {h.isDraft && (
                    <Button
                      size="sm"
                      onClick={(e) => handleQuickSaveDraft(h, e)}
                      className="h-7 px-2 text-[10px] bg-emerald-600 hover:bg-emerald-500"
                    >
                      Save
                    </Button>
                  )}
                  <button
                    onClick={(e) => handleDeleteHotspot(h.id, !!h.isDraft, e)}
                    className="text-slate-400 hover:text-red-400 p-1.5"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* ====== MAIN WORKSPACE (SIDEBAR + CANVAS) ====== */}
      <div className="flex flex-1 overflow-hidden">
        {/* Desktop Sidebar */}
        <div className="hidden md:flex w-80 bg-slate-950 border-r border-slate-800 flex-col h-[calc(100vh-88px)] sticky top-[88px] overflow-y-auto">
          <div className="p-4 space-y-4">
            {/* Header info */}
            <div className="flex items-center justify-between">
              <h2 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                <Layers size={13} /> Page Highlights ({allCurrentHotspots.length})
              </h2>
              {draftHotspots.length > 0 && (
                <button
                  onClick={handleSaveAllDrafts}
                  className="text-[10px] font-bold text-emerald-400 hover:underline"
                >
                  Save All
                </button>
              )}
            </div>

            {/* List of Hotspots */}
            {allCurrentHotspots.length === 0 ? (
              <div className="text-center py-10 px-4 border border-dashed border-slate-800 rounded-2xl">
                <Scan size={24} className="text-slate-600 mx-auto mb-2" />
                <p className="text-xs font-semibold text-slate-400">No highlights on this page</p>
                <p className="text-[11px] text-slate-500 mt-1">
                  Click &ldquo;Auto-Detect&rdquo; above or drag on the canvas to draw.
                </p>
              </div>
            ) : (
              <div className="space-y-2.5">
                {allCurrentHotspots.map((h) => {
                  const isSelected = selectedHotspotId === h.id;
                  return (
                    <div
                      key={h.id}
                      onClick={() => setSelectedHotspotId(h.id)}
                      className={`p-3 rounded-2xl border transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-indigo-950/70 border-indigo-500 shadow-lg shadow-indigo-950/50'
                          : h.isDraft
                          ? 'bg-slate-900/70 border-indigo-500/30 hover:border-indigo-500/60'
                          : 'bg-slate-900 border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-xs font-bold text-white truncate">{h.name || 'Unnamed Product'}</p>
                            {h.isDraft ? (
                              <span className="text-[9px] bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 px-1.5 py-0.2 rounded font-mono shrink-0">
                                Draft
                              </span>
                            ) : (
                              <span className="text-[9px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-1.5 py-0.2 rounded font-mono shrink-0">
                                Saved
                              </span>
                            )}
                          </div>
                          <p className="text-[10px] text-slate-400 font-mono mt-1">
                            T:{h.top}% L:{h.left}% W:{h.width}% H:{h.height}%
                          </p>
                          {h.price && (
                            <p className="text-[10px] font-bold text-slate-300 mt-0.5">
                              Price: {h.price}
                            </p>
                          )}
                        </div>

                        {/* Card Actions */}
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              openEditModal(h);
                            }}
                            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
                            title="Configure details"
                          >
                            <Edit2 size={13} />
                          </button>
                          {h.isDraft && (
                            <button
                              onClick={(e) => handleQuickSaveDraft(h, e)}
                              className="p-1.5 text-emerald-400 hover:text-emerald-300 rounded-lg hover:bg-emerald-500/10 transition-colors"
                              title="Save to database"
                            >
                              <Check size={14} />
                            </button>
                          )}
                          {h.isDirty && (
                            <button
                              onClick={(e) => handleSaveAdjustedPosition(h, e)}
                              className="p-1.5 text-amber-400 hover:text-amber-300 rounded-lg hover:bg-amber-500/10 transition-colors"
                              title="Save moved position"
                            >
                              <Save size={13} />
                            </button>
                          )}
                          <button
                            onClick={(e) => handleDeleteHotspot(h.id, !!h.isDraft, e)}
                            className="p-1.5 text-slate-400 hover:text-red-400 rounded-lg hover:bg-red-500/10 transition-colors"
                            title="Delete"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Canvas Workspace Area */}
        <div className="flex-1 p-3 md:p-6 overflow-y-auto flex justify-center items-start bg-slate-900/60">
          <div className="w-full max-w-3xl flex flex-col items-center">
            {/* Interactive Image Container */}
            <div className="w-full bg-slate-950 rounded-2xl border border-slate-800 overflow-hidden shadow-2xl relative">
              {selectedImage ? (
                <div
                  ref={canvasContainerRef}
                  className="relative w-full select-none touch-none cursor-crosshair overflow-hidden"
                  onPointerDown={handleCanvasPointerDown}
                  onPointerMove={handleCanvasPointerMove}
                  onPointerUp={handleCanvasPointerUp}
                  onPointerLeave={handleCanvasPointerUp}
                >
                  {/* Underlay Image */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    ref={imageElementRef}
                    src={`/product/${selectedImage}`}
                    alt="Catalog Page Canvas"
                    onLoad={handleImageLoaded}
                    className="w-full h-auto block pointer-events-none select-none"
                    draggable={false}
                  />

                  {/* ============ RENDER ALL HOTSPOTS ============ */}
                  {allCurrentHotspots.map((h) => {
                    const isSelected = selectedHotspotId === h.id;
                    const isDraft = !!h.isDraft;

                    return (
                      <div
                        key={h.id}
                        data-hotspot-id={h.id}
                        style={{
                          top: `${h.top}%`,
                          left: `${h.left}%`,
                          width: `${h.width}%`,
                          height: `${h.height}%`,
                        }}
                        className={`absolute cursor-move transition-colors ${
                          isSelected
                            ? 'border-2 border-indigo-400 bg-indigo-500/25 ring-2 ring-indigo-400/50 z-20'
                            : isDraft
                            ? 'border-2 border-dashed border-indigo-400/80 bg-indigo-500/15 hover:bg-indigo-500/25 z-10'
                            : 'border-2 border-emerald-500/90 bg-emerald-500/15 hover:bg-emerald-500/25 z-10'
                        }`}
                      >
                        {/* Name badge */}
                        <div className="absolute -top-5 left-0 flex items-center gap-1 pointer-events-none">
                          <span
                            className={`text-[9px] font-bold px-1.5 py-0.5 rounded-sm whitespace-nowrap shadow-sm text-white flex items-center gap-1 ${
                              isSelected
                                ? 'bg-indigo-600'
                                : isDraft
                                ? 'bg-indigo-500'
                                : 'bg-emerald-600'
                            }`}
                          >
                            {h.name || 'Item'}
                            {isDraft && <span className="text-[8px] opacity-80">(Draft)</span>}
                            {h.isDirty && <span className="text-[8px] text-amber-200">●</span>}
                          </span>
                        </div>

                        {/* Floating Action Pill on Selected Box */}
                        {isSelected && (
                          <div
                            onPointerDown={(e) => e.stopPropagation()}
                            className="absolute -bottom-8 left-1/2 -translate-x-1/2 bg-slate-950/95 border border-slate-700 rounded-xl px-2 py-1 flex items-center gap-1 shadow-2xl z-30 pointer-events-auto"
                          >
                            <button
                              onClick={() => openEditModal(h)}
                              className="px-2 py-0.5 text-[10px] font-bold text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg flex items-center gap-1"
                              title="Configure details"
                            >
                              <Edit2 size={11} /> Edit
                            </button>
                            {isDraft && (
                              <button
                                onClick={(e) => handleQuickSaveDraft(h, e)}
                                className="px-2 py-0.5 text-[10px] font-bold text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg flex items-center gap-1"
                                title="Save"
                              >
                                <Save size={11} /> Save
                              </button>
                            )}
                            {h.isDirty && (
                              <button
                                onClick={(e) => handleSaveAdjustedPosition(h, e)}
                                className="px-2 py-0.5 text-[10px] font-bold text-amber-300 bg-amber-500/20 hover:bg-amber-500/30 rounded-lg flex items-center gap-1"
                                title="Save new position"
                              >
                                <Check size={11} /> Save Pos
                              </button>
                            )}
                            <button
                              onClick={(e) => handleDeleteHotspot(h.id, isDraft, e)}
                              className="p-1 text-slate-400 hover:text-red-400 rounded-lg"
                              title="Delete"
                            >
                              <Trash2 size={12} />
                            </button>
                          </div>
                        )}

                        {/* 8 Resize Handles (rendered only when selected) */}
                        {isSelected && (
                          <>
                            {/* NW Handle */}
                            <div
                              data-handle="nw"
                              className="absolute -top-1.5 -left-1.5 w-3 h-3 bg-white border-2 border-indigo-600 rounded-full cursor-nwse-resize z-30 shadow-md"
                            />
                            {/* N Handle */}
                            <div
                              data-handle="n"
                              className="absolute -top-1.5 left-1/2 -translate-x-1/2 w-3 h-3 bg-white border-2 border-indigo-600 rounded-full cursor-ns-resize z-30 shadow-md"
                            />
                            {/* NE Handle */}
                            <div
                              data-handle="ne"
                              className="absolute -top-1.5 -right-1.5 w-3 h-3 bg-white border-2 border-indigo-600 rounded-full cursor-nesw-resize z-30 shadow-md"
                            />
                            {/* E Handle */}
                            <div
                              data-handle="e"
                              className="absolute top-1/2 -right-1.5 -translate-y-1/2 w-3 h-3 bg-white border-2 border-indigo-600 rounded-full cursor-ew-resize z-30 shadow-md"
                            />
                            {/* SE Handle */}
                            <div
                              data-handle="se"
                              className="absolute -bottom-1.5 -right-1.5 w-3 h-3 bg-white border-2 border-indigo-600 rounded-full cursor-nwse-resize z-30 shadow-md"
                            />
                            {/* S Handle */}
                            <div
                              data-handle="s"
                              className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-3 h-3 bg-white border-2 border-indigo-600 rounded-full cursor-ns-resize z-30 shadow-md"
                            />
                            {/* SW Handle */}
                            <div
                              data-handle="sw"
                              className="absolute -bottom-1.5 -left-1.5 w-3 h-3 bg-white border-2 border-indigo-600 rounded-full cursor-nesw-resize z-30 shadow-md"
                            />
                            {/* W Handle */}
                            <div
                              data-handle="w"
                              className="absolute top-1/2 -left-1.5 -translate-y-1/2 w-3 h-3 bg-white border-2 border-indigo-600 rounded-full cursor-ew-resize z-30 shadow-md"
                            />
                          </>
                        )}
                      </div>
                    );
                  })}

                  {/* Temporary Box being drawn manually */}
                  {tempDrawingBox && (
                    <div
                      className="absolute border-2 border-dashed border-blue-400 bg-blue-500/25 pointer-events-none z-30"
                      style={{
                        top: `${tempDrawingBox.top}%`,
                        left: `${tempDrawingBox.left}%`,
                        width: `${tempDrawingBox.width}%`,
                        height: `${tempDrawingBox.height}%`,
                      }}
                    />
                  )}
                </div>
              ) : (
                <div className="p-20 text-center text-slate-500 text-sm">
                  Loading catalog pages...
                </div>
              )}
            </div>

            {/* Instruction Footer Note */}
            <p className="text-[11px] text-slate-500 mt-3 text-center">
              💡 Tip: Click any box to activate 8-point resize handles or drag to move. Dragging on empty space draws a new custom box.
            </p>
          </div>
        </div>
      </div>

      {/* ====== CONFIGURE / EDIT HOTSPOT MODAL ====== */}
      {isFormOpen && targetEditHotspot && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-slate-900 border border-slate-800 w-full sm:max-w-md sm:rounded-2xl rounded-t-2xl p-6 shadow-2xl animate-in slide-in-from-bottom-4 sm:zoom-in-95 duration-200">
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-800">
              <div>
                <h3 className="text-base font-bold text-white">
                  {targetEditHotspot.isDraft ? 'Configure & Save Hotspot' : 'Edit Hotspot Details'}
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  T:{targetEditHotspot.top}% L:{targetEditHotspot.left}% ({targetEditHotspot.width}% × {targetEditHotspot.height}%)
                </p>
              </div>
              <button
                onClick={() => setIsFormOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-3.5">
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Product Name *</label>
                <input
                  autoFocus
                  type="text"
                  className="w-full bg-slate-950 border border-slate-800 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none p-2.5 rounded-xl text-sm mt-1 text-white transition-colors"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g. Mortice Lock 200mm"
                />
              </div>

              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Price (Optional)</label>
                <input
                  type="text"
                  className="w-full bg-slate-950 border border-slate-800 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none p-2.5 rounded-xl text-sm mt-1 text-white transition-colors"
                  value={formData.price}
                  onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                  placeholder="e.g. ₹ 850"
                />
              </div>

              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Types / Finishes</label>
                <input
                  type="text"
                  className="w-full bg-slate-950 border border-slate-800 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none p-2.5 rounded-xl text-sm mt-1 text-white transition-colors"
                  value={formData.types}
                  onChange={(e) => setFormData({ ...formData, types: e.target.value })}
                  placeholder="Antic, Brass, SS (comma separated)"
                />
              </div>

              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Sizes</label>
                <input
                  type="text"
                  className="w-full bg-slate-950 border border-slate-800 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none p-2.5 rounded-xl text-sm mt-1 text-white transition-colors"
                  value={formData.sizes}
                  onChange={(e) => setFormData({ ...formData, sizes: e.target.value })}
                  placeholder="Small, Big, 25mm (comma separated)"
                />
              </div>

              <div className="flex gap-2.5 pt-4 border-t border-slate-800">
                <Button
                  disabled={isSaving}
                  className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white h-11 rounded-xl text-xs font-bold shadow-md shadow-indigo-600/30"
                  onClick={handleFormSubmit}
                >
                  {isSaving ? 'Saving...' : targetEditHotspot.isDraft ? 'Save Hotspot' : 'Update Hotspot'}
                </Button>
                <Button
                  className="flex-1 h-11 rounded-xl text-xs border-slate-800 bg-slate-950 text-slate-300 hover:bg-slate-800"
                  variant="outline"
                  onClick={() => setIsFormOpen(false)}
                >
                  Cancel
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
