import { describe, it, expect } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { mergeProcessor } from './mergeProcessor';
import { makeIngested } from '@/test/makeIngested';
import type { ProcessorContext } from '@/types/tool';

/** Create an in-memory pdf-lib document with `count` distinctly-sized pages. */
async function makeDoc(count: number, baseWidth: number): Promise<PDFDocument> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < count; i++) {
    // Vary width per page so page order is verifiable after merge.
    doc.addPage([baseWidth + i, 100]);
  }
  return doc;
}

describe('mergeProcessor', () => {
  it('concatenates all input documents in order', async () => {
    const docA = await makeDoc(2, 200); // widths 200, 201
    const docB = await makeDoc(3, 500); // widths 500, 501, 502

    const fileA = await makeIngested(docA, 'a.pdf');
    const fileB = await makeIngested(docB, 'b.pdf');

    const ctx: ProcessorContext = {
      files: [fileA, fileB],
      options: undefined,
    };

    const result = await mergeProcessor(ctx);
    expect(result.outputs).toHaveLength(1);

    const outBytes = new Uint8Array(await result.outputs[0]!.blob.arrayBuffer());
    const out = await PDFDocument.load(outBytes);

    // Page count is the sum of inputs.
    expect(out.getPageCount()).toBe(5);

    // Page order matches input order (verified via per-page widths).
    const widths = out.getPages().map((p) => Math.round(p.getWidth()));
    expect(widths).toEqual([200, 201, 500, 501, 502]);
  });
});
