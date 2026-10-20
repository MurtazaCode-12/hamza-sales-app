/**
 * Utility functions for 2-phase rate synchronization, hierarchical matching,
 * and price variance guard (50% threshold).
 */

export function normalizeKey(name: string | null | undefined): string {
  if (!name || typeof name !== 'string') return '';
  return name.toLowerCase().replace(/[^a-z0-9]/g, '');
}

export interface PriceVarianceResult {
  isDeviated: boolean;
  variancePercent: number;
  reason?: 'RATE_ZERO_OR_INVALID' | 'PRICE_SPIKE_OVER_50_PERCENT' | 'PRICE_DROP_OVER_50_PERCENT' | 'UNMATCHED_PRODUCT';
  description?: string;
}

/**
 * Check price variance: If extracted price is 0, null, or deviates by more than 50%
 * from the existing database rate, mark it as flagged for review.
 */
export function calculatePriceVariance(
  existingRate: number | null | undefined,
  newRate: number | null | undefined
): PriceVarianceResult {
  if (newRate === null || newRate === undefined || isNaN(Number(newRate)) || Number(newRate) <= 0) {
    return {
      isDeviated: true,
      variancePercent: 100,
      reason: 'RATE_ZERO_OR_INVALID',
      description: 'Extracted price is 0.00 or missing.',
    };
  }

  const numNew = Number(newRate);

  // If there is no existing rate (new product or unpriced), it is not a variance issue
  if (existingRate === null || existingRate === undefined || isNaN(Number(existingRate)) || Number(existingRate) <= 0) {
    return {
      isDeviated: false,
      variancePercent: 0,
    };
  }

  const numExisting = Number(existingRate);
  const diff = numNew - numExisting;
  const varianceRatio = Math.abs(diff) / numExisting;
  const variancePercent = Math.round(varianceRatio * 100);

  // Check if deviation is strictly greater than 50% (0.50)
  if (varianceRatio > 0.5) {
    const isSpike = diff > 0;
    return {
      isDeviated: true,
      variancePercent,
      reason: isSpike ? 'PRICE_SPIKE_OVER_50_PERCENT' : 'PRICE_DROP_OVER_50_PERCENT',
      description: isSpike
        ? `Price jumped by +${variancePercent}% (from ₹${numExisting} to ₹${numNew}).`
        : `Price dropped by -${variancePercent}% (from ₹${numExisting} to ₹${numNew}).`,
    };
  }

  return {
    isDeviated: false,
    variancePercent,
  };
}

export interface ExtractedVariant {
  variant_name: string;
  size?: string | null;
  rate: number;
}

export interface ExtractedCatalogItem {
  category_name?: string | null;
  product_name: string;
  variants: ExtractedVariant[];
}

export interface MatchedVariantResult {
  extractedProduct: ExtractedCatalogItem;
  extractedVariant: ExtractedVariant;
  matchedProductId: string | null;
  matchedProductName: string | null;
  matchedHotspotId: string | null;
  matchedVariantKey: string;
  currentRate: number | null;
  newRate: number;
  variance: PriceVarianceResult;
  isFlagged: boolean;
}

/**
 * Match extracted products and sub-variants against database Products and CatalogHotspots
 */
export function matchExtractedHierarchy(
  extractedList: ExtractedCatalogItem[],
  existingProducts: Array<{
    id: string;
    name: string;
    category?: string | null;
    rate?: number | null;
    types?: string[];
    sizes?: string[];
  }>,
  existingHotspots: Array<{
    id: string;
    name: string;
    price?: string | null;
    types?: string[];
    sizes?: string[];
  }>
): {
  autoUpdateItems: MatchedVariantResult[];
  reviewItems: MatchedVariantResult[];
} {
  const autoUpdateItems: MatchedVariantResult[] = [];
  const reviewItems: MatchedVariantResult[] = [];

  for (const item of extractedList) {
    if (!item.product_name) continue;

    const rawProdName = item.product_name.trim();
    const prodKey = normalizeKey(rawProdName);

    // 1. Find best matching Product from DB
    let matchedProduct = existingProducts.find((p) => normalizeKey(p.name) === prodKey);
    if (!matchedProduct) {
      matchedProduct = existingProducts.find((p) => {
        const k = normalizeKey(p.name);
        return k.length >= 4 && (k.includes(prodKey) || prodKey.includes(k));
      });
    }

    // 2. Find matching CatalogHotspots
    const matchingHotspots = existingHotspots.filter((h) => {
      const hKey = normalizeKey(h.name);
      return hKey === prodKey || (hKey.length >= 4 && (hKey.includes(prodKey) || prodKey.includes(hKey)));
    });

    const primaryHotspot = matchingHotspots[0] || null;

    // Parse existing hotspot price map if available
    let existingPriceMap: Record<string, number> = {};
    if (primaryHotspot?.price) {
      const trimmed = primaryHotspot.price.trim();
      if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
        try {
          existingPriceMap = JSON.parse(trimmed);
        } catch {}
      }
    }

    const variantsList = Array.isArray(item.variants) && item.variants.length > 0
      ? item.variants
      : [{ variant_name: 'Standard', size: '', rate: 0 }];

    for (const v of variantsList) {
      const vName = (v.variant_name || 'Standard').trim();
      const vSize = (v.size || '').trim();
      const vKey = vSize ? `${vName} ${vSize}`.trim() : vName;
      const rateNum = Number(v.rate) || 0;

      // Determine existing current rate
      let currentRate: number | null = null;
      if (existingPriceMap[vName] !== undefined) {
        currentRate = Number(existingPriceMap[vName]);
      } else if (vSize && existingPriceMap[vSize] !== undefined) {
        currentRate = Number(existingPriceMap[vSize]);
      } else if (existingPriceMap[vKey] !== undefined) {
        currentRate = Number(existingPriceMap[vKey]);
      } else if (existingPriceMap.default !== undefined) {
        currentRate = Number(existingPriceMap.default);
      } else if (matchedProduct?.rate != null) {
        currentRate = Number(matchedProduct.rate);
      }

      // Check variance
      const variance = calculatePriceVariance(currentRate, rateNum);
      const isUnmatched = !matchedProduct && !primaryHotspot;

      const result: MatchedVariantResult = {
        extractedProduct: item,
        extractedVariant: v,
        matchedProductId: matchedProduct?.id || null,
        matchedProductName: matchedProduct?.name || primaryHotspot?.name || null,
        matchedHotspotId: primaryHotspot?.id || null,
        matchedVariantKey: vKey,
        currentRate,
        newRate: rateNum,
        variance: isUnmatched
          ? { isDeviated: true, variancePercent: 0, reason: 'UNMATCHED_PRODUCT', description: 'Product not found in catalog.' }
          : variance,
        isFlagged: isUnmatched || variance.isDeviated,
      };

      if (result.isFlagged) {
        reviewItems.push(result);
      } else {
        autoUpdateItems.push(result);
      }
    }
  }

  return { autoUpdateItems, reviewItems };
}
