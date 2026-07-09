import fontkit from '@pdf-lib/fontkit';
import { StandardFonts, type PDFDocument, type PDFFont } from 'pdf-lib';

// pdf-lib doesn't expose whether fontkit has already been registered on a
// document, but the `registerFontkit` call itself is a cheap setter. We
// track the docs we've touched in a WeakSet so callers can invoke this
// repeatedly without penalty.
const registered = new WeakSet<PDFDocument>();

/**
 * Register `@pdf-lib/fontkit` on the given document. Idempotent — safe to
 * call every time you're about to embed a font.
 */
export function registerFontkit(doc: PDFDocument): void {
  if (registered.has(doc)) return;
  doc.registerFontkit(fontkit);
  registered.add(doc);
}

/**
 * Embed the default font for M2 tools: pdf-lib's built-in Helvetica
 * (WinAnsi encoding).
 *
 * In a later milestone we can swap this for a bundled Noto Sans TTF (via
 * `doc.embedFont(bytes, { subset: true })`) without changing callers —
 * the return type stays `PDFFont` and fontkit is already registered.
 */
export async function embedStandardFont(doc: PDFDocument): Promise<PDFFont> {
  registerFontkit(doc);
  return doc.embedFont(StandardFonts.Helvetica);
}
