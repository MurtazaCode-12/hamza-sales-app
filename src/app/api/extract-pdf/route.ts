import { NextRequest, NextResponse } from 'next/server';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import os from 'os';
import prisma from '@/lib/prisma';
import { getDefaultGeminiKey } from '@/lib/geminiKey';
import { repairAndParseJsonArray } from '@/lib/jsonRepair';
import {
  parseGridTablesToRows,
  itemsToDeterministicInputRows,
  matchRowsDeterministically,
} from '@/lib/deterministicMatcher';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

interface PythonExtractionResult {
  success: boolean;
  strategy?: string;
  productCount?: number;
  items?: Array<{ product_name: string; variant?: string; rate: number; unit?: string }>;
  pageImages?: string[];
  tables?: string[][][];
  error?: string;
}

/**
 * Structured Output Schema for Gemini Multimodal Fallback
 */
const GEMINI_MULTIMODAL_SCHEMA = {
  type: 'ARRAY',
  description: 'Strict list of extracted products, variants, and numeric rates from the document.',
  items: {
    type: 'OBJECT',
    properties: {
      product_name: {
        type: 'STRING',
        description: 'Product title e.g. CYCLE LOCK, CHINA PAD LOCK, SS HINGE',
      },
      variant: {
        type: 'STRING',
        description: 'Specific size, model, finish, or type e.g. Standard, Heavy, 20mm, 50mm',
      },
      rate: {
        type: 'NUMBER',
        description: 'The exact numeric rate or price without currency symbols',
      },
    },
    required: ['product_name', 'variant', 'rate'],
  },
};

/**
 * Fallback to Gemini 1.5/2.5 Flash using Structured Outputs when coordinate extraction yields < 3 items
 */
async function callGeminiMultimodalFallback(
  pdfBuffer: Buffer,
  pageImages: string[] | undefined,
  clientApiKey?: string
): Promise<Array<{ product_name: string; variant: string; rate: number }>> {
  const apiKey = clientApiKey || getDefaultGeminiKey();
  if (!apiKey) {
    console.warn('No Gemini API key available for multimodal fallback');
    return [];
  }

  const parts: any[] = [];

  // If page images were rendered by Python, include them as image/jpeg
  if (Array.isArray(pageImages) && pageImages.length > 0) {
    for (const imgB64 of pageImages.slice(0, 5)) {
      parts.push({
        inlineData: {
          mimeType: 'image/jpeg',
          data: imgB64,
        },
      });
    }
  }

  // Also include the original PDF bytes
  parts.push({
    inlineData: {
      mimeType: 'application/pdf',
      data: pdfBuffer.toString('base64'),
    },
  });

  parts.push({
    text: `You are an expert wholesale catalog digitizer. Read this price list and extract every product item, its variant (size, model, type, or finish), and its exact numeric rate.\nStrictly output a JSON array of objects conforming to the provided schema with keys: product_name, variant, and rate.`,
  });

  const geminiPayload = {
    contents: [{ parts }],
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: GEMINI_MULTIMODAL_SCHEMA,
      temperature: 0.1,
      maxOutputTokens: 8192,
    },
  };

  const modelEndpoints = [
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${apiKey}`,
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent?key=${apiKey}`,
  ];

  for (const endpointUrl of modelEndpoints) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 35000);

      const res = await fetch(endpointUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(geminiPayload),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (res.ok) {
        const data = await res.json();
        const textPart = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (textPart) {
          const parsed = repairAndParseJsonArray(textPart);
          if (Array.isArray(parsed) && parsed.length > 0) {
            return parsed
              .map((it: any) => ({
                product_name: String(it.product_name || it.name || '').trim(),
                variant: String(it.variant || it.size || it.type || '').trim(),
                rate: Number(it.rate || it.price) || 0,
              }))
              .filter((it: any) => it.product_name && it.rate > 0);
          }
        }
      }
    } catch (err: any) {
      console.warn(`Gemini fallback error on ${endpointUrl.split('?')[0]}:`, err.message);
    }
  }

  return [];
}

