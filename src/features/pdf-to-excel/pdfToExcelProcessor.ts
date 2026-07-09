import type { ProcessorContext, ProcessResult } from '@/types/tool';

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

function stripPdfExt(name: string): string {
  return name.replace(/\.pdf$/i, '');
}

const Y_TOL = 2;
const COLUMN_GAP = 12;

interface Segment {
  x: number;
  right: number;
  text: string;
}

function escapeCsv(cell: string): string {
  if (/[",\r\n]/.test(cell)) {
    return `"${cell.replace(/"/g, '""')}"`;
  }
  return cell;
}

/**
 * Group items into rows by y-coordinate. Within a row, split into columns
 * where the horizontal gap between adjacent items exceeds COLUMN_GAP.
 */
function itemsToRows(items: PdfTextItem[]): string[][] {
  interface RowBucket {
    y: number;
    segments: Segment[];
  }

  const rows: RowBucket[] = [];
  for (const it of items) {
    const text = it.str;
    if (text.length === 0 || text.trim().length === 0) continue;
    const x = it.transform[4] ?? 0;
    const y = it.transform[5] ?? 0;
    const width = it.width || 0;

    let bucket = rows.find((r) => Math.abs(r.y - y) <= Y_TOL);
    if (!bucket) {
      bucket = { y, segments: [] };
      rows.push(bucket);
    }
    bucket.segments.push({ x, right: x + width, text });
  }

  rows.sort((a, b) => b.y - a.y);

  const out: string[][] = [];
  for (const row of rows) {
    row.segments.sort((a, b) => a.x - b.x);
    const cols: string[] = [];
    let curText = '';
    let curRight = -Infinity;
    for (const seg of row.segments) {
      if (curText === '') {
        curText = seg.text;
      } else if (seg.x - curRight > COLUMN_GAP) {
        cols.push(curText.trim());
        curText = seg.text;
      } else {
        const needsSpace =
          !curText.endsWith(' ') && !seg.text.startsWith(' ');
        curText += (needsSpace ? ' ' : '') + seg.text;
      }
      curRight = Math.max(curRight, seg.right);
    }
    if (curText) cols.push(curText.trim());
    if (cols.length > 0) out.push(cols);
  }
  return out;
}

export async function pdfToExcelProcessor(
  ctx: ProcessorContext,
): Promise<ProcessResult> {
  const start = performance.now();
  if (ctx.files.length !== 1) {
    throw new Error('PDF to Excel requires exactly one input file.');
  }
  const file = ctx.files[0];
  if (!file) throw new Error('PDF to Excel requires exactly one input file.');

  const allRows: string[][] = [];

  for (let i = 1; i <= file.pageCount; i++) {
    if (ctx.signal?.aborted) throw new Error('aborted');
    const page = await file.pdfjsDoc.getPage(i);
    const content = await page.getTextContent();
    const items = content.items.filter(isTextItem) as PdfTextItem[];
    const rows = itemsToRows(items);
    if (i > 1 && rows.length > 0) allRows.push([]);
    for (const row of rows) allRows.push(row);
    ctx.onProgress?.(i / file.pageCount, `Extracting page ${i}`);
  }

  const csv = allRows
    .map((r) => r.map(escapeCsv).join(','))
    .join('\r\n');
  // Prepend UTF-8 BOM (﻿) so Excel opens the file with correct encoding.
  const blob = new Blob(['﻿', csv], { type: 'text/csv;charset=utf-8' });
  const basename = stripPdfExt(file.name);

  return {
    outputs: [{ name: `${basename}.csv`, blob }],
    stats: {
      inputBytes: file.arrayBuffer.byteLength,
      outputBytes: blob.size,
      durationMs: performance.now() - start,
    },
  };
}
