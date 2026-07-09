import type { ProcessResult } from '@/types/tool';
import { embedImageIntoDoc } from '@/lib/pdf/imageEmbed';

export interface JpgToPdfOptions {
  pageSize: 'a4' | 'letter' | 'fit';
  orientation: 'portrait' | 'landscape' | 'auto';
  marginPt: number;
  images: File[];
}

interface Size {
  width: number;
  height: number;
}

const A4: Size = { width: 595, height: 842 };
const LETTER: Size = { width: 612, height: 792 };
const FIT_MAX: Size = { width: 1224, height: 1584 };

function scaleToFit(imgW: number, imgH: number, maxW: number, maxH: number): Size {
  if (imgW <= maxW && imgH <= maxH) {
    return { width: imgW, height: imgH };
  }
  const ratio = Math.min(maxW / imgW, maxH / imgH);
  return { width: imgW * ratio, height: imgH * ratio };
}

function orientedSize(base: Size, orientation: 'portrait' | 'landscape'): Size {
  if (orientation === 'landscape') {
    return { width: base.height, height: base.width };
  }
  return base;
}

function pickPageSize(
  options: JpgToPdfOptions,
  imgW: number,
  imgH: number,
  marginPt: number,
): Size {
  if (options.pageSize === 'fit') {
    // Page dimensions = image dimensions (scaled to fit within FIT_MAX).
    const fitted = scaleToFit(imgW, imgH, FIT_MAX.width, FIT_MAX.height);
    return {
      width: fitted.width + marginPt * 2,
      height: fitted.height + marginPt * 2,
    };
  }
  const base = options.pageSize === 'letter' ? LETTER : A4;
  let orientation: 'portrait' | 'landscape';
  if (options.orientation === 'auto') {
    // Pick the orientation whose available area gives the larger scaled image.
    const portrait = orientedSize(base, 'portrait');
    const landscape = orientedSize(base, 'landscape');
    const availP: Size = {
      width: portrait.width - marginPt * 2,
      height: portrait.height - marginPt * 2,
    };
    const availL: Size = {
      width: landscape.width - marginPt * 2,
      height: landscape.height - marginPt * 2,
    };
    const fitP = scaleToFit(imgW, imgH, availP.width, availP.height);
    const fitL = scaleToFit(imgW, imgH, availL.width, availL.height);
    orientation =
      fitL.width * fitL.height > fitP.width * fitP.height
        ? 'landscape'
        : 'portrait';
  } else {
    orientation = options.orientation;
  }
  return orientedSize(base, orientation);
}

export async function jpgToPdfProcessor(
  options: JpgToPdfOptions,
  onProgress?: (fraction: number, note?: string) => void,
  signal?: AbortSignal,
): Promise<ProcessResult> {
  const start = performance.now();
  if (options.images.length === 0) {
    throw new Error('At least one image is required.');
  }
  const { PDFDocument } = await import('pdf-lib');
  const doc = await PDFDocument.create();

  const marginPt = Math.max(0, options.marginPt);
  let inputBytes = 0;
  const total = options.images.length;

  for (let i = 0; i < total; i++) {
    if (signal?.aborted) throw new Error('aborted');
    const file = options.images[i];
    if (!file) continue;
    inputBytes += file.size;

    const embedded = await embedImageIntoDoc(doc, file);
    const imgW = embedded.width;
    const imgH = embedded.height;

    const pageSize = pickPageSize(options, imgW, imgH, marginPt);
    const availW = Math.max(1, pageSize.width - marginPt * 2);
    const availH = Math.max(1, pageSize.height - marginPt * 2);
    const drawScale = Math.min(availW / imgW, availH / imgH, 1);
    // If image is larger than available area, drawScale < 1. If smaller,
    // draw at its natural embed size (clamped by drawScale === 1 above).
    const drawW = imgW * drawScale;
    const drawH = imgH * drawScale;
    const x = (pageSize.width - drawW) / 2;
    const y = (pageSize.height - drawH) / 2;

    const page = doc.addPage([pageSize.width, pageSize.height]);
    page.drawImage(embedded, {
      x,
      y,
      width: drawW,
      height: drawH,
    });

    onProgress?.((i + 1) / total, `Adding image ${i + 1} of ${total}`);
  }

  const bytes = await doc.save({ useObjectStreams: true });
  const blob = new Blob([bytes as BlobPart], { type: 'application/pdf' });

  return {
    outputs: [{ name: 'images.pdf', blob }],
    stats: {
      inputBytes,
      outputBytes: blob.size,
      durationMs: performance.now() - start,
    },
  };
}
