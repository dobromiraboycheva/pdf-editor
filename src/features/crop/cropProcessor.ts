import type { ProcessorContext, ProcessResult } from '@/types/tool';

export interface CropRect {
  // In PDF-space (points, origin bottom-left).
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CropOptions {
  rect: CropRect;
  applyToAll: boolean; // false = only current page; true = all pages
  currentPageIndex: number; // used when applyToAll === false
}

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

function intersect(a: Box, b: Box): Box | null {
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.width, b.x + b.width);
  const y2 = Math.min(a.y + a.height, b.y + b.height);
  const width = x2 - x1;
  const height = y2 - y1;
  if (width <= 0 || height <= 0) return null;
  return { x: x1, y: y1, width, height };
}

export async function cropProcessor(
  ctx: ProcessorContext,
): Promise<ProcessResult> {
  const start = performance.now();
  const { PDFDocument } = await import('pdf-lib');
  const file = ctx.files[0];
  if (!file) throw new Error('No file provided.');
  if (ctx.files.length !== 1) {
    throw new Error('Crop requires exactly one PDF.');
  }
  const opts = ctx.options as CropOptions;
  if (!opts.rect) throw new Error('No crop rectangle provided.');

  const doc = await PDFDocument.load(file.arrayBuffer.slice(0));
  const pages = doc.getPages();
  const total = pages.length;

  const targetIndices: number[] = opts.applyToAll
    ? pages.map((_, i) => i)
    : [
        Math.max(
          0,
          Math.min(total - 1, Math.floor(opts.currentPageIndex)),
        ),
      ];

  for (let i = 0; i < targetIndices.length; i++) {
    if (ctx.signal?.aborted) throw new Error('aborted');
    const idx = targetIndices[i];
    if (idx === undefined) continue;
    const page = pages[idx];
    if (!page) continue;

    const media = page.getMediaBox();
    const mediaBox: Box = {
      x: media.x,
      y: media.y,
      width: media.width,
      height: media.height,
    };

    const desired: Box = {
      x: opts.rect.x,
      y: opts.rect.y,
      width: opts.rect.width,
      height: opts.rect.height,
    };

    const clipped = intersect(desired, mediaBox);
    if (!clipped) continue; // rect outside this page's media box — skip

    // v1: only setCropBox (non-destructive; content stream is preserved).
    page.setCropBox(clipped.x, clipped.y, clipped.width, clipped.height);

    ctx.onProgress?.(
      (i + 1) / Math.max(1, targetIndices.length),
      `Cropping page ${idx + 1}`,
    );
  }

  const bytes = await doc.save({
    useObjectStreams: true,
    addDefaultPage: false,
  });
  const blob = new Blob([bytes as BlobPart], { type: 'application/pdf' });

  return {
    outputs: [{ name: 'cropped.pdf', blob }],
    stats: {
      inputBytes: file.size,
      outputBytes: blob.size,
      durationMs: performance.now() - start,
    },
  };
}
