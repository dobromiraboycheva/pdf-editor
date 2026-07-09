import JSZip from 'jszip';
import type { PDFFont, PDFPage } from 'pdf-lib';
import type { ProcessResult } from '@/types/tool';

export interface ExcelToPdfOptions {
  file: File;
  pageSize: 'a4' | 'letter';
  orientation: 'portrait' | 'landscape';
}

interface PageDims {
  width: number;
  height: number;
}

interface SheetData {
  name: string;
  rows: string[][];
}

const A4: PageDims = { width: 595, height: 842 };
const LETTER: PageDims = { width: 612, height: 792 };
const MARGIN = 32;
const FONT_SIZE = 9;
const ROW_H = 18;
const HEADER_H = 22;
const CELL_PAD = 4;
const TITLE_SIZE = 14;
const MAX_COLS = 20;

/**
 * Decode the small set of XML entities that appear in OOXML text nodes.
 * OOXML uses a plain set (no HTML entities), so this covers the common cases.
 */
function decodeXmlEntities(text: string): string {
  return text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

/**
 * Parse `xl/sharedStrings.xml`. Each `<si>` element contains one shared string;
 * its text may be split across multiple `<t>` runs (e.g. rich text).
 */
function parseSharedStrings(xml: string): string[] {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xml, 'application/xml');
  const parserError = doc.querySelector('parsererror');
  if (parserError) return [];
  const items = Array.from(doc.getElementsByTagName('si'));
  return items.map((si) => {
    const runs = Array.from(si.getElementsByTagName('t'));
    return runs.map((t) => t.textContent ?? '').join('');
  });
}

/**
 * Parse a cell reference like "AB12" → { col: 27, row: 11 } (0-indexed).
 */
function parseCellRef(ref: string): { col: number; row: number } | null {
  const match = /^([A-Z]+)(\d+)$/.exec(ref);
  if (!match) return null;
  const letters = match[1] ?? '';
  const digits = match[2] ?? '';
  let col = 0;
  for (let i = 0; i < letters.length; i++) {
    col = col * 26 + (letters.charCodeAt(i) - 64);
  }
  return { col: col - 1, row: Number.parseInt(digits, 10) - 1 };
}

/**
 * Parse a `xl/worksheets/sheet*.xml` document into a 2D array of cell values.
 * Cell values are resolved against the shared strings table when the cell's
 * `t` attribute is `"s"` (shared string) or `"inlineStr"` (embedded `<is>`).
 */
function parseSheet(xml: string, sharedStrings: string[]): string[][] {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xml, 'application/xml');
  const parserError = doc.querySelector('parsererror');
  if (parserError) return [];

  const rowEls = Array.from(doc.getElementsByTagName('row'));
  const rows: string[][] = [];
  let maxCol = 0;

  for (const rowEl of rowEls) {
    const rIdxAttr = rowEl.getAttribute('r');
    const rIdx = rIdxAttr ? Number.parseInt(rIdxAttr, 10) - 1 : rows.length;
    if (Number.isNaN(rIdx) || rIdx < 0) continue;
    while (rows.length <= rIdx) rows.push([]);
    const row = rows[rIdx];
    if (!row) continue;

    const cellEls = Array.from(rowEl.getElementsByTagName('c'));
    let cellCol = 0;
    for (const cellEl of cellEls) {
      const ref = cellEl.getAttribute('r');
      let col = cellCol;
      if (ref) {
        const parsed = parseCellRef(ref);
        if (parsed) col = parsed.col;
      }
      const type = cellEl.getAttribute('t') ?? 'n';
      let value = '';
      if (type === 's') {
        const vEl = cellEl.getElementsByTagName('v')[0];
        const idx = vEl ? Number.parseInt(vEl.textContent ?? '', 10) : NaN;
        if (!Number.isNaN(idx) && idx >= 0 && idx < sharedStrings.length) {
          value = sharedStrings[idx] ?? '';
        }
      } else if (type === 'inlineStr') {
        const isEl = cellEl.getElementsByTagName('is')[0];
        if (isEl) {
          const runs = Array.from(isEl.getElementsByTagName('t'));
          value = runs.map((t) => t.textContent ?? '').join('');
        }
      } else if (type === 'str' || type === 'b' || type === 'e') {
        const vEl = cellEl.getElementsByTagName('v')[0];
        value = vEl?.textContent ?? '';
        if (type === 'b') value = value === '1' ? 'TRUE' : 'FALSE';
      } else {
        // Numeric or default — take raw value.
        const vEl = cellEl.getElementsByTagName('v')[0];
        value = vEl?.textContent ?? '';
      }
      while (row.length <= col) row.push('');
      row[col] = value;
      if (col + 1 > maxCol) maxCol = col + 1;
      cellCol = col + 1;
    }
  }

  // Pad every row to the same length so downstream layout is uniform.
  for (const row of rows) {
    while (row.length < maxCol) row.push('');
  }
  return rows;
}

