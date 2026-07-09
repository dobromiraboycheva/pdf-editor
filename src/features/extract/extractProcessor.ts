import type { ProcessorContext, ProcessResult } from '@/types/tool';
import { parsePageRanges } from '@/lib/pdf/pageRangeParse';

export interface ExtractOptions {
  rangesSpec: string;
}

function stripPdfExt(name: string): string {
  return name.replace(/\.pdf$/i, '');
}

export async function extractProcessor(
  ctx: ProcessorContext,
): Promise<ProcessResult> {
  const start = performance.now();
  if (ctx.files.length !== 1) {
    throw new Error('Extract requires exactly one input file.');
  }
  const file = ctx.files[0];
  if (!file) throw new Error('Extract requires exactly one input file.');

  const options = ctx.options as ExtractOptions;
  const parsed = parsePageRanges(options.rangesSpec ?? '', file.pageCount);
  if (!parsed.ok || !parsed.indices || parsed.indices.length === 0) {
    throw new Error(parsed.error ?? 'Invalid page ranges.');
  }

  const { PDFDocument } = await import('pdf-lib');
  const out = await PDFDocument.create();

  const indices = parsed.indices;
  ctx.onProgress?.(0, 'Copying pages');
  const copied = await out.copyPages(file.pdfLibDoc, indices);
  for (let i = 0; i < copied.length; i++) {
    if (ctx.signal?.aborted) throw new Error('aborted');
    const page = copied[i];
    if (page) out.addPage(page);
    ctx.onProgress?.((i + 1) / copied.length, `Adding page ${i + 1}`);
  }

  const bytes = await out.save({ useObjectStreams: true });
  const blob = new Blob([bytes as BlobPart], { type: 'application/pdf' });
  const basename = stripPdfExt(file.name);

  return {
    outputs: [{ name: `${basename}-extracted.pdf`, blob }],
    stats: {
      inputBytes: file.arrayBuffer.byteLength,
      outputBytes: blob.size,
      durationMs: performance.now() - start,
    },
  };
}
