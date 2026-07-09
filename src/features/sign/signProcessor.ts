import type { ProcessorContext, ProcessResult } from '@/types/tool';
import { embedImageIntoDoc } from '@/lib/pdf/imageEmbed';

export interface SignStampSpec {
  pageIndex: number;
  /** CSS-space top-left coordinates within the rendered page overlay. */
  x: number;
  y: number;
  width: number;
  height: number;
  /** CSS-space width of the page overlay when the stamp was placed. */
  overlayCssWidth: number;
  /** CSS-space height of the page overlay when the stamp was placed. */
  overlayCssHeight: number;
}

export interface SignOptions {
  signature: Blob | null;
  stamps: SignStampSpec[];
}

export async function signProcessor(
  ctx: ProcessorContext,
): Promise<ProcessResult> {
  const start = performance.now();
  const { PDFDocument } = await import('pdf-lib');
  const file = ctx.files[0];
  if (!file) throw new Error('No file provided.');

  const opts = ctx.options as SignOptions;
  if (!opts.signature) throw new Error('No signature provided.');
  if (opts.stamps.length === 0) throw new Error('No signature placements.');

  const doc = await PDFDocument.load(file.arrayBuffer.slice(0));
  const pages = doc.getPages();

  const sigImage = await embedImageIntoDoc(doc, opts.signature);

  const total = opts.stamps.length;
  for (let i = 0; i < opts.stamps.length; i++) {
    if (ctx.signal?.aborted) throw new Error('aborted');
    const stamp = opts.stamps[i];
    if (!stamp) continue;
    const page = pages[stamp.pageIndex];
    if (!page) continue;

    const { width: pdfW, height: pdfH } = page.getSize();
    const sx = pdfW / stamp.overlayCssWidth;
    const sy = pdfH / stamp.overlayCssHeight;

    const w = stamp.width * sx;
    const h = stamp.height * sy;
    const x = stamp.x * sx;
    // Convert top-left CSS Y to bottom-left PDF Y.
    const y = pdfH - stamp.y * sy - h;

    page.drawImage(sigImage, { x, y, width: w, height: h });

    ctx.onProgress?.((i + 1) / total, `Placing signature ${i + 1} of ${total}`);
  }

  const bytes = await doc.save({ useObjectStreams: true, addDefaultPage: false });
  const blob = new Blob([bytes as BlobPart], { type: 'application/pdf' });

  return {
    outputs: [{ name: 'signed.pdf', blob }],
    stats: {
      inputBytes: file.size,
      outputBytes: blob.size,
      durationMs: performance.now() - start,
    },
  };
}
