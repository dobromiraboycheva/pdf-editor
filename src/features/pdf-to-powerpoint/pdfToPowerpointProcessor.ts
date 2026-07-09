import type { ProcessorContext, ProcessResult } from '@/types/tool';

function stripPdfExt(name: string): string {
  return name.replace(/\.pdf$/i, '');
}

const SLIDE_WIDTH = 720; // 10 inches at 72pt
const SLIDE_HEIGHT = 540; // 7.5 inches at 72pt
const RENDER_SCALE = 2;
const JPEG_QUALITY = 0.85;

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

export async function pdfToPowerpointProcessor(
  ctx: ProcessorContext,
): Promise<ProcessResult> {
  const start = performance.now();
  if (ctx.files.length !== 1) {
    throw new Error('PDF to PowerPoint requires exactly one input file.');
  }
  const file = ctx.files[0];
  if (!file)
    throw new Error('PDF to PowerPoint requires exactly one input file.');

  const { PDFDocument, rgb } = await import('pdf-lib');
  const slidesDoc = await PDFDocument.create();

  for (let i = 1; i <= file.pageCount; i++) {
    if (ctx.signal?.aborted) throw new Error('aborted');

    const page = await file.pdfjsDoc.getPage(i);
    const viewport = page.getViewport({ scale: RENDER_SCALE });

    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.ceil(viewport.width));
    canvas.height = Math.max(1, Math.ceil(viewport.height));
    const canvasCtx = canvas.getContext('2d');
    if (!canvasCtx) throw new Error('Failed to acquire 2D canvas context.');
    canvasCtx.fillStyle = '#ffffff';
    canvasCtx.fillRect(0, 0, canvas.width, canvas.height);

    await page.render({ canvasContext: canvasCtx, viewport }).promise;

    const jpegBlob = await canvasToJpegBlob(canvas, JPEG_QUALITY);
    const bytes = new Uint8Array(await jpegBlob.arrayBuffer());
    const img = await slidesDoc.embedJpg(bytes);

    const slide = slidesDoc.addPage([SLIDE_WIDTH, SLIDE_HEIGHT]);
    slide.drawRectangle({
      x: 0,
      y: 0,
      width: SLIDE_WIDTH,
      height: SLIDE_HEIGHT,
      color: rgb(1, 1, 1),
    });
    const scale = Math.min(SLIDE_WIDTH / img.width, SLIDE_HEIGHT / img.height);
    const w = img.width * scale;
    const h = img.height * scale;
    slide.drawImage(img, {
      x: (SLIDE_WIDTH - w) / 2,
      y: (SLIDE_HEIGHT - h) / 2,
      width: w,
      height: h,
    });

    // Release canvas memory eagerly.
    canvas.width = 0;
    canvas.height = 0;

    ctx.onProgress?.(i / file.pageCount, `Rendering slide ${i}`);
  }

  const bytes = await slidesDoc.save({ useObjectStreams: true });
  const blob = new Blob([bytes as BlobPart], { type: 'application/pdf' });
  const basename = stripPdfExt(file.name);

  return {
    outputs: [{ name: `${basename}-slideshow.pdf`, blob }],
    stats: {
      inputBytes: file.arrayBuffer.byteLength,
      outputBytes: blob.size,
      durationMs: performance.now() - start,
    },
  };
}
