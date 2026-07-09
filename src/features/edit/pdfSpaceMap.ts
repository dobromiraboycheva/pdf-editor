/**
 * Coordinate helpers.
 *
 * The store keeps annotations in **PDF-space with a top-left origin**,
 * so the mapping to Konva pixels is a pure uniform scale. Y-flipping to
 * pdf-lib's bottom-left origin happens once at save time.
 */

export interface PageSpace {
  /** Page width in PDF points. */
  pdfWidth: number;
  /** Page height in PDF points. */
  pdfHeight: number;
  /** Canvas width in CSS pixels (matches the Konva stage width). */
  canvasWidth: number;
  /** Canvas height in CSS pixels (matches the Konva stage height). */
  canvasHeight: number;
}

/** Uniform scale factor from PDF points to canvas pixels. */
export function scaleFactor(p: PageSpace): number {
  return p.canvasWidth / p.pdfWidth;
}

/** Point in PDF-space (top-left origin) → Konva pixel space. */
export function pdfToCanvas(
  p: PageSpace,
  x: number,
  y: number,
): { x: number; y: number } {
  const s = scaleFactor(p);
  return { x: x * s, y: y * s };
}

/** Konva pixel space → PDF-space (top-left origin). */
export function canvasToPdf(
  p: PageSpace,
  x: number,
  y: number,
): { x: number; y: number } {
  const s = scaleFactor(p);
  return { x: x / s, y: y / s };
}

/** Scale a delta (width/height) — no flipping. */
export function scaleDelta(p: PageSpace, v: number): number {
  return v * scaleFactor(p);
}

/** Inverse scale a delta — for width/height edits back to PDF-space. */
export function unscaleDelta(p: PageSpace, v: number): number {
  return v / scaleFactor(p);
}
