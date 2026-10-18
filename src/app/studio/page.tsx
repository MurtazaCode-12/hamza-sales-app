"use client";

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { getCatalogImages } from '@/app/actions';
import { toast } from 'sonner';
import {
  Trash2,
  ChevronDown,
  ChevronUp,
  Sparkles,
  Check,
  Edit2,
  Layers,
  Save,
  X,
  Scan,
  Upload,
  Key,
  Bot,
  Image as ImageIcon,
  ArrowRight,
  ArrowLeft,
  ShieldAlert,
  FileText,
  LogOut
} from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { useProfile } from '@/context/ProfileContext';
import { getDefaultGeminiKey } from '@/lib/geminiKey';
import UploadPriceListModal from '@/components/UploadPriceListModal';

export interface StudioHotspot {
  id: string;
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
  source?: 'gemini' | 'manual';
  isDirty?: boolean;
}

type ResizeHandle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';

// Resilient fetch helper that handles HTML/non-JSON responses gracefully
async function safeJsonFetch(url: string, options?: RequestInit): Promise<{ ok: boolean; status: number; data: any }> {
  const res = await fetch(url, options);
  const contentType = res.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    const text = await res.text();
    console.warn(`Non-JSON response from ${url}:`, res.status, text.slice(0, 200));
    throw new Error(`Server returned status ${res.status}. Please try again.`);
  }
  const data = await res.json();
  return { ok: res.ok, status: res.status, data };
}

const DEFAULT_GEMINI_KEY = getDefaultGeminiKey();

