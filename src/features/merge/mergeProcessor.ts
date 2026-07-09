import type { ProcessorContext, ProcessResult } from '@/types/tool';

export async function mergeProcessor(ctx: ProcessorContext): Promise<ProcessResult> {
  const start = performance.now();
  const { PDFDocument } = await import('pdf-lib');
  const merged = await PDFDocument.create();

  const inputBytes = ctx.files.reduce((a, f) => a + f.arrayBuffer.byteLength, 0);
  const totalPages = ctx.files.reduce((a, f) => a + f.pageCount, 0);
  let progress = 0;

  for (const file of ctx.files) {
    if (ctx.signal?.aborted) throw new Error('aborted');
    const pageIndices = file.pdfLibDoc.getPageIndices();
    const copied = await merged.copyPages(file.pdfLibDoc, pageIndices);
    for (const p of copied) {
      merged.addPage(p);
      progress++;
      ctx.onProgress?.(progress / totalPages, `Merging ${file.name}`);
    }
  }

  const bytes = await merged.save({ useObjectStreams: true });
  // TS 5.5's lib.dom narrows Blob parts to `ArrayBufferView<ArrayBuffer>`, and pdf-lib's
  // `save()` returns `Uint8Array<ArrayBufferLike>`. The cast is safe at runtime.
  const blob = new Blob([bytes as BlobPart], { type: 'application/pdf' });
  return {
    outputs: [{ name: 'merged.pdf', blob }],
    stats: {
      inputBytes,
      outputBytes: blob.size,
      durationMs: performance.now() - start,
    },
  };
}
