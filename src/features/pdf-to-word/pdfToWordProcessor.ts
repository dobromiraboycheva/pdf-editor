import type { ProcessorContext, ProcessResult } from '@/types/tool';
import type {
  TextItem,
  TextMarkedContent,
} from 'pdfjs-dist/types/src/display/api';

interface Para {
  text: string;
  fontSize?: number;
}

function isTextItem(x: TextItem | TextMarkedContent): x is TextItem {
  return 'str' in x && 'transform' in x;
}

function stripPdfExt(name: string): string {
  return name.replace(/\.pdf$/i, '');
}

const PAGE_BREAK_MARKER = '__PAGE_BREAK__';

export async function pdfToWordProcessor(
  ctx: ProcessorContext,
): Promise<ProcessResult> {
  const start = performance.now();
  if (ctx.files.length !== 1) {
    throw new Error('PDF to Word requires exactly one input file.');
  }
  const file = ctx.files[0];
  if (!file) throw new Error('PDF to Word requires exactly one input file.');

  const pdfjsDoc = file.pdfjsDoc;
  const { Document, Packer, Paragraph, TextRun, PageBreak } = await import(
    'docx'
  );

  // Extract text per page, grouped into paragraphs by Y-position.
  const allParagraphs: Para[] = [];

  for (let i = 1; i <= file.pageCount; i++) {
    if (ctx.signal?.aborted) throw new Error('aborted');
    ctx.onProgress?.((i - 1) / file.pageCount, `Reading page ${i}`);

    const page = await pdfjsDoc.getPage(i);
    const content = await page.getTextContent();
    const items = content.items as (TextItem | TextMarkedContent)[];

    // Group items by Y with 2pt tolerance.
    interface LinePart {
      x: number;
      str: string;
      height: number;
    }
    interface Line {
      y: number;
      parts: LinePart[];
    }
    const lines: Line[] = [];
    for (const item of items) {
      if (!isTextItem(item)) continue;
      const str = item.str;
      const transform = item.transform;
      if (!str || !transform) continue;
      const x = transform[4] ?? 0;
      const y = transform[5] ?? 0;
      const height = item.height || 12;
      const existing = lines.find((l) => Math.abs(l.y - y) < 2);
      if (existing) existing.parts.push({ x, str, height });
      else lines.push({ y, parts: [{ x, str, height }] });
    }
    lines.sort((a, b) => b.y - a.y); // top to bottom
    for (const line of lines) {
      line.parts.sort((a, b) => a.x - b.x);
      const text = line.parts
        .map((p) => p.str)
        .join(' ')
        .trim();
      if (!text) continue;
      const avgHeight =
        line.parts.reduce((s, p) => s + p.height, 0) / line.parts.length;
      allParagraphs.push({ text, fontSize: avgHeight });
    }

    // Add page-break marker between pages (all but last).
    if (i < file.pageCount) allParagraphs.push({ text: PAGE_BREAK_MARKER });
  }

  ctx.onProgress?.(0.9, 'Building DOCX…');

  // Detect a "body" font size (median). Anything > body * 1.3 → heading.
  const sizes = allParagraphs
    .filter((p) => p.fontSize && p.text !== PAGE_BREAK_MARKER)
    .map((p) => p.fontSize as number);
  sizes.sort((a, b) => a - b);
  const bodySize =
    sizes.length > 0 ? (sizes[Math.floor(sizes.length / 2)] ?? 11) : 11;

  // Build docx Paragraphs.
  const paragraphs = allParagraphs.map((p) => {
    if (p.text === PAGE_BREAK_MARKER) {
      return new Paragraph({
        children: [new PageBreak()],
      });
    }
    const isHeading =
      p.fontSize !== undefined && p.fontSize > bodySize * 1.3;
    // docx sizes are in half-points (so 22 = 11pt).
    const sizeHalfPt = isHeading
      ? Math.round(Math.min(48, Math.max(24, (p.fontSize ?? 11) * 2)))
      : 22;
    return new Paragraph({
      children: [
        new TextRun({
          text: p.text,
          bold: isHeading,
          size: sizeHalfPt,
        }),
      ],
      spacing: { after: isHeading ? 200 : 120 },
    });
  });

  const doc = new Document({
    sections: [{ properties: {}, children: paragraphs }],
  });

  const blob = await Packer.toBlob(doc);
  const basename = stripPdfExt(file.name);

  return {
    outputs: [{ name: `${basename}.docx`, blob }],
    stats: {
      inputBytes: file.arrayBuffer.byteLength,
      outputBytes: blob.size,
      durationMs: performance.now() - start,
    },
  };
}
