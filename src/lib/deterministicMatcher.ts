/**
 * Deterministic Table Extractor & Exact Matcher
 * Uses strict string normalization, alias matching, and catalog hotspot resolution.
 */

export function cleanDeterministicString(str: string | null | undefined): string {
  if (!str) return '';
  return str.toLowerCase().replace(/\s+/g, ' ').trim();
}

export function stripSymbols(str: string | null | undefined): string {
  if (!str) return '';
  return str.toLowerCase().replace(/[^a-z0-9]/g, '');
}

export interface DeterministicRow {
  id: string;
  tableIndex: number;
  rowIndex: number;
  rawProduct: string;
  rawVariant: string;
  rawRate: number;
  rawUnit: string;
  // Match results
  matchedProductId: string | null;
  matchedProductName: string | null;
  matchedHotspotId: string | null;
  matchedVariantKey: string;
  currentRate: number | null;
  status: 'MATCHED' | 'UNMATCHED' | 'MANUALLY_LINKED';
}

export interface DbProductItem {
  id: string;
  name: string;
  category?: string | null;
  rate?: number | null;
  unit?: string | null;
  aliases: string[];
  types: string[];
  sizes: string[];
}

export interface DbHotspotItem {
  id: string;
  name: string;
  price?: string | null;
  types: string[];
  sizes: string[];
}

/**
 * Parses raw 2D grid tables from pdfplumber into structured table rows.
 * Deterministically identifies Product, Variant/Size, and Rate columns.
 */
export function parseGridTablesToRows(tables: string[][][]): Array<{
  rawProduct: string;
  rawVariant: string;
  rawRate: number;
  rawUnit: string;
  tableIndex: number;
  rowIndex: number;
}> {
  const extractedRows: Array<{
    rawProduct: string;
    rawVariant: string;
    rawRate: number;
    rawUnit: string;
    tableIndex: number;
    rowIndex: number;
  }> = [];

  tables.forEach((table, tableIdx) => {
    if (!table || table.length === 0) return;

    // Detect header row if present
    let colProd = -1;
    let colVar = -1;
    let colRate = -1;
    let colUnit = -1;
    let headerRowIdx = -1;

    for (let r = 0; r < Math.min(table.length, 3); r++) {
      const row = table[r].map((c) => cleanDeterministicString(c));
      const hasProd = row.some((c, idx) => {
        if (c.includes('product') || c.includes('item') || c.includes('particular') || c.includes('desc') || c.includes('name')) {
          colProd = idx;
          return true;
        }
        return false;
      });
      const hasRate = row.some((c, idx) => {
        if (c.includes('rate') || c.includes('price') || c.includes('mrp') || c.includes('rs') || c.includes('₹') || c.includes('amount')) {
          colRate = idx;
          return true;
        }
        return false;
      });
      const hasVar = row.some((c, idx) => {
        if (c.includes('size') || c.includes('variant') || c.includes('type') || c.includes('finish') || c.includes('spec') || c.includes('gauge')) {
          colVar = idx;
          return true;
        }
        return false;
      });
      const hasUnit = row.some((c, idx) => {
        if (c.includes('unit') || c.includes('pkg') || c.includes('pack')) {
          colUnit = idx;
          return true;
        }
        return false;
      });

      if (hasProd || hasRate) {
        headerRowIdx = r;
        break;
      }
    }

    // Positional fallback if no clear header was detected
    const firstDataRow = table[headerRowIdx + 1] || table[0];
    const numCols = firstDataRow ? firstDataRow.length : 0;

    if (colRate === -1) {
      // Find column with numbers/prices in first few rows
      for (let c = numCols - 1; c >= 0; c--) {
        const hasNumber = table.slice(headerRowIdx + 1, headerRowIdx + 5).some((r) => {
          const val = r[c] ? r[c].replace(/[^\d.]/g, '') : '';
          return val.length > 0 && !isNaN(Number(val)) && Number(val) > 0;
        });
        if (hasNumber) {
          colRate = c;
          break;
        }
      }
      if (colRate === -1 && numCols > 0) colRate = numCols - 1;
    }

    if (colProd === -1) {
      colProd = 0;
    }

    if (colVar === -1 && numCols >= 3) {
      // Pick column between prod and rate
      for (let c = 1; c < numCols; c++) {
        if (c !== colProd && c !== colRate && c !== colUnit) {
          colVar = c;
          break;
        }
      }
    }

    // Process data rows
    let currentParentProduct = '';

    for (let r = headerRowIdx + 1; r < table.length; r++) {
      const row = table[r];
      if (!row || row.length === 0) continue;

      const rawProdCell = colProd >= 0 && row[colProd] ? row[colProd].trim() : '';
      const rawVarCell = colVar >= 0 && row[colVar] ? row[colVar].trim() : '';
      const rawRateCell = colRate >= 0 && row[colRate] ? row[colRate].trim() : '';
      const rawUnitCell = colUnit >= 0 && row[colUnit] ? row[colUnit].trim() : '';

      // Skip row if it repeats header text or is empty
      const isHeaderRepeat =
        cleanDeterministicString(rawProdCell) === 'product' ||
        cleanDeterministicString(rawProdCell) === 'item' ||
        cleanDeterministicString(rawRateCell) === 'rate';
      if (isHeaderRepeat) continue;

      // Clean rate number (e.g. "Rs. 51.00", "₹51.00", "51/-" -> 51.00)
      const sanitizedRateStr = rawRateCell.replace(/[^0-9.]/g, '');
      const parsedRate = parseFloat(sanitizedRateStr);

      if (rawProdCell) {
        currentParentProduct = rawProdCell;
      }

      // If we have at least a product name or rate
      const effectiveProd = rawProdCell || currentParentProduct;
      if (!effectiveProd && isNaN(parsedRate)) continue;

      extractedRows.push({
        rawProduct: effectiveProd,
        rawVariant: rawVarCell,
        rawRate: isNaN(parsedRate) ? 0 : parsedRate,
        rawUnit: rawUnitCell || 'Pcs',
        tableIndex: tableIdx,
        rowIndex: r,
      });
    }
  });

  return extractedRows;
}

