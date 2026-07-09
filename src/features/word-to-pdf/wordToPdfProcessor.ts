import type { ProcessResult } from '@/types/tool';

export interface WordToPdfOptions {
  file: File;
  pageSize: 'a4' | 'letter';
}

interface PageDims {
  width: number;
  height: number;
}

interface StyledLine {
  text: string;
  size: number;
  bold: boolean;
  /** Extra top gap (pt) before this line. */
  topGap: number;
  /** Extra bottom gap (pt) after this line. */
  bottomGap: number;
}

const A4: PageDims = { width: 595, height: 842 };
const LETTER: PageDims = { width: 612, height: 792 };
const MARGIN = 48;
const BODY_SIZE = 12;
const LINE_HEIGHT = 16;

// Mammoth's typing is loose (buffer-oriented, Node-flavored). We only use the
// browser ArrayBuffer input path, so we describe just what we call.
interface MammothResult {
  value: string;
}
interface MammothLike {
  extractRawText: (input: { arrayBuffer: ArrayBuffer }) => Promise<MammothResult>;
  convertToHtml: (input: { arrayBuffer: ArrayBuffer }) => Promise<MammothResult>;
}

interface HtmlBlock {
  tag: 'h1' | 'h2' | 'h3' | 'p' | 'li';
  text: string;
}

/**
 * Parse mammoth's simple HTML output into an ordered list of block-level
 * chunks. Mammoth emits well-formed, tag-per-paragraph HTML for headings,
 * paragraphs, and list items, which is enough for a lightweight typesetter.
 */
function parseMammothHtml(html: string): HtmlBlock[] {
  const blocks: HtmlBlock[] = [];
  const re = /<(h[1-3]|p|li)(?:\s[^>]*)?>([\s\S]*?)<\/\1>/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html)) !== null) {
    const rawTag = match[1].toLowerCase();
    const tag =
      rawTag === 'h1' || rawTag === 'h2' || rawTag === 'h3'
        ? (rawTag as 'h1' | 'h2' | 'h3')
        : rawTag === 'li'
          ? 'li'
          : 'p';
    const inner = match[2]
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\s+/g, ' ')
      .trim();
    if (inner.length === 0) continue;
    blocks.push({ tag, text: inner });
  }
  return blocks;
}

/**
 * Word-wrap a string to a max pixel width, measuring via the embedded font.
 * Falls back to hard-splitting oversized tokens (e.g. URLs).
 */
function wrapText(
  text: string,
  maxWidth: number,
  size: number,
  measure: (s: string, size: number) => number,
): string[] {
  if (text === '') return [''];
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = '';

  const hardSplit = (word: string): string[] => {
    const chunks: string[] = [];
    let buf = '';
    for (const ch of word) {
      const candidate = buf + ch;
      if (measure(candidate, size) > maxWidth && buf !== '') {
        chunks.push(buf);
        buf = ch;
      } else {
        buf = candidate;
      }
    }
    if (buf !== '') chunks.push(buf);
    return chunks;
  };

  for (const word of words) {
    if (word === '') continue;
    if (measure(word, size) > maxWidth) {
      if (current !== '') {
        lines.push(current);
        current = '';
      }
      const parts = hardSplit(word);
      for (let i = 0; i < parts.length - 1; i++) lines.push(parts[i]);
      current = parts[parts.length - 1] ?? '';
      continue;
    }
    const candidate = current === '' ? word : `${current} ${word}`;
    if (measure(candidate, size) <= maxWidth) {
      current = candidate;
    } else {
      lines.push(current);
      current = word;
    }
  }
  if (current !== '') lines.push(current);
  return lines.length > 0 ? lines : [''];
}

