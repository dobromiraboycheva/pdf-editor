import type { ProcessorContext, ProcessResult } from '@/types/tool';
import type { RotateAngle } from './useRotateStore';

export interface RotateOptions {
  /** Map: 0-based pageIndex → rotation to APPLY (degrees clockwise, one of 0/90/180/270). */
  pageRotations: Record<number, RotateAngle>;
}

function stripPdfExt(name: string): string {
  return name.replace(/\.pdf$/i, '');
}

export async function rotateProcessor(
  ctx: ProcessorContext,
): Promise<ProcessResult> {
  const start = performance.now();
  if (ctx.files.length !== 1) {
    throw new Error('Rotate requires exactly one input file.');
  }
  const file = ctx.files[0];
  if (!file) throw new Error('Rotate requires exactly one input file.');

  const options = ctx.options as RotateOptions;
  const { PDFDocument, degrees } = await import('pdf-lib');

  const out = await PDFDocument.create();
  const indices = file.pdfLibDoc.getPageIndices();
  const copied = await out.copyPages(file.pdfLibDoc, indices);

  for (let i = 0; i < copied.length; i++) {
    if (ctx.signal?.aborted) throw new Error('aborted');
    const page = copied[i];
    if (!page) continue;
    out.addPage(page);
    const apply = options.pageRotations[i] ?? 0;
    if (apply !== 0) {
      const current = page.getRotation().angle;
      const next = (((current + apply) % 360) + 360) % 360;
      page.setRotation(degrees(next));
    }
    ctx.onProgress?.((i + 1) / copied.length, `Rotating page ${i + 1}`);
  }

  const bytes = await out.save({ useObjectStreams: true });
  const blob = new Blob([bytes as BlobPart], { type: 'application/pdf' });
  const basename = stripPdfExt(file.name);

  return {
    outputs: [{ name: `${basename}-rotated.pdf`, blob }],
    stats: {
      inputBytes: file.arrayBuffer.byteLength,
      outputBytes: blob.size,
      durationMs: performance.now() - start,
    },
  };
}