/**
 * Parse `xl/workbook.xml` to obtain the ordered list of sheet names and their
 * `r:id` references, which the `.rels` file maps back to worksheet paths.
 */
function parseWorkbookSheets(
  workbookXml: string,
  relsXml: string,
): { name: string; target: string }[] {
  const parser = new DOMParser();
  const wb = parser.parseFromString(workbookXml, 'application/xml');
  const rels = parser.parseFromString(relsXml, 'application/xml');
  const sheetEls = Array.from(wb.getElementsByTagName('sheet'));
  const relMap = new Map<string, string>();
  for (const rel of Array.from(rels.getElementsByTagName('Relationship'))) {
    const id = rel.getAttribute('Id');
    const target = rel.getAttribute('Target');
    if (id && target) relMap.set(id, target);
  }
  const result: { name: string; target: string }[] = [];
  for (const s of sheetEls) {
    const name = s.getAttribute('name') ?? '';
    const rid =
      s.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id') ??
      s.getAttribute('r:id') ??
      '';
    const target = rid ? relMap.get(rid) : undefined;
    if (target) {
      // Targets are relative to xl/, e.g. "worksheets/sheet1.xml".
      const normalized = target.startsWith('/')
        ? target.slice(1)
        : `xl/${target.replace(/^\.\//, '')}`;
      result.push({ name, target: normalized });
    }
  }
  return result;
}

async function parseXlsxSheets(zip: JSZip): Promise<SheetData[]> {
  const sharedStringsFile = zip.file('xl/sharedStrings.xml');
  const sharedStrings = sharedStringsFile
    ? parseSharedStrings(decodeXmlEntities(await sharedStringsFile.async('string')))
    : [];

  const workbookFile = zip.file('xl/workbook.xml');
  const workbookRelsFile = zip.file('xl/_rels/workbook.xml.rels');
  const sheetRefs =
    workbookFile && workbookRelsFile
      ? parseWorkbookSheets(
          await workbookFile.async('string'),
          await workbookRelsFile.async('string'),
        )
      : [];

  const sheets: SheetData[] = [];
  if (sheetRefs.length > 0) {
    for (let i = 0; i < sheetRefs.length; i++) {
      const ref = sheetRefs[i];
      if (!ref) continue;
      const file = zip.file(ref.target);
      if (!file) continue;
      const xml = await file.async('string');
      sheets.push({ name: ref.name || `Sheet${i + 1}`, rows: parseSheet(xml, sharedStrings) });
    }
  } else {
    // Fallback: enumerate worksheets in the archive directly.
    const worksheetFiles = Object.keys(zip.files)
      .filter((p) => /^xl\/worksheets\/sheet\d+\.xml$/i.test(p))
      .sort();
    for (let i = 0; i < worksheetFiles.length; i++) {
      const path = worksheetFiles[i];
      if (!path) continue;
      const file = zip.file(path);
      if (!file) continue;
      const xml = await file.async('string');
      sheets.push({ name: `Sheet${i + 1}`, rows: parseSheet(xml, sharedStrings) });
    }
  }
  return sheets;
}

