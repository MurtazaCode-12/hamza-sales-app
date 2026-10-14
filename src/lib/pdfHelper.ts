import zlib from 'zlib';

/**
 * Serverless-compatible, pure-Node.js PDF text extractor.
 * Operates without native bindings, web workers, or canvas dependencies.
 */
export async function extractTextFromPdf(buffer: Buffer): Promise<string> {
  try {
    let extractedText = '';
    const rawString = buffer.toString('binary');

    // Match all stream ... endstream blocks in PDF
    const streamRegex = /stream[\r\n]+([\s\S]*?)[\r\n]+endstream/g;
    let match: RegExpExecArray | null;

    while ((match = streamRegex.exec(rawString)) !== null) {
      try {
        const streamBuffer = Buffer.from(match[1], 'binary');
        let decompressed = '';

        // Attempt FlateDecode decompression
        try {
          decompressed = zlib.inflateSync(streamBuffer).toString('utf-8');
        } catch {
          try {
            decompressed = zlib.inflateRawSync(streamBuffer).toString('utf-8');
          } catch {
            decompressed = streamBuffer.toString('utf-8');
          }
        }

        // Extract (text) Tj operators
        const tjRegex = /\(([^)]*)\)\s*Tj/g;
        let tjMatch: RegExpExecArray | null;
        while ((tjMatch = tjRegex.exec(decompressed)) !== null) {
          extractedText += tjMatch[1] + ' ';
        }

        // Extract [(text) -offset (text)] TJ operators
        const tjArrayRegex = /\[(.*?)\]\s*TJ/g;
        let tjArrMatch: RegExpExecArray | null;
        while ((tjArrMatch = tjArrayRegex.exec(decompressed)) !== null) {
          const innerStrings = tjArrMatch[1].match(/\(([^)]*)\)/g);
          if (innerStrings) {
            extractedText += innerStrings.map((s) => s.slice(1, -1)).join('') + ' ';
          }
        }
      } catch {
        // Continue processing other streams if one is malformed
      }
    }

    // Fallback: search for readable text patterns in raw binary if streams were encrypted or non-standard
    if (!extractedText.trim()) {
      const asciiMatches = rawString.match(/[A-Za-z0-9\s,.-]{4,}/g);
      if (asciiMatches) {
        extractedText = asciiMatches.join(' ');
      }
    }

    // Clean up excessive whitespace and special characters
    return extractedText
      .replace(/\\([()\\])/g, '$1') // unescape \( \) \\
      .replace(/\s+/g, ' ')
      .trim();
  } catch (err) {
    console.warn('PDF stream extraction encountered error:', err);
    return '';
  }
}
