import type { PDFDocument } from 'pdf-lib';
import type { IngestedPdf } from '@/types/tool';

/**
 * Build an {@link IngestedPdf}-shaped object from a pdf-lib document for use in
 * unit tests of the structural processors (merge/split/rotate/extract).
 *
 * Those processors only touch `pdfLibDoc`, `arrayBuffer`, `pageCount`, `name`,
 * `size`, and `id`. `pdfjsDoc` is required by the interface but never read by
 * these pure pdf-lib code paths, so we cast a placeholder — pdf.js needs a DOM
 * / worker and cannot run under the Node test environment.
 */
export async function makeIngested(
  doc: PDFDocument,
  name = 'test.pdf',
): Promise<IngestedPdf> {
  const bytes = await doc.save({ useObjectStreams: true });
  // Copy into a fresh, exact-length ArrayBuffer so byteLength is meaningful.
  const arrayBuffer = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;

  return {
    id: `${name}::${arrayBuffer.byteLength}`,
    name,
    size: arrayBuffer.byteLength,
    arrayBuffer,
    pdfLibDoc: doc,
    // pdf.js document is unused by structural processors; see note above.
    pdfjsDoc: {} as never,
    pageCount: doc.getPageCount(),
  };
}
