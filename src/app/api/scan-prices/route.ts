import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { extractTextFromPdf } from '@/lib/pdfHelper';
import { getDefaultGeminiKey } from '@/lib/geminiKey';

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const clientApiKey = formData.get('apiKey') as string | null;

    if (!file) {
      return NextResponse.json(
        { success: false, error: 'No PDF price list file provided' },
        { status: 400 }
      );
    }

    const apiKey = clientApiKey || getDefaultGeminiKey();
    if (!apiKey) {
      return NextResponse.json(
        {
          success: false,
          error: 'MISSING_API_KEY',
          message: 'Gemini API key is required to parse PDF price lists.',
        },
        { status: 401 }
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Extract text from PDF
    const pdfText = await extractTextFromPdf(buffer);

    if (!pdfText.trim()) {
      return NextResponse.json(
        { success: false, error: 'Could not extract text from the PDF file' },
        { status: 400 }
      );
    }

    // Call Gemini 2.5 Flash API to parse prices and products
    const prompt = `You are an expert price-list parser for hardware, locks, hinges, and building materials.
Extract every product name and its corresponding price / rate from the provided catalog text.
Standard units should be mapped to one of: "Packet", "Pcs", "Box", "Dozen", "Set" (default to "Pcs" if not specified).

Return ONLY a valid JSON array of objects with the exact schema:
[
  {
    "name": "Product Name (clean, formatted)",
    "rate": 150.0,
    "unit": "Pcs",
    "category": "Hinges or Locks or Hardware etc."
  }
]

PDF Text content:
${pdfText.slice(0, 20000)}`;

    const requestPayload = {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: 0.1,
      },
    };

    let geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
    let geminiResponse = await fetch(geminiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestPayload),
    });

    if (!geminiResponse.ok && (geminiResponse.status === 404 || geminiResponse.status === 400)) {
      geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${apiKey}`;
      geminiResponse = await fetch(geminiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestPayload),
      });
    }

    if (!geminiResponse.ok) {
      const errText = await geminiResponse.text();
      console.error('Gemini API error during price scanning:', errText);
      return NextResponse.json(
        { success: false, error: 'Gemini API call failed', details: errText },
        { status: geminiResponse.status }
      );
    }

    const geminiData = await geminiResponse.json();
    const rawContent = geminiData.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!rawContent) {
      return NextResponse.json(
        { success: false, error: 'No output received from Gemini API' },
        { status: 500 }
      );
    }

    let parsedItems: Array<{ name: string; rate: number; unit?: string; category?: string }> = [];
    try {
      parsedItems = JSON.parse(rawContent);
    } catch (e) {
      // Heuristic fallback if wrapped in codeblocks
      const cleaned = rawContent.replace(/```json/g, '').replace(/```/g, '').trim();
      parsedItems = JSON.parse(cleaned);
    }

    if (!Array.isArray(parsedItems)) {
      if ((parsedItems as any).products) {
        parsedItems = (parsedItems as any).products;
      } else {
        parsedItems = [];
      }
    }

    // Upsert products and hotspots in Supabase
    const updatedProducts: any[] = [];
    for (const item of parsedItems) {
      if (!item.name || isNaN(Number(item.rate))) continue;

      const numRate = Number(item.rate);
      const unit = item.unit || 'Pcs';

      try {
        // Upsert Product model
        const existing = await prisma.product.findFirst({
          where: { name: { equals: item.name, mode: 'insensitive' } },
        });

        if (existing) {
          const updated = await prisma.product.update({
            where: { id: existing.id },
            data: {
              rate: numRate,
              unit: unit,
              category: item.category || existing.category,
            },
          });
          updatedProducts.push(updated);
        } else {
          const created = await prisma.product.create({
            data: {
              name: item.name,
              rate: numRate,
              unit: unit,
              category: item.category || 'Hardware',
            },
          });
          updatedProducts.push(created);
        }

        // Also update any matching CatalogHotspot price
        await prisma.catalogHotspot.updateMany({
          where: { name: { equals: item.name, mode: 'insensitive' } },
          data: { price: `₹${numRate}/${unit}` },
        });
      } catch (dbErr) {
        // Resilient fallback to memory list
        updatedProducts.push(item);
      }
    }

    return NextResponse.json({
      success: true,
      scannedCount: parsedItems.length,
      updatedCount: updatedProducts.length,
      products: updatedProducts,
    });
  } catch (error: any) {
    console.error('Scan prices error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to scan price list' },
      { status: 500 }
    );
  }
}
