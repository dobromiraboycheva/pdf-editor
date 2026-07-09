import type { PDFDocument } from 'pdf-lib';

/**
 * Serialize a PDFDocument to raw bytes with object streams enabled.
 * Prefer this when you need to hand the bytes off to something other than
 * a browser download — e.g. embedding into a ZIP.
 */
export async function saveDocumentBytes(doc: PDFDocument): Promise<Uint8Array> {
  return doc.save({ useObjectStreams: true });
}

/**
 * Serialize a PDFDocument to a Blob with `application/pdf` MIME type.
 * Uses object streams for a smaller output.
 */
export async function saveDocument(doc: PDFDocument): Promise<Blob> {
  const bytes = await saveDocumentBytes(doc);
  // pdf-lib returns Uint8Array; cast to BlobPart to sidestep the
  // lib.dom.d.ts SharedArrayBuffer narrowing quirk.
  return new Blob([bytes as BlobPart], { type: 'application/pdf' });
}
