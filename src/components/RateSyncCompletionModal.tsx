"use client";

import React, { useState } from 'react';
import {
  CheckCircle2,
  AlertTriangle,
  ArrowUpRight,
  ArrowDownRight,
  HelpCircle,
  Check,
  RotateCw,
  Sparkles,
  X,
  Database,
  Layers,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

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

export interface RateSyncCompletionModalProps {
  isOpen: boolean;
  onClose: () => void;
  autoUpdatedCount: number;
  totalScannedVariants: number;
  reviewItems: SyncReviewItem[];
  onRefresh?: () => void;
}

export function RateSyncCompletionModal({
  isOpen,
  onClose,
  autoUpdatedCount,
  totalScannedVariants,
  reviewItems: initialReviewItems,
  onRefresh,
}: RateSyncCompletionModalProps) {
  const [reviewItems, setReviewItems] = useState<SyncReviewItem[]>(initialReviewItems);
  const [editedRates, setEditedRates] = useState<Record<string, string>>({});
  const [confirmedIds, setConfirmedIds] = useState<Set<string>>(new Set());
  const [isUpdatingId, setIsUpdatingId] = useState<string | null>(null);
  const [isUpdatingAll, setIsUpdatingAll] = useState(false);

  // Sync state when initialReviewItems changes
  React.useEffect(() => {
    setReviewItems(initialReviewItems);
    setConfirmedIds(new Set());
    const initialMap: Record<string, string> = {};
    initialReviewItems.forEach((item) => {
      initialMap[item.id] = String(item.extractedRate > 0 ? item.extractedRate : '');
    });
    setEditedRates(initialMap);
  }, [initialReviewItems]);

  const handleRateInputChange = (id: string, value: string) => {
    setEditedRates((prev) => ({ ...prev, [id]: value }));
  };

  /**
   * Single-click confirm & update for an individual review item
   */
  const handleConfirmSingleItem = async (item: SyncReviewItem) => {
    const rawVal = editedRates[item.id] ?? String(item.extractedRate);
    const numRate = parseFloat(rawVal);

    if (isNaN(numRate) || numRate <= 0) {
      toast.error('Please enter a valid rate greater than 0');
      return;
    }

    setIsUpdatingId(item.id);

    try {
      const res = await fetch('/api/sync-rates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'confirm_review_items',
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
        throw new Error(data.error || 'Failed to update rate');
      }

      setConfirmedIds((prev) => new Set([...prev, item.id]));
      toast.success(`Updated "${item.productName} (${item.variantName})" to ₹${numRate}`);
      onRefresh?.();
    } catch (err: any) {
      toast.error(err.message || 'Failed to update rate');
    } finally {
      setIsUpdatingId(null);
    }
  };

  /**
   * Bulk confirm & update all remaining review items
   */
  const handleConfirmAllReviewed = async () => {
    const unconfirmed = reviewItems.filter((it) => !confirmedIds.has(it.id));
    if (unconfirmed.length === 0) return;

    setIsUpdatingAll(true);

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

      const res = await fetch('/api/sync-rates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'confirm_review_items',
          items: itemsToConfirm,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to update rates');
      }

      const allIds = new Set(reviewItems.map((r) => r.id));
      setConfirmedIds(allIds);
      toast.success(`Confirmed and updated ${itemsToConfirm.length} review items in Supabase!`);
      onRefresh?.();
    } catch (err: any) {
      toast.error(err.message || 'Failed to confirm review items');
    } finally {
      setIsUpdatingAll(false);
    }
  };

  const pendingCount = reviewItems.filter((it) => !confirmedIds.has(it.id)).length;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-3xl max-h-[90vh] flex flex-col bg-slate-900 border border-slate-800 text-white rounded-3xl p-6 shadow-2xl overflow-hidden">
        <DialogHeader className="shrink-0 mb-3">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
              <Sparkles size={22} />
            </div>
            <div>
              <DialogTitle className="text-lg font-bold text-white flex items-center gap-2">
                <span>Rate Synchronization Complete</span>
                <span className="text-[10px] font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 px-2.5 py-0.5 rounded-full uppercase tracking-wider">
                  2-Phase Pipeline
                </span>
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-400">
                Gemini comprehended document layout, and rates were matched against your catalog with a 50% variance guard.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-4 pr-1">
          {/* ================= AUTO-UPDATED SUMMARY CARD ================= */}
          <div className="bg-emerald-950/30 border border-emerald-800/40 rounded-2xl p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
                <CheckCircle2 size={22} />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h4 className="text-sm font-bold text-white">Auto-Updated</h4>
                  <span className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[11px] font-bold px-2 py-0.5 rounded-md font-mono">
                    {autoUpdatedCount} Variants
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Rates matched database products and passed the 50% variance safety check.
                </p>
              </div>
            </div>
            <div className="text-right">
              <span className="text-[11px] font-mono text-emerald-400/90 bg-slate-950 border border-emerald-900/60 px-2.5 py-1 rounded-lg">
                Live in Storefront
              </span>
            </div>
          </div>

          {/* ================= REVIEW ITEMS SECTION ================= */}
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
                    disabled={isUpdatingAll}
                    className="border-amber-700/60 bg-amber-950/40 text-amber-300 hover:bg-amber-900/40 text-[11px] font-bold h-7 rounded-lg gap-1.5"
                  >
                    {isUpdatingAll ? (
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
                  const isUpdating = isUpdatingId === item.id;
                  const currentInput = editedRates[item.id] ?? String(item.extractedRate);

                  return (
                    <div
                      key={item.id}
                      className={`p-3.5 flex flex-wrap items-center justify-between gap-3 text-xs transition-colors ${
                        isConfirmed ? 'bg-emerald-950/20 opacity-75' : 'hover:bg-slate-900/60'
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
                          {item.description || 'Price requires verification.'}
                        </p>
                      </div>

                      {/* Current vs Extracted Rate */}
                      <div className="flex items-center gap-2">
                        <div className="text-right text-[11px]">
                          <span className="text-slate-500 block text-[9px] uppercase">Current</span>
                          <span className="font-mono text-slate-400">
                            {item.currentRate != null && item.currentRate > 0 ? `₹${item.currentRate}` : 'Unset'}
                          </span>
                        </div>

                        {/* Variance Badge */}
                        <div className="px-2 py-0.5 rounded-md text-[10px] font-bold font-mono">
                          {item.reason === 'PRICE_SPIKE_OVER_50_PERCENT' && (
                            <span className="bg-amber-500/20 text-amber-300 border border-amber-500/30 px-1.5 py-0.5 rounded flex items-center gap-0.5">
                              <ArrowUpRight size={10} />
                              +{item.variancePercent}%
                            </span>
                          )}
                          {item.reason === 'PRICE_DROP_OVER_50_PERCENT' && (
                            <span className="bg-sky-500/20 text-sky-300 border border-sky-500/30 px-1.5 py-0.5 rounded flex items-center gap-0.5">
                              <ArrowDownRight size={10} />
                              -{item.variancePercent}%
                            </span>
                          )}
                          {item.reason === 'RATE_ZERO_OR_INVALID' && (
                            <span className="bg-rose-500/20 text-rose-300 border border-rose-500/30 px-1.5 py-0.5 rounded">
                              0.00 Rate
                            </span>
                          )}
                          {item.reason === 'UNMATCHED_PRODUCT' && (
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
                            onChange={(e) => handleRateInputChange(item.id, e.target.value)}
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
                All extracted prices were within expected limits and were updated automatically.
              </p>
            </div>
          )}
        </div>

        {/* ================= FOOTER ================= */}
        <div className="shrink-0 pt-3 border-t border-slate-800/80 flex items-center justify-between">
          <span className="text-[11px] text-slate-500">
            Total Scanned: {totalScannedVariants} variants across price sheet
          </span>
          <Button
            type="button"
            onClick={onClose}
            className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold h-10 px-6 rounded-xl text-xs shadow-md"
          >
            Done
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default RateSyncCompletionModal;
