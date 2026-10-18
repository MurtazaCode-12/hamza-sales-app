"use client";

import React, { useState, useRef } from "react";
import { 
  FileText, 
  Upload, 
  Sparkles, 
  CheckCircle2, 
  AlertCircle, 
  X, 
  RotateCw,
  Tag,
  Layers,
  ArrowRight
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { getDefaultGeminiKey } from "@/lib/geminiKey";

interface ScannedProduct {
  name: string;
  rate: number;
  unit?: string;
  category?: string;
}

interface UploadPriceListModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export function UploadPriceListModal({ isOpen, onClose, onSuccess }: UploadPriceListModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [scanStep, setScanStep] = useState<string>("");
  const [scanResult, setScanResult] = useState<{
    scannedCount: number;
    updatedCount: number;
    products: ScannedProduct[];
  } | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

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
      setScanResult(null);
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
      setScanResult(null);
    }
  };

  const handleStartScan = async () => {
    if (!file) {
      toast.error("Please select a price list file first");
      return;
    }

    setIsScanning(true);
    setErrorMsg(null);
    setScanResult(null);
    setScanStep("Reading PDF text stream...");

    try {
      const formData = new FormData();
      formData.append("file", file);

      const apiKey = getDefaultGeminiKey();
      if (apiKey) {
        formData.append("apiKey", apiKey);
      }

      setScanStep("Gemini 2.5 Flash analyzing product items & prices...");

      const res = await fetch("/api/scan-prices", {
        method: "POST",
        body: formData,
      });

      const contentType = res.headers.get("content-type") || "";
      if (!contentType.includes("application/json")) {
        const text = await res.text();
        throw new Error(`Server returned status ${res.status}: ${text.slice(0, 100)}`);
      }

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.message || data.error || "Failed to scan PDF price list");
      }

      setScanStep("Updating products and catalog hotspots in database...");
      setScanResult({
        scannedCount: data.scannedCount || 0,
        updatedCount: data.updatedCount || 0,
        products: Array.isArray(data.products) ? data.products : [],
      });

      toast.success(
        `Scanned ${data.scannedCount || 0} items! Updated ${data.updatedCount || 0} database records.`,
        { description: "Product catalog and hotspot rates updated." }
      );

      onSuccess?.();
    } catch (err: any) {
      console.error("Price scan error:", err);
      setErrorMsg(err.message || "Failed to scan price list");
      toast.error(err.message || "Failed to scan price list");
    } finally {
      setIsScanning(false);
      setScanStep("");
    }
  };

  const handleClose = () => {
    if (isScanning) return;
    setFile(null);
    setScanResult(null);
    setErrorMsg(null);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto bg-slate-900 border border-slate-800 text-white rounded-3xl p-6 shadow-2xl">
        <DialogHeader className="mb-4">
          <div className="flex items-center gap-2.5 mb-1">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center">
              <FileText size={20} />
            </div>
            <div>
              <DialogTitle className="text-lg font-bold text-white flex items-center gap-2">
                <span>Upload PDF Price List</span>
                <span className="text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30 px-2 py-0.5 rounded-full uppercase tracking-wider">
                  Gemini 2.5 Flash
                </span>
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-400">
                Upload your wholesale price catalog in PDF format. AI extracts all products and syncs rates to Supabase.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* Upload Zone */}
        {!scanResult && (
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
                <Upload size={22} className={isScanning ? "animate-bounce" : ""} />
              </div>

              {file ? (
                <div>
                  <p className="text-sm font-bold text-amber-300 truncate max-w-sm mx-auto">
                    {file.name}
                  </p>
                  <p className="text-[11px] text-slate-400 mt-1 font-mono">
                    {(file.size / 1024).toFixed(1)} KB • Ready for scanning
                  </p>
                  <span className="inline-block mt-2 text-[10px] text-slate-400 bg-slate-800 px-2.5 py-1 rounded-lg">
                    Click or drop another file to change
                  </span>
                </div>
              ) : (
                <div>
                  <p className="text-sm font-bold text-slate-200">
                    Click to browse or drop your PDF or Image price list here
                  </p>
                  <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
                    Supports wholesale PDFs, scanned pages, and photos of rate sheets. Gemini 2.5 Flash extracts all products, variants, and rates directly into Supabase.
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

            {isScanning && (
              <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 text-center space-y-2">
                <div className="flex items-center justify-center gap-2 text-indigo-400 font-bold text-xs">
                  <RotateCw size={15} className="animate-spin" />
                  <span>{scanStep}</span>
                </div>
                <p className="text-[11px] text-slate-500">
                  Processing pages with Google Gemini 2.5 Flash. This usually takes 5-10 seconds.
                </p>
                <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                  <div className="bg-gradient-to-r from-blue-500 via-indigo-500 to-amber-500 h-full w-full animate-pulse" />
                </div>
              </div>
            )}

            <div className="flex gap-2.5 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={handleClose}
                disabled={isScanning}
                className="flex-1 border-slate-800 bg-slate-950 text-slate-300 hover:bg-slate-800 h-11 rounded-xl text-xs"
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={handleStartScan}
                disabled={!file || isScanning}
                className="flex-1 bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 text-slate-950 font-bold h-11 rounded-xl text-xs shadow-lg shadow-amber-600/20"
              >
                {isScanning ? (
                  <>
                    <RotateCw size={14} className="animate-spin mr-1.5" />
                    Scanning Rates...
                  </>
                ) : (
                  <>
                    <Sparkles size={14} className="mr-1.5" />
                    Scan &amp; Update Prices
                  </>
                )}
              </Button>
            </div>
          </div>
        )}

        {/* Scan Results View */}
        {scanResult && (
          <div className="space-y-4">
            <div className="bg-emerald-950/40 border border-emerald-700/50 rounded-2xl p-4 text-center">
              <CheckCircle2 size={32} className="text-emerald-400 mx-auto mb-2" />
              <h4 className="text-base font-bold text-white">Price List Successfully Synced!</h4>
              <p className="text-xs text-slate-300 mt-1">
                Extracted <strong className="text-emerald-400">{scanResult.scannedCount} items</strong> from PDF. Updated <strong className="text-emerald-400">{scanResult.updatedCount} products</strong> in Supabase database.
              </p>
            </div>

            {/* Scanned Items Table Preview */}
            {scanResult.products.length > 0 && (
              <div className="bg-slate-950 border border-slate-800 rounded-2xl overflow-hidden">
                <div className="px-4 py-2.5 bg-slate-900 border-b border-slate-800 flex items-center justify-between">
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                    Extracted Rates Preview ({scanResult.products.length})
                  </span>
                  <span className="text-[10px] text-slate-500">Live in Catalog</span>
                </div>
                <div className="max-h-56 overflow-y-auto divide-y divide-slate-800/80">
                  {scanResult.products.map((p, idx) => (
                    <div key={idx} className="px-4 py-2 flex items-center justify-between text-xs">
                      <div className="min-w-0 pr-2">
                        <p className="font-bold text-white truncate">{p.name}</p>
                        <p className="text-[10px] text-slate-400">{p.category || "General"}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <span className="font-mono font-bold text-amber-300 bg-amber-950/50 border border-amber-800/40 px-2 py-0.5 rounded-lg">
                          ₹{p.rate}/{p.unit || "Pcs"}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setFile(null);
                  setScanResult(null);
                }}
                className="flex-1 border-slate-800 bg-slate-950 text-slate-300 hover:bg-slate-800 h-11 rounded-xl text-xs"
              >
                Scan Another File
              </Button>
              <Button
                type="button"
                onClick={handleClose}
                className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white font-bold h-11 rounded-xl text-xs shadow-md"
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

export default UploadPriceListModal;
