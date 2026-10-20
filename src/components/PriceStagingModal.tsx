"use client";

import React, { useState, useEffect, useRef } from "react";
import { 
  FileText, 
  Upload, 
  Sparkles, 
  CheckCircle2, 
  AlertCircle, 
  AlertTriangle,
  X, 
  RotateCw,
  Trash2,
  Check,
  ArrowRight,
  ArrowUpRight,
  ArrowDownRight,
  Database,
  Layers,
  Edit3
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { getDefaultGeminiKey } from "@/lib/geminiKey";

export interface SyncReviewItem {
  id: string;
  productName: string;
  variantName: string;
  size?: string;
  variantKey: string;
  currentRate: number | null;
  extractedRate: number;
  variancePercent: number;
  reason?: string;
  description?: string;
  matchedProductId?: string | null;
  matchedHotspotId?: string | null;
}

export interface PriceStagingModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export function PriceStagingModal({ isOpen, onClose, onSuccess }: PriceStagingModalProps) {
  // Modal Stages: "upload" | "processing" | "summary"
  const [modalStage, setModalStage] = useState<"upload" | "processing" | "summary">("upload");
  const [file, setFile] = useState<File | null>(null);
  const [processStep, setProcessStep] = useState<string>("");
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  // Sync Results
  const [autoUpdatedCount, setAutoUpdatedCount] = useState<number>(0);
  const [totalScannedVariants, setTotalScannedVariants] = useState<number>(0);
  const [reviewItems, setReviewItems] = useState<SyncReviewItem[]>([]);
  const [editedRates, setEditedRates] = useState<Record<string, string>>({});
  const [confirmedIds, setConfirmedIds] = useState<Set<string>>(new Set());

  // Individual and bulk confirming state
  const [isConfirmingId, setIsConfirmingId] = useState<string | null>(null);
  const [isConfirmingAll, setIsConfirmingAll] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen) {
      setFile(null);
      setModalStage("upload");
      setErrorMsg(null);
      setAutoUpdatedCount(0);
      setReviewItems([]);
      setEditedRates({});
      setConfirmedIds(new Set());
    }
  }, [isOpen]);

  // Live timer while processing
  useEffect(() => {
    let timer: any;
    if (modalStage === "processing") {
      setElapsedSeconds(0);
      timer = setInterval(() => {
        setElapsedSeconds((prev) => prev + 1);
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [modalStage]);

  const isValidFileType = (name: string) => {
    return !!name.toLowerCase().match(/\.(pdf|png|jpe?g|webp)$/i);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (selected) {
      if (!isValidFileType(selected.name)) {
        toast.error("Please select a PDF document or image file");
        return;
      }
      setFile(selected);
      setErrorMsg(null);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const dropped = e.dataTransfer.files?.[0];
    if (dropped) {
      if (!isValidFileType(dropped.name)) {
        toast.error("Please drop a PDF document or image file");
        return;
      }
      setFile(dropped);
      setErrorMsg(null);
    }
  };

  /**
   * Execute 2-Phase Rate Sync Pipeline (/api/sync-rates)
   */
  const handleStartSync = async () => {
    if (!file) {
      toast.error("Please select a price list file first");
      return;
    }

    setModalStage("processing");
    setErrorMsg(null);
    setProcessStep("Phase 1: Full document comprehension with Gemini AI...");

    try {
      const apiKey = getDefaultGeminiKey();
      const formData = new FormData();
      formData.append("file", file);
      if (apiKey) formData.append("apiKey", apiKey);

      const controller = new AbortController();
      const timeoutId = setTimeout(() => {
        setProcessStep("Phase 2: Matching against catalog & verifying 50% price variance guard...");
      }, 5000);

      const res = await fetch("/api/sync-rates", {
        method: "POST",
        body: formData,
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to process price list");
      }

      setAutoUpdatedCount(data.autoUpdatedCount || 0);
      setTotalScannedVariants(data.totalScannedVariants || 0);

      const revList: SyncReviewItem[] = Array.isArray(data.reviewItems) ? data.reviewItems : [];
      setReviewItems(revList);

      const rateInputs: Record<string, string> = {};
      revList.forEach((r) => {
        rateInputs[r.id] = String(r.extractedRate > 0 ? r.extractedRate : "");
      });
      setEditedRates(rateInputs);

      setModalStage("summary");

      if (data.autoUpdatedCount > 0) {
        toast.success(`Successfully auto-synced ${data.autoUpdatedCount} variant prices!`);
      }
      if (revList.length > 0) {
        toast.warning(`${revList.length} items flagged for review.`);
      }

      onSuccess?.();
    } catch (err: any) {
      console.error("2-phase sync error:", err);
      setErrorMsg(err.message || "Failed to process price list");
      toast.error(err.message || "Failed to process price list");
      setModalStage("upload");
    } finally {
      setProcessStep("");
    }
  };

  /**
   * Single-click confirm & update for an individual review item
   */
  const handleConfirmSingleItem = async (item: SyncReviewItem) => {
    const rawVal = editedRates[item.id] ?? String(item.extractedRate);
    const numRate = parseFloat(rawVal);

    if (isNaN(numRate) || numRate <= 0) {
      toast.error("Please enter a valid rate greater than 0");
      return;
    }

    setIsConfirmingId(item.id);

    try {
      const res = await fetch("/api/sync-rates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "confirm_review_items",
          items: [
            {
              productId: item.matchedProductId,
              hotspotId: item.matchedHotspotId,
              variantKey: item.variantKey,
              rate: numRate,
            },
          ],
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to update rate");
      }

      setConfirmedIds((prev) => new Set([...prev, item.id]));
      toast.success(`Updated "${item.productName} (${item.variantName})" to ₹${numRate}`);
      onSuccess?.();
    } catch (err: any) {
      toast.error(err.message || "Failed to update rate");
    } finally {
      setIsConfirmingId(null);
    }
  };

  /**
   * Bulk confirm & update all remaining review items
   */
  const handleConfirmAllReviewed = async () => {
    const unconfirmed = reviewItems.filter((it) => !confirmedIds.has(it.id));
    if (unconfirmed.length === 0) return;

    setIsConfirmingAll(true);

    try {
      const itemsToConfirm = unconfirmed
        .map((it) => {
          const rawVal = editedRates[it.id] ?? String(it.extractedRate);
          const numRate = parseFloat(rawVal);
          return {
            productId: it.matchedProductId,
            hotspotId: it.matchedHotspotId,
            variantKey: it.variantKey,
            rate: isNaN(numRate) ? it.extractedRate : numRate,
          };
        })
        .filter((it) => it.rate > 0);

      const res = await fetch("/api/sync-rates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "confirm_review_items",
          items: itemsToConfirm,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to update rates");
      }

      const allIds = new Set(reviewItems.map((r) => r.id));
      setConfirmedIds(allIds);
      toast.success(`Confirmed and updated ${itemsToConfirm.length} items in Supabase!`);
      onSuccess?.();
    } catch (err: any) {
      toast.error(err.message || "Failed to confirm review items");
    } finally {
      setIsConfirmingAll(false);
    }
  };

  const pendingCount = reviewItems.filter((it) => !confirmedIds.has(it.id)).length;

  const handleClose = () => {
    if (modalStage === "processing" || isConfirmingAll) return;
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent
        className={`bg-slate-900 border border-slate-800 text-white rounded-3xl shadow-2xl transition-all duration-300 ${
          modalStage === "summary"
            ? "sm:max-w-4xl max-h-[92vh] flex flex-col p-6"
            : "sm:max-w-xl max-h-[90vh] overflow-y-auto p-6"
        }`}
      >
        <DialogHeader className="mb-3 shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center shrink-0">
                <FileText size={22} />
              </div>
              <div>
                <DialogTitle className="text-lg font-bold text-white flex items-center gap-2">
                  <span>PDF Price Scanner</span>
                  <span className="text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30 px-2.5 py-0.5 rounded-full uppercase tracking-wider">
                    2-Phase Sync
                  </span>
                </DialogTitle>
                <DialogDescription className="text-xs text-slate-400">
                  {modalStage === "summary"
                    ? "Phase 3: Rate synchronization summary and single-click review items."
                    : "Gemini comprehends tables and sub-items, followed by automated Supabase sync with a 50% variance guard."}
                </DialogDescription>
              </div>
            </div>

            <div className="hidden sm:flex items-center gap-1.5 text-[11px] font-mono px-2.5 py-1 rounded-full bg-slate-950 border border-slate-800 text-slate-400">
              <span className={`w-2 h-2 rounded-full ${modalStage === "processing" ? "bg-amber-400 animate-pulse" : modalStage === "summary" ? "bg-emerald-400" : "bg-slate-500"}`} />
              <span className="capitalize">{modalStage === "upload" ? "Phase 1: Upload" : modalStage === "processing" ? "Processing Pipeline" : "Phase 3: Summary"}</span>
            </div>
          </div>
        </DialogHeader>

        {/* ================= STAGE 1: UPLOAD ================= */}
        {modalStage === "upload" && (
          <div className="space-y-4">
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-2xl p-6 text-center cursor-pointer transition-all ${
                file
                  ? "border-amber-500/60 bg-amber-950/20"
                  : "border-slate-700 hover:border-slate-600 bg-slate-950/60 hover:bg-slate-950/80"
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,application/pdf,image/png,image/jpeg,image/webp"
                onChange={handleFileChange}
                className="hidden"
              />

              <div className="w-12 h-12 rounded-2xl bg-slate-800 flex items-center justify-center text-slate-300 mx-auto mb-3 shadow-md">
                <Upload size={22} />
              </div>

              {file ? (
                <div>
                  <p className="text-sm font-bold text-amber-300 truncate max-w-sm mx-auto">
                    {file.name}
                  </p>
                  <p className="text-[11px] text-slate-400 mt-1 font-mono">
                    {(file.size / 1024).toFixed(1)} KB • Ready for 2-phase sync
                  </p>
                  <span className="inline-block mt-2 text-[10px] text-slate-400 bg-slate-800 px-2.5 py-1 rounded-lg">
                    Click or drop another file to change
                  </span>
                </div>
              ) : (
                <div>
                  <p className="text-sm font-bold text-slate-200">
                    Click to browse or drop your PDF price list here
                  </p>
                  <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
                    Supports wholesale PDFs with sub-types, finishes, and sizes. Gemini maps document layout, then synchronizes database rates with price variance protection.
                  </p>
                </div>
              )}
            </div>

            {errorMsg && (
              <div className="p-3 bg-red-950/60 border border-red-800 text-red-200 rounded-xl text-xs flex items-start gap-2">
                <AlertCircle size={15} className="shrink-0 mt-0.5 text-red-400" />
                <span>{errorMsg}</span>
              </div>
            )}

            <div className="flex gap-2.5 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={handleClose}
                className="flex-1 border-slate-800 bg-slate-950 text-slate-300 hover:bg-slate-800 h-11 rounded-xl text-xs"
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={handleStartSync}
                disabled={!file}
                className="flex-1 bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 text-slate-950 font-bold h-11 rounded-xl text-xs shadow-lg shadow-amber-600/20"
              >
                <Sparkles size={14} className="mr-1.5" />
                Sync Rates with Gemini Pipeline
              </Button>
            </div>
          </div>
        )}

        {/* ================= STAGE 2: PROCESSING ================= */}
        {modalStage === "processing" && (
          <div className="py-8 space-y-4 text-center">
            <div className="w-16 h-16 rounded-3xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 mx-auto">
              <RotateCw size={28} className="animate-spin text-amber-400" />
            </div>
            <div>
              <h4 className="text-base font-bold text-white">Running 2-Phase Rate Sync Pipeline</h4>
              <p className="text-xs text-amber-300 mt-1 flex items-center justify-center gap-1.5 font-mono">
                <span>{processStep}</span>
                {elapsedSeconds > 0 && <span className="text-slate-400">({elapsedSeconds}s)</span>}
              </p>
              <p className="text-[11px] text-slate-500 mt-2 max-w-sm mx-auto">
                Comprehending document layout, extracting variants, and testing prices against the 50% variance threshold.
              </p>
            </div>

            <div className="w-full max-w-xs mx-auto bg-slate-800 h-1.5 rounded-full overflow-hidden">
              <div className="bg-gradient-to-r from-amber-500 via-indigo-500 to-emerald-500 h-full w-full animate-pulse" />
            </div>
          </div>
        )}

        {/* ================= STAGE 3: STUDIO UI SUMMARY ================= */}
        {modalStage === "summary" && (
          <div className="flex-1 flex flex-col min-h-0 space-y-4">
            <div className="flex-1 overflow-y-auto space-y-4 pr-1">
              {/* Auto-Updated Summary Card */}
              <div className="bg-emerald-950/30 border border-emerald-800/40 rounded-2xl p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
                    <CheckCircle2 size={22} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="text-sm font-bold text-white">Auto-Updated</h4>
                      <span className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[11px] font-bold px-2.5 py-0.5 rounded-md font-mono">
                        {autoUpdatedCount} Variants
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Updated in Supabase database and live in storefront catalog hotspots.
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <span className="text-[11px] font-mono text-emerald-400/90 bg-slate-950 border border-emerald-900/60 px-2.5 py-1 rounded-lg">
                    Applied Directly
                  </span>
                </div>
              </div>

              {/* Review Items Section */}
              {reviewItems.length > 0 ? (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <AlertTriangle size={16} className="text-amber-400" />
                      <h4 className="text-xs font-bold text-amber-300 uppercase tracking-wider">
                        Review Items ({pendingCount} pending)
                      </h4>
                    </div>

                    {pendingCount > 1 && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={handleConfirmAllReviewed}
                        disabled={isConfirmingAll}
                        className="border-amber-700/60 bg-amber-950/40 text-amber-300 hover:bg-amber-900/40 text-[11px] font-bold h-7 rounded-lg gap-1.5"
                      >
                        {isConfirmingAll ? (
                          <RotateCw size={12} className="animate-spin" />
                        ) : (
                          <Check size={12} />
                        )}
                        <span>Confirm All ({pendingCount})</span>
                      </Button>
                    )}
                  </div>

                  <div className="border border-slate-800 rounded-2xl overflow-hidden bg-slate-950/90 divide-y divide-slate-800/60">
                    {reviewItems.map((item) => {
                      const isConfirmed = confirmedIds.has(item.id);
                      const isUpdating = isConfirmingId === item.id;
                      const currentInput = editedRates[item.id] ?? String(item.extractedRate);

                      return (
                        <div
                          key={item.id}
                          className={`p-3.5 flex flex-wrap items-center justify-between gap-3 text-xs transition-colors ${
                            isConfirmed ? "bg-emerald-950/20 opacity-75" : "hover:bg-slate-900/60"
                          }`}
                        >
                          {/* Product & Variant */}
                          <div className="min-w-[180px] max-w-xs">
                            <div className="flex items-center gap-1.5">
                              <span className="font-bold text-white truncate">{item.productName}</span>
                              <span className="text-slate-400">•</span>
                              <span className="text-amber-300 font-medium truncate">{item.variantName}</span>
                              {item.size && <span className="text-[10px] text-slate-500">({item.size})</span>}
                            </div>
                            <p className="text-[10px] text-slate-400 mt-0.5">
                              {item.description || "Price requires verification."}
                            </p>
                          </div>

                          {/* Current vs Extracted Rate */}
                          <div className="flex items-center gap-2">
                            <div className="text-right text-[11px]">
                              <span className="text-slate-500 block text-[9px] uppercase">Current</span>
                              <span className="font-mono text-slate-400">
                                {item.currentRate != null && item.currentRate > 0 ? `₹${item.currentRate}` : "Unset"}
                              </span>
                            </div>

                            {/* Variance Badge */}
                            <div className="px-2 py-0.5 rounded-md text-[10px] font-bold font-mono">
                              {item.reason === "PRICE_SPIKE_OVER_50_PERCENT" && (
                                <span className="bg-amber-500/20 text-amber-300 border border-amber-500/30 px-1.5 py-0.5 rounded flex items-center gap-0.5">
                                  <ArrowUpRight size={10} />
                                  +{item.variancePercent}%
                                </span>
                              )}
                              {item.reason === "PRICE_DROP_OVER_50_PERCENT" && (
                                <span className="bg-sky-500/20 text-sky-300 border border-sky-500/30 px-1.5 py-0.5 rounded flex items-center gap-0.5">
                                  <ArrowDownRight size={10} />
                                  -{item.variancePercent}%
                                </span>
                              )}
                              {item.reason === "RATE_ZERO_OR_INVALID" && (
                                <span className="bg-rose-500/20 text-rose-300 border border-rose-500/30 px-1.5 py-0.5 rounded">
                                  0.00 Rate
                                </span>
                              )}
                              {item.reason === "UNMATCHED_PRODUCT" && (
                                <span className="bg-purple-500/20 text-purple-300 border border-purple-500/30 px-1.5 py-0.5 rounded">
                                  Unmatched
                                </span>
                              )}
                            </div>

                            {/* Editable Rate Input */}
                            <div className="flex items-center gap-1">
                              <span className="text-slate-400 font-mono text-xs">₹</span>
                              <input
                                type="text"
                                inputMode="decimal"
                                value={currentInput}
                                disabled={isConfirmed}
                                onChange={(e) =>
                                  setEditedRates((prev) => ({ ...prev, [item.id]: e.target.value }))
                                }
                                placeholder="0.00"
                                className="w-20 px-2 py-1 text-xs font-mono font-bold bg-slate-900 border border-slate-700 text-white rounded-lg focus:outline-none focus:border-amber-500 disabled:opacity-50"
                              />
                            </div>
                          </div>

                          {/* Single-Click Confirm Button */}
                          <div className="shrink-0">
                            {isConfirmed ? (
                              <div className="flex items-center gap-1 text-[11px] font-bold text-emerald-400 bg-emerald-950/60 border border-emerald-800/60 px-2.5 py-1 rounded-lg">
                                <Check size={13} />
                                <span>Updated</span>
                              </div>
                            ) : (
                              <Button
                                size="sm"
                                onClick={() => handleConfirmSingleItem(item)}
                                disabled={isUpdating}
                                className="bg-amber-600 hover:bg-amber-500 text-slate-950 font-bold text-xs h-8 px-3 rounded-xl gap-1 shadow-md shadow-amber-600/20"
                              >
                                {isUpdating ? (
                                  <RotateCw size={13} className="animate-spin" />
                                ) : (
                                  <Check size={13} />
                                )}
                                <span>Confirm</span>
                              </Button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div className="bg-slate-950 border border-slate-800/80 rounded-2xl p-4 text-center">
                  <CheckCircle2 size={24} className="text-emerald-400 mx-auto mb-1.5" />
                  <p className="text-xs font-bold text-white">Zero Abnormal Variances</p>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    All extracted prices were within expected limits and were updated automatically in Supabase.
                  </p>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="shrink-0 pt-3 border-t border-slate-800/80 flex items-center justify-between">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setModalStage("upload");
                  setFile(null);
                  setReviewItems([]);
                }}
                className="border-slate-800 bg-slate-950 text-slate-300 hover:bg-slate-800 h-10 px-4 rounded-xl text-xs"
              >
                Scan Another File
              </Button>
              <Button
                type="button"
                onClick={handleClose}
                className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold h-10 px-6 rounded-xl text-xs shadow-md"
              >
                Done
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default PriceStagingModal;
