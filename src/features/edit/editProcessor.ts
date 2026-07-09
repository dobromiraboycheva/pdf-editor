import type { ProcessorContext, ProcessResult } from '@/types/tool';
import { registerFontkit } from '@/lib/pdf/fontEmbed';
import { embedImageIntoDoc } from '@/lib/pdf/imageEmbed';
import { StandardFonts, type PDFFont } from 'pdf-lib';
import type {
  Annotation,
  ArrowAnnotation,
  EllipseAnnotation,
  FreehandAnnotation,
  HighlightAnnotation,
  ImageAnnotation,
  LineAnnotation,
  RectAnnotation,
  TextAnnotation,
} from './annotationTypes';

export interface EditOptions {
  annotations: Annotation[];
}

interface RgbNormalized {
  r: number;
  g: number;
  b: number;
}

/** Parse `#RRGGBB` / `#RGB` into 0..1 RGB. Falls back to black on invalid input. */
function parseHex(hex: string): RgbNormalized {
  let value = hex.trim();
  if (value.startsWith('#')) value = value.slice(1);
  if (value.length === 3) {
    value = value
      .split('')
      .map((c) => c + c)
      .join('');
  }
  if (!/^[0-9a-fA-F]{6}$/.test(value)) return { r: 0, g: 0, b: 0 };
  return {
    r: parseInt(value.slice(0, 2), 16) / 255,
    g: parseInt(value.slice(2, 4), 16) / 255,
    b: parseInt(value.slice(4, 6), 16) / 255,
  };
}

/** Y-flip: our store uses top-left origin, pdf-lib uses bottom-left. */
function flipY(pageHeight: number, topY: number): number {
  return pageHeight - topY;
}

interface DrawContext {
  page: import('pdf-lib').PDFPage;
  pageHeight: number;
  rgb: (r: number, g: number, b: number) => import('pdf-lib').RGB;
}

function pickFontKey(
  family: TextAnnotation['fontFamily'],
  bold: boolean,
  italic: boolean,
): StandardFonts {
  if (family === 'Times') {
    if (bold && italic) return StandardFonts.TimesRomanBoldItalic;
    if (bold) return StandardFonts.TimesRomanBold;
    if (italic) return StandardFonts.TimesRomanItalic;
    return StandardFonts.TimesRoman;
  }
  if (family === 'Courier') {
    if (bold && italic) return StandardFonts.CourierBoldOblique;
    if (bold) return StandardFonts.CourierBold;
    if (italic) return StandardFonts.CourierOblique;
    return StandardFonts.Courier;
  }
  // Helvetica default
  if (bold && italic) return StandardFonts.HelveticaBoldOblique;
  if (bold) return StandardFonts.HelveticaBold;
  if (italic) return StandardFonts.HelveticaOblique;
  return StandardFonts.Helvetica;
}

function drawText(
  ann: TextAnnotation,
  ctx: DrawContext,
  font: PDFFont,
) {
  const c = parseHex(ann.colorHex);
  const text = ann.text ?? '';
  if (!text) return;
  const align = ann.alignment ?? 'left';
  const boxWidth = ann.width && ann.width > 0 ? ann.width : undefined;
  const underline = ann.underline === true;
  // pdf-lib's drawText places (x, y) at the baseline. We want the box to
  // start at our stored top-left, so we shift y down by one line.
  const ascent = font.heightAtSize(ann.fontSize);
  const baselineY = flipY(ctx.pageHeight, ann.y + ascent);
  const lineHeight = font.heightAtSize(ann.fontSize) * 1.2;
  const color = ctx.rgb(c.r, c.g, c.b);
  // Underline offset below the baseline (typographic convention: ~10% of size).
  const underlineOffset = ann.fontSize * 0.12;
  const underlineThickness = Math.max(0.5, ann.fontSize * 0.06);

  const drawOneLine = (line: string, baseline: number) => {
    const lineWidth = font.widthOfTextAtSize(line, ann.fontSize);
    let x = ann.x;
    if (boxWidth !== undefined) {
      if (align === 'center') x = ann.x + (boxWidth - lineWidth) / 2;
      else if (align === 'right') x = ann.x + (boxWidth - lineWidth);
    }
    ctx.page.drawText(line, {
      x,
      y: baseline,
      size: ann.fontSize,
      font,
      color,
    });
    if (underline && line.length > 0) {
      ctx.page.drawLine({
        start: { x, y: baseline - underlineOffset },
        end: { x: x + lineWidth, y: baseline - underlineOffset },
        thickness: underlineThickness,
        color,
      });
    }
  };

  if (boxWidth !== undefined) {
    // Simple word-wrap.
    const words = text.split(/\s+/);
    let line = '';
    let currentY = baselineY;
    for (const word of words) {
      const attempt = line ? `${line} ${word}` : word;
      const w = font.widthOfTextAtSize(attempt, ann.fontSize);
      if (w > boxWidth && line) {
        drawOneLine(line, currentY);
        line = word;
        currentY -= lineHeight;
      } else {
        line = attempt;
      }
    }
    if (line) drawOneLine(line, currentY);
    return;
  }

  // No wrap — respect explicit newlines.
  const lines = text.split('\n');
  let currentY = baselineY;
  for (const line of lines) {
    drawOneLine(line, currentY);
    currentY -= lineHeight;
  }
}

