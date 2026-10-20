import { NextRequest, NextResponse } from 'next/server';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import os from 'os';
import prisma from '@/lib/prisma';
import {
  parseGridTablesToRows,
  matchRowsDeterministically,
} from '@/lib/deterministicMatcher';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Executes Python pdfplumber extraction deterministically
 */
async function runPythonPdfplumber(pdfBuffer: Buffer, originUrl?: string): Promise<{ success: boolean; tables: string[][][]; error?: string }> {
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
        if (data.success && Array.isArray(data.tables) && data.tables.length > 0) {
          return { success: true, tables: data.tables };
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

    let extractedTables: string[][][] | null = null;
    let pdfBuffer: Buffer | null = null;

    if (contentType.includes('application/json')) {
      const body = await req.json();
      if (Array.isArray(body.tables) && body.tables.length > 0) {
        extractedTables = body.tables;
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

    // 1. Run deterministic pdfplumber extraction if tables not pre-provided
    if (!extractedTables) {
      if (!pdfBuffer || pdfBuffer.length === 0) {
        return NextResponse.json({ success: false, error: 'Empty file payload' }, { status: 400 });
      }

      const extractionResult = await runPythonPdfplumber(pdfBuffer, originUrl);
      if (!extractionResult.success || !extractionResult.tables || extractionResult.tables.length === 0) {
        return NextResponse.json(
          {
            success: false,
            error: extractionResult.error || 'No table rows could be identified in the uploaded PDF. Please verify the document format.',
          },
          { status: 400 }
        );
      }
      extractedTables = extractionResult.tables;
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

    // 3. Deterministically parse table grid into rows
    const parsedRows = parseGridTablesToRows(extractedTables);

    // 4. Run strict matching logic against database with aliases
    const { allRows, matchedCount, unmatchedCount } = matchRowsDeterministically(
      parsedRows,
      dbProducts,
      dbHotspots
    );

    return NextResponse.json({
      success: true,
      tables: extractedTables,
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
