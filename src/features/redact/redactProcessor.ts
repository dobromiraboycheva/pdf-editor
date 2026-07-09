import type { ProcessorContext, ProcessResult } from '@/types/tool';

export interface RedactRectSpec {
  pageIndex: number;
  /** CSS-space top-left within the rendered overlay. */
  x: number;
  y: number;
  width: number;
  height: number;
  /** CSS-space overlay size at draw time — used for PDF-space conversion. */
  overlayCssWidth: number;
  overlayCssHeight: number;
}

export interface RedactOptions {
  rects: RedactRectSpec[];
}

/** Render scale for rasterizing redacted pages (higher = crisper, larger). */
const RASTER_SCALE = 2.5;
/** JPEG quality for the flattened raster of a redacted page. */
const JPEG_QUALITY = 0.92;

function canvasToJpegBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error('Failed to encode redacted page.'));
      },
      'image/jpeg',
      JPEG_QUALITY,
    );
  });
}

/**
 * Truly removes redacted content by rasterizing each page that has redaction
 * rectangles: the whole page is rendered to a canvas, solid black rectangles
 * are painted over the redaction regions, and the flattened raster replaces the
 * page. The underlying text/images no longer exist in the output, so they can't
 * be recovered by copy-paste or pdftotext. Pages without redactions are copied
 * through as vectors to preserve quality and size.
 */
export async function redactProcessor(
  ctx: ProcessorContext,
): Promise<ProcessResult> {
  const start = performance.now();
  const { PDFDocument } = await import('pdf-lib');
  const file = ctx.files[0];
  if (!file) throw new Error('No file provided.');

  const opts = ctx.options as RedactOptions;
  if (opts.rects.length === 0) throw new Error('No redactions to apply.');

  const pdfjsDoc = file.pdfjsDoc;

  // Group redaction rects by page index.
  const rectsByPage = new Map<number, RedactRectSpec[]>();
  for (const r of opts.rects) {
    const list = rectsByPage.get(r.pageIndex);
    if (list) list.push(r);
    else rectsByPage.set(r.pageIndex, [r]);
  }

  const srcDoc = await PDFDocument.load(file.arrayBuffer.slice(0));
  const pageCount = srcDoc.getPageCount();
  const outDoc = await PDFDocument.create();

  const total = pageCount;
  for (let pageIndex = 0; pageIndex < pageCount; pageIndex++) {
    if (ctx.signal?.aborted) throw new Error('aborted');

    const pageRects = rectsByPage.get(pageIndex);

    if (!pageRects || pageRects.length === 0) {
      // No redactions — copy the original vector page through as-is.
      const [copied] = await outDoc.copyPages(srcDoc, [pageIndex]);
      if (copied) outDoc.addPage(copied);
      ctx.onProgress?.((pageIndex + 1) / total, `Page ${pageIndex + 1} of ${total}`);
      continue;
    }

    // Rasterize the whole page, then destroy the covered content by painting
    // opaque black rectangles onto the raster before embedding it.
    const page = await pdfjsDoc.getPage(pageIndex + 1);
    const viewport = page.getViewport({ scale: RASTER_SCALE });
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.ceil(viewport.width));
    canvas.height = Math.max(1, Math.ceil(viewport.height));

    const canvasCtx = canvas.getContext('2d');
    if (!canvasCtx) {
      canvas.width = 0;
      canvas.height = 0;
      throw new Error('Failed to acquire 2D canvas context.');
    }
    // JPEG has no alpha — paint white first.
    canvasCtx.fillStyle = '#ffffff';
    canvasCtx.fillRect(0, 0, canvas.width, canvas.height);

    await page.render({ canvasContext: canvasCtx, viewport }).promise;

    // PDF-point page size (scale 1) is what the output page uses.
    const base = page.getViewport({ scale: 1 });
    const pdfW = base.width;
    const pdfH = base.height;

    // Paint black over each redaction region. Rects are top-left origin CSS
    // space; convert to canvas pixels (canvas is also top-left origin) via the
    // overlay->PDF scale times the render scale. No Y-flip for canvas painting.
    canvasCtx.fillStyle = '#000000';
    for (const r of pageRects) {
      const cssToPdfX = pdfW / r.overlayCssWidth;
      const cssToPdfY = pdfH / r.overlayCssHeight;
      const cx = r.x * cssToPdfX * RASTER_SCALE;
      const cy = r.y * cssToPdfY * RASTER_SCALE;
      const cw = r.width * cssToPdfX * RASTER_SCALE;
      const ch = r.height * cssToPdfY * RASTER_SCALE;
      canvasCtx.fillRect(cx, cy, cw, ch);
    }

    const blob = await canvasToJpegBlob(canvas);
    const jpgBytes = new Uint8Array(await blob.arrayBuffer());
    const img = await outDoc.embedJpg(jpgBytes);

    const newPage = outDoc.addPage([pdfW, pdfH]);
    newPage.drawImage(img, { x: 0, y: 0, width: pdfW, height: pdfH });

    // Free the canvas backing store.
    canvas.width = 0;
    canvas.height = 0;

    ctx.onProgress?.((pageIndex + 1) / total, `Page ${pageIndex + 1} of ${total}`);
  }

  const bytes = await outDoc.save({ useObjectStreams: true, addDefaultPage: false });
  const blob = new Blob([bytes as BlobPart], { type: 'application/pdf' });

  return {
    outputs: [{ name: 'redacted.pdf', blob }],
    stats: {
      inputBytes: file.size,
      outputBytes: blob.size,
      durationMs: performance.now() - start,
    },
  };
}