async function drawImage(
  ann: ImageAnnotation,
  ctx: DrawContext,
  doc: import('pdf-lib').PDFDocument,
) {
  const blob = ann.fileBlob;
  if (!blob) return; // no bytes preserved — skip
  const img = await embedImageIntoDoc(doc, blob);
  // pdf-lib's drawImage x/y is bottom-left of the image.
  ctx.page.drawImage(img, {
    x: ann.x,
    y: flipY(ctx.pageHeight, ann.y + ann.height),
    width: ann.width,
    height: ann.height,
  });
}

function drawRect(ann: RectAnnotation, ctx: DrawContext) {
  const stroke = parseHex(ann.strokeHex);
  const fill = ann.fillHex ? parseHex(ann.fillHex) : undefined;
  ctx.page.drawRectangle({
    x: ann.x,
    y: flipY(ctx.pageHeight, ann.y + ann.height),
    width: ann.width,
    height: ann.height,
    borderColor: ctx.rgb(stroke.r, stroke.g, stroke.b),
    borderWidth: ann.strokeWidth,
    color: fill ? ctx.rgb(fill.r, fill.g, fill.b) : undefined,
    opacity: fill ? ann.opacity : undefined,
    borderOpacity: ann.opacity,
  });
}

function drawEllipse(ann: EllipseAnnotation, ctx: DrawContext) {
  const stroke = parseHex(ann.strokeHex);
  const fill = ann.fillHex ? parseHex(ann.fillHex) : undefined;
  const cx = ann.x + ann.width / 2;
  const cyTop = ann.y + ann.height / 2;
  ctx.page.drawEllipse({
    x: cx,
    y: flipY(ctx.pageHeight, cyTop),
    xScale: ann.width / 2,
    yScale: ann.height / 2,
    borderColor: ctx.rgb(stroke.r, stroke.g, stroke.b),
    borderWidth: ann.strokeWidth,
    color: fill ? ctx.rgb(fill.r, fill.g, fill.b) : undefined,
    opacity: fill ? ann.opacity : undefined,
    borderOpacity: ann.opacity,
  });
}

function drawLine(ann: LineAnnotation, ctx: DrawContext) {
  const c = parseHex(ann.strokeHex);
  ctx.page.drawLine({
    start: { x: ann.x1, y: flipY(ctx.pageHeight, ann.y1) },
    end: { x: ann.x2, y: flipY(ctx.pageHeight, ann.y2) },
    thickness: ann.strokeWidth,
    color: ctx.rgb(c.r, c.g, c.b),
    opacity: ann.opacity,
  });
}

function drawArrow(ann: ArrowAnnotation, ctx: DrawContext) {
  const c = parseHex(ann.strokeHex);
  const color = ctx.rgb(c.r, c.g, c.b);
  const sx = ann.x1;
  const sy = flipY(ctx.pageHeight, ann.y1);
  const ex = ann.x2;
  const ey = flipY(ctx.pageHeight, ann.y2);

  ctx.page.drawLine({
    start: { x: sx, y: sy },
    end: { x: ex, y: ey },
    thickness: ann.strokeWidth,
    color,
    opacity: ann.opacity,
  });

  // Arrowhead: two short segments at ±30° from the reverse direction.
  const dx = ex - sx;
  const dy = ey - sy;
  const len = Math.hypot(dx, dy);
  if (len < 0.5) return;
  const headLen = Math.max(10, ann.strokeWidth * 3);
  const angle = Math.atan2(dy, dx);
  const a1 = angle + Math.PI - Math.PI / 6;
  const a2 = angle + Math.PI + Math.PI / 6;
  const h1x = ex + Math.cos(a1) * headLen;
  const h1y = ey + Math.sin(a1) * headLen;
  const h2x = ex + Math.cos(a2) * headLen;
  const h2y = ey + Math.sin(a2) * headLen;
  ctx.page.drawLine({
    start: { x: ex, y: ey },
    end: { x: h1x, y: h1y },
    thickness: ann.strokeWidth,
    color,
    opacity: ann.opacity,
  });
  ctx.page.drawLine({
    start: { x: ex, y: ey },
    end: { x: h2x, y: h2y },
    thickness: ann.strokeWidth,
    color,
    opacity: ann.opacity,
  });
}

