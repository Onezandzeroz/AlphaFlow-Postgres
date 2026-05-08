/**
 * documentDetect.ts
 *
 * Receipt quad detection — 2 strategies, proven and tested.
 *
 * Strategy 1 — Brightness (primary):
 *   Bilateral filter → Otsu threshold → whiteness validation.
 *   Receipts are uniformly white paper; Otsu finds the brightest region.
 *   Whiteness validation rejects quads whose interior isn't mostly white.
 *
 * Strategy 2 — Edges (fallback):
 *   Bilateral filter → Canny edge detection → contour search.
 *   For high-contrast receipt boundaries when brightness alone fails.
 *
 * Both strategies use:
 *   - Bilateral pre-filter (smooths texture noise, preserves receipt edges)
 *   - Morphological close (merge fragmented white regions)
 *   - Whiteness validation (reject non-white quads)
 *
 * Performance: operates on small canvases (~480px).
 * Auto-switches from bilateral to Gaussian if bilateral >40ms.
 */

declare const cv: any;

export interface Quad {
  tl: { x: number; y: number };
  tr: { x: number; y: number };
  br: { x: number; y: number };
  bl: { x: number; y: number };
}

// ── Adaptive filter: bilateral with auto-fallback ───────────────────

let useBilateral = true;

function adaptiveSmooth(src: any, out: any): void {
  if (useBilateral) {
    const t0 = performance.now();
    try {
      cv.bilateralFilter(src, out, 9, 75, 75);
      const dt = performance.now() - t0;
      if (dt > 40) {
        useBilateral = false;
        console.warn(`[detect] Bilateral ${dt.toFixed(1)}ms → Gaussian fallback`);
      }
      return;
    } catch {
      useBilateral = false;
    }
  }
  cv.GaussianBlur(src, out, new cv.Size(7, 7), 0);
}

// ── Whiteness validation ────────────────────────────────────────────

function quadWhiteness(gray: any, quad: Quad, w: number, h: number): number {
  const { tl, tr, br, bl } = quad;

  // Bounding box with 15% inset to avoid edge pixels
  const minX = Math.max(0, Math.min(tl.x, bl.x) + (Math.max(tl.x, bl.x) - Math.min(tl.x, bl.x)) * 0.15);
  const maxX = Math.min(w, Math.max(tr.x, br.x) - (Math.max(tr.x, br.x) - Math.min(tr.x, br.x)) * 0.15);
  const minY = Math.max(0, Math.min(tl.y, tr.y) + (Math.max(tl.y, tr.y) - Math.min(tl.y, tr.y)) * 0.15);
  const maxY = Math.min(h, Math.max(bl.y, br.y) - (Math.max(bl.y, br.y) - Math.min(bl.y, br.y)) * 0.15);

  const rx = Math.round(minX);
  const ry = Math.round(minY);
  const rw = Math.round(maxX - rx);
  const rh = Math.round(maxY - ry);

  if (rw <= 2 || rh <= 2) return 0;

  try {
    const roi = gray.roi(new cv.Rect(rx, ry, rw, rh));
    const mean = cv.mean(roi);
    roi.delete();
    return mean[0] / 255;
  } catch {
    return 0;
  }
}

// ── Contour → quad extraction ───────────────────────────────────────

interface QuadCandidate {
  quad: Quad;
  score: number;
  whiteness: number;
}

function extractQuadCandidates(
  contours: any,
  gray: any,
  frameArea: number,
  minArea: number,
  minWhiteness = 0.50,
): QuadCandidate[] {
  const candidates: QuadCandidate[] = [];
  const imgW = gray.cols;
  const imgH = gray.rows;

  for (let i = 0; i < contours.size(); i++) {
    const contour = contours.get(i);
    const peri = cv.arcLength(contour, true);
    const approx = new cv.Mat();
    cv.approxPolyDP(contour, approx, 0.02 * peri, true);

    if (approx.rows === 4) {
      const area = cv.contourArea(approx);
      if (area > minArea) {
        const pts: Array<{ x: number; y: number }> = [];
        for (let j = 0; j < 4; j++) {
          pts.push({
            x: approx.data32S[j * 2],
            y: approx.data32S[j * 2 + 1],
          });
        }
        pts.sort((a, b) => a.y - b.y);
        const top = pts.slice(0, 2).sort((a, b) => a.x - b.x);
        const bottom = pts.slice(2, 4).sort((a, b) => a.x - b.x);
        const quad: Quad = { tl: top[0], tr: top[1], br: bottom[1], bl: bottom[0] };

        const whiteness = quadWhiteness(gray, quad, imgW, imgH);
        if (whiteness < minWhiteness) {
          approx.delete();
          continue;
        }

        // Aspect ratio score
        const topW = Math.hypot(quad.tr.x - quad.tl.x, quad.tr.y - quad.tl.y);
        const botW = Math.hypot(quad.br.x - quad.bl.x, quad.br.y - quad.bl.y);
        const leftH = Math.hypot(quad.bl.x - quad.tl.x, quad.bl.y - quad.tl.y);
        const rightH = Math.hypot(quad.br.x - quad.tr.x, quad.br.y - quad.tr.y);
        const avgW = (topW + botW) / 2;
        const avgH = (leftH + rightH) / 2;
        const aspect = avgH / Math.max(avgW, 1);

        let aspectScore: number;
        if (aspect >= 0.8 && aspect <= 3.0) {
          aspectScore = 1.0;
        } else if (aspect >= 0.5 && aspect < 0.8) {
          aspectScore = 0.5;
        } else {
          aspectScore = 0.15;
        }

        const areaScore = area / frameArea;
        const whitenessBonus = whiteness > 0.75 ? 1.4 : whiteness > 0.65 ? 1.15 : 1.0;
        const score = areaScore * aspectScore * whitenessBonus;

        candidates.push({ quad, score, whiteness });
      }
    }
    approx.delete();
  }

  candidates.sort((a, b) => b.score - a.score);
  return candidates;
}

