import type { ProcessResult } from '@/types/tool';

export interface HtmlToPdfOptions {
  source: 'url' | 'html';
  url?: string;
  html?: string;
  pageSize: 'a4' | 'letter';
}

interface PageDims {
  width: number;
  height: number;
}

const A4: PageDims = { width: 595, height: 842 };
const LETTER: PageDims = { width: 612, height: 792 };
const MARGIN = 48;
const FONT_SIZE = 11;
const LINE_HEIGHT = 14;

/**
 * Strip HTML tags to plain text. Preserves paragraph structure by mapping
 * common block-level tags to newlines before stripping. Also decodes a
 * handful of common HTML entities. This is intentionally light — client-side
 * HTML→PDF requires a headless browser for anything better.
 */
function htmlToPlainText(html: string): string {
  return (
    html
      // Drop scripts and styles entirely (including their contents).
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
      // Block-level → newline.
      .replace(/<\/(p|div|section|article|header|footer|li|tr|h[1-6])>/gi, '\n')
      .replace(/<br\s*\/?>(?!\n)/gi, '\n')
      .replace(/<li[^>]*>/gi, '• ')
      // Strip remaining tags.
      .replace(/<[^>]+>/g, '')
      // Decode common entities.
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      // Collapse excessive blank lines.
      .replace(/[ \t]+/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
  );
}

function wrapLine(
  text: string,
  maxWidth: number,
  charWidth: number,
): string[] {
  if (text === '') return [''];
  const maxChars = Math.max(1, Math.floor(maxWidth / charWidth));
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    if (word.length > maxChars) {
      // Hard-wrap very long tokens (e.g. URLs).
      if (current !== '') {
        lines.push(current);
        current = '';
      }
      for (let i = 0; i < word.length; i += maxChars) {
        const chunk = word.slice(i, i + maxChars);
        if (chunk.length === maxChars) {
          lines.push(chunk);
        } else {
          current = chunk;
        }
      }
      continue;
    }
    const candidate = current === '' ? word : `${current} ${word}`;
    if (candidate.length <= maxChars) {
      current = candidate;
    } else {
      lines.push(current);
      current = word;
    }
  }
  if (current !== '') lines.push(current);
  return lines.length > 0 ? lines : [''];
}

/**
 * Fetch remote HTML with graceful fallbacks:
 *   1. Native fetch — works only for CORS-permissive origins.
 *   2. Public read-only CORS proxy (r.jina.ai) — works for most public pages,
 *      returns Markdown-ish text but we don't care since we strip HTML anyway.
 *      Free, no key needed, no data stored.
 *
 * If both fail, we surface a clear message telling the user to paste
 * HTML directly (which always works).
 */
async function fetchRemoteHtml(
  url: string,
  signal?: AbortSignal,
): Promise<string> {
  // Strategy 1: direct fetch (only works for CORS-permissive origins).
  try {
    const response = await fetch(url, { signal, mode: 'cors' });
    if (response.ok) return await response.text();
  } catch {
    // fall through
  }

  // Strategy 2: public read-only proxy that returns cleaned text.
  // r.jina.ai is a free, no-auth proxy that returns readable content of any URL.
  try {
    const proxied = `https://r.jina.ai/${url}`;
    const response = await fetch(proxied, { signal });
    if (response.ok) return await response.text();
  } catch {
    // fall through
  }

  throw new Error('CORS_BLOCKED');
}

export async function htmlToPdfProcessor(
  options: HtmlToPdfOptions,
  onProgress?: (fraction: number, note?: string) => void,
  signal?: AbortSignal,
): Promise<ProcessResult> {
  const start = performance.now();
  const { PDFDocument, StandardFonts } = await import('pdf-lib');

  let sourceHtml = '';
  if (options.source === 'url') {
    const url = (options.url ?? '').trim();
    if (!url) throw new Error('A URL is required.');
    if (!/^https?:\/\//i.test(url)) {
      throw new Error('URL must start with http:// or https://');
    }
    onProgress?.(0.05, 'Fetching URL…');
    try {
      sourceHtml = await fetchRemoteHtml(url, signal);
    } catch (e) {
      if ((e as Error).message === 'CORS_BLOCKED') {
        throw new Error(
          'This site blocks cross-origin requests (CORS). Please open the page in your browser, copy its HTML (View → Developer → View Source), and paste it into the HTML field below.',
        );
      }
      throw new Error(`Could not fetch URL: ${(e as Error).message}`);
    }
  } else {
    sourceHtml = options.html ?? '';
  }

  if (sourceHtml.trim().length === 0) {
    throw new Error('No HTML content to convert.');
  }

  onProgress?.(0.2, 'Extracting text…');
  const text = htmlToPlainText(sourceHtml);
  const paragraphs = text.split(/\n/);

  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const dims = options.pageSize === 'letter' ? LETTER : A4;
  const contentWidth = dims.width - MARGIN * 2;
  // Approximate character width for Helvetica at FONT_SIZE — used only to
  // decide wrap points; actual drawing uses the real font metrics via drawText.
  const charWidth = font.widthOfTextAtSize('M', FONT_SIZE);

  // Collect wrapped lines.
  const lines: string[] = [];
  for (const para of paragraphs) {
    if (signal?.aborted) throw new Error('aborted');
    if (para.trim() === '') {
      lines.push('');
      continue;
    }
    for (const wrapped of wrapLine(para, contentWidth, charWidth)) {
      lines.push(wrapped);
    }
  }

  const linesPerPage = Math.max(
    1,
    Math.floor((dims.height - MARGIN * 2) / LINE_HEIGHT),
  );
  const pageCount = Math.max(1, Math.ceil(lines.length / linesPerPage));

  for (let p = 0; p < pageCount; p++) {
    if (signal?.aborted) throw new Error('aborted');
    const page = doc.addPage([dims.width, dims.height]);
    const pageLines = lines.slice(p * linesPerPage, (p + 1) * linesPerPage);
    let y = dims.height - MARGIN;
    for (const line of pageLines) {
      page.drawText(line, {
        x: MARGIN,
        y,
        size: FONT_SIZE,
        font,
      });
      y -= LINE_HEIGHT;
    }
    onProgress?.(0.2 + (0.8 * (p + 1)) / pageCount, `Rendering page ${p + 1}`);
  }

  const bytes = await doc.save({ useObjectStreams: true });
  const blob = new Blob([bytes as BlobPart], { type: 'application/pdf' });

  return {
    outputs: [{ name: 'webpage.pdf', blob }],
    stats: {
      inputBytes: sourceHtml.length,
      outputBytes: blob.size,
      durationMs: performance.now() - start,
    },
  };
}
