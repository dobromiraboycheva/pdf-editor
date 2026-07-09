import type { ProcessorContext, ProcessResult } from '@/types/tool';
import { stripMetadata } from '@/lib/pdf/stripMetadata';

function stripPdfExt(name: string): string {
  return name.replace(/\.pdf$/i, '');
}

export async function repairProcessor(
  ctx: ProcessorContext,
): Promise<ProcessResult> {
  const start = performance.now();
  if (ctx.files.length !== 1) {
    throw new Error('Repair requires exactly one input file.');
  }
  const file = ctx.files[0];
  if (!file) throw new Error('Repair requires exactly one input file.');

  const { PDFDocument } = await import('pdf-lib');

  // Try with the most forgiving flags pdf-lib exposes.
  ctx.onProgress?.(0.1, 'Loading with forgiving parser');
  let doc;
  try {
    doc = await PDFDocument.load(file.arrayBuffer.slice(0), {
      ignoreEncryption: true,
      throwOnInvalidObject: false,
      capNumbers: false,
      parseSpeed: 100, // maximum tolerance
    });
  } catch (e) {
    // Fallback: try to locate a PDF trailer manually and re-slice the bytes
    // so pdf-lib can reparse from the start of the "%PDF-" signature.
    const bytes = new Uint8Array(file.arrayBuffer);
    const pdfHeader = new TextEncoder().encode('%PDF-');
    let headerIdx = -1;
    for (let i = 0; i < Math.min(bytes.length - pdfHeader.length, 4096); i++) {
      let match = true;
      for (let j = 0; j < pdfHeader.length; j++) {
        if (bytes[i + j] !== pdfHeader[j]) {
          match = false;
          break;
        }
      }
      if (match) {
        headerIdx = i;
        break;
      }
    }
    if (headerIdx > 0) {
      try {
        doc = await PDFDocument.load(bytes.slice(headerIdx), {
          ignoreEncryption: true,
          throwOnInvalidObject: false,
          capNumbers: false,
          parseSpeed: 100,
        });
      } catch (err) {
        throw new Error(
          `Could not repair: ${(err as Error).message || (e as Error).message}`,
        );
      }
    } else {
      throw new Error(`Could not repair: ${(e as Error).message}`);
    }
  }

  ctx.onProgress?.(0.6, 'Rewriting');
  stripMetadata(doc);
  const bytes = await doc.save({
    useObjectStreams: true,
    updateFieldAppearances: false,
  });
  ctx.onProgress?.(1, 'Done');
  const blob = new Blob([bytes as BlobPart], { type: 'application/pdf' });
  const basename = stripPdfExt(file.name);

  return {
    outputs: [{ name: `${basename}-repaired.pdf`, blob }],
    stats: {
      inputBytes: file.arrayBuffer.byteLength,
      outputBytes: blob.size,
      durationMs: performance.now() - start,
    },
  };
}
