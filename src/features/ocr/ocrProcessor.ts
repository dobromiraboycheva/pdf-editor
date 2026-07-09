import type { ProcessorContext, ProcessResult } from '@/types/tool';
import { embedStandardFont } from '@/lib/pdf/fontEmbed';

export interface OcrOptions {
  language: 'eng' | 'bul' | 'eng+bul';
}

const RENDER_SCALE = 2;

/**
 * Base URL for the vendored Tesseract assets served from `public/tesseract/`.
 * Worker + wasm core are copied here at build time (scripts/copy-tesseract-assets.mjs);
 * language traineddata is placed under `${LOCAL_BASE}/lang` by
 * scripts/fetch-tesseract-lang.sh. When any of these are missing we fall back to
 * the CDN so OCR keeps working (see createOcrWorker).
 */
const LOCAL_BASE = '/tesseract';

let warnedLocalFallback = false;

type TesseractModule = typeof import('tesseract.js');
type TesseractWorker = Awaited<ReturnType<TesseractModule['createWorker']>>;

/**
 * Create a Tesseract worker, preferring the locally vendored worker/core/lang
 * assets for privacy + offline use. If the local assets are missing (not
 * vendored) and worker init fails, fall back once to tesseract.js's default CDN
 * paths so OCR still works.
 */
async function createOcrWorker(
  createWorker: TesseractModule['createWorker'],
  language: OcrOptions['language'],
): Promise<TesseractWorker> {
  try {
    // tesseract.js v7 signature: createWorker(langs, oem, options)
    return await createWorker(language, undefined, {
      workerPath: `${LOCAL_BASE}/worker.min.js`,
      // Directory containing tesseract-core*.wasm.js — the worker picks the
      // right SIMD variant at runtime.
      corePath: `${LOCAL_BASE}/`,
      // Directory containing {eng,bul}.traineddata.gz.
      langPath: `${LOCAL_BASE}/lang`,
    });
  } catch (err) {
    if (!warnedLocalFallback) {
      warnedLocalFallback = true;
      // eslint-disable-next-line no-console
      console.warn(
        '[ocr] Local Tesseract assets under /tesseract not found or failed to ' +
          'load; falling back to the CDN. Run `npm run vendor:ocr-lang` and ' +
          '`npm run vendor:ocr-core` to vendor them for offline use.',
        err,
      );
    }
    // Default paths -> CDN (cdn.jsdelivr.net + tessdata.projectnaptha.com).
    return createWorker(language);
  }
}

/**
 * Run OCR on each page of the PDF using tesseract.js, then bake the extracted
 * word list as an invisible (opacity=0) text overlay via pdf-lib so the
 * resulting PDF is searchable / selectable.
 *
 * Note: OCR prefers the locally vendored language traineddata under
 * `public/tesseract/lang` (~15 MB per language). If it isn't vendored, the first
 * run downloads it from the CDN and the browser caches it for subsequent runs.
 * See BUILD.md → "Vendoring OCR models".
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

  const worker = await createOcrWorker(createWorker, opts.language);
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
