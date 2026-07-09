import type { ProcessorContext, ProcessResult } from '@/types/tool';
import { BLANK_PAGE_MARKER, type OrganizeRotation } from './useOrganizeStore';

export interface OrganizeOptions {
  pageOrder: number[];
  rotations: Record<number, OrganizeRotation>;
}

const BLANK_PAGE_WIDTH = 595.28; // A4 portrait
const BLANK_PAGE_HEIGHT = 841.89;

function stripPdfExt(name: string): string {
  return name.replace(/\.pdf$/i, '');
}

export async function organizeProcessor(
  ctx: ProcessorContext,
): Promise<ProcessResult> {
  const start = performance.now();
  if (ctx.files.length !== 1) {
    throw new Error('Organize requires exactly one input file.');
  }
  const file = ctx.files[0];
  if (!file) throw new Error('Organize requires exactly one input file.');

  const options = ctx.options as OrganizeOptions;
  const order = options.pageOrder;
  if (order.length === 0) {
    throw new Error('At least one page must remain.');
  }

  const { PDFDocument, degrees } = await import('pdf-lib');
  const out = await PDFDocument.create();

  // Copy all source pages we'll actually need in one call for efficiency.
  const sourceIndicesNeeded = Array.from(
    new Set(order.filter((i) => i !== BLANK_PAGE_MARKER)),
  );
  const copied =
    sourceIndicesNeeded.length > 0
      ? await out.copyPages(file.pdfLibDoc, sourceIndicesNeeded)
      : [];
  const sourceToCopiedIdx = new Map<number, number>();
  sourceIndicesNeeded.forEach((src, idx) => sourceToCopiedIdx.set(src, idx));

  for (let position = 0; position < order.length; position++) {
    if (ctx.signal?.aborted) throw new Error('aborted');
    const src = order[position];
    if (src === undefined) continue;
    const applyRotation = options.rotations[position] ?? 0;

    if (src === BLANK_PAGE_MARKER) {
      out.addPage([BLANK_PAGE_WIDTH, BLANK_PAGE_HEIGHT]);
    } else {
      const copiedIdx = sourceToCopiedIdx.get(src);
      if (copiedIdx === undefined) continue;
      const template = copied[copiedIdx];
      if (!template) continue;
      // Duplicate positions require a fresh copy per position.
      let pageToAdd = template;
      if (order.slice(0, position).some((s) => s === src)) {
        const dup = await out.copyPages(file.pdfLibDoc, [src]);
        const [d] = dup;
        if (!d) continue;
        pageToAdd = d;
      }
      out.addPage(pageToAdd);
      if (applyRotation !== 0) {
        const current = pageToAdd.getRotation().angle;
        const next = (((current + applyRotation) % 360) + 360) % 360;
        pageToAdd.setRotation(degrees(next));
      }
    }
    ctx.onProgress?.(
      (position + 1) / order.length,
      `Adding page ${position + 1}`,
    );
  }

  const bytes = await out.save({ useObjectStreams: true });
  const blob = new Blob([bytes as BlobPart], { type: 'application/pdf' });
  const basename = stripPdfExt(file.name);

  return {
    outputs: [{ name: `${basename}-organized.pdf`, blob }],
    stats: {
      inputBytes: file.arrayBuffer.byteLength,
      outputBytes: blob.size,
      durationMs: performance.now() - start,
    },
  };
}
