// Client-side Auto Detection Service for Catalog Studio
// Integrates TensorFlow.js COCO-SSD model with canvas-based visual contour segmentation

export interface DetectedBox {
  name: string;
  top: number; // percentage (0 - 100)
  left: number; // percentage (0 - 100)
  width: number; // percentage (0 - 100)
  height: number; // percentage (0 - 100)
  confidence?: number;
  source: 'ai' | 'contour';
}

let cachedModel: any = null;
let modelLoadingPromise: Promise<any> | null = null;

/**
 * Initializes and caches the COCO-SSD model dynamically in the browser.
 */
export async function loadCocoSsdModel(onProgress?: (status: string) => void) {
  if (typeof window === 'undefined') return null;
  if (cachedModel) return cachedModel;
  if (modelLoadingPromise) return modelLoadingPromise;

  modelLoadingPromise = (async () => {
    try {
      onProgress?.('Loading TensorFlow core...');
      const tf = await import('@tensorflow/tfjs');
      await tf.ready();

      onProgress?.('Loading COCO-SSD object detection model...');
      const cocoSsd = await import('@tensorflow-models/coco-ssd');
      const model = await cocoSsd.load({
        base: 'lite_mobilenet_v2', // Lightweight and fast for browser execution
      });
      cachedModel = model;
      onProgress?.('AI Model Ready');
      return model;
    } catch (err) {
      console.error('Failed to load TensorFlow/COCO-SSD model:', err);
      modelLoadingPromise = null;
      throw err;
    }
  })();

  return modelLoadingPromise;
}

/**
 * Runs TensorFlow COCO-SSD object detection on an HTMLImageElement
 */
export async function detectWithCocoSsd(
  imageElement: HTMLImageElement,
  minConfidence = 0.18
): Promise<DetectedBox[]> {
  try {
    const model = await loadCocoSsdModel();
    if (!model) return [];

    // Run prediction on the image element
    // maxNumBoxes: 30, minScore: minConfidence
    const predictions = await model.detect(imageElement, 30, minConfidence);

    const naturalWidth = imageElement.naturalWidth || imageElement.width || 1000;
    const naturalHeight = imageElement.naturalHeight || imageElement.height || 1414;

    const detected: DetectedBox[] = predictions.map((pred: any) => {
      const [x, y, w, h] = pred.bbox;
      // Convert pixel bounding box to percentage of natural image dimensions
      const left = Math.max(0, Math.min(100, (x / naturalWidth) * 100));
      const top = Math.max(0, Math.min(100, (y / naturalHeight) * 100));
      const width = Math.max(2, Math.min(100 - left, (w / naturalWidth) * 100));
      const height = Math.max(2, Math.min(100 - top, (h / naturalHeight) * 100));

      // Friendly display name from detected class
      const formattedName = pred.class
        ? pred.class.charAt(0).toUpperCase() + pred.class.slice(1)
        : 'Product';

      return {
        name: formattedName,
        left: Number(left.toFixed(2)),
        top: Number(top.toFixed(2)),
        width: Number(width.toFixed(2)),
        height: Number(height.toFixed(2)),
        confidence: Math.round(pred.score * 100),
        source: 'ai' as const,
      };
    });

    return detected;
  } catch (err) {
    console.warn('COCO-SSD detection encountered an error:', err);
    return [];
  }
}

/**
 * Intelligent Catalog Saliency / Cluster Detection:
 * Hardware catalog pages contain products on light/white backgrounds.
 * This runs client-side canvas segmentation to locate distinct product photos.
 */