/**
 * Find best quad from a binary image (already thresholded).
 */
function findBestQuad(
  binary: any,
  gray: any,
  frameArea: number,
  minArea: number,
  minWhiteness = 0.50,
): Quad | null {
  const contours = new cv.MatVector();
  const hierarchy = new cv.Mat();
  try {
    cv.findContours(binary, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);
    const candidates = extractQuadCandidates(contours, gray, frameArea, minArea, minWhiteness);
    return candidates.length > 0 ? candidates[0].quad : null;
  } catch {
    return null;
  } finally {
    contours.delete();
    hierarchy.delete();
  }
}

// ── Morphological close helper ──────────────────────────────────────

function morphClose(img: any, ksize: number, iterations: number): void {
  const kernel = cv.Mat.ones(ksize, ksize, cv.CV_8U);
  cv.morphologyEx(img, img, cv.MORPH_CLOSE, kernel, new cv.Point(-1, -1), iterations);
  kernel.delete();
}

// ── Strategy 1: Brightness — Otsu threshold (primary) ───────────────
/**
 * Smooth with bilateral filter → Otsu auto-threshold → morphology close.
 * Receipts are uniformly white, so Otsu naturally separates them from
 * darker/colored backgrounds. Whiteness validation rejects false positives.
 */

function detectByBrightness(
  gray: any,
  frameArea: number,
  minArea: number,
): Quad | null {
  const filtered = new cv.Mat();
  const binary = new cv.Mat();

  try {
    adaptiveSmooth(gray, filtered);

    // Otsu automatically finds the best brightness threshold
    cv.threshold(filtered, binary, 0, 255, cv.THRESH_BINARY + cv.THRESH_OTSU);

    // Merge fragmented white regions
    morphClose(binary, 7, 3);

    // Slight dilation to close gaps at receipt edges
    const kernel = cv.Mat.ones(3, 3, cv.CV_8U);
    cv.dilate(binary, binary, kernel);
    kernel.delete();

    return findBestQuad(binary, gray, frameArea, minArea, 0.50);
  } catch {
    return null;
  } finally {
    filtered.delete();
    binary.delete();
  }
}

// ── Strategy 2: Edges — Canny (fallback) ───────────────────────────
/**
 * Smooth with bilateral filter → Canny edge detection → contour search.
 * For high-contrast receipt boundaries when brightness alone fails.
 */

function detectByEdges(
  gray: any,
  frameArea: number,
  minArea: number,
): Quad | null {
  const filtered = new cv.Mat();
  const edges = new cv.Mat();

  try {
    adaptiveSmooth(gray, filtered);
    cv.Canny(filtered, edges, 80, 200);

    morphClose(edges, 5, 2);

    return findBestQuad(edges, gray, frameArea, minArea, 0.55);
  } catch {
    return null;
  } finally {
    filtered.delete();
    edges.delete();
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PUBLIC API
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Detect a document/receipt quadrilateral in the given canvas.
 *
 * Two strategies tried in order until one succeeds:
 *   1. Brightness (Otsu) — primary, works for most backgrounds
 *   2. Edges (Canny) — fallback for high-contrast boundaries
 *
 * Returns null if no suitable quad is found.
 */
export function detectDocumentQuad(
  sourceCanvas: HTMLCanvasElement
): Quad | null {
  if (typeof cv === 'undefined' || !cv.Mat) return null;

  const src = cv.imread(sourceCanvas);
  const gray = new cv.Mat();

  try {
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);

    const frameArea = sourceCanvas.width * sourceCanvas.height;
    const minArea = frameArea * 0.05;

    // 1. Brightness — Otsu threshold (primary)
    const brightQuad = detectByBrightness(gray, frameArea, minArea);
    if (brightQuad) return brightQuad;

    // 2. Edges — Canny (fallback)
    return detectByEdges(gray, frameArea, minArea);
  } catch (err) {
    console.warn('[documentDetect] Detection failed:', err);
    return null;
  } finally {
    src.delete();
    gray.delete();
  }
}

/**
 * Convert a Quad to an array of 4 points for cv.matFromArray.
 */
export function quadToOpenCVPoints(quad: Quad): number[] {
  return [
    quad.tl.x, quad.tl.y,
    quad.tr.x, quad.tr.y,
    quad.br.x, quad.br.y,
    quad.bl.x, quad.bl.y,
  ];
}