/**
 * Deterministically match parsed rows against Supabase products and variants.
 * Strictly uses lowercase, whitespace-stripped comparison, and Product.aliases.
 */
export function matchRowsDeterministically(
  rows: Array<{
    rawProduct: string;
    rawVariant: string;
    rawRate: number;
    rawUnit: string;
    tableIndex: number;
    rowIndex: number;
  }>,
  products: DbProductItem[],
  hotspots: DbHotspotItem[]
): {
  allRows: DeterministicRow[];
  matchedCount: number;
  unmatchedCount: number;
} {
  const allRows: DeterministicRow[] = [];
  let matchedCount = 0;
  let unmatchedCount = 0;

  rows.forEach((row, idx) => {
    const rawClean = cleanDeterministicString(row.rawProduct);
    const rawStripped = stripSymbols(row.rawProduct);
    const varClean = cleanDeterministicString(row.rawVariant);
    const varStripped = stripSymbols(row.rawVariant);

    // 1. Strict Deterministic Match against Product.name and Product.aliases
    let matchedProduct: DbProductItem | null = null;

    for (const p of products) {
      const pClean = cleanDeterministicString(p.name);
      const pStripped = stripSymbols(p.name);

      // Exact match on name
      if (pClean === rawClean || (rawStripped.length >= 3 && pStripped === rawStripped)) {
        matchedProduct = p;
        break;
      }

      // Exact match on aliases
      const aliasMatch = (p.aliases || []).some((alias) => {
        const aClean = cleanDeterministicString(alias);
        const aStripped = stripSymbols(alias);
        return aClean === rawClean || (rawStripped.length >= 3 && aStripped === rawStripped);
      });

      if (aliasMatch) {
        matchedProduct = p;
        break;
      }
    }

    // 2. Hotspot matching if not matched or for variant map
    const matchingHotspots = hotspots.filter((h) => {
      const hClean = cleanDeterministicString(h.name);
      const hStripped = stripSymbols(h.name);
      return hClean === rawClean || (rawStripped.length >= 3 && hStripped === rawStripped);
    });
    const primaryHotspot = matchingHotspots[0] || null;

    // Parse existing hotspot price map
    let hotspotPriceMap: Record<string, number> = {};
    if (primaryHotspot?.price) {
      const trimmed = primaryHotspot.price.trim();
      if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
        try {
          hotspotPriceMap = JSON.parse(trimmed);
        } catch {}
      }
    }

    // 3. Variant Key & Current Rate Resolution
    let matchedVariantKey = row.rawVariant || 'Standard';
    let currentRate: number | null = null;

    if (matchedProduct) {
      currentRate = matchedProduct.rate != null ? Number(matchedProduct.rate) : null;

      // Check if rawVariant matches any product types or sizes
      const allProductVariants = [...(matchedProduct.types || []), ...(matchedProduct.sizes || [])];
      for (const pv of allProductVariants) {
        if (cleanDeterministicString(pv) === varClean || stripSymbols(pv) === varStripped) {
          matchedVariantKey = pv;
          break;
        }
      }
    }

    if (primaryHotspot) {
      // Hotspot variant check
      if (hotspotPriceMap[matchedVariantKey] !== undefined) {
        currentRate = Number(hotspotPriceMap[matchedVariantKey]);
      } else if (hotspotPriceMap[row.rawVariant] !== undefined) {
        currentRate = Number(hotspotPriceMap[row.rawVariant]);
      } else if (hotspotPriceMap.default !== undefined) {
        currentRate = Number(hotspotPriceMap.default);
      }
    }

    const isMatched = !!matchedProduct || !!primaryHotspot;

    const rowResult: DeterministicRow = {
      id: `row-${row.tableIndex}-${row.rowIndex}-${idx}`,
      tableIndex: row.tableIndex,
      rowIndex: row.rowIndex,
      rawProduct: row.rawProduct,
      rawVariant: row.rawVariant,
      rawRate: row.rawRate,
      rawUnit: row.rawUnit || 'Pcs',
      matchedProductId: matchedProduct?.id || null,
      matchedProductName: matchedProduct?.name || primaryHotspot?.name || null,
      matchedHotspotId: primaryHotspot?.id || null,
      matchedVariantKey,
      currentRate,
      status: isMatched ? 'MATCHED' : 'UNMATCHED',
    };

    if (isMatched) {
      matchedCount++;
    } else {
      unmatchedCount++;
    }

    allRows.push(rowResult);
  });

  return { allRows, matchedCount, unmatchedCount };
}

/**
 * Converts structured product items (from coordinate extraction or Gemini fallback)
 * into the deterministic row input format.
 */
export function itemsToDeterministicInputRows(
  items: Array<{ product_name: string; variant?: string; rate: number; unit?: string }>
): Array<{
  rawProduct: string;
  rawVariant: string;
  rawRate: number;
  rawUnit: string;
  tableIndex: number;
  rowIndex: number;
}> {
  return items.map((it, idx) => ({
    rawProduct: it.product_name,
    rawVariant: it.variant || '',
    rawRate: Number(it.rate) || 0,
    rawUnit: it.unit || 'Pcs',
    tableIndex: 0,
    rowIndex: idx,
  }));
}