export function detectCatalogContours(
  imageElement: HTMLImageElement
): DetectedBox[] {
  try {
    if (typeof window === 'undefined') return [];

    const naturalWidth = imageElement.naturalWidth || imageElement.width || 1000;
    const naturalHeight = imageElement.naturalHeight || imageElement.height || 1414;

    // Create downscaled canvas for fast contour analysis
    const canvas = document.createElement('canvas');
    const scaleWidth = 400;
    const scaleHeight = Math.round((naturalHeight / naturalWidth) * scaleWidth);
    canvas.width = scaleWidth;
    canvas.height = scaleHeight;

    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return [];

    ctx.drawImage(imageElement, 0, 0, scaleWidth, scaleHeight);
    const imgData = ctx.getImageData(0, 0, scaleWidth, scaleHeight);
    const data = imgData.data;

    // Detect background color (sample borders)
    let bgR = 0, bgG = 0, bgB = 0;
    let sampleCount = 0;
    for (let x = 0; x < scaleWidth; x += 10) {
      const topIdx = (x) * 4;
      const btmIdx = ((scaleHeight - 1) * scaleWidth + x) * 4;
      bgR += data[topIdx] + data[btmIdx];
      bgG += data[topIdx + 1] + data[btmIdx + 1];
      bgB += data[topIdx + 2] + data[btmIdx + 2];
      sampleCount += 2;
    }
    bgR /= sampleCount;
    bgG /= sampleCount;
    bgB /= sampleCount;

    // Create binary occupancy grid (cells of 10x10)
    const cellW = 10;
    const cellH = 10;
    const cols = Math.floor(scaleWidth / cellW);
    const rows = Math.floor(scaleHeight / cellH);
    const grid: number[][] = Array.from({ length: rows }, () => Array(cols).fill(0));

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        let nonBgCount = 0;
        const startX = c * cellW;
        const startY = r * cellH;

        for (let py = 0; py < cellH; py += 2) {
          for (let px = 0; px < cellW; px += 2) {
            const idx = ((startY + py) * scaleWidth + (startX + px)) * 4;
            const rVal = data[idx];
            const gVal = data[idx + 1];
            const bVal = data[idx + 2];
            const diff = Math.abs(rVal - bgR) + Math.abs(gVal - bgG) + Math.abs(bVal - bgB);
            // Threshold for foreground feature
            if (diff > 45) {
              nonBgCount++;
            }
          }
        }
        if (nonBgCount > 5) {
          grid[r][c] = 1;
        }
      }
    }

    // Ignore page headers (top 8%) and footers (bottom 6%) which typically contain branding/page numbers
    const topMargin = Math.floor(rows * 0.08);
    const btmMargin = Math.floor(rows * 0.94);
    for (let r = 0; r < rows; r++) {
      if (r < topMargin || r > btmMargin) {
        for (let c = 0; c < cols; c++) grid[r][c] = 0;
      }
    }

    // Find connected components in grid
    const visited: boolean[][] = Array.from({ length: rows }, () => Array(cols).fill(false));
    const rawBoxes: { minR: number; maxR: number; minC: number; maxC: number }[] = [];

    for (let r = topMargin; r <= btmMargin; r++) {
      for (let c = 0; c < cols; c++) {
        if (grid[r][c] === 1 && !visited[r][c]) {
          // BFS / Flood fill
          let minR = r, maxR = r, minC = c, maxC = c;
          const queue: [number, number][] = [[r, c]];
          visited[r][c] = true;

          while (queue.length > 0) {
            const [currR, currC] = queue.shift()!;
            minR = Math.min(minR, currR);
            maxR = Math.max(maxR, currR);
            minC = Math.min(minC, currC);
            maxC = Math.max(maxC, currC);

            // 4-neighborhood with small gap tolerance (connect cells up to 1 step away)
            const neighbors: [number, number][] = [
              [currR - 1, currC], [currR + 1, currC],
              [currR, currC - 1], [currR, currC + 1],
              [currR - 2, currC], [currR + 2, currC],
              [currR, currC - 2], [currR, currC + 2]
            ];

            for (const [nr, nc] of neighbors) {
              if (nr >= topMargin && nr <= btmMargin && nc >= 0 && nc < cols && grid[nr][nc] === 1 && !visited[nr][nc]) {
                visited[nr][nc] = true;
                queue.push([nr, nc]);
              }
            }
          }

          const widthCells = maxC - minC + 1;
          const heightCells = maxR - minR + 1;

          // Filter out tiny noise and massive whole-page fills
          if (widthCells >= 3 && heightCells >= 3 && widthCells < cols * 0.95 && heightCells < rows * 0.85) {
            rawBoxes.push({ minR, maxR, minC, maxC });
          }
        }
      }
    }

    // Convert to percentage boxes with generous padding
    const detected: DetectedBox[] = rawBoxes.map((b, idx) => {
      const left = Math.max(0, (b.minC / cols) * 100 - 1);
      const top = Math.max(0, (b.minR / rows) * 100 - 1);
      const width = Math.min(100 - left, ((b.maxC - b.minC + 1) / cols) * 100 + 2);
      const height = Math.min(100 - top, ((b.maxR - b.minR + 1) / rows) * 100 + 2);

      return {
        name: `Item #${idx + 1}`,
        left: Number(left.toFixed(2)),
        top: Number(top.toFixed(2)),
        width: Number(width.toFixed(2)),
        height: Number(height.toFixed(2)),
        confidence: 85,
        source: 'contour' as const,
      };
    });

    return detected;
  } catch (err) {
    console.warn('Contour detection encountered an error:', err);
    return [];
  }
}

/**
 * Calculates Intersection over Union between two boxes (percentage coordinates)
 */
function calculateIoU(a: DetectedBox, b: DetectedBox): number {
  const xA = Math.max(a.left, b.left);
  const yA = Math.max(a.top, b.top);
  const xB = Math.min(a.left + a.width, b.left + b.width);
  const yB = Math.min(a.top + a.height, b.top + b.height);

  const interArea = Math.max(0, xB - xA) * Math.max(0, yB - yA);
  const areaA = a.width * a.height;
  const areaB = b.width * b.height;

  const unionArea = areaA + areaB - interArea;
  return unionArea <= 0 ? 0 : interArea / unionArea;
}

/**
 * Combined hybrid detection:
 * Runs COCO-SSD and Smart Catalog Contour Detection, merges and deduplicates.
 */
export async function autoDetectProducts(
  imageElement: HTMLImageElement,
  mode: 'ai' | 'contour' | 'hybrid' = 'hybrid'
): Promise<DetectedBox[]> {
  if (!imageElement) return [];

  let aiBoxes: DetectedBox[] = [];
  let contourBoxes: DetectedBox[] = [];

  if (mode === 'ai' || mode === 'hybrid') {
    aiBoxes = await detectWithCocoSsd(imageElement);
  }

  if (mode === 'contour' || mode === 'hybrid') {
    contourBoxes = detectCatalogContours(imageElement);
  }

  if (mode === 'ai') return aiBoxes;
  if (mode === 'contour') return contourBoxes;

  // Hybrid Mode:
  // If AI found strong detections, prioritize them. If AI found 0 or very few (typical for hardware catalogs),
  // supplement with contour boxes.
  if (aiBoxes.length === 0) {
    return contourBoxes;
  }

  const merged = [...aiBoxes];

  for (const cBox of contourBoxes) {
    const hasOverlapWithAi = aiBoxes.some((aBox) => calculateIoU(aBox, cBox) > 0.3);
    if (!hasOverlapWithAi) {
      merged.push(cBox);
    }
  }

  return merged;
}
