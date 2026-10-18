/**
 * Utility for case-insensitive, formatting-resilient product and hotspot matching.
 * Handles variations like:
 * "CYCLE LOCK", "cycle lock", "Cycle Lock", "CYCLE_LOCK", "CYCLE LOCK - HEAVY"
 */

export function normalizeProductName(name: string | null | undefined): string {
  if (!name || typeof name !== 'string') return '';
  return name
    .toLowerCase()
    .trim()
    .replace(/[_\-.:,()/\\#]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function isValidPositiveRate(rate: any): boolean {
  if (rate === null || rate === undefined || rate === '') return false;
  const num = Number(rate);
  return !isNaN(num) && num > 0;
}

export function findMatchingProduct<T extends { id: string; name: string; rate?: number | null }>(
  item: { name: string; matchedCatalogName?: string | null },
  products: T[]
): T | null {
  const rawItemName = (item.name || '').trim();
  const rawMatchedName = (item.matchedCatalogName || '').trim();
  const lowerItem = rawItemName.toLowerCase();
  const lowerMatched = rawMatchedName.toLowerCase();
  const normItem = normalizeProductName(rawItemName);
  const normMatched = normalizeProductName(rawMatchedName);

  // 1. Strict lowercase & trimmed match
  let found = products.find((p) => {
    const pLower = p.name.toLowerCase().trim();
    return pLower === lowerItem || (lowerMatched && pLower === lowerMatched);
  });
  if (found) return found;

  // 2. Normalized match (punctuation and spacing removed)
  found = products.find((p) => {
    const pNorm = normalizeProductName(p.name);
    return pNorm === normItem || (normMatched && pNorm === normMatched);
  });
  if (found) return found;

  // 3. Substring / containment match on normalized names (e.g. "CYCLE LOCK - HEAVY" -> "Cycle Lock")
  found = products.find((p) => {
    const pNorm = normalizeProductName(p.name);
    if (!pNorm || !normItem) return false;
    if (pNorm.length < 4 || normItem.length < 4) return false;
    return normItem.includes(pNorm) || pNorm.includes(normItem);
  });
  if (found) return found;

  return null;
}

export function aggressiveNormalize(name: string | null | undefined): string {
  if (!name || typeof name !== 'string') return '';
  return name.toLowerCase().replace(/[^a-z0-9]/g, '');
}

export function aggressiveMatchProduct<T extends { id: string; name: string; rate?: number | null; unit?: string | null; category?: string | null }>(
  extractedName: string | null | undefined,
  products: T[]
): { product: T; confidence: 'exact' | 'high' | 'medium' } | null {
  if (!extractedName || !products || products.length === 0) return null;

  const raw = extractedName.trim();
  const lower = raw.toLowerCase();
  const agg = aggressiveNormalize(raw);

  if (!agg) return null;

  // 1. Strict lowercase & trimmed match
  const exact = products.find((p) => p.name.trim().toLowerCase() === lower);
  if (exact) return { product: exact, confidence: 'exact' };

  // 2. Aggressive normalized match (stripping all spaces, symbols, punctuation)
  // e.g. "CYCLE LOCK" matches "Cycle Lock", "CYCLE_LOCK" matches "Cycle Lock"
  const aggMatch = products.find((p) => aggressiveNormalize(p.name) === agg);
  if (aggMatch) return { product: aggMatch, confidence: 'exact' };

  // 3. Word token matching
  const extTokens = raw.toLowerCase().split(/[\s_\-.:,/\\#]+/).filter((t) => t.length > 1);
  if (extTokens.length > 0) {
    const tokenMatch = products.find((p) => {
      const pTokens = p.name.toLowerCase().split(/[\s_\-.:,/\\#]+/).filter((t) => t.length > 1);
      if (pTokens.length === 0) return false;
      const allPInExt = pTokens.every((pt) => extTokens.some((et) => et.includes(pt) || pt.includes(et)));
      const allExtInP = extTokens.every((et) => pTokens.some((pt) => pt.includes(et) || et.includes(pt)));
      return allPInExt || allExtInP;
    });
    if (tokenMatch) return { product: tokenMatch, confidence: 'high' };
  }

  // 4. Substring containment on aggressive string
  // e.g. "cyclelockheavy" contains "cyclelock"
  const containment = products.find((p) => {
    const pAgg = aggressiveNormalize(p.name);
    if (!pAgg || pAgg.length < 4 || agg.length < 4) return false;
    return agg.includes(pAgg) || pAgg.includes(agg);
  });
  if (containment) return { product: containment, confidence: 'medium' };

  return null;
}

export function findMatchingHotspots<T extends { id: string; name: string; price?: string | null; types?: string[] | null }>(
  item: { name: string; matchedCatalogName?: string | null; type?: string | null },
  hotspots: T[]
): T[] {
  const rawItemName = (item.name || '').trim();
  const rawMatchedName = (item.matchedCatalogName || '').trim();
  const lowerItem = rawItemName.toLowerCase();
  const lowerMatched = rawMatchedName.toLowerCase();
  const normItem = normalizeProductName(rawItemName);
  const normMatched = normalizeProductName(rawMatchedName);

  return hotspots.filter((h) => {
    const hLower = (h.name || '').toLowerCase().trim();
    const hNorm = normalizeProductName(h.name);

    const nameMatch =
      hLower === lowerItem ||
      (lowerMatched && hLower === lowerMatched) ||
      hNorm === normItem ||
      (normMatched && hNorm === normMatched) ||
      (normItem.length >= 4 && hNorm.length >= 4 && (normItem.includes(hNorm) || hNorm.includes(normItem)));

    if (!nameMatch) return false;

    // Check type compatibility if item specified a type and hotspot specifies types
    if (item.type && Array.isArray(h.types) && h.types.length > 0) {
      const iTypeNorm = normalizeProductName(item.type);
      const typesNorm = h.types.map((t: string) => normalizeProductName(t));
      return typesNorm.some((ht: string) => ht.includes(iTypeNorm) || iTypeNorm.includes(ht));
    }

    return true;
  });
}
