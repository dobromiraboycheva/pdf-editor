import { PDFDocument, EncryptedPDFError } from 'pdf-lib';
import * as pdfjs from 'pdfjs-dist';
import workerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import type { IngestedPdf } from '@/types/tool';

// Configure the pdf.js worker exactly once at module load.
// Vite's `?url` import resolves to a URL served alongside the app.
pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;

/**
 * Compute a stable id for a File based on name/size/lastModified.
 * Deterministic and cheap; good enough for dedup within a session.
 */
export function computeFileId(file: File): string {
  return `${file.name}::${file.size}::${file.lastModified}`;
}

/**
 * Read the given PDF file into memory and open it with both pdf-lib and pdf.js.
 * Both libraries consume the underlying ArrayBuffer, so each receives its own
 * copy via `.slice(0)`. The returned IngestedPdf.arrayBuffer is a third copy
 * kept intact for downstream consumers.
 *
 * Throws a friendly error for password-protected PDFs.
 */
export async function ingestPdfFile(file: File): Promise<IngestedPdf> {
  const arrayBuffer = await file.arrayBuffer();

  let pdfLibDoc: PDFDocument;
  let isEncrypted = false;
  try {
    pdfLibDoc = await PDFDocument.load(arrayBuffer.slice(0), {
      ignoreEncryption: false,
    });
  } catch (err) {
    if (err instanceof EncryptedPDFError) {
      // The file is encrypted — load it in "ignore encryption" mode so
      // downstream tools (Unlock PDF) can still receive the raw bytes and
      // handle decryption themselves. Other tools may not work on the
      // resulting doc, but that's a user-side decision.
      isEncrypted = true;
      try {
        pdfLibDoc = await PDFDocument.load(arrayBuffer.slice(0), {
          ignoreEncryption: true,
        });
      } catch {
        throw new Error(
          "This PDF is password-protected. Use the Unlock tool with the password.",
        );
      }
    } else {
      throw err;
    }
  }
  // Silence unused-var warning if we later need to expose this
  void isEncrypted;

  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(arrayBuffer.slice(0)),
  });
  const pdfjsDoc = await loadingTask.promise;

  return {
    id: computeFileId(file),
    name: file.name,
    size: file.size,
    arrayBuffer,
    pdfLibDoc,
    pdfjsDoc,
    pageCount: pdfLibDoc.getPageCount(),
  };
}
