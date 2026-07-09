import { describe, it, expect } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { splitProcessor, type SplitOptions } from './splitProcessor';
import { makeIngested } from '@/test/makeIngested';
import type { ProcessorContext } from '@/types/tool';

async function makeDoc(count: number): Promise<PDFDocument> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < count; i++) doc.addPage([100, 100]);
  return doc;
}

async function pageCountOf(blob: Blob): Promise<number> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const doc = await PDFDocument.load(bytes);
  return doc.getPageCount();
}

describe('splitProcessor', () => {
  it("mode 'ranges' emits one file per comma fragment", async () => {
    const file = await makeIngested(await makeDoc(6), 'doc.pdf');
    const options: SplitOptions = { mode: 'ranges', rangesSpec: '1-2,4-6' };
    const ctx: ProcessorContext = { files: [file], options };

    const result = await splitProcessor(ctx);
    expect(result.outputs).toHaveLength(2);
    expect(await pageCountOf(result.outputs[0]!.blob)).toBe(2);
    expect(await pageCountOf(result.outputs[1]!.blob)).toBe(3);
  });

  it("mode 'every' chunks into fixed-size groups", async () => {
    const file = await makeIngested(await makeDoc(6), 'doc.pdf');
    const options: SplitOptions = { mode: 'every', everyN: 2 };
    const ctx: ProcessorContext = { files: [file], options };

    const result = await splitProcessor(ctx);
    expect(result.outputs).toHaveLength(3);
    for (const out of result.outputs) {
      expect(await pageCountOf(out.blob)).toBe(2);
    }
  });

  it("mode 'single' emits one file per page", async () => {
    const file = await makeIngested(await makeDoc(6), 'doc.pdf');
    const options: SplitOptions = { mode: 'single' };
    const ctx: ProcessorContext = { files: [file], options };

    const result = await splitProcessor(ctx);
    expect(result.outputs).toHaveLength(6);
    for (const out of result.outputs) {
      expect(await pageCountOf(out.blob)).toBe(1);
    }
  });
});
