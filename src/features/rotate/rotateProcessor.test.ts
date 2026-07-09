import { describe, it, expect } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { rotateProcessor, type RotateOptions } from './rotateProcessor';
import { makeIngested } from '@/test/makeIngested';
import type { ProcessorContext } from '@/types/tool';

async function makeDoc(count: number): Promise<PDFDocument> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < count; i++) doc.addPage([100, 100]);
  return doc;
}

describe('rotateProcessor', () => {
  it('applies +90 to the targeted page only', async () => {
    const file = await makeIngested(await makeDoc(3), 'doc.pdf');
    const options: RotateOptions = { pageRotations: { 0: 90 } };
    const ctx: ProcessorContext = { files: [file], options };

    const result = await rotateProcessor(ctx);
    expect(result.outputs).toHaveLength(1);

    const bytes = new Uint8Array(await result.outputs[0]!.blob.arrayBuffer());
    const out = await PDFDocument.load(bytes);
    const angles = out.getPages().map((p) => p.getRotation().angle);
    expect(angles).toEqual([90, 0, 0]);
  });
});
