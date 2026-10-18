"use client";

import React, { useState, useEffect, useRef, useMemo } from "react";
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
  Filter,
  Search,
  Check,
  ArrowRight,
  Database,
  Layers,
  Edit3
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { getDefaultGeminiKey } from "@/lib/geminiKey";
import { repairAndParseJsonArray } from "@/lib/jsonRepair";
import { aggressiveNormalize, aggressiveMatchProduct, isValidPositiveRate } from "@/lib/productMatcher";

export interface StagedProductRow {
  id: string; // unique row id
  extractedName: string;
  extractedRate: number;
  rateInput: string; // string representation for typing
  unit: string;
  category: string;
  matchedProductId: string | null;
  matchedProductName: string | null;
  status: "READY" | "ACTION_REQUIRED";
  validationError?: string;
}

export interface DatabaseProduct {
  id: string;
  name: string;
  category?: string | null;
  rate?: number | null;
  unit?: string | null;
}

export interface PriceStagingModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export function PriceStagingModal({ isOpen, onClose, onSuccess }: PriceStagingModalProps) {
  // Modal Stages: "upload" | "extracting" | "staging" | "synced"
  const [modalStage, setModalStage] = useState<"upload" | "extracting" | "staging" | "synced">("upload");
  const [file, setFile] = useState<File | null>(null);
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractStep, setExtractStep] = useState<string>("");
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  // Database Products Cache
  const [dbProducts, setDbProducts] = useState<DatabaseProduct[]>([]);
  const [isLoadingDbProducts, setIsLoadingDbProducts] = useState(false);

  // Staged Table Rows
  const [stagedRows, setStagedRows] = useState<StagedProductRow[]>([]);
  const [filterMode, setFilterMode] = useState<"all" | "action_required" | "ready">("all");
  const [searchQuery, setSearchQuery] = useState("");

  // Syncing State & Results
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<{ updatedCount: number; warnings: string[] } | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // 1. Fetch DB Products when modal opens
  useEffect(() => {
    if (isOpen) {
      loadDbProducts();
    } else {
      // Reset state on close
      setFile(null);
      setModalStage("upload");
      setStagedRows([]);
      setErrorMsg(null);
      setSyncResult(null);
      setSearchQuery("");
      setFilterMode("all");
    }
  }, [isOpen]);

  const loadDbProducts = async () => {
    try {
      setIsLoadingDbProducts(true);
      const res = await fetch("/api/products");
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data?.products)) {
          // Sort products alphabetically for easy dropdown navigation
          const sorted = [...data.products].sort((a, b) => a.name.localeCompare(b.name));
          setDbProducts(sorted);
        }
      }
    } catch (err) {
      console.warn("Failed to load DB products for matching:", err);
    } finally {
      setIsLoadingDbProducts(false);
    }
  };

  // Live timer while extracting
  useEffect(() => {
    let timer: any;
    if (isExtracting) {
      setElapsedSeconds(0);
      timer = setInterval(() => {
        setElapsedSeconds((prev) => prev + 1);
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [isExtracting]);

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
   * Helper to compute row status:
   * Green ("READY"): matchedProductId is valid AND rate is number > 0.
   * Red ("ACTION_REQUIRED"): matchedProductId is null OR rate <= 0 / NaN.
   */
  const evaluateRow = (
    matchedProductId: string | null,
    rateNum: number
  ): { status: "READY" | "ACTION_REQUIRED"; validationError?: string } => {
    const hasValidProduct = !!matchedProductId && matchedProductId.trim() !== "";
    const hasValidRate = !isNaN(rateNum) && rateNum > 0;

    if (!hasValidProduct && !hasValidRate) {
      return { status: "ACTION_REQUIRED", validationError: "Unmatched product & rate is 0.00" };
    }
    if (!hasValidProduct) {
      return { status: "ACTION_REQUIRED", validationError: "Select matching database product" };
    }
    if (!hasValidRate) {
      return { status: "ACTION_REQUIRED", validationError: "Enter valid positive rate (> 0)" };
    }
    return { status: "READY" };
  };

  /**
   * AI PDF Extraction using Gemini API (with strict spatial prompt)
   */
  const handleStartExtraction = async () => {
    if (!file) {
      toast.error("Please select a price list file first");
      return;
    }

    setIsExtracting(true);
    setModalStage("extracting");
    setErrorMsg(null);
    setExtractStep("Reading document file...");

    try {
      const apiKey = getDefaultGeminiKey();

      // Read file into Base64
      const base64Data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const res = reader.result as string;
          const base64 = res.includes(",") ? res.split(",")[1] : res;
          resolve(base64);
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      let mimeType = file.type || "application/pdf";
      const lowerName = file.name.toLowerCase();
      if (lowerName.endsWith(".pdf")) mimeType = "application/pdf";
      else if (lowerName.endsWith(".png")) mimeType = "image/png";
      else if (lowerName.endsWith(".jpg") || lowerName.endsWith(".jpeg")) mimeType = "image/jpeg";
      else if (lowerName.endsWith(".webp")) mimeType = "image/webp";

      // Strict spatial prompt
      const prompt = `You are an expert price-list parser for hardware, locks, hinges, building materials, and architectural fittings.
Analyze this entire price list document thoroughly.
Extract EVERY product, item, variant, size, packaging unit, and its wholesale price / rate.

CRITICAL INSTRUCTIONS FOR PRODUCT NAMES AND PRICES:
1. Spatial Formatting: The PDF text may have spatial formatting issues where prices appear on a different baseline than the product name, appear on separate lines, have large horizontal gaps between them, or be separated by underscores/dashes/dots. Carefully associate each numeric price to the nearest preceding product name.
2. extractedName: The exact or cleaned product name (e.g. "CYCLE LOCK", "Brass Butt Hinges 4 Inch", "Pad Lock 50mm").
3. extractedRate: The numeric wholesale price / rate in INR (e.g. 51.00, 65, 120, 280.50). Remove currency symbols like Rs, ₹, /-, etc.
   If no price or number is found for an item, set extractedRate to 0.
4. unit: Packaging unit if mentioned ("Pcs", "Packet", "Box", "Dozen", "Set", default to "Pcs").
5. category: Category if discernible (e.g. "Locks", "Hinges", "Hardware", etc.).

Return ONLY a strict JSON array of objects with this exact structure:
[
  {
    "extractedName": "CYCLE LOCK",
    "extractedRate": 51.00,
    "unit": "Pcs",
    "category": "Locks"
  }
]`;

      let rawExtractedItems: any[] = [];
      let clientExtracted = false;

      // Strategy 1: Direct client-side Gemini extraction
      if (apiKey) {
        setExtractStep("Gemini Flash analyzing spatial layout & prices...");

        const geminiPayload = {
          contents: [
            {
              parts: [
                {
                  inlineData: { mimeType, data: base64Data },
                },
                { text: prompt },
              ],
            },
          ],
          generationConfig: {
            responseMimeType: "application/json",
            temperature: 0.1,
            maxOutputTokens: 8192,
          },
        };

        const endpoints = [
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent?key=${apiKey}`,
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-lite-latest:generateContent?key=${apiKey}`,
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent?key=${apiKey}`,
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${apiKey}`,
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${apiKey}`,
        ];

        for (const url of endpoints) {
          try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 45000);

            const gRes = await fetch(url, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(geminiPayload),
              signal: controller.signal,
            });
            clearTimeout(timeoutId);

            if (gRes.ok) {
              const gData = await gRes.json();
              const rawText = gData.candidates?.[0]?.content?.parts?.[0]?.text;
              if (rawText) {
                const items = repairAndParseJsonArray(rawText);
                if (Array.isArray(items) && items.length > 0) {
                  rawExtractedItems = items;
                  clientExtracted = true;
                  break;
                }
              }
            } else {
              if (gRes.status === 429 || gRes.status === 401 || gRes.status === 403) {
                break;
              }
            }
          } catch (endpointErr) {
            console.warn("Direct Gemini endpoint failed, trying next:", endpointErr);
          }
        }
      }

      // Strategy 2: Server-side extractOnly fallback
      if (!clientExtracted || rawExtractedItems.length === 0) {
        setExtractStep("Direct connection unavailable, extracting via server...");
        const formData = new FormData();
        formData.append("file", file);
        formData.append("extractOnly", "true");
        if (apiKey) formData.append("apiKey", apiKey);

        const res = await fetch("/api/scan-prices", {
          method: "POST",
          body: formData,
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData?.message || errData?.error || `Server extraction failed (${res.status})`);
        }

        const data = await res.json();
        if (data.success && Array.isArray(data.items)) {
          rawExtractedItems = data.items;
        } else {
          throw new Error("No products could be extracted from this PDF.");
        }
      }

      if (rawExtractedItems.length === 0) {
        throw new Error("Gemini could not identify any products or rates in this PDF.");
      }

      setExtractStep("Running aggressive matching against database...");

      // Ensure fresh database products
      let currentDbProducts = dbProducts;
      if (currentDbProducts.length === 0) {
        const pRes = await fetch("/api/products");
        if (pRes.ok) {
          const pData = await pRes.json();
          if (Array.isArray(pData?.products)) {
            currentDbProducts = [...pData.products].sort((a, b) => a.name.localeCompare(b.name));
            setDbProducts(currentDbProducts);
          }
        }
      }

      // Transform raw extracted items into Staged Rows with Aggressive Matching
      const staged: StagedProductRow[] = rawExtractedItems.map((item: any, index: number) => {
        const rawName = (item.extractedName || item.name || "").trim();
        const rawRateVal =
          typeof item.extractedRate === "number"
            ? item.extractedRate
            : typeof item.rate === "number"
            ? item.rate
            : parseFloat(item.extractedRate || item.rate) || 0;

        const rateNum = !isNaN(rawRateVal) ? rawRateVal : 0;
        const unit = item.unit || "Pcs";
        const category = item.category || "Hardware";

        // Aggressive string matching against database products
        const matchResult = aggressiveMatchProduct(rawName, currentDbProducts);
        const matchedProduct = matchResult?.product || null;
        const matchedProductId = matchedProduct ? matchedProduct.id : null;
        const matchedProductName = matchedProduct ? matchedProduct.name : null;

        const { status, validationError } = evaluateRow(matchedProductId, rateNum);

        return {
          id: `stage-${index}-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
          extractedName: rawName || "Unknown Item",
          extractedRate: rateNum,
          rateInput: rateNum > 0 ? String(rateNum) : "0.00",
          unit,
          category,
          matchedProductId,
          matchedProductName,
          status,
          validationError,
        };
      });

      setStagedRows(staged);
      setModalStage("staging");
      toast.success(`Extracted ${staged.length} items from PDF! Review staging table below.`);
    } catch (err: any) {
      console.error("PDF extraction error:", err);
      setErrorMsg(err.message || "Failed to extract PDF price list");
      toast.error(err.message || "Failed to extract PDF price list");
      setModalStage("upload");
    } finally {
      setIsExtracting(false);
      setExtractStep("");
    }
  };

  /**
   * Handle manual change of matched database product for a row
   */
  const handleProductChange = (rowId: string, selectedProductId: string) => {
    setStagedRows((prev) =>
      prev.map((row) => {
        if (row.id !== rowId) return row;

        const matchedProduct = dbProducts.find((p) => p.id === selectedProductId) || null;
        const matchedProductId = matchedProduct ? matchedProduct.id : null;
        const matchedProductName = matchedProduct ? matchedProduct.name : null;
        const { status, validationError } = evaluateRow(matchedProductId, row.extractedRate);

        return {
          ...row,
          matchedProductId,
          matchedProductName,
          status,
          validationError,
        };
      })
    );
  };

  /**
   * Handle manual change of rate input for a row
   */
  const handleRateChange = (rowId: string, newRateStr: string) => {
    setStagedRows((prev) =>
      prev.map((row) => {
        if (row.id !== rowId) return row;

        const numVal = parseFloat(newRateStr.replace(/[^0-9.]/g, ""));
        const validNum = !isNaN(numVal) ? numVal : 0;
        const { status, validationError } = evaluateRow(row.matchedProductId, validNum);

        return {
          ...row,
          rateInput: newRateStr,
          extractedRate: validNum,
          status,
          validationError,
        };
      })
    );
  };

  /**
   * Handle row deletion / exclude from sync
   */
  const handleDeleteRow = (rowId: string) => {
    setStagedRows((prev) => prev.filter((r) => r.id !== rowId));
    toast.info("Item excluded from sync");
  };

  /**
   * KPI Counters
   */
  const redCount = useMemo(() => stagedRows.filter((r) => r.status === "ACTION_REQUIRED").length, [stagedRows]);
  const greenCount = useMemo(() => stagedRows.filter((r) => r.status === "READY").length, [stagedRows]);
  const isSyncDisabled = stagedRows.length === 0 || redCount > 0 || isSyncing;

  /**
   * Filtered rows for display
   */
  const displayedRows = useMemo(() => {
    return stagedRows.filter((row) => {
      // Status filter
      if (filterMode === "action_required" && row.status !== "ACTION_REQUIRED") return false;
      if (filterMode === "ready" && row.status !== "READY") return false;

      // Search filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const nameMatch = row.extractedName.toLowerCase().includes(q);
        const productMatch = row.matchedProductName?.toLowerCase().includes(q);
        return nameMatch || productMatch;
      }
      return true;
    });
  }, [stagedRows, filterMode, searchQuery]);

  /**
   * Final Sync: Batch updates Supabase
   */
  const handleConfirmAndSync = async () => {
    if (isSyncDisabled) {
      toast.error("Please resolve all red rows before confirming sync.");
      return;
    }

    setIsSyncing(true);
    setErrorMsg(null);

    try {
      const itemsToSync = stagedRows.map((r) => ({
        productId: r.matchedProductId,
        name: r.matchedProductName || r.extractedName,
        rate: r.extractedRate,
        unit: r.unit || "Pcs",
        category: r.category || "Hardware",
      }));

      const res = await fetch("/api/scan-prices/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: itemsToSync }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to sync prices to Supabase");
      }

      setSyncResult({
        updatedCount: data.updatedCount || itemsToSync.length,
        warnings: data.warnings || [],
      });
      setModalStage("synced");

      toast.success(`Successfully updated ${data.updatedCount || itemsToSync.length} products in Supabase!`, {
        description: "Catalog and hotspot rates are now updated live.",
      });

      onSuccess?.();
    } catch (err: any) {
      console.error("Final sync error:", err);
      setErrorMsg(err.message || "Failed to sync prices to Supabase");
      toast.error(err.message || "Failed to sync prices to Supabase");
    } finally {
      setIsSyncing(false);
    }
  };

  const handleClose = () => {
    if (isExtracting || isSyncing) return;
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent
        className={`bg-slate-900 border border-slate-800 text-white rounded-3xl shadow-2xl transition-all duration-300 ${
          modalStage === "staging"
            ? "sm:max-w-4xl lg:max-w-5xl w-[95vw] max-h-[92vh] flex flex-col p-5 sm:p-6"
            : "sm:max-w-xl max-h-[90vh] overflow-y-auto p-6"
        }`}
      >
        <DialogHeader className="mb-3 shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center">
                <FileText size={20} />
              </div>
              <div>
                <DialogTitle className="text-lg font-bold text-white flex items-center gap-2">
                  <span>PDF Price Scanner</span>
                  <span className="text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30 px-2 py-0.5 rounded-full uppercase tracking-wider">
                    Zero-Error Staging
                  </span>
                </DialogTitle>
                <DialogDescription className="text-xs text-slate-400">
                  {modalStage === "staging"
                    ? "Review and validate extracted prices before committing changes to Supabase."
                    : "Upload your wholesale price catalog. AI parses the document into a review staging table."}
                </DialogDescription>
              </div>
            </div>

            {/* Stage indicator badge */}
            <div className="hidden sm:flex items-center gap-1.5 text-[11px] font-mono px-2.5 py-1 rounded-full bg-slate-950 border border-slate-800 text-slate-400">
              <span className={`w-2 h-2 rounded-full ${modalStage === "staging" ? "bg-amber-400 animate-pulse" : modalStage === "synced" ? "bg-emerald-400" : "bg-slate-500"}`} />
              <span className="capitalize">{modalStage === "upload" ? "Step 1: Upload" : modalStage === "extracting" ? "Step 2: AI Parsing" : modalStage === "staging" ? "Step 3: Staging Review" : "Step 4: Synced"}</span>
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
                    {(file.size / 1024).toFixed(1)} KB • Ready for extraction
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
                    Supports wholesale PDFs with complex columns, dashed lines, and spatial baselines. Extracted rates will be held in a staging table for review before any database changes.
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
                onClick={handleStartExtraction}
                disabled={!file}
                className="flex-1 bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 text-slate-950 font-bold h-11 rounded-xl text-xs shadow-lg shadow-amber-600/20"
              >
                <Sparkles size={14} className="mr-1.5" />
                Extract Prices to Staging
              </Button>
            </div>
          </div>
        )}

        {/* ================= STAGE 2: EXTRACTING ================= */}
        {modalStage === "extracting" && (
          <div className="py-8 space-y-4 text-center">
            <div className="w-16 h-16 rounded-3xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 mx-auto">
              <RotateCw size={28} className="animate-spin text-amber-400" />
            </div>
            <div>
              <h4 className="text-base font-bold text-white">Extracting Rates with Gemini Flash AI</h4>
              <p className="text-xs text-amber-300 mt-1 flex items-center justify-center gap-1.5 font-mono">
                <span>{extractStep}</span>
                {elapsedSeconds > 0 && <span className="text-slate-400">({elapsedSeconds}s)</span>}
              </p>
              <p className="text-[11px] text-slate-500 mt-2 max-w-sm mx-auto">
                Parsing spatial layouts, baseline offsets, and associating prices to products without updating Supabase.
              </p>
            </div>

            <div className="w-full max-w-xs mx-auto bg-slate-800 h-1.5 rounded-full overflow-hidden">
              <div className="bg-gradient-to-r from-amber-500 via-indigo-500 to-emerald-500 h-full w-full animate-pulse" />
            </div>
          </div>
        )}

        {/* ================= STAGE 3: STAGING & REVIEW UI ================= */}
        {modalStage === "staging" && (
          <div className="flex-1 flex flex-col min-h-0 space-y-3">
            {/* Top Stats & Filter Toolbar */}
            <div className="shrink-0 bg-slate-950 border border-slate-800/80 rounded-2xl p-3 flex flex-wrap items-center justify-between gap-3">
              {/* KPI Counters */}
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-300">
                  Total Items: <span className="font-mono text-white bg-slate-800 px-2 py-0.5 rounded-md">{stagedRows.length}</span>
                </span>
                <span className="text-xs font-bold text-emerald-400 flex items-center gap-1 bg-emerald-950/60 border border-emerald-800/40 px-2.5 py-0.5 rounded-md">
                  <CheckCircle2 size={13} />
                  <span>{greenCount} Ready</span>
                </span>
                {redCount > 0 ? (
                  <span className="text-xs font-bold text-rose-400 flex items-center gap-1 bg-rose-950/60 border border-rose-800/60 px-2.5 py-0.5 rounded-md animate-pulse">
                    <AlertTriangle size={13} />
                    <span>{redCount} Requires Action</span>
                  </span>
                ) : (
                  <span className="text-xs font-bold text-emerald-300 flex items-center gap-1 bg-emerald-950/40 border border-emerald-800/30 px-2 py-0.5 rounded-md">
                    <span>Zero Errors</span>
                  </span>
                )}
              </div>

              {/* Filter Tabs & Search */}
              <div className="flex items-center gap-2 flex-1 justify-end min-w-[280px]">
                {/* Search Input */}
                <div className="relative flex-1 max-w-[200px]">
                  <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search staged..."
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-8 pr-2.5 py-1 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
                  />
                  {searchQuery && (
                    <button
                      onClick={() => setSearchQuery("")}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white"
                    >
                      <X size={12} />
                    </button>
                  )}
                </div>

                {/* Filter Tabs */}
                <div className="flex bg-slate-900 border border-slate-800 rounded-xl p-0.5 text-[11px]">
                  <button
                    onClick={() => setFilterMode("all")}
                    className={`px-2.5 py-1 rounded-lg font-medium transition-colors ${
                      filterMode === "all" ? "bg-slate-800 text-white font-bold" : "text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    All ({stagedRows.length})
                  </button>
                  <button
                    onClick={() => setFilterMode("action_required")}
                    className={`px-2.5 py-1 rounded-lg font-medium flex items-center gap-1 transition-colors ${
                      filterMode === "action_required"
                        ? "bg-rose-950 text-rose-300 border border-rose-800/50 font-bold"
                        : "text-rose-400/80 hover:text-rose-300"
                    }`}
                  >
                    <span>Action ({redCount})</span>
                  </button>
                  <button
                    onClick={() => setFilterMode("ready")}
                    className={`px-2.5 py-1 rounded-lg font-medium flex items-center gap-1 transition-colors ${
                      filterMode === "ready"
                        ? "bg-emerald-950 text-emerald-300 border border-emerald-800/50 font-bold"
                        : "text-emerald-400/80 hover:text-emerald-300"
                    }`}
                  >
                    <span>Ready ({greenCount})</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Staging Data Table */}
            <div className="flex-1 min-h-[300px] max-h-[50vh] overflow-y-auto overflow-x-auto border border-slate-800 rounded-2xl bg-slate-950/80 shadow-inner">
              <table className="w-full border-collapse text-left text-xs">
                <thead className="sticky top-0 z-10 bg-slate-900/95 backdrop-blur-md border-b border-slate-800 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                  <tr>
                    <th className="py-2.5 px-3 w-[28%]">Extracted Name (PDF)</th>
                    <th className="py-2.5 px-3 w-[18%]">Extracted Rate (₹)</th>
                    <th className="py-2.5 px-3 w-[34%]">Matched Database Product</th>
                    <th className="py-2.5 px-3 w-[14%]">Sync Status</th>
                    <th className="py-2.5 px-2 w-[6%] text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-sans">
                  {displayedRows.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-slate-500 text-xs">
                        {searchQuery ? "No items matching your search." : "No items in this filter view."}
                      </td>
                    </tr>
                  ) : (
                    displayedRows.map((row) => {
                      const isRed = row.status === "ACTION_REQUIRED";
                      return (
                        <tr
                          key={row.id}
                          className={`transition-colors ${
                            isRed
                              ? "bg-rose-950/20 hover:bg-rose-950/30 border-l-4 border-l-rose-500"
                              : "bg-emerald-950/10 hover:bg-emerald-950/20 border-l-4 border-l-emerald-500"
                          }`}
                        >
                          {/* 1. Extracted Name */}
                          <td className="py-2.5 px-3 align-middle">
                            <div className="flex flex-col">
                              <span className="font-semibold text-white truncate max-w-[220px]" title={row.extractedName}>
                                {row.extractedName}
                              </span>
                              <span className="text-[10px] text-slate-400">
                                {row.category} • {row.unit}
                              </span>
                            </div>
                          </td>

                          {/* 2. Extracted Rate (Editable input for immediate correction) */}
                          <td className="py-2.5 px-3 align-middle">
                            <div className="flex items-center gap-1.5">
                              <span className="text-slate-400 font-mono text-xs">₹</span>
                              <input
                                type="text"
                                inputMode="decimal"
                                value={row.rateInput}
                                onChange={(e) => handleRateChange(row.id, e.target.value)}
                                placeholder="0.00"
                                className={`w-24 px-2 py-1 text-xs font-mono font-bold rounded-lg border transition-all ${
                                  row.extractedRate <= 0
                                    ? "bg-rose-950/80 border-rose-500 text-rose-200 focus:ring-1 focus:ring-rose-400"
                                    : "bg-slate-900 border-slate-700 text-emerald-300 focus:border-emerald-500"
                                } focus:outline-none`}
                                title="Click to manually correct rate (e.g. 51.00)"
                              />
                            </div>
                            {row.extractedRate <= 0 && (
                              <p className="text-[10px] text-rose-400 font-medium mt-0.5">Rate required &gt; 0</p>
                            )}
                          </td>

                          {/* 3. Matched Database Product (Dropdown for manual selection) */}
                          <td className="py-2.5 px-3 align-middle">
                            <div className="space-y-1">
                              <select
                                value={row.matchedProductId || ""}
                                onChange={(e) => handleProductChange(row.id, e.target.value)}
                                className={`w-full max-w-[320px] px-2 py-1.5 text-xs rounded-lg border transition-all ${
                                  !row.matchedProductId
                                    ? "bg-rose-950/80 border-rose-500 text-rose-200 focus:ring-1 focus:ring-rose-400"
                                    : "bg-slate-900 border-slate-700 text-slate-200 focus:border-amber-500"
                                } focus:outline-none`}
                              >
                                <option value="" className="bg-slate-900 text-rose-300">
                                  -- Select Database Product --
                                </option>
                                {dbProducts.map((p) => (
                                  <option key={p.id} value={p.id} className="bg-slate-900 text-slate-200">
                                    {p.name} {p.rate ? `(Current: ₹${p.rate})` : ""}
                                  </option>
                                ))}
                              </select>

                              {row.matchedProductName && (
                                <p className="text-[10px] text-emerald-400/90 flex items-center gap-1">
                                  <Check size={10} />
                                  <span>Mapped to: <strong>{row.matchedProductName}</strong></span>
                                </p>
                              )}
                              {!row.matchedProductId && (
                                <p className="text-[10px] text-rose-400 font-medium">
                                  Pick corresponding product from dropdown
                                </p>
                              )}
                            </div>
                          </td>

                          {/* 4. Sync Status */}
                          <td className="py-2.5 px-3 align-middle">
                            {isRed ? (
                              <div className="inline-flex items-center gap-1.5 bg-rose-950/80 border border-rose-700/60 text-rose-300 px-2 py-1 rounded-lg text-[10px] font-bold">
                                <AlertTriangle size={12} className="shrink-0 text-rose-400" />
                                <span>Requires Action</span>
                              </div>
                            ) : (
                              <div className="inline-flex items-center gap-1.5 bg-emerald-950/80 border border-emerald-700/60 text-emerald-300 px-2 py-1 rounded-lg text-[10px] font-bold">
                                <CheckCircle2 size={12} className="shrink-0 text-emerald-400" />
                                <span>Ready to Sync</span>
                              </div>
                            )}
                          </td>

                          {/* 5. Delete Action */}
                          <td className="py-2.5 px-2 align-middle text-center">
                            <button
                              type="button"
                              onClick={() => handleDeleteRow(row.id)}
                              className="w-7 h-7 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-rose-950/40 flex items-center justify-center transition-colors"
                              title="Exclude this item from sync"
                            >
                              <Trash2 size={13} />
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Error & Warning Notices */}
            {redCount > 0 && (
              <div className="shrink-0 p-2.5 bg-rose-950/40 border border-rose-800/60 rounded-xl text-xs text-rose-300 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <AlertCircle size={15} className="text-rose-400 shrink-0" />
                  <span>
                    <strong>{redCount} item(s) require action.</strong> Set a valid positive rate and match each product before syncing.
                  </span>
                </div>
                <button
                  onClick={() => setFilterMode("action_required")}
                  className="text-[11px] underline font-bold text-rose-300 hover:text-rose-200 shrink-0"
                >
                  View Action Items
                </button>
              </div>
            )}

            {redCount === 0 && stagedRows.length > 0 && (
              <div className="shrink-0 p-2.5 bg-emerald-950/40 border border-emerald-800/60 rounded-xl text-xs text-emerald-300 flex items-center gap-2">
                <CheckCircle2 size={16} className="text-emerald-400 shrink-0" />
                <span>
                  <strong>All {stagedRows.length} items validated successfully!</strong> Ready to commit batch update to Supabase.
                </span>
              </div>
            )}

            {/* Modal Footer Controls */}
            <div className="shrink-0 flex items-center justify-between gap-3 pt-1">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setModalStage("upload");
                  setFile(null);
                  setStagedRows([]);
                }}
                disabled={isSyncing}
                className="border-slate-800 bg-slate-950 text-slate-300 hover:bg-slate-800 h-11 rounded-xl text-xs px-4"
              >
                Scan Another PDF
              </Button>

              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={handleClose}
                  disabled={isSyncing}
                  className="text-slate-400 hover:text-white h-11 rounded-xl text-xs px-4"
                >
                  Cancel
                </Button>

                {/* THE FINAL SYNC BUTTON: Disabled until all rows are Green */}
                <Button
                  type="button"
                  onClick={handleConfirmAndSync}
                  disabled={isSyncDisabled}
                  className={`h-11 px-6 rounded-xl text-xs font-bold transition-all shadow-lg ${
                    isSyncDisabled
                      ? "bg-slate-800 text-slate-500 cursor-not-allowed opacity-60 border border-slate-700"
                      : "bg-gradient-to-r from-emerald-600 via-emerald-500 to-teal-500 hover:from-emerald-500 hover:to-teal-400 text-white shadow-emerald-700/30"
                  }`}
                  title={
                    redCount > 0
                      ? `Resolve ${redCount} red row(s) to enable sync`
                      : "Batch sync all verified items to Supabase"
                  }
                >
                  {isSyncing ? (
                    <>
                      <RotateCw size={14} className="animate-spin mr-2" />
                      Syncing to Supabase...
                    </>
                  ) : (
                    <>
                      <Database size={14} className="mr-2" />
                      Confirm &amp; Sync Database ({greenCount})
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* ================= STAGE 4: SYNCED SUCCESS ================= */}
        {modalStage === "synced" && syncResult && (
          <div className="py-6 space-y-4 text-center">
            <div className="w-16 h-16 rounded-3xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 mx-auto shadow-lg shadow-emerald-500/10">
              <CheckCircle2 size={32} />
            </div>

            <div>
              <h4 className="text-lg font-bold text-white">Prices Successfully Committed to Supabase!</h4>
              <p className="text-xs text-slate-300 mt-1 max-w-sm mx-auto">
                Updated <strong className="text-emerald-400 font-mono text-sm">{syncResult.updatedCount} products</strong> in database and synchronized catalog hotspot pricing.
              </p>
            </div>

            {syncResult.warnings && syncResult.warnings.length > 0 && (
              <div className="bg-amber-950/40 border border-amber-600/40 rounded-2xl p-3 text-left space-y-1 text-xs text-amber-200">
                <p className="font-bold text-amber-300 flex items-center gap-1.5">
                  <AlertTriangle size={14} />
                  <span>Notices:</span>
                </p>
                <div className="max-h-24 overflow-y-auto font-mono text-[11px] space-y-0.5 text-amber-300/80">
                  {syncResult.warnings.map((w, idx) => (
                    <div key={idx}>• {w}</div>
                  ))}
                </div>
              </div>
            )}

            <div className="pt-2 flex gap-2 justify-center">
              <Button
                type="button"
                onClick={handleClose}
                className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold h-11 px-8 rounded-xl text-xs shadow-md"
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
