import type { ProcessorContext, ProcessResult } from '@/types/tool';
import {
  compressImagesInDoc,
  type CompressLevel,
} from '@/lib/pdf/compressImages';
import { stripMetadata } from '@/lib/pdf/stripMetadata';

export interface CompressOptions {
  level: CompressLevel;
}

export async function compressProcessor(
  ctx: ProcessorContext,
): Promise<ProcessResult> {
  const start = performance.now();
  const { PDFDocument } = await import('pdf-lib');
  const file = ctx.files[0];
  if (!file) throw new Error('No file provided.');
  // Load a fresh copy so we don't mutate the cached ctx.files[0].pdfLibDoc.
  const doc = await PDFDocument.load(file.arrayBuffer.slice(0));
  const opts = ctx.options as CompressOptions;

  ctx.onProgress?.(0.05, 'Analyzing document…');
  stripMetadata(doc);

  await compressImagesInDoc(
    doc,
    opts.level,
    (f, n) => ctx.onProgress?.(0.1 + f * 0.8, n),
    ctx.signal,
  );

  ctx.onProgress?.(0.95, 'Writing PDF…');
  const bytes = await doc.save({ useObjectStreams: true, addDefaultPage: false });
  const blob = new Blob([bytes as BlobPart], { type: 'application/pdf' });

  return {
    outputs: [{ name: 'compressed.pdf', blob }],
    stats: {
      inputBytes: file.size,
      outputBytes: blob.size,
      durationMs: performance.now() - start,
    },
  };
}
