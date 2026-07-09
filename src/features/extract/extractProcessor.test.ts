import { describe, it, expect } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { extractProcessor, type ExtractOptions } from './extractProcessor';
import { makeIngested } from '@/test/makeIngested';
import type { ProcessorContext } from '@/types/tool';

async function makeDoc(count: number): Promise<PDFDocument> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < count; i++) doc.addPage([100, 100]);
  return doc;
}

describe('extractProcessor', () => {
  it('extracts only the selected pages', async () => {
    const file = await makeIngested(await makeDoc(5), 'doc.pdf');
    const options: ExtractOptions = { rangesSpec: '1,3,5' };
    const ctx: ProcessorContext = { files: [file], options };

    const result = await extractProcessor(ctx);
    expect(result.outputs).toHaveLength(1);

    const bytes = new Uint8Array(await result.outputs[0]!.blob.arrayBuffer());
    const out = await PDFDocument.load(bytes);
    expect(out.getPageCount()).toBe(3);
  });
});