/**
 * Sanitize a string for a WinAnsi (Helvetica) font: pdf-lib will throw if it
 * encounters glyphs the standard font can't encode (e.g. emoji, CJK). Replace
 * anything outside the printable Latin-1 range with '?'.
 */
function sanitizeForWinAnsi(text: string): string {
  let out = '';
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 0;
    if (code === 9 || code === 10) {
      out += ' ';
    } else if (code >= 32 && code <= 255) {
      out += ch;
    } else {
      out += '?';
    }
  }
  return out;
}

/**
 * Truncate `s` so that it fits in `w` points when rendered in `f` at FONT_SIZE.
 * Falls back to an ellipsis suffix when the full string doesn't fit.
 */
function fitToWidth(s: string, w: number, f: PDFFont): string {
  const clean = sanitizeForWinAnsi(s);
  if (w <= 0) return '';
  if (f.widthOfTextAtSize(clean, FONT_SIZE) <= w) return clean;
  // Binary search for the max prefix length that fits alongside an ellipsis.
  let lo = 0;
  let hi = clean.length;
  while (lo < hi) {
    const mid = Math.floor((lo + hi + 1) / 2);
    const test = `${clean.slice(0, mid)}...`;
    if (f.widthOfTextAtSize(test, FONT_SIZE) <= w) lo = mid;
    else hi = mid - 1;
  }
  return `${clean.slice(0, lo)}...`;
}

