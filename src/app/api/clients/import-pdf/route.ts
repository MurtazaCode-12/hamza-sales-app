import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { extractTextFromPdf } from '@/lib/pdfHelper';

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json(
        { success: false, error: 'No PDF file uploaded' },
        { status: 400 }
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Extract text from PDF
    const pdfText = await extractTextFromPdf(buffer);

    if (!pdfText.trim()) {
      return NextResponse.json(
        { success: false, error: 'Could not extract text from the provided PDF.' },
        { status: 400 }
      );
    }

    // Try to extract clients using Gemini API if key is available
    let extractedClients: Array<{ name: string; phone: string; address?: string; ownerName?: string; city?: string }> = [];

    const apiKey = process.env.GEMINI_API_KEY;
    if (apiKey) {
      try {
        const prompt = `Extract all client, customer, or shop directory details from this PDF text.
For each client found, provide:
- "name": Shop or Business Name (Required)
- "phone": Contact phone or mobile number (Required, default to "0000000000" if missing)
- "ownerName": Proprietor or contact person name (optional)
- "address": Address or locality (optional)
- "city": City or town (optional)

Respond ONLY with a valid JSON array of objects:
[
  { "name": "...", "phone": "...", "ownerName": "...", "address": "...", "city": "..." }
]

PDF Text content:
${pdfText.slice(0, 15000)}`;

        const geminiRes = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ parts: [{ text: prompt }] }],
              generationConfig: {
                responseMimeType: 'application/json',
                temperature: 0.2,
              },
            }),
          }
        );

        if (geminiRes.ok) {
          const geminiData = await geminiRes.json();
          const textResponse = geminiData.candidates?.[0]?.content?.parts?.[0]?.text;
          if (textResponse) {
            extractedClients = JSON.parse(textResponse);
          }
        }
      } catch (geminiErr) {
        console.warn('Gemini extraction failed, using heuristic regex parser:', geminiErr);
      }
    }

    // Fallback: simple line/regex extraction if Gemini wasn't used or returned empty
    if (extractedClients.length === 0) {
      const lines = pdfText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const phoneMatch = line.match(/(\+?91[\s-]?)?[6789]\d{9}/);
        if (phoneMatch) {
          const parts = line.split(/[-–,|]/);
          const name = parts[0]?.trim() || `Client ${extractedClients.length + 1}`;
          extractedClients.push({
            name: name.replace(/\d+/g, '').trim() || name,
            phone: phoneMatch[0].replace(/\s+/g, ''),
            address: parts[1]?.trim() || '',
            ownerName: '',
            city: 'Pune',
          });
        }
      }
    }

    // Insert extracted clients into Supabase
    const savedClients = [];
    for (const c of extractedClients) {
      if (!c.name) continue;
      try {
        const created = await prisma.client.create({
          data: {
            name: c.name,
            phone: c.phone || '0000000000',
            address: c.address || '',
            ownerName: c.ownerName || '',
            city: c.city || '',
          },
        });
        savedClients.push(created);
      } catch {
        savedClients.push(c);
      }
    }

    return NextResponse.json({
      success: true,
      importedCount: savedClients.length,
      clients: savedClients,
    });
  } catch (error: any) {
    console.error('PDF Client import error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to import PDF' },
      { status: 500 }
    );
  }
}
