import type { ProcessorContext, ProcessResult } from '@/types/tool';
import { embedImageIntoDoc } from '@/lib/pdf/imageEmbed';
import { embedStandardFont } from '@/lib/pdf/fontEmbed';

export type WatermarkPosition =
  | 'top-left'
  | 'top-center'
  | 'top-right'
  | 'middle-left'
  | 'center'
  | 'middle-right'
  | 'bottom-left'
  | 'bottom-center'
  | 'bottom-right';

export type WatermarkKind = 'text' | 'image';

export interface WatermarkOptions {
  kind: WatermarkKind;
  text?: string;
  fontSize?: number;
  colorHex?: string;
  opacity?: number;
  angleDeg?: number;
  position?: WatermarkPosition;
  image?: File;
  imageScale?: number;
}

interface RgbNormalized {
  r: number;
  g: number;
  b: number;
}

/**
 * Parse `#RRGGBB` or `#RGB` into normalized 0..1 RGB triples.
 * Falls back to red on invalid input.
 */
export function parseHexColor(hex: string): RgbNormalized {
  let value = hex.trim();
  if (value.startsWith('#')) value = value.slice(1);
  if (value.length === 3) {
    value = value
      .split('')
      .map((c) => c + c)
      .join('');
  }
  if (!/^[0-9a-fA-F]{6}$/.test(value)) {
    return { r: 1, g: 0, b: 0 };
  }
  const r = parseInt(value.slice(0, 2), 16) / 255;
  const g = parseInt(value.slice(2, 4), 16) / 255;
  const b = parseInt(value.slice(4, 6), 16) / 255;
  return { r, g, b };
}

const MARGIN = 24;

interface PlacedText {
  x: number;
  y: number;
}

function textAnchor(
  position: WatermarkPosition,
  pageWidth: number,
  pageHeight: number,
  textWidth: number,
  textHeight: number,
): PlacedText {
  let x: number;
  let y: number;
  if (position.startsWith('top-')) {
    y = pageHeight - MARGIN - textHeight;
  } else if (position.startsWith('bottom-')) {
    y = MARGIN;
  } else {
    y = (pageHeight - textHeight) / 2;
  }
  if (position.endsWith('-left')) {
    x = MARGIN;
  } else if (position.endsWith('-right')) {
    x = pageWidth - MARGIN - textWidth;
  } else {
    x = (pageWidth - textWidth) / 2;
  }
  return { x, y };
}

function imageAnchor(
  position: WatermarkPosition,
  pageWidth: number,
  pageHeight: number,
  imgWidth: number,
  imgHeight: number,
): PlacedText {
  let x: number;
  let y: number;
  if (position.startsWith('top-')) {
    y = pageHeight - MARGIN - imgHeight;
  } else if (position.startsWith('bottom-')) {
    y = MARGIN;
  } else {
    y = (pageHeight - imgHeight) / 2;
  }
  if (position.endsWith('-left')) {
    x = MARGIN;
  } else if (position.endsWith('-right')) {
    x = pageWidth - MARGIN - imgWidth;
  } else {
    x = (pageWidth - imgWidth) / 2;
  }
  return { x, y };
}

export async function watermarkProcessor(
  ctx: ProcessorContext,
): Promise<ProcessResult> {
  const start = performance.now();
  const { PDFDocument, rgb, degrees } = await import('pdf-lib');
  const file = ctx.files[0];
  if (!file) throw new Error('No file provided.');
  const opts = ctx.options as WatermarkOptions;

  const doc = await PDFDocument.load(file.arrayBuffer.slice(0));
  const pages = doc.getPages();
  const total = pages.length || 1;

  const kind = opts.kind;
  const opacity = Math.max(0, Math.min(1, opts.opacity ?? 0.3));
  const angleDeg = opts.angleDeg ?? -30;
  const position: WatermarkPosition = opts.position ?? 'center';

  if (kind === 'text') {
    const text = (opts.text ?? '').trim();
    if (!text) throw new Error('Watermark text is empty.');
    const size = opts.fontSize ?? 48;
    const color = parseHexColor(opts.colorHex ?? '#FF0000');
    const font = await embedStandardFont(doc);

    const textWidth = font.widthOfTextAtSize(text, size);
    const textHeight = font.heightAtSize(size);

    for (let i = 0; i < pages.length; i++) {
      if (ctx.signal?.aborted) throw new Error('aborted');
      const page = pages[i];
      if (!page) continue;
      const { width, height } = page.getSize();
      const { x, y } = textAnchor(position, width, height, textWidth, textHeight);
      page.drawText(text, {
        x,
        y,
        size,
        font,
        color: rgb(color.r, color.g, color.b),
        opacity,
        rotate: degrees(angleDeg),
      });
      ctx.onProgress?.((i + 1) / total, `Watermarking page ${i + 1} of ${total}`);
    }
  } else {
    if (!opts.image) throw new Error('No watermark image provided.');
    const img = await embedImageIntoDoc(doc, opts.image);
    const scaleFraction = Math.max(0.05, Math.min(1, opts.imageScale ?? 0.35));

    for (let i = 0; i < pages.length; i++) {
      if (ctx.signal?.aborted) throw new Error('aborted');
      const page = pages[i];
      if (!page) continue;
      const { width, height } = page.getSize();
      const shortest = Math.min(width, height);
      const targetLongest = shortest * scaleFraction * 2; // approximate max side
      const imgDims = img.scaleToFit(targetLongest, targetLongest);
      const { x, y } = imageAnchor(
        position,
        width,
        height,
        imgDims.width,
        imgDims.height,
      );
      page.drawImage(img, {
        x,
        y,
        width: imgDims.width,
        height: imgDims.height,
        opacity,
        rotate: degrees(angleDeg),
      });
      ctx.onProgress?.((i + 1) / total, `Watermarking page ${i + 1} of ${total}`);
    }
  }

  const bytes = await doc.save({ useObjectStreams: true, addDefaultPage: false });
  const blob = new Blob([bytes as BlobPart], { type: 'application/pdf' });

  return {
    outputs: [{ name: 'watermarked.pdf', blob }],
    stats: {
      inputBytes: file.size,
      outputBytes: blob.size,
      durationMs: performance.now() - start,
    },
  };
}