/**
 * Executes Python coordinate & table extraction
 */
async function runPythonPdfplumber(pdfBuffer: Buffer, originUrl?: string): Promise<PythonExtractionResult> {
  // If running on Vercel production and the python serverless function is reachable via internal fetch
  const host =
    originUrl ||
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : 'https://hamza-sales-app.vercel.app');

  if (host) {
    try {
      const res = await fetch(`${host}/api/extract-pdf.py`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/pdf' },
        body: new Uint8Array(pdfBuffer),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          return {
            success: true,
            strategy: data.strategy,
            productCount: data.productCount,
            items: data.items,
            pageImages: data.pageImages,
            tables: data.tables,
          };
        }
      }
    } catch (e) {
      console.warn('Direct HTTP to /api/extract-pdf.py failed, falling back to local Python CLI execution:', e);
    }
  }

  // Local / serverless child_process fallback: executes api/extract-pdf.py with python
  return new Promise((resolve) => {
    const scriptPath = path.join(process.cwd(), 'api', 'extract-pdf.py');
    const tempFilePath = path.join(os.tmpdir(), `upload-${Date.now()}-${Math.random().toString(36).substring(7)}.pdf`);

    try {
      fs.writeFileSync(tempFilePath, pdfBuffer);
    } catch (err: any) {
      return resolve({ success: false, tables: [], error: `Failed to write temp file: ${err.message}` });
    }

    const pythonCmd = process.platform === 'win32' ? 'python' : 'python3';
    const pyProcess = spawn(pythonCmd, [scriptPath, tempFilePath]);

    let stdout = '';
    let stderr = '';

    pyProcess.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });

    pyProcess.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    pyProcess.on('close', (code) => {
      try {
        if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
      } catch {}

      if (code !== 0) {
        return resolve({
          success: false,
          tables: [],
          error: stderr || `Python extraction failed with exit code ${code}`,
        });
      }

      try {
        const parsed = JSON.parse(stdout);
        resolve({
          success: parsed.success ?? true,
          strategy: parsed.strategy,
          productCount: parsed.productCount,
          items: parsed.items || [],
          pageImages: parsed.pageImages || [],
          tables: parsed.tables || [],
          error: parsed.error,
        });
      } catch (err: any) {
        resolve({
          success: false,
          tables: [],
          error: `Failed to parse Python output: ${err.message}. Raw output: ${stdout.slice(0, 200)}`,
        });
      }
    });

    pyProcess.on('error', (err) => {
      try {
        if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
      } catch {}
      resolve({
        success: false,
        tables: [],
        error: `Failed to spawn Python process: ${err.message}. Ensure Python with pdfplumber is installed.`,
      });
    });
  });
}

