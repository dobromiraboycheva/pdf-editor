import type { ProcessorContext, ProcessResult } from '@/types/tool';
import { parsePageRanges } from '@/lib/pdf/pageRangeParse';

export type SplitMode = 'ranges' | 'every' | 'single';

export interface SplitOptions {
  mode: SplitMode;
  /** When mode === 'ranges'. */
  rangesSpec?: string;
  /** When mode === 'every'. */
  everyN?: number;
}

function stripPdfExt(name: string): string {
  return name.replace(/\.pdf$/i, '');
}

function computeGroups(
  options: SplitOptions,
  pageCount: number,
): number[][] {
  if (options.mode === 'single') {
    const groups: number[][] = [];
    for (let i = 0; i < pageCount; i++) groups.push([i]);
    return groups;
  }
  if (options.mode === 'every') {
    const n = Math.max(1, Math.floor(options.everyN ?? 1));
    const groups: number[][] = [];
    for (let start = 0; start < pageCount; start += n) {
      const group: number[] = [];
      for (let j = start; j < Math.min(start + n, pageCount); j++) {
        group.push(j);
      }
      groups.push(group);
    }
    return groups;
  }
  // 'ranges'
  const parsed = parsePageRanges(options.rangesSpec ?? '', pageCount);
  if (!parsed.ok || !parsed.groups) {
    throw new Error(parsed.error ?? 'Invalid page ranges.');
  }
  return parsed.groups;
}

export async function splitProcessor(
  ctx: ProcessorContext,
): Promise<ProcessResult> {
  const start = performance.now();
  if (ctx.files.length !== 1) {
    throw new Error('Split requires exactly one input file.');
  }
  const file = ctx.files[0];
  if (!file) throw new Error('Split requires exactly one input file.');

  const options = ctx.options as SplitOptions;
  const { PDFDocument } = await import('pdf-lib');

  const groups = computeGroups(options, file.pageCount);
  if (groups.length === 0) {
    throw new Error('No output groups produced.');
  }

  const basename = stripPdfExt(file.name);
  const outputs: { name: string; blob: Blob }[] = [];
  let outputBytes = 0;

  for (let i = 0; i < groups.length; i++) {
    if (ctx.signal?.aborted) throw new Error('aborted');
    const group = groups[i];
    if (!group || group.length === 0) continue;

    const out = await PDFDocument.create();
    const copied = await out.copyPages(file.pdfLibDoc, group);
    for (const p of copied) out.addPage(p);

    const bytes = await out.save({ useObjectStreams: true });
    // pdf-lib returns Uint8Array<ArrayBufferLike>; cast for TS 5.5 lib.dom.
    const blob = new Blob([bytes as BlobPart], { type: 'application/pdf' });
    outputBytes += blob.size;
    outputs.push({
      name: `${basename}-${i + 1}.pdf`,
      blob,
    });

    ctx.onProgress?.(
      (i + 1) / groups.length,
      `Creating file ${i + 1} of ${groups.length}`,
    );
  }

  return {
    outputs,
    stats: {
      inputBytes: file.arrayBuffer.byteLength,
      outputBytes,
      durationMs: performance.now() - start,
    },
  };
}
