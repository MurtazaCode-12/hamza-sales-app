import { PDFParse } from 'pdf-parse';

export async function extractTextFromPdf(buffer: Buffer): Promise<string> {
  const parser = new PDFParse({ data: buffer });
  try {
    const res: any = await parser.getText();
    if (typeof res === 'string') return res;
    if (res && typeof res.text === 'string') return res.text;
    if (res && Array.isArray(res.pages)) {
      return res.pages.map((p: any) => p.text).join('\n');
    }
    return String(res || '');
  } finally {
    try {
      await parser.destroy();
    } catch {}
  }
}
