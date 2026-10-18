/**
 * Utility to safely parse and repair JSON responses from LLMs.
 * Handles markdown backticks, truncated arrays, trailing commas, and wrapped objects.
 */

export function repairAndParseJsonArray<T = any>(rawText: string | null | undefined): T[] {
  if (!rawText || typeof rawText !== 'string') return [];

  // 1. Remove markdown code fences and whitespace
  let text = rawText
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .replace(/```json/gi, '')
    .replace(/```/g, '')
    .trim();

  // 2. Direct parse attempt
  try {
    const res = JSON.parse(text);
    if (Array.isArray(res)) return res;
    if (Array.isArray(res?.products)) return res.products;
    if (Array.isArray(res?.items)) return res.items;
    if (Array.isArray(res?.data)) return res.data;
  } catch {}

  // 3. Extract between first '[' and last ']'
  const firstBracket = text.indexOf('[');
  const lastBracket = text.lastIndexOf(']');
  if (firstBracket !== -1 && lastBracket > firstBracket) {
    try {
      const sliced = text.slice(firstBracket, lastBracket + 1);
      const res = JSON.parse(sliced);
      if (Array.isArray(res)) return res;
    } catch {}
  }

  // 4. Handle truncated JSON array: find the last complete object '}' after first '['
  if (firstBracket !== -1) {
    const sub = text.slice(firstBracket);
    const lastBrace = sub.lastIndexOf('}');
    if (lastBrace !== -1) {
      const candidate = sub.slice(0, lastBrace + 1) + ']';
      try {
        const res = JSON.parse(candidate);
        if (Array.isArray(res)) return res;
      } catch {}
    }
  }

  // 5. Handle wrapped object like { "products": [...] } that was truncated
  const firstBrace = text.indexOf('{');
  if (firstBrace !== -1) {
    // Check if there is an inner array
    const innerBracket = text.indexOf('[', firstBrace);
    if (innerBracket !== -1) {
      const sub = text.slice(innerBracket);
      const lastBrace = sub.lastIndexOf('}');
      if (lastBrace !== -1) {
        const candidate = sub.slice(0, lastBrace + 1) + ']';
        try {
          const res = JSON.parse(candidate);
          if (Array.isArray(res)) return res;
        } catch {}
      }
    }

    // Try parsing single object
    const lastBrace = text.lastIndexOf('}');
    if (lastBrace > firstBrace) {
      try {
        const obj = JSON.parse(text.slice(firstBrace, lastBrace + 1));
        if (Array.isArray(obj?.products)) return obj.products;
        if (Array.isArray(obj?.items)) return obj.items;
        if (Array.isArray(obj?.data)) return obj.data;
        if (obj?.name && (obj?.rate !== undefined || obj?.price !== undefined)) {
          return [obj as unknown as T];
        }
      } catch {}
    }
  }

  return [];
}

export function repairAndParseJsonObject<T = any>(rawText: string | null | undefined): T | null {
  if (!rawText || typeof rawText !== 'string') return null;

  let text = rawText
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .replace(/```json/gi, '')
    .replace(/```/g, '')
    .trim();

  // 1. Direct parse
  try {
    const res = JSON.parse(text);
    if (res && typeof res === 'object' && !Array.isArray(res)) return res;
  } catch {}

  // 2. Extract between first '{' and last '}'
  const firstBrace = text.indexOf('{');
  const lastBrace = text.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    try {
      const sliced = text.slice(firstBrace, lastBrace + 1);
      const res = JSON.parse(sliced);
      if (res && typeof res === 'object') return res;
    } catch {}
  }

  // 3. Truncated object repair: find last complete field or nested array
  if (firstBrace !== -1) {
    const sub = text.slice(firstBrace);
    const lastGood = Math.max(sub.lastIndexOf('}'), sub.lastIndexOf(']'));
    if (lastGood !== -1) {
      try {
        const candidate = sub.slice(0, lastGood + 1) + '\n}';
        const res = JSON.parse(candidate);
        if (res && typeof res === 'object') return res;
      } catch {}
    }
  }

  return null;
}
