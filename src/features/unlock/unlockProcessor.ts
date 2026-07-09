import type { ProcessorContext, ProcessResult } from '@/types/tool';

export interface UnlockOptions {
  password?: string;
}

/**
 * Unlocks a password-protected PDF using pdf.js (the only pdf-lib-family lib
 * that supports password-based decryption in the browser).
 *
 * Approach:
 *   1. Load the raw bytes with `pdfjs.getDocument({ data, password })`.
 *      pdf.js throws PasswordException on wrong password.
 *   2. For each page, render at 2× DPR to a canvas → JPEG blob → embed into
 *      a fresh pdf-lib document.
 *
 * Trade-off: this rasterizes the pages, so text is no longer selectable.
 * That's a client-side limitation — true content-preserving decryption
 * requires a native tool like qpdf. But users get a fully-openable PDF
 * without any password.
 */
export async function unlockPdfFile(
  file: File,
  password: string,
  onProgress?: (fraction: number, note?: string) => void,
): Promise<Blob> {
  onProgress?.(0.05, 'Validating password…');

  const pdfjs = await import('pdfjs-dist');
  const { PDFDocument } = await import('pdf-lib');

  const bytes = new Uint8Array(await file.arrayBuffer());

  // pdf.js loader accepts password. It throws PasswordException if wrong or missing.
  let doc;
  try {
    doc = await pdfjs.getDocument({
      data: bytes,
      password: password || undefined,
    }).promise;
  } catch (e) {
    const err = e as { name?: string; code?: number; message?: string };
    if (
      err.name === 'PasswordException' ||
      (err.message ?? '').toLowerCase().includes('password')
    ) {
      throw new Error('wrongPassword');
    }
    throw new Error(
      `Could not read PDF: ${err.message || 'unknown error'}`,
    );
  }

  const pageCount = doc.numPages;
  if (pageCount === 0) throw new Error('PDF has no pages.');

  onProgress?.(0.15, 'Extracting pages…');

  const newDoc = await PDFDocument.create();

  for (let i = 1; i <= pageCount; i++) {
    const page = await doc.getPage(i);
    const viewport = page.getViewport({ scale: 2 });
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const ctx2d = canvas.getContext('2d');
    if (!ctx2d) throw new Error('Canvas 2D context unavailable.');
    ctx2d.fillStyle = '#FFFFFF';
    ctx2d.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx2d, viewport }).promise;

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.9),
    );
    if (!blob) throw new Error('Failed to render page.');
    const jpgBytes = new Uint8Array(await blob.arrayBuffer());
    const img = await newDoc.embedJpg(jpgBytes);

    const originalViewport = page.getViewport({ scale: 1 });
    const newPage = newDoc.addPage([
      originalViewport.width,
      originalViewport.height,
    ]);
    newPage.drawImage(img, {
      x: 0,
      y: 0,
      width: originalViewport.width,
      height: originalViewport.height,
    });

    // Free the canvas backing store — otherwise a full-res bitmap leaks per page.
    canvas.width = 0;
    canvas.height = 0;

    onProgress?.(0.15 + (0.8 * i) / pageCount, `Page ${i} of ${pageCount}`);
  }

  onProgress?.(0.95, 'Writing unlocked PDF…');
  const outBytes = await newDoc.save({
    useObjectStreams: true,
    addDefaultPage: false,
  });
  return new Blob([outBytes as BlobPart], { type: 'application/pdf' });
}

/**
 * Legacy signature — kept for compatibility with `PdfTool.process`. The Page
 * component uses `unlockPdfFile` directly instead of going through this path.
 */
export async function unlockProcessor(
  ctx: ProcessorContext,
): Promise<ProcessResult> {
  const file = ctx.files[0];
  if (!file) throw new Error('No file provided.');
  const opts = (ctx.options as UnlockOptions) || {};
  // ctx.files[0] here is an IngestedPdf — its `file` reference isn't preserved.
  // Reconstruct a synthetic File from the arrayBuffer.
  const raw = new File(
    [new Uint8Array(file.arrayBuffer.slice(0))],
    file.name,
    { type: 'application/pdf' },
  );
  const blob = await unlockPdfFile(raw, opts.password ?? '', ctx.onProgress);
  return {
    outputs: [{ name: 'unlocked.pdf', blob }],
    stats: {
      inputBytes: file.size,
      outputBytes: blob.size,
      durationMs: 0,
    },
  };
}
