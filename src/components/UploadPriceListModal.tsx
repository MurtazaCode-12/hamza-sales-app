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
import { repairAndParseJsonArray } from "@/lib/jsonRepair";

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

  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  // Live timer while scanning
  React.useEffect(() => {
    let timer: any;
    if (isScanning) {
      setElapsedSeconds(0);
      timer = setInterval(() => {
        setElapsedSeconds((prev) => prev + 1);
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [isScanning]);

  const handleStartScan = async () => {
    if (!file) {
      toast.error("Please select a price list file first");
      return;
    }

    setIsScanning(true);
    setErrorMsg(null);
    setScanResult(null);
    setScanStep("Reading document file...");

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

      // Determine MIME type
      let mimeType = file.type || "application/pdf";
      const lowerName = file.name.toLowerCase();
      if (lowerName.endsWith(".pdf")) mimeType = "application/pdf";
      else if (lowerName.endsWith(".png")) mimeType = "image/png";
      else if (lowerName.endsWith(".jpg") || lowerName.endsWith(".jpeg")) mimeType = "image/jpeg";
      else if (lowerName.endsWith(".webp")) mimeType = "image/webp";

      // Fetch catalog context snippet for Gemini entity matching
      setScanStep("Loading catalog context...");
      let catalogContextSnippet: any[] = [];
      try {
        const ctxController = new AbortController();
        const ctxTimeout = setTimeout(() => ctxController.abort(), 6000);
        const ctxRes = await fetch("/api/hotspots/context", { signal: ctxController.signal });
        clearTimeout(ctxTimeout);
        if (ctxRes.ok) {
          const ctxData = await ctxRes.json();
          if (Array.isArray(ctxData?.context)) {
            catalogContextSnippet = ctxData.context;
          }
        }
      } catch (e) {
        console.warn("Could not load catalog context:", e);
      }

      const prompt = `You are an expert price-list parser for hardware, locks, hinges, building materials, and architectural fittings.
Analyze this entire price list document thoroughly.
Extract EVERY product, item, variant, size, packaging unit, and its wholesale price / rate.

Rules:
1. Standard packaging units must be mapped to one of: "Packet", "Pcs", "Box", "Dozen", "Set" (default to "Pcs" if not stated).
2. "rate" must be a positive number in INR (e.g. 65, 120, 280.50). Remove currency symbols like Rs, ₹, /-, etc.
3. Match each item to the closest product from our catalog database if applicable.
4. If a product has multiple size dimensions (e.g., 25mm, 35mm, 45mm, 50mm, 60mm, 70mm, 3 inch, 4 inch), extract a separate entry for each size with its specific rate.
5. If a product has a type/finish (e.g., ALTO, RECO, Ultra Key, Regular, Brass, Antique), extract it into "type".

Known products currently in our catalog:
${JSON.stringify(catalogContextSnippet.slice(0, 50), null, 2)}

Return ONLY a valid JSON array of objects with this exact schema:
[
  {
    "name": "Pad Lock",
    "matchedCatalogName": "Pad Lock",
    "rate": 65,
    "unit": "Pcs",
    "category": "Locks",
    "size": "25mm",
    "type": "ALTO"
  }
]`;

      let parsedItems: any[] = [];
      let clientScanSuccessful = false;
      let lastClientError = "";

      // Strategy 1: Direct client-side Gemini extraction (bypasses Vercel serverless timeouts completely)
      if (apiKey) {
        setScanStep("Gemini Flash analyzing catalog & price tables...");

        const geminiPayload = {
          contents: [
            {
              parts: [
                {
                  inlineData: {
                    mimeType,
                    data: base64Data,
                  },
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
            const timeoutId = setTimeout(() => controller.abort(), 45000); // 45s safety timeout

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
                  parsedItems = items;
                  clientScanSuccessful = true;
                  break;
                }
              }
            } else {
              const errBody = await gRes.text();
              lastClientError = errBody;
              console.warn(`Gemini call to ${url.split("?")[0]} returned ${gRes.status}:`, errBody);
              // If quota or auth error, don't keep trying slower models
              if (gRes.status === 429 || gRes.status === 401 || gRes.status === 403) {
                break;
              }
            }
          } catch (endpointErr: any) {
            lastClientError = endpointErr?.message || "Direct connection failed";
            console.warn("Direct client Gemini attempt failed, trying next:", endpointErr);
          }
        }
      }

      // If client-side Gemini extracted items, bulk sync to Supabase in 1 single SQL query
      if (clientScanSuccessful && Array.isArray(parsedItems) && parsedItems.length > 0) {
        setScanStep(`Syncing ${parsedItems.length} extracted rates into Supabase...`);

        const syncRes = await fetch("/api/scan-prices/sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ items: parsedItems }),
        });

        const syncData = await syncRes.json();
        if (!syncRes.ok || !syncData.success) {
          throw new Error(syncData.error || "Failed to sync prices to database");
        }

        setScanResult({
          scannedCount: syncData.scannedCount || 0,
          updatedCount: syncData.updatedCount || 0,
          products: Array.isArray(syncData.products) ? syncData.products : [],
        });

        toast.success(
          `Scanned ${syncData.scannedCount || 0} items! Updated ${syncData.updatedCount || 0} database records.`,
          { description: "Product catalog and hotspot rates updated." }
        );

        onSuccess?.();
        return;
      }

      // If client scan failed due to explicit API quota or authentication, fail fast with clear message
      if (!clientScanSuccessful && lastClientError) {
        if (lastClientError.includes("429") || lastClientError.includes("RESOURCE_EXHAUSTED")) {
          throw new Error("Gemini API daily free-tier quota exceeded. Please wait a short while or update your API key in Studio.");
        }
        if (lastClientError.includes("401") || lastClientError.includes("403") || lastClientError.includes("API_KEY_INVALID")) {
          throw new Error("Invalid Gemini API Key. Please verify your API key in Studio.");
        }
      }

      // Strategy 2: Server-side scan fallback if client direct connection was blocked by browser
      setScanStep("Direct connection unavailable, scanning via server...");
      const formData = new FormData();
      formData.append("file", file);
      if (apiKey) formData.append("apiKey", apiKey);

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
                  Gemini Flash AI
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
                    Supports wholesale PDFs, scanned pages, and photos of rate sheets. Gemini Flash AI extracts all products, variants, and rates directly into Supabase.
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
                <div className="flex items-center justify-center gap-2 text-amber-400 font-bold text-xs">
                  <RotateCw size={15} className="animate-spin text-amber-400" />
                  <span>{scanStep} {elapsedSeconds > 0 ? `(${elapsedSeconds}s)` : ''}</span>
                </div>
                <p className="text-[11px] text-slate-500">
                  AI document parsing &amp; sub-second Supabase bulk rate synchronization.
                </p>
                <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                  <div className="bg-gradient-to-r from-amber-500 via-indigo-500 to-emerald-500 h-full w-full animate-pulse" />
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