export async function excelToPdfProcessor(
  options: ExcelToPdfOptions,
  onProgress?: (fraction: number, note?: string) => void,
  signal?: AbortSignal,
): Promise<ProcessResult> {
  const start = performance.now();
  onProgress?.(0.05, 'Reading workbook...');

  const arrayBuffer = await options.file.arrayBuffer();
  const inputBytes = arrayBuffer.byteLength;

  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(arrayBuffer);
  } catch (e) {
    throw new Error(`Not a valid XLSX file: ${(e as Error).message}`);
  }

  onProgress?.(0.2, 'Extracting cells...');
  const sheets = await parseXlsxSheets(zip);
  if (sheets.length === 0) {
    throw new Error('No worksheets found in the file.');
  }

  const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib');
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const boldFont = await doc.embedFont(StandardFonts.HelveticaBold);

  const base = options.pageSize === 'letter' ? LETTER : A4;
  const dims: PageDims =
    options.orientation === 'landscape'
      ? { width: base.height, height: base.width }
      : base;

  const contentWidth = dims.width - MARGIN * 2;
  const gridColor = rgb(0.85, 0.85, 0.85);
  const borderColor = rgb(0.5, 0.5, 0.5);
  const headerFill = rgb(0.93, 0.93, 0.93);
  const noticeColor = rgb(0.4, 0.4, 0.4);

  for (let si = 0; si < sheets.length; si++) {
    if (signal?.aborted) throw new Error('aborted');
    const sheet = sheets[si];
    if (!sheet || sheet.rows.length === 0) continue;

    const rawCols = sheet.rows.reduce((m, r) => Math.max(m, r.length), 0);
    if (rawCols === 0) continue;
    const maxCols = Math.min(rawCols, MAX_COLS);
    const truncated = rawCols > maxCols;
    const colWidth = contentWidth / maxCols;
    const tableRight = MARGIN + colWidth * maxCols;

    let page: PDFPage = doc.addPage([dims.width, dims.height]);
    let y = dims.height - MARGIN;

    const drawSheetTitle = (title: string): void => {
      page.drawText(fitToWidth(title, contentWidth, boldFont), {
        x: MARGIN,
        y: y - TITLE_SIZE,
        size: TITLE_SIZE,
        font: boldFont,
      });
      y -= TITLE_SIZE + 8;
    };

    const drawTruncationNotice = (): void => {
      const text = `(Showing first ${maxCols} of ${rawCols} columns)`;
      page.drawText(fitToWidth(text, contentWidth, font), {
        x: MARGIN,
        y: y - 10,
        size: 8,
        font,
        color: noticeColor,
      });
      y -= 14;
    };

    const headerRow = sheet.rows[0] ?? [];
    const drawHeader = (): void => {
      // Light-gray background fill for the header band.
      page.drawRectangle({
        x: MARGIN,
        y: y - HEADER_H,
        width: colWidth * maxCols,
        height: HEADER_H,
        color: headerFill,
      });
      // Header text per column.
      for (let c = 0; c < maxCols; c++) {
        const cell = headerRow[c] ?? '';
        page.drawText(fitToWidth(cell, colWidth - 2 * CELL_PAD, boldFont), {
          x: MARGIN + c * colWidth + CELL_PAD,
          y: y - HEADER_H + 7,
          size: FONT_SIZE,
          font: boldFont,
        });
      }
      // Vertical column separators.
      for (let c = 0; c <= maxCols; c++) {
        page.drawLine({
          start: { x: MARGIN + c * colWidth, y },
          end: { x: MARGIN + c * colWidth, y: y - HEADER_H },
          thickness: 0.5,
          color: borderColor,
        });
      }
      // Top + bottom borders of the header band.
      page.drawLine({
        start: { x: MARGIN, y },
        end: { x: tableRight, y },
        thickness: 0.75,
        color: borderColor,
      });
      page.drawLine({
        start: { x: MARGIN, y: y - HEADER_H },
        end: { x: tableRight, y: y - HEADER_H },
        thickness: 0.75,
        color: borderColor,
      });
      y -= HEADER_H;
    };

    drawSheetTitle(sheet.name);
    if (truncated) drawTruncationNotice();
    drawHeader();

    for (let r = 1; r < sheet.rows.length; r++) {
      if (signal?.aborted) throw new Error('aborted');

      // Page break: start a fresh page, redraw title (continued) + header row.
      if (y - ROW_H < MARGIN) {
        page = doc.addPage([dims.width, dims.height]);
        y = dims.height - MARGIN;
        drawSheetTitle(`${sheet.name} (continued)`);
        drawHeader();
      }

      const row = sheet.rows[r] ?? [];
      // Cell text.
      for (let c = 0; c < maxCols; c++) {
        const cell = row[c] ?? '';
        if (cell === '') continue;
        page.drawText(fitToWidth(cell, colWidth - 2 * CELL_PAD, font), {
          x: MARGIN + c * colWidth + CELL_PAD,
          y: y - ROW_H + 6,
          size: FONT_SIZE,
          font,
        });
      }
      // Vertical column separators (thin gray) inside the row band.
      for (let c = 0; c <= maxCols; c++) {
        page.drawLine({
          start: { x: MARGIN + c * colWidth, y },
          end: { x: MARGIN + c * colWidth, y: y - ROW_H },
          thickness: 0.3,
          color: gridColor,
        });
      }
      // Bottom horizontal separator of the row.
      page.drawLine({
        start: { x: MARGIN, y: y - ROW_H },
        end: { x: tableRight, y: y - ROW_H },
        thickness: 0.3,
        color: gridColor,
      });
      y -= ROW_H;
    }

    onProgress?.(0.2 + (0.7 * (si + 1)) / sheets.length, `Rendering ${sheet.name}`);
  }

  onProgress?.(0.95, 'Saving PDF...');
  const bytes = await doc.save({ useObjectStreams: true });
  const blob = new Blob([bytes as BlobPart], { type: 'application/pdf' });

  const baseName = options.file.name.replace(/\.[^.]+$/, '') || 'workbook';

  return {
    outputs: [{ name: `${baseName}.pdf`, blob }],
    stats: {
      inputBytes,
      outputBytes: blob.size,
      durationMs: performance.now() - start,
    },
  };
}
