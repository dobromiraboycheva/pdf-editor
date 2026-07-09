import { PDFDict, PDFName, type PDFDocument } from 'pdf-lib';

/**
 * Remove all identifying metadata from the document:
 *   - Info dict: Title, Author, Subject, Keywords, Producer, Creator.
 *   - Catalog `/Metadata` XMP stream (if present).
 *
 * Idempotent — safe to call on an already-stripped document.
 *
 * NOTE: on save, pdf-lib rewrites ModDate and (by default) Producer.
 * Callers who want a fully quiet Info dict should construct the document
 * with `updateMetadata: false` and save with the same options — this
 * helper only handles the fields that survive that path.
 */
export function stripMetadata(doc: PDFDocument): void {
  // --- Info dict fields ---------------------------------------------------
  const infoRef = doc.context.trailerInfo.Info;
  if (infoRef) {
    const info = doc.context.lookup(infoRef);
    if (info instanceof PDFDict) {
      info.delete(PDFName.Title);
      info.delete(PDFName.Author);
      info.delete(PDFName.Subject);
      info.delete(PDFName.Keywords);
      info.delete(PDFName.Producer);
      info.delete(PDFName.Creator);
    }
  }

  // --- Catalog /Metadata XMP stream --------------------------------------
  const metadataKey = PDFName.of('Metadata');
  const catalog = doc.catalog;
  if (catalog.has(metadataKey)) {
    catalog.delete(metadataKey);
  }
}
