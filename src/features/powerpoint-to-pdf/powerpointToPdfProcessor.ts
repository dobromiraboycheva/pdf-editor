import JSZip from 'jszip';
import type { ProcessResult } from '@/types/tool';

export interface PowerpointToPdfOptions {
  file: File;
}

interface SlideText {
  index: number;
  title: string;
  body: string[];
}

// PPT default slide size: 10 x 7.5 inches at 72dpi = 720 x 540 pt.
const SLIDE_WIDTH = 720;
const SLIDE_HEIGHT = 540;
const MARGIN = 48;
const TITLE_SIZE = 26;
const TITLE_LINE_HEIGHT = 32;
const BODY_SIZE = 14;
const BODY_LINE_HEIGHT = 20;

/**
 * Order slide files by their trailing number so `slide2` beats `slide10`.
 */
function slideOrderKey(path: string): number {
  const m = /slide(\d+)\.xml$/i.exec(path);
  return m && m[1] ? Number.parseInt(m[1], 10) : 0;
}

/**
 * Extract every `<a:t>` text node from a slide XML. Each text node is one
 * "run". We group runs by their enclosing `<a:p>` paragraph so each paragraph
 * becomes one line — the first paragraph is treated as the slide title and
 * the rest are body lines.
 */
function extractSlideText(xml: string): { title: string; body: string[] } {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xml, 'application/xml');
  if (doc.querySelector('parsererror')) return { title: '', body: [] };

  // Grab every paragraph in document order — DOMParser handles namespaces so
  // we match on local name via getElementsByTagName which returns qualified
  // names in XML mode.
  const paragraphs = Array.from(doc.getElementsByTagName('a:p'));
  const lines: string[] = [];
  for (const p of paragraphs) {
    const runs = Array.from(p.getElementsByTagName('a:t'));
    const text = runs.map((t) => t.textContent ?? '').join('').trim();
    if (text.length > 0) lines.push(text);
  }
  if (lines.length === 0) return { title: '', body: [] };
  const [first, ...rest] = lines;
  return { title: first ?? '', body: rest };
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

function wrapLine(text: string, maxWidth: number, charWidth: number): string[] {
  const maxChars = Math.max(1, Math.floor(maxWidth / charWidth));
  if (text.length <= maxChars) return [text];
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    if (word.length > maxChars) {
      if (current !== '') {
        lines.push(current);
        current = '';
      }
      for (let i = 0; i < word.length; i += maxChars) {
        const chunk = word.slice(i, i + maxChars);
        if (chunk.length === maxChars) lines.push(chunk);
        else current = chunk;
      }
      continue;
    }
    const candidate = current === '' ? word : `${current} ${word}`;
    if (candidate.length <= maxChars) current = candidate;
    else {
      lines.push(current);
      current = word;
    }
  }
  if (current !== '') lines.push(current);
  return lines.length > 0 ? lines : [''];
}

export async function powerpointToPdfProcessor(
  options: PowerpointToPdfOptions,
  onProgress?: (fraction: number, note?: string) => void,
  signal?: AbortSignal,
): Promise<ProcessResult> {
  const start = performance.now();
  onProgress?.(0.05, 'Reading presentation…');

  const arrayBuffer = await options.file.arrayBuffer();
  const inputBytes = arrayBuffer.byteLength;

  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(arrayBuffer);
  } catch (e) {
    throw new Error(`Not a valid PPTX file: ${(e as Error).message}`);
  }

  const slidePaths = Object.keys(zip.files)
    .filter((p) => /^ppt\/slides\/slide\d+\.xml$/i.test(p))
    .sort((a, b) => slideOrderKey(a) - slideOrderKey(b));

  if (slidePaths.length === 0) {
    throw new Error('No slides found in the file.');
  }

  onProgress?.(0.2, 'Extracting slide text…');
  const slides: SlideText[] = [];
  for (let i = 0; i < slidePaths.length; i++) {
    if (signal?.aborted) throw new Error('aborted');
    const path = slidePaths[i];
    if (!path) continue;
    const file = zip.file(path);
    if (!file) continue;
    const xml = await file.async('string');
    const { title, body } = extractSlideText(xml);
    slides.push({ index: i + 1, title, body });
  }

  const { PDFDocument, StandardFonts } = await import('pdf-lib');
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const boldFont = await doc.embedFont(StandardFonts.HelveticaBold);

  const contentWidth = SLIDE_WIDTH - MARGIN * 2;
  const titleCharWidth = boldFont.widthOfTextAtSize('M', TITLE_SIZE);
  const bodyCharWidth = font.widthOfTextAtSize('M', BODY_SIZE);

  for (let s = 0; s < slides.length; s++) {
    if (signal?.aborted) throw new Error('aborted');
    const slide = slides[s];
    if (!slide) continue;
    const page = doc.addPage([SLIDE_WIDTH, SLIDE_HEIGHT]);
    let y = SLIDE_HEIGHT - MARGIN;

    // Slide-number caption in the top-right corner.
    const caption = `Slide ${slide.index}`;
    const captionWidth = font.widthOfTextAtSize(caption, 9);
    page.drawText(sanitizeForWinAnsi(caption), {
      x: SLIDE_WIDTH - MARGIN - captionWidth,
      y: SLIDE_HEIGHT - MARGIN + 8,
      size: 9,
      font,
    });

    if (slide.title) {
      const titleLines = wrapLine(slide.title, contentWidth, titleCharWidth);
      for (const line of titleLines) {
        if (y < MARGIN + TITLE_LINE_HEIGHT) break;
        page.drawText(sanitizeForWinAnsi(line), {
          x: MARGIN,
          y: y - TITLE_SIZE,
          size: TITLE_SIZE,
          font: boldFont,
        });
        y -= TITLE_LINE_HEIGHT;
      }
      y -= 12; // gap after title
    }

    for (const bodyLine of slide.body) {
      if (y < MARGIN + BODY_LINE_HEIGHT) break;
      const bullet = `• ${bodyLine}`;
      const wrapped = wrapLine(bullet, contentWidth, bodyCharWidth);
      for (let i = 0; i < wrapped.length; i++) {
        if (y < MARGIN + BODY_LINE_HEIGHT) break;
        const line = wrapped[i] ?? '';
        // Hanging indent for wrapped continuation lines.
        const x = i === 0 ? MARGIN : MARGIN + 12;
        page.drawText(sanitizeForWinAnsi(line), {
          x,
          y: y - BODY_SIZE,
          size: BODY_SIZE,
          font,
        });
        y -= BODY_LINE_HEIGHT;
      }
    }

    onProgress?.(0.2 + (0.75 * (s + 1)) / slides.length, `Rendering slide ${s + 1}`);
  }

  onProgress?.(0.95, 'Saving PDF…');
  const bytes = await doc.save({ useObjectStreams: true });
  const blob = new Blob([bytes as BlobPart], { type: 'application/pdf' });

  const baseName = options.file.name.replace(/\.[^.]+$/, '') || 'presentation';

  return {
    outputs: [{ name: `${baseName}.pdf`, blob }],
    stats: {
      inputBytes,
      outputBytes: blob.size,
      durationMs: performance.now() - start,
    },
  };
}
