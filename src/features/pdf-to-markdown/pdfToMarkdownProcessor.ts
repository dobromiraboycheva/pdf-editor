import type { ProcessorContext, ProcessResult } from '@/types/tool';

// pdf.js text items: import as a type-only alias so we can be explicit without
// pulling `any` into our code.
interface PdfTextItem {
  str: string;
  transform: number[];
  height: number;
  width: number;
  hasEOL: boolean;
}

function isTextItem(x: unknown): x is PdfTextItem {
  if (typeof x !== 'object' || x === null) return false;
  const o = x as { str?: unknown; transform?: unknown };
  return typeof o.str === 'string' && Array.isArray(o.transform);
}

interface Line {
  y: number;
  height: number; // approx font size
  text: string;
}

function stripPdfExt(name: string): string {
  return name.replace(/\.pdf$/i, '');
}

function escapeMd(text: string): string {
  // Minimal markdown escape for safe body text.
  return text.replace(/([\\`*_{}\[\]()#+\-!>])/g, '\\$1');
}

/**
 * Group text items into lines by y-coordinate proximity.
 * Then infer heading levels from font size relative to the body baseline.
 */
function itemsToLines(items: PdfTextItem[]): Line[] {
  const Y_TOL = 2;
  const lines: Line[] = [];
  let cur: Line | null = null;
  for (const it of items) {
    const y = it.transform[5] ?? 0;
    const height = Math.abs(it.height || it.transform[3] || 0);
    if (!cur || Math.abs(y - cur.y) > Y_TOL) {
      if (cur) lines.push(cur);
      cur = { y, height, text: it.str };
    } else {
      // Same line: append with a space if either side doesn't already have one.
      const needsSpace =
        cur.text.length > 0 &&
        !cur.text.endsWith(' ') &&
        !it.str.startsWith(' ');
      cur.text += (needsSpace ? ' ' : '') + it.str;
      // Take the tallest glyph as the line height.
      if (height > cur.height) cur.height = height;
    }
    if (it.hasEOL && cur) {
      lines.push(cur);
      cur = null;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

function inferHeadingLevel(
  lineHeight: number,
  bodyMedian: number,
): 0 | 1 | 2 | 3 {
  if (bodyMedian <= 0) return 0;
  const ratio = lineHeight / bodyMedian;
  if (ratio >= 1.6) return 1;
  if (ratio >= 1.3) return 2;
  if (ratio >= 1.15) return 3;
  return 0;
}

function median(nums: number[]): number {
  if (nums.length === 0) return 0;
  const sorted = nums.slice().sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2
    : sorted[mid] ?? 0;
}

export async function pdfToMarkdownProcessor(
  ctx: ProcessorContext,
): Promise<ProcessResult> {
  const start = performance.now();
  if (ctx.files.length !== 1) {
    throw new Error('PDF to Markdown requires exactly one input file.');
  }
  const file = ctx.files[0];
  if (!file) throw new Error('PDF to Markdown requires exactly one input file.');

  const pdfjsDoc = file.pdfjsDoc;
  const chunks: string[] = [];

  for (let i = 1; i <= file.pageCount; i++) {
    if (ctx.signal?.aborted) throw new Error('aborted');
    const page = await pdfjsDoc.getPage(i);
    const content = await page.getTextContent();
    const items = content.items.filter(isTextItem) as PdfTextItem[];
    // pdf.js emits items top-down in reading order; sort by y descending (pdf
    // coordinate space has y=0 at bottom) so higher-on-page comes first.
    items.sort((a, b) => (b.transform[5] ?? 0) - (a.transform[5] ?? 0));

    const lines = itemsToLines(items);
    const bodyMedian = median(
      lines.map((l) => l.height).filter((h) => h > 0),
    );

    for (const line of lines) {
      const text = line.text.trim();
      if (!text) continue;
      const level = inferHeadingLevel(line.height, bodyMedian);
      if (level > 0) {
        chunks.push(`${'#'.repeat(level)} ${escapeMd(text)}\n`);
      } else {
        chunks.push(`${escapeMd(text)}\n`);
      }
    }

    if (i < file.pageCount) chunks.push('\n---\n');
    else chunks.push('\n');
    ctx.onProgress?.(i / file.pageCount, `Extracting page ${i}`);
  }

  const md = chunks.join('\n');
  const blob = new Blob([md], { type: 'text/markdown' });
  const basename = stripPdfExt(file.name);

  return {
    outputs: [{ name: `${basename}.md`, blob }],
    stats: {
      inputBytes: file.arrayBuffer.byteLength,
      outputBytes: blob.size,
      durationMs: performance.now() - start,
    },
  };
}