export async function wordToPdfProcessor(
  options: WordToPdfOptions,
  onProgress?: (fraction: number, note?: string) => void,
  signal?: AbortSignal,
): Promise<ProcessResult> {
  const start = performance.now();

  onProgress?.(0.05, 'Reading DOCX…');
  const arrayBuffer = await options.file.arrayBuffer();
  if (signal?.aborted) throw new Error('aborted');

  const mammothModule = (await import('mammoth')) as unknown as {
    default?: MammothLike;
  } & Partial<MammothLike>;
  const mammoth: MammothLike =
    mammothModule.default ??
    ({
      extractRawText: mammothModule.extractRawText,
      convertToHtml: mammothModule.convertToHtml,
    } as MammothLike);

  onProgress?.(0.2, 'Parsing document…');
  // Try HTML first for heading detection; fall back to raw text if it fails.
  let blocks: HtmlBlock[] = [];
  try {
    const htmlResult = await mammoth.convertToHtml({ arrayBuffer });
    blocks = parseMammothHtml(htmlResult.value);
  } catch {
    blocks = [];
  }

  if (blocks.length === 0) {
    const rawResult = await mammoth.extractRawText({ arrayBuffer });
    const paragraphs = rawResult.value
      .split(/\r?\n/)
      .map((p) => p.trim())
      .filter((p) => p.length > 0);
    blocks = paragraphs.map((text) => ({ tag: 'p' as const, text }));
  }

  if (blocks.length === 0) {
    throw new Error('Document appears to be empty.');
  }

  if (signal?.aborted) throw new Error('aborted');

  onProgress?.(0.4, 'Typesetting…');
  const { PDFDocument, StandardFonts } = await import('pdf-lib');
  const doc = await PDFDocument.create();
  const regularFont = await doc.embedFont(StandardFonts.Helvetica);
  const boldFont = await doc.embedFont(StandardFonts.HelveticaBold);
  const dims = options.pageSize === 'letter' ? LETTER : A4;
  const contentWidth = dims.width - MARGIN * 2;

  const measure = (s: string, size: number, bold: boolean): number =>
    (bold ? boldFont : regularFont).widthOfTextAtSize(s, size);

  const styleForTag = (
    tag: HtmlBlock['tag'],
  ): { size: number; bold: boolean; topGap: number; bottomGap: number } => {
    switch (tag) {
      case 'h1':
        return { size: 22, bold: true, topGap: 12, bottomGap: 6 };
      case 'h2':
        return { size: 18, bold: true, topGap: 10, bottomGap: 4 };
      case 'h3':
        return { size: 14, bold: true, topGap: 8, bottomGap: 3 };
      case 'li':
        return { size: BODY_SIZE, bold: false, topGap: 0, bottomGap: 2 };
      case 'p':
      default:
        return { size: BODY_SIZE, bold: false, topGap: 0, bottomGap: 6 };
    }
  };

  const styledLines: StyledLine[] = [];
  for (const block of blocks) {
    const style = styleForTag(block.tag);
    const text = block.tag === 'li' ? `• ${block.text}` : block.text;
    const wrapped = wrapText(text, contentWidth, style.size, (s, sz) =>
      measure(s, sz, style.bold),
    );
    wrapped.forEach((line, idx) => {
      styledLines.push({
        text: line,
        size: style.size,
        bold: style.bold,
        topGap: idx === 0 ? style.topGap : 0,
        bottomGap: idx === wrapped.length - 1 ? style.bottomGap : 0,
      });
    });
  }

  // Paginate. Cap advancement so a truly oversized line still moves the cursor.
  const lineAdvance = (line: StyledLine): number =>
    Math.max(LINE_HEIGHT, line.size + 4);

  let page = doc.addPage([dims.width, dims.height]);
  let y = dims.height - MARGIN;
  const bottomLimit = MARGIN;

  const newPage = (): void => {
    page = doc.addPage([dims.width, dims.height]);
    y = dims.height - MARGIN;
  };

  for (let i = 0; i < styledLines.length; i++) {
    if (signal?.aborted) throw new Error('aborted');
    const line = styledLines[i];
    // Apply top gap (skip if we're already at the top of a fresh page).
    if (y < dims.height - MARGIN && line.topGap > 0) {
      y -= line.topGap;
    }
    const advance = lineAdvance(line);
    if (y - advance < bottomLimit) {
      newPage();
    }
    if (line.text.length > 0) {
      page.drawText(line.text, {
        x: MARGIN,
        y: y - line.size,
        size: line.size,
        font: line.bold ? boldFont : regularFont,
      });
    }
    y -= advance;
    if (line.bottomGap > 0) {
      y -= line.bottomGap;
    }
    if ((i & 15) === 0) {
      onProgress?.(0.4 + (0.55 * (i + 1)) / styledLines.length, 'Typesetting…');
    }
  }

  onProgress?.(0.95, 'Saving PDF…');
  const bytes = await doc.save({ useObjectStreams: true });
  const blob = new Blob([bytes as BlobPart], { type: 'application/pdf' });

  return {
    outputs: [{ name: 'document.pdf', blob }],
    stats: {
      inputBytes: options.file.size,
      outputBytes: blob.size,
      durationMs: performance.now() - start,
    },
  };
}
