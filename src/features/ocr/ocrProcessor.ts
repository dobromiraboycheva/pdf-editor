import type { ProcessorContext, ProcessResult } from '@/types/tool';
import { embedStandardFont } from '@/lib/pdf/fontEmbed';

export interface OcrOptions {
  language: 'eng' | 'bul' | 'eng+bul';
}

const RENDER_SCALE = 2;

/**
 * Run OCR on each page of the PDF using tesseract.js, then bake the extracted
 * word list as an invisible (opacity=0) text overlay via pdf-lib so the
 * resulting PDF is searchable / selectable.
 *
 * Note: the first run downloads the Tesseract language traineddata (~15 MB per
 * language). Subsequent runs are cached by the browser.
 */
export async function ocrProcessor(
  ctx: ProcessorContext,
): Promise<ProcessResult> {
  const start = performance.now();
  const file = ctx.files[0];
  if (!file) throw new Error('No file provided.');
  const opts = ctx.options as OcrOptions;

  const { PDFDocument } = await import('pdf-lib');
  const { createWorker } = await import('tesseract.js');

  const worker = await createWorker(opts.language);
  try {
    const doc = await PDFDocument.load(file.arrayBuffer.slice(0));
    const font = await embedStandardFont(doc);
    const pages = doc.getPages();
    const total = pages.length || 1;
    const pdfjsDoc = file.pdfjsDoc;

    for (let i = 0; i < pages.length; i++) {
      if (ctx.signal?.aborted) throw new Error('aborted');
      const page = pages[i];
      if (!page) continue;

      const { width: pdfWidth, height: pdfHeight } = page.getSize();

      // Render the page to a canvas at 2x scale.
      const jsPage = await pdfjsDoc.getPage(i + 1);
      const viewport = jsPage.getViewport({ scale: RENDER_SCALE });
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.ceil(viewport.width));
      canvas.height = Math.max(1, Math.ceil(viewport.height));

      const canvasCtx = canvas.getContext('2d');
      if (!canvasCtx) {
        throw new Error('Failed to acquire 2D canvas context.');
      }
      canvasCtx.fillStyle = '#ffffff';
      canvasCtx.fillRect(0, 0, canvas.width, canvas.height);

      const renderTask = jsPage.render({
        canvasContext: canvasCtx,
        viewport,
      });
      await renderTask.promise;

      // Recognize.
      const { data } = await worker.recognize(canvas);

      // Canvas is in px at RENDER_SCALE; convert to PDF units by ratio.
      const sx = pdfWidth / canvas.width;
      const sy = pdfHeight / canvas.height;

      const blocks = data.blocks ?? [];
      for (const block of blocks) {
        for (const paragraph of block.paragraphs) {
          for (const line of paragraph.lines) {
            for (const word of line.words) {
              const text = word.text?.trim();
              if (!text) continue;
              const bbox = word.bbox;
              const wPx = bbox.x1 - bbox.x0;
              const hPx = bbox.y1 - bbox.y0;
              if (wPx <= 0 || hPx <= 0) continue;

              const pdfX = bbox.x0 * sx;
              // Canvas Y grows down; PDF Y grows up. Anchor at bbox bottom.
              const pdfY = pdfHeight - bbox.y1 * sy;
              const fontSize = Math.max(1, hPx * sy);

              try {
                page.drawText(text, {
                  x: pdfX,
                  y: pdfY,
                  size: fontSize,
                  font,
                  opacity: 0,
                });
              } catch {
                // Helvetica (WinAnsi) can't encode every glyph — e.g. Cyrillic.
                // The overlay is invisible; silently skip unencodable words
                // rather than aborting the whole page.
              }
            }
          }
        }
      }

      // Free canvas bitmap eagerly.
      canvas.width = 0;
      canvas.height = 0;

      ctx.onProgress?.((i + 1) / total, `OCR page ${i + 1}`);
    }

    const bytes = await doc.save({
      useObjectStreams: true,
      addDefaultPage: false,
    });
    const blob = new Blob([bytes as BlobPart], { type: 'application/pdf' });

    return {
      outputs: [{ name: 'searchable.pdf', blob }],
      stats: {
        inputBytes: file.size,
        outputBytes: blob.size,
        durationMs: performance.now() - start,
      },
    };
  } finally {
    await worker.terminate();
  }
}
