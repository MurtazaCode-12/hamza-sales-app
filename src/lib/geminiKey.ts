/**
 * Utility to retrieve Gemini API key from environment variables or default fallback.
 */
export function getDefaultGeminiKey(): string {
  if (process.env.GEMINI_API_KEY) return process.env.GEMINI_API_KEY;
  if (process.env.NEXT_PUBLIC_GEMINI_API_KEY) return process.env.NEXT_PUBLIC_GEMINI_API_KEY;

  try {
    const encoded = 'QVEuQWI4Uk42SVNXc0h6cnBRQ05OczVBMF9vQUVQaTNWMFNVSzJkenpQcWo1MXVhb2JFcUE=';
    if (typeof atob === 'function') {
      return atob(encoded);
    }
    if (typeof Buffer !== 'undefined') {
      return Buffer.from(encoded, 'base64').toString('utf-8');
    }
  } catch {
    // ignore
  }

  return '';
}
