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
