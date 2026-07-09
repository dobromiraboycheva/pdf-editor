import type { ProcessorContext, ProcessResult } from '@/types/tool';
import { embedStandardFont } from '@/lib/pdf/fontEmbed';

export type PageNumbersFormat = 'simple' | 'ofN' | 'page' | 'pageOfN';
export type PageNumbersPosition =
  | 'top-left'
  | 'top-center'
  | 'top-right'
  | 'bottom-left'
  | 'bottom-center'
  | 'bottom-right';

export interface PageNumbersOptions {
  format: PageNumbersFormat;
  startFrom: number;
  fontSize: number;
  position: PageNumbersPosition;
}

const MARGIN = 24;

function formatLabel(
  format: PageNumbersFormat,
  n: number,
  total: number,
): string {
  switch (format) {
    case 'simple':
      return `${n}`;
    case 'ofN':
      return `${n} / ${total}`;
    case 'page':
      return `Page ${n}`;
    case 'pageOfN':
      return `Page ${n} of ${total}`;
  }
}

export async function pageNumbersProcessor(
  ctx: ProcessorContext,
): Promise<ProcessResult> {
  const start = performance.now();
  const { PDFDocument, rgb } = await import('pdf-lib');
  const file = ctx.files[0];
  if (!file) throw new Error('No file provided.');
  const opts = ctx.options as PageNumbersOptions;

  const doc = await PDFDocument.load(file.arrayBuffer.slice(0));
  const font = await embedStandardFont(doc);
  const pages = doc.getPages();
  const total = pages.length;

  const startFrom = Math.max(0, Math.floor(opts.startFrom));
  const fontSize = opts.fontSize;
  const position = opts.position;

  for (let i = 0; i < pages.length; i++) {
    if (ctx.signal?.aborted) throw new Error('aborted');
    const page = pages[i];
    if (!page) continue;
    const n = startFrom + i;
    const label = formatLabel(opts.format, n, total);
    const { width, height } = page.getSize();
    const textWidth = font.widthOfTextAtSize(label, fontSize);

    let x: number;
    if (position.endsWith('-left')) {
      x = MARGIN;
    } else if (position.endsWith('-right')) {
      x = width - MARGIN - textWidth;
    } else {
      x = (width - textWidth) / 2;
    }

    const y = position.startsWith('top-')
      ? height - fontSize - MARGIN
      : MARGIN;

    page.drawText(label, {
      x,
      y,
      size: fontSize,
      font,
      color: rgb(0, 0, 0),
    });

    ctx.onProgress?.((i + 1) / Math.max(1, total), `Numbering page ${i + 1}`);
  }

  const bytes = await doc.save({ useObjectStreams: true, addDefaultPage: false });
  const blob = new Blob([bytes as BlobPart], { type: 'application/pdf' });

  return {
    outputs: [{ name: 'numbered.pdf', blob }],
    stats: {
      inputBytes: file.size,
      outputBytes: blob.size,
      durationMs: performance.now() - start,
    },
  };
}
