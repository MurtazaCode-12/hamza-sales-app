"use client";

import React, { useState, useEffect, useRef, useMemo } from "react";
import { 
  FileText, 
  Upload, 
  CheckCircle2, 
  AlertCircle, 
  AlertTriangle, 
  X, 
  RotateCw, 
  Check, 
  ArrowRight, 
  Database, 
  Search, 
  Link2,
  Sparkles,
  Trash2
} from "lucide-react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { DeterministicRow, DbProductItem } from "@/lib/deterministicMatcher";

export interface PriceStagingModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export function PriceStagingModal({ isOpen, onClose, onSuccess }: PriceStagingModalProps) {
  const [modalStage, setModalStage] = useState<"upload" | "processing" | "staging" | "completed">("upload");
  const [file, setFile] = useState<File | null>(null);
  const [processStep, setProcessStep] = useState<string>("");
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  const [rows, setRows] = useState<DeterministicRow[]>([]);
  const [dbProducts, setDbProducts] = useState<DbProductItem[]>([]);
  const [editedRates, setEditedRates] = useState<Record<string, number>>({});
  const [manualLinks, setManualLinks] = useState<Record<string, { productId: string; variantKey: string }>>({});
  const [strategy, setStrategy] = useState<string>("");
  
  const [filterTab, setFilterTab] = useState<"all" | "matched" | "unmatched">("all");
  const [searchQuery, setSearchQuery] = useState("");