export default function CatalogStudio() {
  const { profile: activeProfile, isAdmin, isLoading: isProfileLoading, signOut } = useProfile();

  const [catalogPages, setCatalogPages] = useState<string[]>([]);
  const [selectedImage, setSelectedImage] = useState<string>('');
  const [customUploadedSrc, setCustomUploadedSrc] = useState<string | null>(null);
  const [customUploadedName, setCustomUploadedName] = useState<string>('');
  
  const [savedHotspots, setSavedHotspots] = useState<StudioHotspot[]>([]);
  const [draftHotspots, setDraftHotspots] = useState<StudioHotspot[]>([]);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Gemini API & Loading State
  const [isGeminiAnalyzing, setIsGeminiAnalyzing] = useState(false);
  const [geminiApiKey, setGeminiApiKey] = useState<string>(DEFAULT_GEMINI_KEY);
  const [isApiKeyModalOpen, setIsApiKeyModalOpen] = useState(false);
  const [tempApiKeyInput, setTempApiKeyInput] = useState(DEFAULT_GEMINI_KEY);

  // PDF Price Scanner State
  const [isScanningPdf, setIsScanningPdf] = useState(false);
  const [isPriceListModalOpen, setIsPriceListModalOpen] = useState(false);
  const pdfFileInputRef = useRef<HTMLInputElement>(null);

  // Canvas Refs & Dimensions
  const canvasContainerRef = useRef<HTMLDivElement>(null);
  const imageElementRef = useRef<HTMLImageElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  // Load API Key from localStorage (fallback to DEFAULT_GEMINI_KEY)
  useEffect(() => {
    const savedKey = localStorage.getItem('gemini_api_key') || DEFAULT_GEMINI_KEY;
    if (savedKey) {
      setGeminiApiKey(savedKey);
      setTempApiKeyInput(savedKey);
      localStorage.setItem('gemini_api_key', savedKey);
    }
  }, []);

  // Fetch catalog pages list
  useEffect(() => {
    getCatalogImages().then((pages) => {
      setCatalogPages(pages);
      if (pages.length > 0) setSelectedImage(pages[0]);
    });
  }, []);

  // Load saved hotspots whenever selected catalog image changes
  useEffect(() => {
    if (selectedImage && !customUploadedSrc) {
      loadSavedHotspots(selectedImage);
    }
  }, [selectedImage, customUploadedSrc]);

  const loadSavedHotspots = async (imageId: string) => {
    try {
      const { ok, data } = await safeJsonFetch(`/api/hotspots?imageId=${encodeURIComponent(imageId)}`);
      if (ok && data?.success) {
        const mapped: StudioHotspot[] = (data.hotspots || []).map((h: any) => ({
          ...h,
          isDraft: false,
        }));
        setSavedHotspots(mapped);
      }
    } catch (err) {
      console.error('Failed to load hotspots', err);
    }
    setDraftHotspots([]);
    setSelectedHotspotId(null);
  };

  // Convert current image (or uploaded image) to base64 for Gemini
  const getImageBase64 = async (): Promise<string> => {
    if (customUploadedSrc) {
      return customUploadedSrc;
    }
    // Fetch image from public path and convert to base64
    const response = await fetch(`/product/${selectedImage}`);
    const blob = await response.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  };

  // Call Gemini 2.5 Flash API for Object Detection & Variant Extraction
  const runGeminiDetection = async (base64Override?: string) => {
    setIsGeminiAnalyzing(true);
    toast.info('Sending image to Gemini 2.5 Flash for product detection...', { duration: 3000 });

    try {
      const base64Data = base64Override || (await getImageBase64());
      const currentImageId = customUploadedSrc ? customUploadedName : selectedImage;

      const { ok, data } = await safeJsonFetch('/api/gemini-detect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageBase64: base64Data,
          mimeType: 'image/jpeg',
          apiKey: geminiApiKey || DEFAULT_GEMINI_KEY,
        }),
      });

      if (!ok) {
        if (data?.error === 'MISSING_API_KEY') {
          setIsApiKeyModalOpen(true);
          toast.error('Gemini API key is required. Please enter your API key.');
        } else {
          toast.error(`Gemini Error: ${data?.message || data?.error || 'Detection failed'}`);
        }
        setIsGeminiAnalyzing(false);
        return;
      }

      if (!data?.products || data.products.length === 0) {
        toast.info('Gemini analyzed the image but did not detect distinct products.');
        setIsGeminiAnalyzing(false);
        return;
      }

      // Format parsed Gemini products as draft highlights with types and sizes
      const newDrafts: StudioHotspot[] = data.products.map((p: any, idx: number) => ({
        id: `gemini-${Date.now()}-${idx}`,
        imageId: currentImageId,
        name: p.name || `Product #${idx + 1}`,
        price: p.price || '',
        types: Array.isArray(p.types) ? p.types : [],
        sizes: Array.isArray(p.sizes) ? p.sizes : [],
        top: p.top,
        left: p.left,
        width: p.width,
        height: p.height,
        isDraft: true,
        source: 'gemini',
      }));

      setDraftHotspots(newDrafts);
      toast.success(`✨ Gemini 2.5 Flash detected ${newDrafts.length} product(s)!`, {
        description: 'Auto-extracted variants, sizes, and bounding boxes.',
      });
    } catch (err: any) {
      console.error('Gemini Detection Error:', err);
      toast.error(err?.message || 'Failed to communicate with Gemini API');
    } finally {
      setIsGeminiAnalyzing(false);
    }
  };

  // Handle local image file upload
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const result = event.target?.result as string;
      setCustomUploadedSrc(result);
      setCustomUploadedName(file.name);
      setSavedHotspots([]);
      setDraftHotspots([]);
      setSelectedHotspotId(null);
      toast.success(`Uploaded ${file.name}`);

      // Automatically send to Gemini 1.5 Flash API as requested
      runGeminiDetection(result);
    };
    reader.readAsDataURL(file);
    e.target.value = ''; // reset input
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
    if (isFormOpen || isGeminiAnalyzing) return;
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

      if (activeHandle.includes('e')) {
        width = Math.max(2, Math.min(100 - left, initialBoxRect.width + dx));
      } else if (activeHandle.includes('w')) {
        const potentialLeft = Math.max(0, Math.min(initialBoxRect.left + initialBoxRect.width - 2, initialBoxRect.left + dx));
        width = initialBoxRect.width + (initialBoxRect.left - potentialLeft);
        left = potentialLeft;
      }

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

  // Handle Pointer Up
  const handleCanvasPointerUp = () => {
    if (interactionMode === 'drawing') {
      if (tempDrawingBox && tempDrawingBox.width > 2 && tempDrawingBox.height > 2) {
        const currentImgId = customUploadedSrc ? customUploadedName : selectedImage;
        const newManualDraft: StudioHotspot = {
          id: `draft-manual-${Date.now()}`,
          imageId: currentImgId,
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

  // Open Edit/Configure Modal
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
    const currentImgId = customUploadedSrc ? customUploadedName : selectedImage;

    try {
      if (targetEditHotspot.isDraft) {
        const { ok, data } = await safeJsonFetch('/api/hotspots', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            imageId: currentImgId,
            name: formData.name.trim(),
            price: formData.price.trim(),
            types: parsedTypes,
            sizes: parsedSizes,
            top: targetEditHotspot.top,
            left: targetEditHotspot.left,
            width: targetEditHotspot.width,
            height: targetEditHotspot.height,
          }),
        });

        if (ok && data?.success && data?.hotspot) {
          toast.success(`Hotspot "${formData.name}" saved!`);
          setDraftHotspots((prev) => prev.filter((h) => h.id !== targetEditHotspot.id));
          const newSaved: StudioHotspot = {
            ...data.hotspot,
            price: data.hotspot.price ?? null,
            isDraft: false,
          };
          setSavedHotspots((prev) => [...prev, newSaved]);
          setSelectedHotspotId(data.hotspot.id);
          setIsFormOpen(false);
          setTargetEditHotspot(null);
        } else {
          toast.error(data?.error || 'Failed to save hotspot to database');
        }
      } else {
        const { ok, data } = await safeJsonFetch('/api/hotspots', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: targetEditHotspot.id,
            imageId: currentImgId,
            name: formData.name.trim(),
            price: formData.price.trim(),
            types: parsedTypes,
            sizes: parsedSizes,
            top: targetEditHotspot.top,
            left: targetEditHotspot.left,
            width: targetEditHotspot.width,
            height: targetEditHotspot.height,
          }),
        });

        if (ok && data?.success) {
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
          toast.error(data?.error || 'Failed to update hotspot');
        }
      }
    } catch (err: any) {
      console.error(err);
      toast.error(err?.message || 'An error occurred while saving');
    } finally {
      setIsSaving(false);
    }
  };

  // Quick Save an individual Draft Hotspot
  const handleQuickSaveDraft = async (draft: StudioHotspot, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setIsSaving(true);
    const currentImgId = customUploadedSrc ? customUploadedName : selectedImage;

    try {
      const { ok, data } = await safeJsonFetch('/api/hotspots', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageId: currentImgId,
          name: draft.name || 'Product',
          price: draft.price || '',
          types: draft.types || [],
          sizes: draft.sizes || [],
          top: draft.top,
          left: draft.left,
          width: draft.width,
          height: draft.height,
        }),
      });

      if (ok && data?.success && data?.hotspot) {
        toast.success(`Saved "${draft.name}"`);
        setDraftHotspots((prev) => prev.filter((h) => h.id !== draft.id));
        const newSaved: StudioHotspot = {
          ...data.hotspot,
          price: data.hotspot.price ?? null,
          isDraft: false,
        };
        setSavedHotspots((prev) => [...prev, newSaved]);
      } else {
        toast.error(data?.error || 'Failed to save hotspot');
      }
    } catch (err: any) {
      toast.error(err?.message || 'Failed to save hotspot');
    } finally {
      setIsSaving(false);
    }
  };

  // Save updated coordinates of an adjusted saved hotspot
  const handleSaveAdjustedPosition = async (hotspot: StudioHotspot, e?: React.MouseEvent) => {
    e?.stopPropagation();
    try {
      const { ok, data } = await safeJsonFetch('/api/hotspots', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: hotspot.id,
          top: hotspot.top,
          left: hotspot.left,
          width: hotspot.width,
          height: hotspot.height,
        }),
      });

      if (ok && data?.success) {
        toast.success('Updated hotspot position');
        setSavedHotspots((prev) =>
          prev.map((h) => (h.id === hotspot.id ? { ...h, isDirty: false } : h))
        );
      } else {
        toast.error(data?.error || 'Failed to save position');
      }
    } catch (err: any) {
      toast.error(err?.message || 'Failed to save position');
    }
  };

  // Batch Save all Gemini draft highlights
  const handleSaveAllDrafts = async () => {
    if (draftHotspots.length === 0) return;
    setIsSaving(true);
    toast.info(`Saving ${draftHotspots.length} hotspots to database...`);
    const currentImgId = customUploadedSrc ? customUploadedName : selectedImage;

    try {
      const { ok, data } = await safeJsonFetch('/api/hotspots', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          hotspots: draftHotspots.map((d) => ({
            imageId: currentImgId,
            name: d.name,
            price: d.price || '',
            types: d.types || [],
            sizes: d.sizes || [],
            top: d.top,
            left: d.left,
            width: d.width,
            height: d.height,
          })),
        }),
      });

      if (ok && data?.success) {
        toast.success(`🎉 Successfully saved ${data.count} products!`);
        if (!customUploadedSrc) {
          loadSavedHotspots(selectedImage);
        } else {
          setSavedHotspots((prev) => [
            ...prev,
            ...(data.hotspots || []).map((h: any) => ({ ...h, isDraft: false })),
          ]);
          setDraftHotspots([]);
        }
      } else {
        toast.error(data?.error || 'Failed to batch save');
      }
    } catch (err: any) {
      toast.error(err?.message || 'Failed to batch save');
    } finally {
      setIsSaving(false);
    }
  };

  // Delete a hotspot
  const handleDeleteHotspot = async (id: string, isDraft: boolean, e?: React.MouseEvent) => {
    e?.stopPropagation();

    if (isDraft) {
      setDraftHotspots((prev) => prev.filter((h) => h.id !== id));
      if (selectedHotspotId === id) setSelectedHotspotId(null);
      toast.success('Draft removed');
      return;
    }

    try {
      const { ok, data } = await safeJsonFetch(`/api/hotspots?id=${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });

      if (ok && data?.success) {
        setSavedHotspots((prev) => prev.filter((h) => h.id !== id));
        if (selectedHotspotId === id) setSelectedHotspotId(null);
        toast.success('Hotspot deleted from database');
      } else {
        toast.error(data?.error || 'Failed to delete');
      }
    } catch (err: any) {
      toast.error(err?.message || 'Failed to delete');
    }
  };

  // Save API Key to localStorage
  const handleSaveApiKey = () => {
    const trimmed = tempApiKeyInput.trim();
    setGeminiApiKey(trimmed);
    localStorage.setItem('gemini_api_key', trimmed);
    setIsApiKeyModalOpen(false);
    toast.success('Gemini API key saved!');
  };

  // Upload & Scan PDF Price List
  const handlePdfPriceUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsScanningPdf(true);
    toast.info("Scanning PDF Price List with Gemini 2.5 Flash...");

    try {
      const formData = new FormData();
      formData.append("file", file);
      if (geminiApiKey) formData.append("apiKey", geminiApiKey);

      const { ok, data } = await safeJsonFetch("/api/scan-prices", {
        method: "POST",
        body: formData,
      });

      if (!ok || !data?.success) {
        throw new Error(data?.message || data?.error || "Failed to scan PDF price list");
      }

      toast.success(
        `Scanned ${data.scannedCount || 0} items! Updated ${data.updatedCount || 0} products in database.`
      );

      // Refresh hotspots for current image if applicable
      const currentImgId = customUploadedSrc ? customUploadedName : selectedImage;
      if (currentImgId) {
        const { ok: hOk, data: hData } = await safeJsonFetch(`/api/hotspots?imageId=${encodeURIComponent(currentImgId)}`);
        if (hOk && hData?.success && hData?.hotspots) {
          setSavedHotspots(hData.hotspots.map((h: any) => ({ ...h, isDraft: false })));
        }
      }
    } catch (err: any) {
      toast.error(err?.message || "Failed to scan PDF price list");
    } finally {
      setIsScanningPdf(false);
    }
  };

  // Active image display URL
  const currentImageUrl = customUploadedSrc || (selectedImage ? `/product/${selectedImage}` : '');

  // Admin Guard: Only Admin profiles can access /studio
  if (!isProfileLoading && !isAdmin) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6 text-center select-none">
        <div className="w-16 h-16 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-500 flex items-center justify-center mb-4">
          <ShieldAlert size={32} />
        </div>
        <h1 className="text-xl font-bold text-white mb-2">Admin Profile Required</h1>
        <p className="text-sm text-slate-400 max-w-sm mb-6">
          The Catalog Studio is restricted to Admin profiles only. You are currently browsing as {activeProfile?.name || "a Standard User"}.
        </p>
        <div className="flex gap-3">
          <Link href="/select-profile">
            <Button className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold px-4 py-2">
              Switch Profile
            </Button>
          </Link>
          <Link href="/">
            <Button variant="outline" className="border-slate-800 text-slate-300 hover:bg-slate-900 rounded-xl text-xs font-bold px-4 py-2">
              Back to Catalog
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900 font-sans text-slate-100 flex flex-col select-none">
      {/* Hidden file input for uploading images */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileUpload}
      />

      {/* Hidden file input for PDF price list */}
      <input
        ref={pdfFileInputRef}
        type="file"
        accept=".pdf,application/pdf"
        className="hidden"
        onChange={handlePdfPriceUpload}
      />

      {/* ====== TOP HEADER & TOOLBAR ====== */}
      <div className="sticky top-0 z-30 bg-slate-950/90 backdrop-blur-md border-b border-slate-800 shadow-xl">
        <div className="px-4 py-2.5 flex flex-wrap items-center justify-between gap-3">
          {/* Logo & Title */}
          <div className="flex items-center gap-2.5">
            <Link 
              href="/admin" 
              className="p-2 bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-400 hover:text-white rounded-xl transition-all"
              title="Return to Admin Dashboard"
            >
              <ArrowLeft size={16} />
            </Link>
            <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center text-white shadow-md shadow-indigo-600/30">
              <Bot size={18} />
            </div>
            <div>
              <h1 className="text-sm font-extrabold tracking-tight text-white flex items-center gap-1.5">
                Catalog Studio <span className="text-[10px] bg-gradient-to-r from-blue-500/20 to-purple-500/20 text-blue-300 px-1.5 py-0.5 rounded font-mono border border-blue-500/30">Gemini 1.5 Flash</span>
              </h1>
              <p className="text-[10px] text-slate-400 font-medium">
                {savedHotspots.length} saved • {draftHotspots.length} drafts
              </p>
            </div>
          </div>

          {/* Page Selector & Upload Actions */}
          <div className="flex items-center gap-2 flex-1 max-w-md min-w-[200px]">
            {customUploadedSrc ? (
              <div className="flex-1 flex items-center justify-between bg-indigo-950/60 border border-indigo-700/60 rounded-xl px-3 py-1.5">
                <span className="text-xs font-semibold text-indigo-200 truncate">
                  📁 {customUploadedName}
                </span>
                <button
                  onClick={() => {
                    setCustomUploadedSrc(null);
                    setCustomUploadedName('');
                  }}
                  className="text-xs text-indigo-400 hover:text-white ml-2"
                  title="Return to catalog"
                >
                  <X size={14} />
                </button>
              </div>
            ) : (
              <div className="flex-1">
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
            )}

            {/* Upload Image Button */}
            <Button
              size="sm"
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
              className="border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800 rounded-xl text-xs font-semibold h-9 px-3 gap-1.5 shrink-0"
              title="Upload custom image to analyze with Gemini"
            >
              <Upload size={14} />
              <span className="hidden sm:inline">Upload</span>
            </Button>

            {/* PDF Price List Scanner Button */}
            <Button
              size="sm"
              variant="outline"
              onClick={() => setIsPriceListModalOpen(true)}
              className="border-amber-600/60 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20 rounded-xl text-xs font-semibold h-9 px-3 gap-1.5 shrink-0"
              title="Upload PDF price list to scan rates with Gemini"
            >
              <FileText size={14} className="text-amber-400" />
              <span className="hidden sm:inline">Upload Price List</span>
              <span className="sm:hidden">Prices</span>
            </Button>
          </div>

          {/* Detection & Key Actions */}
          <div className="flex items-center gap-2">
            {/* Gemini Detection Button */}
            <Button
              size="sm"
              disabled={isGeminiAnalyzing}
              onClick={() => runGeminiDetection()}
              className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white rounded-xl text-xs font-bold shadow-md shadow-indigo-600/20 h-9 px-3 gap-1.5"
            >
              <Sparkles size={14} className={isGeminiAnalyzing ? 'animate-spin' : ''} />
              {isGeminiAnalyzing ? 'Analyzing...' : 'Detect with Gemini'}
            </Button>

            {/* API Key Modal Button */}
            <Button
              size="sm"
              variant="outline"
              onClick={() => setIsApiKeyModalOpen(true)}
              className={`border-slate-700 bg-slate-900 rounded-xl text-xs h-9 px-2.5 gap-1 ${
                geminiApiKey ? 'text-emerald-400' : 'text-amber-400 animate-pulse'
              }`}
              title="Configure Gemini API Key"
            >
              <Key size={14} />
              <span className="hidden lg:inline">{geminiApiKey ? 'Key Set' : 'Set Key'}</span>
            </Button>

            {/* Save All Drafts */}
            {draftHotspots.length > 0 && (
              <>
                <Button
                  size="sm"
                  disabled={isSaving}
                  onClick={handleSaveAllDrafts}
                  className="bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold shadow-md shadow-emerald-600/20 h-9 px-3 gap-1.5"
                >
                  <Save size={14} />
                  Save ({draftHotspots.length})
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setDraftHotspots([])}
                  className="border-slate-700 bg-slate-900 text-slate-400 hover:text-red-400 hover:bg-red-500/10 rounded-xl text-xs h-9 px-2.5"
                  title="Clear drafts"
                >
                  <Trash2 size={14} />
                </Button>
              </>
            )}

            {/* Log Out Button */}
            <button
              onClick={() => signOut()}
              title="Log Out"
              className="p-2 text-slate-400 hover:text-red-400 hover:bg-red-500/10 rounded-xl transition-colors border border-slate-800"
            >
              <LogOut size={14} />
            </button>

            {/* Mobile list toggle */}
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="md:hidden flex items-center gap-1 text-xs font-bold text-slate-300 bg-slate-800 px-3 py-2 rounded-xl"
            >
              List ({allCurrentHotspots.length}) {sidebarOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>
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
                        Gemini Draft
                      </span>
                    )}
                  </div>
                  <p className="text-[10px] text-slate-400 font-mono">
                    T:{h.top}% L:{h.left}% W:{h.width}% H:{h.height}%
                  </p>
                  {h.types && h.types.length > 0 && (
                    <p className="text-[10px] text-slate-300 truncate max-w-[200px]">
                      Types: {h.types.join(', ')}
                    </p>
                  )}
                  {h.sizes && h.sizes.length > 0 && (
                    <p className="text-[10px] text-indigo-300 truncate max-w-[200px]">
                      Sizes: {h.sizes.join(', ')}
                    </p>
                  )}
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
        <div className="hidden md:flex w-80 bg-slate-950 border-r border-slate-800 flex-col h-[calc(100vh-65px)] sticky top-[65px] overflow-y-auto">
          <div className="p-4 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                <Layers size={13} /> Highlights ({allCurrentHotspots.length})
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

            {allCurrentHotspots.length === 0 ? (
              <div className="text-center py-10 px-4 border border-dashed border-slate-800 rounded-2xl">
                <Scan size={24} className="text-slate-600 mx-auto mb-2" />
                <p className="text-xs font-semibold text-slate-400">No highlights detected</p>
                <p className="text-[11px] text-slate-500 mt-1">
                  Upload an image or click &ldquo;Detect with Gemini&rdquo; to auto-detect products.
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
                              <span className="text-[9px] bg-blue-500/20 text-blue-300 border border-blue-500/30 px-1.5 py-0.2 rounded font-mono shrink-0">
                                Gemini
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
                          {h.types && h.types.length > 0 && (
                            <div className="flex flex-wrap items-center gap-1 mt-1.5">
                              <span className="text-[9px] text-slate-400 font-semibold mr-0.5">Types:</span>
                              {h.types.map((t, idx) => (
                                <span key={idx} className="text-[9px] bg-slate-800 text-slate-300 px-1.5 py-0.5 rounded border border-slate-700/80 font-mono">
                                  {t}
                                </span>
                              ))}
                            </div>
                          )}
                          {h.sizes && h.sizes.length > 0 && (
                            <div className="flex flex-wrap items-center gap-1 mt-1">
                              <span className="text-[9px] text-indigo-400 font-semibold mr-0.5">Sizes:</span>
                              {h.sizes.map((s, idx) => (
                                <span key={idx} className="text-[9px] bg-indigo-950/70 text-indigo-300 px-1.5 py-0.5 rounded border border-indigo-800/60 font-mono">
                                  {s}
                                </span>
                              ))}
                            </div>
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
                            title="Edit details"
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
              {currentImageUrl ? (
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
                    src={currentImageUrl}
                    alt="Catalog Page Canvas"
                    className="w-full h-auto block pointer-events-none select-none"
                    draggable={false}
                  />

                  {/* ============ LOADING OVERLAY FOR GEMINI ============ */}
                  {isGeminiAnalyzing && (
                    <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm flex flex-col items-center justify-center z-40 pointer-events-auto">
                      <div className="relative flex items-center justify-center">
                        <div className="w-20 h-20 rounded-full border-4 border-indigo-500/20 border-t-indigo-500 animate-spin" />
                        <Bot size={28} className="absolute text-indigo-400 animate-pulse" />
                      </div>
                      <div className="mt-4 text-center">
                        <h4 className="text-sm font-bold text-white tracking-wide">
                          Gemini 2.5 Flash Analyzing Image...
                        </h4>
                        <p className="text-xs text-slate-400 mt-1 max-w-xs">
                          Detecting distinct products, types, sizes, and computing 2D bounding boxes
                        </p>
                      </div>
                      {/* Scanning laser beam animation */}
                      <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-cyan-400 to-transparent animate-pulse" />
                    </div>
                  )}

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
                            ? 'border-2 border-dashed border-cyan-400/90 bg-cyan-500/15 hover:bg-cyan-500/25 z-10'
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
                                ? 'bg-cyan-600'
                                : 'bg-emerald-600'
                            }`}
                          >
                            {h.name || 'Item'}
                            {isDraft && <span className="text-[8px] opacity-80">(AI)</span>}
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
                              title="Edit details"
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
                            <div
                              data-handle="nw"
                              className="absolute -top-1.5 -left-1.5 w-3 h-3 bg-white border-2 border-indigo-600 rounded-full cursor-nwse-resize z-30 shadow-md"
                            />
                            <div
                              data-handle="n"
                              className="absolute -top-1.5 left-1/2 -translate-x-1/2 w-3 h-3 bg-white border-2 border-indigo-600 rounded-full cursor-ns-resize z-30 shadow-md"
                            />
                            <div
                              data-handle="ne"
                              className="absolute -top-1.5 -right-1.5 w-3 h-3 bg-white border-2 border-indigo-600 rounded-full cursor-nesw-resize z-30 shadow-md"
                            />
                            <div
                              data-handle="e"
                              className="absolute top-1/2 -right-1.5 -translate-y-1/2 w-3 h-3 bg-white border-2 border-indigo-600 rounded-full cursor-ew-resize z-30 shadow-md"
                            />
                            <div
                              data-handle="se"
                              className="absolute -bottom-1.5 -right-1.5 w-3 h-3 bg-white border-2 border-indigo-600 rounded-full cursor-nwse-resize z-30 shadow-md"
                            />
                            <div
                              data-handle="s"
                              className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-3 h-3 bg-white border-2 border-indigo-600 rounded-full cursor-ns-resize z-30 shadow-md"
                            />
                            <div
                              data-handle="sw"
                              className="absolute -bottom-1.5 -left-1.5 w-3 h-3 bg-white border-2 border-indigo-600 rounded-full cursor-nesw-resize z-30 shadow-md"
                            />
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

      {/* ====== GEMINI API KEY MODAL ====== */}
      {isApiKeyModalOpen && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 w-full max-w-sm rounded-2xl p-6 shadow-2xl animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Key size={18} className="text-indigo-400" />
                <h3 className="text-base font-bold text-white">Gemini API Key</h3>
              </div>
              <button
                onClick={() => setIsApiKeyModalOpen(false)}
                className="text-slate-400 hover:text-white p-1"
              >
                <X size={16} />
              </button>
            </div>
            <p className="text-xs text-slate-400 mb-4">
              Enter your Google Gemini API key to enable 2D bounding box product detection, variant types, and sizes with Gemini 2.5 Flash. Key is saved locally in your browser.
            </p>
            <input
              type="password"
              className="w-full bg-slate-950 border border-slate-800 focus:border-indigo-500 outline-none p-2.5 rounded-xl text-sm text-white mb-4"
              value={tempApiKeyInput}
              onChange={(e) => setTempApiKeyInput(e.target.value)}
              placeholder="AIzaSy..."
            />
            <div className="flex gap-2">
              <Button
                onClick={handleSaveApiKey}
                className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white h-10 rounded-xl text-xs font-bold"
              >
                Save API Key
              </Button>
              <Button
                variant="outline"
                onClick={() => setIsApiKeyModalOpen(false)}
                className="flex-1 border-slate-800 bg-slate-950 text-slate-300 h-10 rounded-xl text-xs"
              >
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Upload Price List Modal */}
      <UploadPriceListModal
        isOpen={isPriceListModalOpen}
        onClose={() => setIsPriceListModalOpen(false)}
        onSuccess={async () => {
          const currentImgId = customUploadedSrc ? customUploadedName : selectedImage;
          if (currentImgId) {
            try {
              const { ok, data } = await safeJsonFetch(`/api/hotspots?imageId=${encodeURIComponent(currentImgId)}`);
              if (ok && data?.success && data?.hotspots) {
                setSavedHotspots(data.hotspots.map((h: any) => ({ ...h, isDraft: false })));
              }
            } catch (err) {
              console.warn(err);
            }
          }
        }}
      />
    </div>
  );
}
