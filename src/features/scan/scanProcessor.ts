import type { ProcessResult } from '@/types/tool';

export interface ScanOptions {
  /** JPEG blobs, one per captured page. */
  pages: Blob[];
  pageSize: 'a4' | 'letter' | 'fit';
}

interface Size {
  width: number;
  height: number;
}

const A4: Size = { width: 595, height: 842 };
const LETTER: Size = { width: 612, height: 792 };
const FIT_MAX: Size = { width: 1224, height: 1584 };
const MARGIN_PT = 24;

function scaleToFit(imgW: number, imgH: number, maxW: number, maxH: number): Size {
  if (imgW <= maxW && imgH <= maxH) {
    return { width: imgW, height: imgH };
  }
  const ratio = Math.min(maxW / imgW, maxH / imgH);
  return { width: imgW * ratio, height: imgH * ratio };
}

function pickPageSize(
  option: ScanOptions['pageSize'],
  imgW: number,
  imgH: number,
): Size {
  if (option === 'fit') {
    const fitted = scaleToFit(imgW, imgH, FIT_MAX.width, FIT_MAX.height);
    return {
      width: fitted.width + MARGIN_PT * 2,
      height: fitted.height + MARGIN_PT * 2,
    };
  }
  const base = option === 'letter' ? LETTER : A4;
  // Auto-orient to the image aspect ratio.
  if (imgW > imgH) {
    return { width: base.height, height: base.width };
  }
  return base;
}

export async function scanProcessor(options: ScanOptions): Promise<ProcessResult> {
  const start = performance.now();
  if (options.pages.length === 0) {
    throw new Error('At least one captured page is required.');
  }

  const { PDFDocument } = await import('pdf-lib');
  const doc = await PDFDocument.create();

  let inputBytes = 0;

  for (const blob of options.pages) {
    inputBytes += blob.size;
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const embedded = await doc.embedJpg(bytes);
    const imgW = embedded.width;
    const imgH = embedded.height;

    const pageSize = pickPageSize(options.pageSize, imgW, imgH);
    const availW = Math.max(1, pageSize.width - MARGIN_PT * 2);
    const availH = Math.max(1, pageSize.height - MARGIN_PT * 2);
    const drawScale = Math.min(availW / imgW, availH / imgH, 1);
    const drawW = imgW * drawScale;
    const drawH = imgH * drawScale;
    const x = (pageSize.width - drawW) / 2;
    const y = (pageSize.height - drawH) / 2;

    const page = doc.addPage([pageSize.width, pageSize.height]);
    page.drawImage(embedded, { x, y, width: drawW, height: drawH });
  }

  const bytes = await doc.save({ useObjectStreams: true });
  const blob = new Blob([bytes as BlobPart], { type: 'application/pdf' });

  return {
    outputs: [{ name: 'scanned.pdf', blob }],
    stats: {
      inputBytes,
      outputBytes: blob.size,
      durationMs: performance.now() - start,
    },
  };
}