  const [isSyncing, setIsSyncing] = useState(false);
  const [syncedCount, setSyncedCount] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen) {
      setFile(null);
      setModalStage("upload");
      setErrorMsg(null);
      setRows([]);
      setDbProducts([]);
      setEditedRates({});
      setManualLinks({});
      setFilterTab("all");
      setSearchQuery("");
      setIsSyncing(false);
    }
  }, [isOpen]);

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
    return !!name.toLowerCase().match(/\.pdf$/i);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (selected) {
      if (!isValidFileType(selected.name)) {
        toast.error("Please select a PDF document");
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
        toast.error("Please drop a PDF document");
        return;
      }
      setFile(dropped);
      setErrorMsg(null);
    }
  };

  const handleStartExtraction = async () => {
    if (!file) {
      toast.error("Please select a PDF price sheet");
      return;
    }

    setModalStage("processing");
    setErrorMsg(null);
    setProcessStep("Executing deterministic pdfplumber table extraction...");

    try {
      const formData = new FormData();
      formData.append("file", file);

      // Primary Channel: Call /api/extract-pdf
      let res = await fetch("/api/extract-pdf", {
        method: "POST",
        body: formData,
      });

      let data = await res.json().catch(() => null);

      // Fallback Channel: If /api/extract-pdf returned empty or failed, call Python serverless directly
      if (!res.ok || !data?.success || !Array.isArray(data?.rows) || data.rows.length === 0) {
        setProcessStep("Connecting directly to Python table parser...");
        try {
          const pyRes = await fetch("/api/extract-pdf.py", {
            method: "POST",
            body: formData,
          });
          if (pyRes.ok) {
            const pyData = await pyRes.json();
            if (pyData?.success && Array.isArray(pyData.tables) && pyData.tables.length > 0) {
              const matchRes = await fetch("/api/extract-pdf", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ tables: pyData.tables }),
              });
              if (matchRes.ok) {
                data = await matchRes.json();
              }
            }
          }
        } catch (pyErr) {
          console.warn("Direct Python fallback error:", pyErr);
        }
      }

      if (!data?.success || !Array.isArray(data?.rows) || data.rows.length === 0) {
        throw new Error(data?.error || "No table rows could be identified in the uploaded PDF. Please verify the document format.");
      }

      const extractedRows: DeterministicRow[] = data.rows;
      const productsList: DbProductItem[] = Array.isArray(data.dbProducts) ? data.dbProducts : [];

      setRows(extractedRows);
      setDbProducts(productsList);
      setStrategy(data.strategy || "coordinate_extraction");

      const initialRates: Record<string, number> = {};
      extractedRows.forEach((r) => {
        initialRates[r.id] = r.rawRate;
      });
      setEditedRates(initialRates);

      setModalStage("staging");
      if (data.strategy === "gemini_multimodal_fallback") {
        toast.success(`Multimodal fallback extracted ${extractedRows.length} products with Gemini Flash!`);
      } else {
        toast.success(`Coordinate parser extracted ${extractedRows.length} products!`);
      }
    } catch (err: any) {
      console.error("PDF extraction error:", err);
      setErrorMsg(err.message || "Failed to extract PDF");
      toast.error(err.message || "Failed to extract PDF");
      setModalStage("upload");
    } finally {
      setProcessStep("");
    }
  };

  const handleRemoveRow = (rowId: string) => {
    setRows((prev) => prev.filter((r) => r.id !== rowId));
    setManualLinks((prev) => {
      const next = { ...prev };
      delete next[rowId];
      return next;
    });
    setEditedRates((prev) => {
      const next = { ...prev };
      delete next[rowId];
      return next;
    });
    toast.info("Row excluded from sync list");
  };

  const handleManualLink = (rowId: string, productId: string) => {
    if (!productId) {
      setManualLinks((prev) => {
        const next = { ...prev };
        delete next[rowId];
        return next;
      });
      return;
    }

    const prod = dbProducts.find((p) => p.id === productId);
    const defaultVariant = prod?.types?.[0] || prod?.sizes?.[0] || "Standard";

    setManualLinks((prev) => ({
      ...prev,
      [rowId]: {
        productId,
        variantKey: defaultVariant,
      },
    }));

    toast.success(`Linked to "${prod?.name || 'Product'}"`);
  };

  const handleManualVariantChange = (rowId: string, variantKey: string) => {
    setManualLinks((prev) => {
      const current = prev[rowId];
      if (!current) return prev;
      return {
        ...prev,
        [rowId]: {
          ...current,
          variantKey,
        },
      };
    });
  };

  const displayedRows = useMemo(() => {
    return rows.filter((r) => {
      const isManuallyLinked = !!manualLinks[r.id];
      const effectiveStatus = isManuallyLinked ? "MANUALLY_LINKED" : r.status;

      if (filterTab === "matched" && effectiveStatus === "UNMATCHED") return false;
      if (filterTab === "unmatched" && effectiveStatus !== "UNMATCHED") return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const prodMatch = r.rawProduct.toLowerCase().includes(q);
        const varMatch = r.rawVariant.toLowerCase().includes(q);
        const matchedProdMatch = (r.matchedProductName || "").toLowerCase().includes(q);
        return prodMatch || varMatch || matchedProdMatch;
      }

      return true;
    });
  }, [rows, manualLinks, filterTab, searchQuery]);

  const totalCount = rows.length;
  const unlinkedCount = rows.filter((r) => r.status === "UNMATCHED" && !manualLinks[r.id]).length;
  const matchedCount = totalCount - unlinkedCount;

  const handleSyncDatabase = async () => {
    const itemsToSync: Array<{
      productId: string | null;
      hotspotId: string | null;
      variantKey: string;
      rate: number;
      aliasToAdd?: string;
    }> = [];

    for (const r of rows) {
      const rate = editedRates[r.id] ?? r.rawRate;
      if (rate <= 0) continue;

      const manual = manualLinks[r.id];
      if (manual) {
        itemsToSync.push({
          productId: manual.productId,
          hotspotId: r.matchedHotspotId,
          variantKey: manual.variantKey,
          rate,
          aliasToAdd: r.rawProduct,
        });
      } else if (r.status === "MATCHED" && (r.matchedProductId || r.matchedHotspotId)) {
        itemsToSync.push({
          productId: r.matchedProductId,
          hotspotId: r.matchedHotspotId,
          variantKey: r.matchedVariantKey,
          rate,
        });
      }
    }

    if (itemsToSync.length === 0) {
      toast.error("No valid matched items available to sync");
      return;
    }

    setIsSyncing(true);

    try {
      const res = await fetch("/api/sync-rates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "sync_deterministic_rows",
          rows: itemsToSync,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to sync rates to database");
      }

      setSyncedCount(data.updatedCount || itemsToSync.length);
      setModalStage("completed");
      toast.success(`Successfully synchronized ${data.updatedCount || itemsToSync.length} prices to Supabase!`);
      onSuccess?.();
    } catch (err: any) {
      toast.error(err.message || "Failed to sync database");
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-5xl w-full p-0 overflow-hidden bg-slate-950 border-slate-800 text-white shadow-2xl rounded-2xl max-h-[92vh] flex flex-col">
        <div className="p-6 border-b border-slate-800 bg-slate-900/60 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
              <Database size={20} />
            </div>
            <div>
              <DialogTitle className="text-lg font-bold text-white flex items-center gap-2">
                Deterministic PDF Price Scanner
                <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-400 border border-blue-500/30">
                  Zero Error
                </span>
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-400">
                100% deterministic table extraction with exact Supabase matching and manual link failsafe
              </DialogDescription>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-2 rounded-lg hover:bg-slate-800/60 transition"
          >
            <X size={18} />
          </button>
        </div>

        <div className="p-6 overflow-y-auto flex-1">
          {modalStage === "upload" && (
            <div className="space-y-6 max-w-xl mx-auto py-6">
              <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition flex flex-col items-center justify-center gap-4 ${
                  file
                    ? "border-blue-500 bg-blue-500/5"
                    : "border-slate-800 hover:border-slate-700 bg-slate-900/40"
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="application/pdf"
                  onChange={handleFileChange}
                  className="hidden"
                />

                {file ? (
                  <>
                    <div className="h-16 w-16 rounded-2xl bg-blue-500/20 text-blue-400 flex items-center justify-center">
                      <FileText size={32} />
                    </div>
                    <div>
                      <p className="text-base font-bold text-white mb-1">{file.name}</p>
                      <p className="text-xs text-slate-400">{(file.size / 1024).toFixed(1)} KB • PDF Document</p>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-xs border-slate-700 hover:bg-slate-800 text-slate-300"
                      onClick={(e) => {
                        e.stopPropagation();
                        setFile(null);
                      }}
                    >
                      Change File
                    </Button>
                  </>
                ) : (
                  <>
                    <div className="h-16 w-16 rounded-2xl bg-slate-800 text-slate-400 flex items-center justify-center">
                      <Upload size={32} />
                    </div>
                    <div>
                      <p className="text-base font-semibold text-white mb-1">
                        Drag and drop your PDF price list here
                      </p>
                      <p className="text-xs text-slate-400">
                        Supports wholesale PDF tables (e.g. Cycle Locks, China Padlocks, Screws, Hinges)
                      </p>
                    </div>
                    <Button size="sm" className="bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold">
                      Browse Computer
                    </Button>
                  </>
                )}
              </div>

              {errorMsg && (
                <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-xs flex items-center gap-3">
                  <AlertCircle size={18} className="shrink-0 text-red-400" />
                  <p>{errorMsg}</p>
                </div>
              )}

              <Button
                onClick={handleStartExtraction}
                disabled={!file}
                className="w-full h-12 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl text-sm flex items-center justify-center gap-2 shadow-lg shadow-blue-600/20"
              >
                <Database size={16} />
                Extract Table Deterministically
                <ArrowRight size={16} />
              </Button>
            </div>
          )}

          {modalStage === "processing" && (
            <div className="py-16 flex flex-col items-center justify-center text-center space-y-4">
              <div className="relative">
                <div className="h-20 w-20 rounded-full border-4 border-blue-500/20 border-t-blue-500 animate-spin flex items-center justify-center">
                  <Database size={28} className="text-blue-400" />
                </div>
              </div>
              <div>
                <h3 className="text-base font-bold text-white mb-1">
                  Parsing PDF Grid Table
                </h3>
                <p className="text-xs text-slate-400 font-mono">
                  {processStep || "Extracting rows and matching against Supabase catalog..."} ({elapsedSeconds}s)
                </p>
              </div>
            </div>
          )}

          {modalStage === "staging" && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800 flex items-center justify-between">
                  <span className="text-xs text-slate-400">Total Scanned Rows</span>
                  <span className="text-lg font-bold text-white">{totalCount}</span>
                </div>
                <div className="p-3.5 rounded-xl bg-emerald-950/20 border border-emerald-500/20 flex items-center justify-between">
                  <span className="text-xs text-emerald-400 flex items-center gap-1.5">
                    <CheckCircle2 size={14} /> Ready to Sync
                  </span>
                  <span className="text-lg font-bold text-emerald-300">{matchedCount}</span>
                </div>
                <div className={`p-3.5 rounded-xl border flex items-center justify-between ${
                  unlinkedCount > 0 
                    ? "bg-red-950/30 border-red-500/40" 
                    : "bg-slate-900/40 border-slate-800"
                }`}>
                  <span className={`text-xs flex items-center gap-1.5 ${
                    unlinkedCount > 0 ? "text-red-400 font-bold" : "text-slate-400"
                  }`}>
                    <AlertTriangle size={14} /> Unmatched (Action Req.)
                  </span>
                  <span className={`text-lg font-bold ${
                    unlinkedCount > 0 ? "text-red-400" : "text-slate-500"
                  }`}>
                    {unlinkedCount}
                  </span>
                </div>
              </div>

              {unlinkedCount > 0 && (
                <div className="p-3.5 rounded-xl bg-red-500/10 border border-red-500/30 flex items-center justify-between text-xs text-red-200">
                  <div className="flex items-center gap-2">
                    <AlertCircle size={16} className="text-red-400 shrink-0" />
                    <span>
                      <strong>{unlinkedCount} products</strong> could not be matched automatically. Please link them using the red dropdowns below to include them in the database sync.
                    </span>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setFilterTab("unmatched")}
                    className="h-7 text-xs border-red-500/40 text-red-300 hover:bg-red-500/20"
                  >
                    View Only Unmatched
                  </Button>
                </div>
              )}

              <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
                <div className="flex flex-wrap gap-1.5 items-center">
                  <div className="flex gap-1.5 bg-slate-900 p-1 rounded-xl border border-slate-800 w-full sm:w-auto">
                    <button
                      onClick={() => setFilterTab("all")}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                        filterTab === "all"
                          ? "bg-blue-600 text-white"
                          : "text-slate-400 hover:text-white"
                      }`}
                    >
                      All Rows ({totalCount})
                    </button>
                    <button
                      onClick={() => setFilterTab("matched")}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                        filterTab === "matched"
                          ? "bg-emerald-600 text-white"
                          : "text-slate-400 hover:text-emerald-300"
                      }`}
                    >
                      Matched ({matchedCount})
                    </button>
                    <button
                      onClick={() => setFilterTab("unmatched")}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition flex items-center gap-1.5 ${
                        filterTab === "unmatched"
                          ? "bg-red-600 text-white"
                          : unlinkedCount > 0 ? "text-red-400 hover:text-red-300" : "text-slate-400"
                      }`}
                    >
                      Unmatched ({unlinkedCount})
                      {unlinkedCount > 0 && (
                        <span className="h-1.5 w-1.5 rounded-full bg-red-400 animate-pulse" />
                      )}
                    </button>
                  </div>

                  {strategy && (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-300 text-[11px] font-medium">
                      <Sparkles size={12} className="text-blue-400" />
                      <span>{strategy === "gemini_multimodal_fallback" ? "Gemini Multimodal Fallback" : "Coordinate-Based Parser"}</span>
                    </span>
                  )}
                </div>

                <div className="relative w-full sm:w-64">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                  <input
                    type="text"
                    placeholder="Search product or size..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-9 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:border-blue-500 outline-none"
                  />
                  {searchQuery && (
                    <button
                      onClick={() => setSearchQuery("")}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white"
                    >
                      <X size={12} />
                    </button>
                  )}
                </div>
              </div>

              <div className="border border-slate-800 rounded-xl overflow-hidden bg-slate-900/30">
                <div className="max-h-[46vh] overflow-y-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="bg-slate-900 text-slate-400 sticky top-0 z-10 border-b border-slate-800">
                      <tr>
                        <th className="py-2.5 px-3 font-semibold">Extracted Name</th>
                        <th className="py-2.5 px-3 font-semibold w-28">Variant</th>
                        <th className="py-2.5 px-3 font-semibold w-28">Detected Rate</th>
                        <th className="py-2.5 px-3 font-semibold">Supabase Match</th>
                        <th className="py-2.5 px-3 font-semibold w-56 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                      {displayedRows.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="py-8 text-center text-slate-500 text-xs">
                            No rows matching current filters
                          </td>
                        </tr>
                      ) : (
                        displayedRows.map((row) => {
                          const manual = manualLinks[row.id];
                          const isLinked = !!manual;
                          const isUnmatched = row.status === "UNMATCHED" && !isLinked;
                          const currentEditRate = editedRates[row.id] ?? row.rawRate;

                          return (
                            <tr
                              key={row.id}
                              className={`transition ${
                                isUnmatched
                                  ? "bg-red-500/10 hover:bg-red-500/15 border-l-4 border-l-red-500"
                                  : isLinked
                                  ? "bg-amber-500/10 hover:bg-amber-500/15 border-l-4 border-l-amber-500"
                                  : "hover:bg-slate-800/40"
                              }`}
                            >
                              {/* 1. Extracted Name */}
                              <td className="py-2.5 px-3">
                                <div className="flex items-center gap-2">
                                  <span className={`font-semibold ${isUnmatched ? "text-red-200 font-bold" : "text-white"}`}>
                                    {row.rawProduct}
                                  </span>
                                  {isUnmatched ? (
                                    <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded-full bg-red-500/20 text-red-300 font-bold border border-red-500/40 text-[9px]">
                                      Unmatched
                                    </span>
                                  ) : isLinked ? (
                                    <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded-full bg-amber-500/20 text-amber-300 font-bold border border-amber-500/40 text-[9px]">
                                      Linked
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded-full bg-emerald-500/20 text-emerald-300 font-bold border border-emerald-500/30 text-[9px]">
                                      Matched
                                    </span>
                                  )}
                                </div>
                              </td>

                              {/* 2. Variant */}
                              <td className="py-2.5 px-3 text-slate-300">
                                {row.rawVariant ? (
                                  <span className="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 text-[11px]">
                                    {row.rawVariant}
                                  </span>
                                ) : (
                                  <span className="text-slate-500 italic text-[11px]">—</span>
                                )}
                              </td>

                              {/* 3. Detected Rate */}
                              <td className="py-2.5 px-3">
                                <div className="flex items-center gap-1">
                                  <span className="text-slate-500 text-xs">₹</span>
                                  <input
                                    type="number"
                                    step="0.5"
                                    value={currentEditRate || ""}
                                    onChange={(e) => {
                                      const val = parseFloat(e.target.value) || 0;
                                      setEditedRates((prev) => ({ ...prev, [row.id]: val }));
                                    }}
                                    className="w-20 bg-slate-950 border border-slate-800 focus:border-blue-500 outline-none rounded-lg px-2 py-1 text-xs text-white font-mono font-bold"
                                  />
                                </div>
                              </td>

                              {/* 4. Supabase Match */}
                              <td className="py-2.5 px-3">
                                {isUnmatched ? (
                                  <div className="flex items-center gap-1.5 text-red-400">
                                    <AlertCircle size={13} className="shrink-0" />
                                    <span className="font-semibold text-xs">Unmatched Product</span>
                                  </div>
                                ) : isLinked ? (
                                  <div className="flex flex-col gap-0.5">
                                    <div className="flex items-center gap-1.5">
                                      <Link2 size={13} className="text-amber-400 shrink-0" />
                                      <span className="text-amber-200 font-medium">
                                        {dbProducts.find((p) => p.id === manual?.productId)?.name}
                                      </span>
                                      {manual?.variantKey && (
                                        <span className="text-amber-400/80 text-[11px]">
                                          ({manual.variantKey})
                                        </span>
                                      )}
                                    </div>
                                    <span className="text-amber-400/70 text-[10px]">Manually linked by admin</span>
                                  </div>
                                ) : (
                                  <div className="flex flex-col gap-0.5">
                                    <div className="flex items-center gap-1.5">
                                      <CheckCircle2 size={13} className="text-emerald-400 shrink-0" />
                                      <span className="text-white font-medium">
                                        {row.matchedProductName}
                                      </span>
                                      {row.matchedVariantKey && (
                                        <span className="text-slate-400 text-[11px]">
                                          ({row.matchedVariantKey})
                                        </span>
                                      )}
                                    </div>
                                    {row.currentRate != null && (
                                      <span className="text-slate-500 text-[10px] font-mono">
                                        Current Catalog Rate: ₹{row.currentRate}
                                      </span>
                                    )}
                                  </div>
                                )}
                              </td>

                              {/* 5. Actions */}
                              <td className="py-2.5 px-3 text-right">
                                {isUnmatched ? (
                                  <div className="flex items-center justify-end gap-2">
                                    <select
                                      defaultValue=""
                                      onChange={(e) => handleManualLink(row.id, e.target.value)}
                                      className="bg-red-950/80 border border-red-500/60 text-red-200 rounded-lg px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-red-400 max-w-[190px]"
                                    >
                                      <option value="" disabled>
                                        Link DB Product...
                                      </option>
                                      {dbProducts.map((p) => (
                                        <option key={p.id} value={p.id} className="bg-slate-900 text-white">
                                          {p.name} {p.rate ? `(₹${p.rate})` : ""}
                                        </option>
                                      ))}
                                    </select>
                                    <button
                                      onClick={() => handleRemoveRow(row.id)}
                                      className="text-slate-500 hover:text-red-400 p-1 rounded transition"
                                      title="Exclude row"
                                    >
                                      <Trash2 size={13} />
                                    </button>
                                  </div>
                                ) : isLinked ? (
                                  <div className="flex items-center justify-end gap-2">
                                    {(() => {
                                      const p = dbProducts.find((it) => it.id === manual?.productId);
                                      const variants = [...(p?.types || []), ...(p?.sizes || [])];
                                      if (variants.length > 0) {
                                        return (
                                          <select
                                            value={manual?.variantKey}
                                            onChange={(e) => handleManualVariantChange(row.id, e.target.value)}
                                            className="bg-slate-950 border border-amber-500/40 text-amber-200 rounded px-1.5 py-0.5 text-[11px]"
                                          >
                                            {variants.map((v) => (
                                              <option key={v} value={v}>
                                                {v}
                                              </option>
                                            ))}
                                          </select>
                                        );
                                      }
                                      return null;
                                    })()}
                                    <button
                                      onClick={() => handleManualLink(row.id, "")}
                                      className="text-slate-400 hover:text-red-300 text-[11px] underline"
                                      title="Unlink"
                                    >
                                      Unlink
                                    </button>
                                    <button
                                      onClick={() => handleRemoveRow(row.id)}
                                      className="text-slate-500 hover:text-red-400 p-1 rounded transition"
                                      title="Exclude row"
                                    >
                                      <Trash2 size={13} />
                                    </button>
                                  </div>
                                ) : (
                                  <div className="flex items-center justify-end gap-2">
                                    <select
                                      value=""
                                      onChange={(e) => handleManualLink(row.id, e.target.value)}
                                      className="bg-slate-950 border border-slate-800 text-slate-400 hover:text-white rounded px-2 py-0.5 text-[11px] outline-none max-w-[120px]"
                                    >
                                      <option value="" disabled>
                                        Change Link...
                                      </option>
                                      {dbProducts.map((p) => (
                                        <option key={p.id} value={p.id} className="bg-slate-900 text-white">
                                          {p.name}
                                        </option>
                                      ))}
                                    </select>
                                    <button
                                      onClick={() => handleRemoveRow(row.id)}
                                      className="text-slate-600 hover:text-red-400 p-1 rounded transition"
                                      title="Exclude row"
                                    >
                                      <Trash2 size={13} />
                                    </button>
                                  </div>
                                )}
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="pt-3 border-t border-slate-800 flex items-center justify-between">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setModalStage("upload")}
                  className="border-slate-800 bg-slate-900 text-slate-300 hover:bg-slate-800 text-xs"
                >
                  <RotateCw size={13} className="mr-1.5" />
                  Upload Different PDF
                </Button>

                <div className="flex items-center gap-3">
                  <span className="text-xs text-slate-400">
                    {matchedCount} of {totalCount} items ready
                  </span>

                  <Button
                    onClick={handleSyncDatabase}
                    disabled={isSyncing || matchedCount === 0}
                    className="h-10 px-5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl text-xs flex items-center gap-2 shadow-lg shadow-emerald-600/20"
                  >
                    {isSyncing ? (
                      <>
                        <RotateCw size={14} className="animate-spin" />
                        Syncing to Supabase...
                      </>
                    ) : (
                      <>
                        <Database size={14} />
                        Approve & Sync to Supabase ({matchedCount} Items)
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </div>
          )}

          {modalStage === "completed" && (
            <div className="py-12 flex flex-col items-center justify-center text-center space-y-4 max-w-md mx-auto">
              <div className="h-16 w-16 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 flex items-center justify-center">
                <CheckCircle2 size={32} />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white mb-1">
                  Database Synchronized!
                </h3>
                <p className="text-xs text-slate-400">
                  Successfully updated {syncedCount} product rates and saved any new aliases directly to Supabase.
                </p>
              </div>
              <Button
                onClick={() => {
                  onClose();
                  onSuccess?.();
                }}
                className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl text-xs px-6 h-10"
              >
                Done
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default PriceStagingModal;
