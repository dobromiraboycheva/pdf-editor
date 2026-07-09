import { PDFDocument } from 'pdf-lib';

/**
 * Load a PDFDocument from raw bytes. Does not silently accept encrypted PDFs.
 */
export function loadFromBytes(
  bytes: Uint8Array | ArrayBuffer,
): Promise<PDFDocument> {
  return PDFDocument.load(bytes, { ignoreEncryption: false });
}

/**
 * Create an empty PDFDocument — used as the accumulator for merge output.
 */
export function createEmpty(): Promise<PDFDocument> {
  return PDFDocument.create();
}
