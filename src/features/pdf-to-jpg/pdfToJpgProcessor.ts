import type { ProcessorContext, ProcessResult } from '@/types/tool';

export interface PdfToJpgOptions {
  quality: 'low' | 'medium' | 'high';
  dpi: number;
}

const QUALITY_VALUES: Record<PdfToJpgOptions['quality'], number> = {
  low: 0.6,
  medium: 0.8,
  high: 0.95,
};

function stripPdfExt(name: string): string {
  return name.replace(/\.pdf$/i, '');
}

function canvasToJpegBlob(
  canvas: HTMLCanvasElement,
  quality: number,
): Promise<Blob> {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error('Failed to encode JPEG.'));
      },
      'image/jpeg',
      quality,
    );
  });
}

export async function pdfToJpgProcessor(
  ctx: ProcessorContext,
): Promise<ProcessResult> {
  const start = performance.now();
  if (ctx.files.length !== 1) {
    throw new Error('PDF to JPG requires exactly one input file.');
  }
  const file = ctx.files[0];
  if (!file) throw new Error('PDF to JPG requires exactly one input file.');

  const options = ctx.options as PdfToJpgOptions;
  const jpegQuality = QUALITY_VALUES[options.quality];
  const scale = options.dpi / 72;
  const basename = stripPdfExt(file.name);
  const pageCount = file.pageCount;

  const outputs: { name: string; blob: Blob }[] = [];
  let outputBytes = 0;

  for (let i = 0; i < pageCount; i++) {
    if (ctx.signal?.aborted) throw new Error('aborted');

    const page = await file.pdfjsDoc.getPage(i + 1);
    const viewport = page.getViewport({ scale });

    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.ceil(viewport.width));
    canvas.height = Math.max(1, Math.ceil(viewport.height));

    const canvasCtx = canvas.getContext('2d');
    if (!canvasCtx) {
      throw new Error('Failed to acquire 2D canvas context.');
    }
    // JPEG has no alpha — paint white first so transparent regions don't
    // become black in the encoded output.
    canvasCtx.fillStyle = '#ffffff';
    canvasCtx.fillRect(0, 0, canvas.width, canvas.height);

    const renderTask = page.render({ canvasContext: canvasCtx, viewport });
    await renderTask.promise;

    const blob = await canvasToJpegBlob(canvas, jpegQuality);
    outputBytes += blob.size;
    outputs.push({
      name: `${basename}-page-${i + 1}.jpg`,
      blob,
    });

    // Free the canvas bitmap eagerly.
    canvas.width = 0;
    canvas.height = 0;

    ctx.onProgress?.((i + 1) / pageCount, `Rendering page ${i + 1}`);
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