export async function POST(req: NextRequest) {
  try {
    const contentType = req.headers.get('content-type') || '';
    const originUrl = req.nextUrl.origin || (req.headers.get('host') ? `https://${req.headers.get('host')}` : undefined);
    const clientApiKey =
      req.headers.get('x-gemini-key') ||
      req.nextUrl.searchParams.get('apiKey') ||
      '';

    let extractedTables: string[][][] | null = null;
    let pdfBuffer: Buffer | null = null;
    let parsedInputRows: Array<{
      rawProduct: string;
      rawVariant: string;
      rawRate: number;
      rawUnit: string;
      tableIndex: number;
      rowIndex: number;
    }> = [];
    let extractionStrategy = 'coordinate_extraction';

    if (contentType.includes('application/json')) {
      const body = await req.json();
      if (Array.isArray(body.tables) && body.tables.length > 0) {
        extractedTables = body.tables;
      } else if (Array.isArray(body.items) && body.items.length > 0) {
        parsedInputRows = itemsToDeterministicInputRows(body.items);
        extractionStrategy = 'direct_items';
      } else {
        const b64 = body.fileBase64 || body.pdfBase64 || body.file;
        if (b64) {
          const cleaned = b64.includes(',') ? b64.split(',')[1] : b64;
          pdfBuffer = Buffer.from(cleaned, 'base64');
        }
      }
    } else if (contentType.includes('multipart/form-data')) {
      const formData = await req.formData();
      const file = formData.get('file') as File | null;
      if (file) {
        const arrayBuffer = await file.arrayBuffer();
        pdfBuffer = Buffer.from(arrayBuffer);
      }
    } else {
      const arrayBuffer = await req.arrayBuffer();
      if (arrayBuffer.byteLength > 0) {
        pdfBuffer = Buffer.from(arrayBuffer);
      }
    }

    // 1. Process Extraction
    if (parsedInputRows.length === 0) {
      if (extractedTables && extractedTables.length > 0) {
        parsedInputRows = parseGridTablesToRows(extractedTables);
        extractionStrategy = 'table_grid_direct';
      } else {
        if (!pdfBuffer || pdfBuffer.length === 0) {
          return NextResponse.json({ success: false, error: 'Empty file payload' }, { status: 400 });
        }

        // Strategy 1 (Primary): Coordinate-Based Text Extraction
        const pyResult = await runPythonPdfplumber(pdfBuffer, originUrl);

        if (pyResult.success && Array.isArray(pyResult.items) && pyResult.items.length >= 3) {
          parsedInputRows = itemsToDeterministicInputRows(pyResult.items);
          extractionStrategy = 'coordinate_extraction';
          extractedTables = pyResult.tables || [];
        } else if (
          pyResult.success &&
          Array.isArray(pyResult.tables) &&
          pyResult.tables.length > 0 &&
          pyResult.tables[0].length >= 3
        ) {
          parsedInputRows = parseGridTablesToRows(pyResult.tables);
          extractionStrategy = 'table_grid_extraction';
          extractedTables = pyResult.tables;
        } else {
          // Strategy 2 (Secondary): Multimodal Fallback using Gemini Flash
          console.log('Coordinate parsing yielded < 3 products, activating Gemini multimodal fallback...');
          const geminiItems = await callGeminiMultimodalFallback(
            pdfBuffer,
            pyResult.pageImages,
            clientApiKey
          );

          if (geminiItems.length > 0) {
            parsedInputRows = itemsToDeterministicInputRows(geminiItems);
            extractionStrategy = 'gemini_multimodal_fallback';
          } else if (Array.isArray(pyResult.items) && pyResult.items.length > 0) {
            parsedInputRows = itemsToDeterministicInputRows(pyResult.items);
            extractionStrategy = 'coordinate_extraction_partial';
          } else {
            return NextResponse.json(
              {
                success: false,
                error:
                  pyResult.error ||
                  'No products or rates could be identified in the uploaded PDF. Please verify the document format.',
              },
              { status: 400 }
            );
          }
        }
      }
    }

    // 2. Fetch existing products and hotspots from Supabase
    const [dbProducts, dbHotspots] = await Promise.all([
      prisma.product.findMany({
        select: {
          id: true,
          name: true,
          category: true,
          rate: true,
          unit: true,
          aliases: true,
          types: true,
          sizes: true,
        },
      }),
      prisma.catalogHotspot.findMany({
        select: {
          id: true,
          name: true,
          price: true,
          types: true,
          sizes: true,
        },
      }),
    ]);

    // 3. Run strict matching logic against database with aliases
    const { allRows, matchedCount, unmatchedCount } = matchRowsDeterministically(
      parsedInputRows,
      dbProducts,
      dbHotspots
    );

    return NextResponse.json({
      success: true,
      strategy: extractionStrategy,
      totalExtracted: parsedInputRows.length,
      tables: extractedTables || [],
      rows: allRows,
      matchedCount,
      unmatchedCount,
      totalRows: allRows.length,
      dbProducts: dbProducts.map((p) => ({
        id: p.id,
        name: p.name,
        aliases: p.aliases,
        types: p.types,
        sizes: p.sizes,
        rate: p.rate,
      })),
    });
  } catch (err: any) {
    console.error('Extraction error:', err);
    return NextResponse.json({ success: false, error: err.message || 'Internal error' }, { status: 500 });
  }
}
