import type { PDFDocumentProxy } from 'pdfjs-dist';

interface RenderThumbnailOpts {
  widthPx?: number;
  dpr?: number;
  signal?: AbortSignal;
}

/**
 * Render a single PDF page to an offscreen HTMLCanvasElement.
 * Default target width is ~120 CSS px at 2x DPR (i.e. 240 device px).
 * Cancelable via an AbortSignal — abort will call the pdf.js RenderTask.cancel().
 */
export async function renderThumbnail(
  doc: PDFDocumentProxy,
  pageIndex: number,
  opts: RenderThumbnailOpts = {},
): Promise<HTMLCanvasElement> {
  const widthPx = opts.widthPx ?? 120;
  const dpr = opts.dpr ?? 2;
  const signal = opts.signal;

  if (signal?.aborted) {
    throw new DOMException('Aborted', 'AbortError');
  }

  // pdf.js uses 1-based page numbers.
  const page = await doc.getPage(pageIndex + 1);

  if (signal?.aborted) {
    // Best-effort cleanup: page object is fine to leave to GC.
    throw new DOMException('Aborted', 'AbortError');
  }

  // Compute a scale so the CSS width matches widthPx, then multiply by DPR for
  // the actual bitmap resolution.
  const baseViewport = page.getViewport({ scale: 1 });
  const scale = (widthPx / baseViewport.width) * dpr;
  const viewport = page.getViewport({ scale });

  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.ceil(viewport.width));
  canvas.height = Math.max(1, Math.ceil(viewport.height));
  // CSS size for accurate on-screen display.
  canvas.style.width = `${widthPx}px`;
  canvas.style.height = `${Math.ceil(viewport.height / dpr)}px`;

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Failed to acquire 2D canvas context for PDF thumbnail.');
  }

  const renderTask = page.render({
    canvasContext: ctx,
    viewport,
  });

  const onAbort = (): void => {
    renderTask.cancel();
  };
  if (signal) {
    signal.addEventListener('abort', onAbort, { once: true });
  }

  try {
    await renderTask.promise;
  } catch (err) {
    if (signal?.aborted) {
      throw new DOMException('Aborted', 'AbortError');
    }
    throw err;
  } finally {
    if (signal) {
      signal.removeEventListener('abort', onAbort);
    }
  }

  return canvas;
}
