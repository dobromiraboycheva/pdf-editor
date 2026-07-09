import type { PDFDocument, PDFImage } from 'pdf-lib';

/**
 * Embed an image (PNG or JPG) into the given document.
 *
 * Type is detected from the byte header: PNGs start with 0x89 0x50 ("‰P"),
 * JPEGs start with 0xFF 0xD8. We fall back to the Blob's `type` if the
 * header doesn't match a known signature.
 */
export async function embedImageIntoDoc(
  doc: PDFDocument,
  source: File | Blob,
): Promise<PDFImage> {
  const bytes = new Uint8Array(await source.arrayBuffer());
  const kind = detectImageKind(bytes, source.type);

  switch (kind) {
    case 'png':
      return doc.embedPng(bytes);
    case 'jpg':
      return doc.embedJpg(bytes);
    default:
      throw new Error(
        'Unsupported image format. Only PNG and JPEG are supported.',
      );
  }
}

type ImageKind = 'png' | 'jpg' | 'unknown';

function detectImageKind(bytes: Uint8Array, mime: string): ImageKind {
  // PNG magic: 89 50 4E 47 0D 0A 1A 0A
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    return 'png';
  }
  // JPEG SOI marker: FF D8, and the file ends with FF D9 — we only sniff SOI.
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    return 'jpg';
  }
  // Fall back to the MIME hint.
  if (mime === 'image/png') return 'png';
  if (mime === 'image/jpeg' || mime === 'image/jpg') return 'jpg';
  return 'unknown';
}