function drawFreehand(ann: FreehandAnnotation, ctx: DrawContext) {
  const c = parseHex(ann.strokeHex);
  const color = ctx.rgb(c.r, c.g, c.b);
  // Draw as many small pdf-lib line segments — simpler and more reliable
  // than fighting pdf-lib's SVG-path coordinate flipping.
  const pts = ann.points;
  if (pts.length < 2) return;
  for (let i = 1; i < pts.length; i++) {
    const p0 = pts[i - 1];
    const p1 = pts[i];
    if (!p0 || !p1) continue;
    ctx.page.drawLine({
      start: { x: p0.x, y: flipY(ctx.pageHeight, p0.y) },
      end: { x: p1.x, y: flipY(ctx.pageHeight, p1.y) },
      thickness: ann.strokeWidth,
      color,
      opacity: ann.opacity,
    });
  }
}

function drawHighlight(ann: HighlightAnnotation, ctx: DrawContext) {
  const c = parseHex(ann.colorHex);
  ctx.page.drawRectangle({
    x: ann.x,
    y: flipY(ctx.pageHeight, ann.y + ann.height),
    width: ann.width,
    height: ann.height,
    color: ctx.rgb(c.r, c.g, c.b),
    opacity: 0.4,
  });
}

export async function editProcessor(
  ctx: ProcessorContext,
): Promise<ProcessResult> {
  const start = performance.now();
  const { PDFDocument, rgb } = await import('pdf-lib');
  const file = ctx.files[0];
  if (!file) throw new Error('No file provided.');
  const opts = ctx.options as EditOptions;
  const annotations = opts.annotations ?? [];

  // pdf-lib consumed the original ArrayBuffer at ingest time, so we
  // reload from a fresh slice to guarantee an unattached buffer.
  const doc = await PDFDocument.load(file.arrayBuffer.slice(0));
  registerFontkit(doc);

  // Cache embedded Standard fonts across annotations so we embed each
  // variant (Helvetica-Bold, Times-Italic, ...) at most once per save.
  const fontCache = new Map<StandardFonts, PDFFont>();
  const getFont = async (key: StandardFonts): Promise<PDFFont> => {
    const cached = fontCache.get(key);
    if (cached) return cached;
    const f = await doc.embedFont(key);
    fontCache.set(key, f);
    return f;
  };

  const pages = doc.getPages();

  // Group by page so we can report progress meaningfully.
  const byPage = new Map<number, Annotation[]>();
  for (const a of annotations) {
    const list = byPage.get(a.pageIndex);
    if (list) list.push(a);
    else byPage.set(a.pageIndex, [a]);
  }

  const totalPages = pages.length || 1;
  for (let pi = 0; pi < pages.length; pi++) {
    if (ctx.signal?.aborted) throw new Error('aborted');
    const list = byPage.get(pi);
    if (!list || list.length === 0) {
      ctx.onProgress?.((pi + 1) / totalPages);
      continue;
    }
    const page = pages[pi];
    if (!page) continue;
    const { height } = page.getSize();
    const drawCtx: DrawContext = { page, pageHeight: height, rgb };

    for (const ann of list) {
      switch (ann.kind) {
        case 'highlight':
          drawHighlight(ann, drawCtx);
          break;
        case 'rect':
          drawRect(ann, drawCtx);
          break;
        case 'ellipse':
          drawEllipse(ann, drawCtx);
          break;
        case 'line':
          drawLine(ann, drawCtx);
          break;
        case 'arrow':
          drawArrow(ann, drawCtx);
          break;
        case 'freehand':
          drawFreehand(ann, drawCtx);
          break;
        case 'text': {
          const fontKey = pickFontKey(
            ann.fontFamily,
            ann.bold === true,
            ann.italic === true,
          );
          const f = await getFont(fontKey);
          drawText(ann, drawCtx, f);
          break;
        }
        case 'image':
          await drawImage(ann, drawCtx, doc);
          break;
      }
    }
    ctx.onProgress?.((pi + 1) / totalPages, `Saving page ${pi + 1} of ${totalPages}`);
  }

  const bytes = await doc.save({ useObjectStreams: true, addDefaultPage: false });
  const blob = new Blob([bytes as BlobPart], { type: 'application/pdf' });

  return {
    outputs: [{ name: 'edited.pdf', blob }],
    stats: {
      inputBytes: file.size,
      outputBytes: blob.size,
      durationMs: performance.now() - start,
    },
  };
}
