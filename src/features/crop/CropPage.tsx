import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { useTranslation } from 'react-i18next';
import { useToast } from '@/hooks/useToast';
import { ChevronLeft, ChevronRight, WandSparkles } from 'lucide-react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { ToolShell } from '@/components/layout/ToolShell';
import { FileDropzone } from '@/components/pdf/FileDropzone';
import { ProcessButton } from '@/components/pdf/ProcessButton';
import { ProgressOverlay } from '@/components/pdf/ProgressOverlay';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useIngestedPdfs } from '@/hooks/useIngestedPdfs';
import { downloadBlob } from '@/lib/files/download';
import { renderThumbnail } from '@/lib/pdf/renderThumbnails';
import { formatBytes } from '@/lib/utils/formatBytes';
import { useCropStore } from './useCropStore';
import {
  cropProcessor,
  type CropOptions,
  type CropRect,
} from './cropProcessor';

const PREVIEW_WIDTH_PX = 600;
const DPR = 2;

// The rect is stored in PDF-space of the reference page (points, origin bottom-left).
// We convert to/from canvas CSS coordinates for interaction.
// TRADE-OFF: When applying to all pages the same PDF-space rect is used verbatim,
// so documents with non-uniform page sizes may be cropped unevenly.

type HandleId =
  | 'nw'
  | 'n'
  | 'ne'
  | 'e'
  | 'se'
  | 's'
  | 'sw'
  | 'w'
  | 'move'
  | 'new';

interface DragState {
  handle: HandleId;
  startCssX: number;
  startCssY: number;
  originalRect: CssRect | null;
}

interface CssRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface PageDims {
  pdfWidth: number;
  pdfHeight: number;
  cssWidth: number;
  cssHeight: number;
}

interface Result {
  size: number;
}

function pdfToCss(rect: CropRect, dims: PageDims): CssRect {
  const sx = dims.cssWidth / dims.pdfWidth;
  const sy = dims.cssHeight / dims.pdfHeight;
  const width = rect.width * sx;
  const height = rect.height * sy;
  const x = rect.x * sx;
  // Origin flip: PDF y is bottom-left, CSS y is top-left.
  const y = dims.cssHeight - rect.y * sy - height;
  return { x, y, width, height };
}

function cssToPdf(rect: CssRect, dims: PageDims): CropRect {
  const sx = dims.pdfWidth / dims.cssWidth;
  const sy = dims.pdfHeight / dims.cssHeight;
  const width = rect.width * sx;
  const height = rect.height * sy;
  const x = rect.x * sx;
  const y = (dims.cssHeight - rect.y - rect.height) * sy;
  return { x, y, width, height };
}

function clampRect(rect: CssRect, dims: PageDims): CssRect {
  const x = Math.max(0, Math.min(dims.cssWidth, rect.x));
  const y = Math.max(0, Math.min(dims.cssHeight, rect.y));
  const maxWidth = dims.cssWidth - x;
  const maxHeight = dims.cssHeight - y;
  const width = Math.max(0, Math.min(maxWidth, rect.width));
  const height = Math.max(0, Math.min(maxHeight, rect.height));
  return { x, y, width, height };
}

function normalizeRect(a: { x: number; y: number }, b: { x: number; y: number }): CssRect {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  const width = Math.abs(a.x - b.x);
  const height = Math.abs(a.y - b.y);
  return { x, y, width, height };
}

export function CropPage() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { files, addFiles, clear, isIngesting, error } = useIngestedPdfs();
  const rect = useCropStore((s) => s.rect);
  const applyToAll = useCropStore((s) => s.applyToAll);
  const currentPageIndex = useCropStore((s) => s.currentPageIndex);
  const setRect = useCropStore((s) => s.setRect);
  const setApplyToAll = useCropStore((s) => s.setApplyToAll);
  const setCurrentPageIndex = useCropStore((s) => s.setCurrentPageIndex);
  const resetStore = useCropStore((s) => s.reset);

  const file = files[0];
  const pageCount = file?.pageCount ?? 0;

  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [note, setNote] = useState('');
  const abortRef = useRef<AbortController | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [trimHint, setTrimHint] = useState<string | null>(null);

  const [canvas, setCanvas] = useState<HTMLCanvasElement | null>(null);
  const [dims, setDims] = useState<PageDims | null>(null);
  const [dragging, setDragging] = useState<DragState | null>(null);

  const canvasMountRef = useRef<HTMLDivElement | null>(null);
  const overlayRef = useRef<HTMLDivElement | null>(null);

  // Reset store when file changes.
  useEffect(() => {
    resetStore();
    setResult(null);
    setTrimHint(null);
    setCanvas(null);
    setDims(null);
  }, [file?.id, resetStore]);

  // Render current page.
  useEffect(() => {
    if (!file) return;
    const pdfjsDoc: PDFDocumentProxy = file.pdfjsDoc;
    const ac = new AbortController();
    let cancelled = false;

    (async () => {
      try {
        const page = await pdfjsDoc.getPage(currentPageIndex + 1);
        if (cancelled) return;
        const baseViewport = page.getViewport({ scale: 1 });
        const pdfWidth = baseViewport.width;
        const pdfHeight = baseViewport.height;
        const cssWidth = PREVIEW_WIDTH_PX;
        const cssHeight = cssWidth * (pdfHeight / pdfWidth);

        const rendered = await renderThumbnail(pdfjsDoc, currentPageIndex, {
          widthPx: PREVIEW_WIDTH_PX,
          dpr: DPR,
          signal: ac.signal,
        });
        if (cancelled) return;
        rendered.style.width = `${cssWidth}px`;
        rendered.style.height = `${cssHeight}px`;
        rendered.style.display = 'block';
        setCanvas(rendered);
        setDims({ pdfWidth, pdfHeight, cssWidth, cssHeight });
      } catch {
        // Ignore render errors / abort.
      }
    })();

    return () => {
      cancelled = true;
      ac.abort();
    };
  }, [file, currentPageIndex]);

  // Mount canvas into DOM.
  useEffect(() => {
    const el = canvasMountRef.current;
    if (!el || !canvas) return;
    el.appendChild(canvas);
    return () => {
      if (canvas.parentElement === el) {
        el.removeChild(canvas);
      }
    };
  }, [canvas]);

  // Escape clears rect.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setRect(null);
        setDragging(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setRect]);

  const cssRect = useMemo<CssRect | null>(() => {
    if (!rect || !dims) return null;
    return pdfToCss(rect, dims);
  }, [rect, dims]);

  const getLocalPoint = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>): { x: number; y: number } => {
      const el = overlayRef.current;
      if (!el) return { x: 0, y: 0 };
      const bounds = el.getBoundingClientRect();
      return {
        x: e.clientX - bounds.left,
        y: e.clientY - bounds.top,
      };
    },
    [],
  );

  const onPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>, handle: HandleId) => {
      if (!dims) return;
      e.preventDefault();
      e.stopPropagation();
      const el = overlayRef.current;
      if (el) el.setPointerCapture(e.pointerId);
      const local = getLocalPoint(e);
      setDragging({
        handle,
        startCssX: local.x,
        startCssY: local.y,
        originalRect: cssRect,
      });
      if (handle === 'new') {
        // Start a fresh 0x0 rect at the pointer.
        const fresh: CssRect = { x: local.x, y: local.y, width: 0, height: 0 };
        setRect(cssToPdf(fresh, dims));
      }
    },
    [cssRect, dims, getLocalPoint, setRect],
  );

  const onPointerMove = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (!dragging || !dims) return;
      const local = getLocalPoint(e);
      const dx = local.x - dragging.startCssX;
      const dy = local.y - dragging.startCssY;
      const orig = dragging.originalRect;

      let next: CssRect;

      if (dragging.handle === 'new') {
        next = normalizeRect(
          { x: dragging.startCssX, y: dragging.startCssY },
          { x: local.x, y: local.y },
        );
      } else if (dragging.handle === 'move' && orig) {
        next = {
          x: orig.x + dx,
          y: orig.y + dy,
          width: orig.width,
          height: orig.height,
        };
      } else if (orig) {
        let x1 = orig.x;
        let y1 = orig.y;
        let x2 = orig.x + orig.width;
        let y2 = orig.y + orig.height;
        if (dragging.handle.includes('w')) x1 = orig.x + dx;
        if (dragging.handle.includes('e')) x2 = orig.x + orig.width + dx;
        if (dragging.handle.includes('n')) y1 = orig.y + dy;
        if (dragging.handle.includes('s')) y2 = orig.y + orig.height + dy;
        next = normalizeRect({ x: x1, y: y1 }, { x: x2, y: y2 });
      } else {
        return;
      }

      const clipped = clampRect(next, dims);
      setRect(cssToPdf(clipped, dims));
    },
    [dragging, dims, getLocalPoint, setRect],
  );

  const onPointerUp = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (!dragging) return;
      const el = overlayRef.current;
      if (el && el.hasPointerCapture(e.pointerId)) {
        el.releasePointerCapture(e.pointerId);
      }
      // If the created rect is degenerate, clear it.
      if (dragging.handle === 'new' && rect && dims) {
        const asCss = pdfToCss(rect, dims);
        if (asCss.width < 4 || asCss.height < 4) {
          setRect(null);
        }
      }
      setDragging(null);
    },
    [dragging, rect, dims, setRect],
  );

  const handleReset = useCallback(() => {
    setRect(null);
    setTrimHint(null);
  }, [setRect]);

  const handleAutoTrim = useCallback(() => {
    if (!canvas || !dims) return;
    setTrimHint(null);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const nativeW = canvas.width;
    const nativeH = canvas.height;
    let data: ImageData;
    try {
      data = ctx.getImageData(0, 0, nativeW, nativeH);
    } catch {
      setTrimHint(
        t('tools.crop.noTrim', { defaultValue: 'No trimmable margins found.' }),
      );
      return;
    }
    const pixels = data.data;
    const threshold = 240 * 3;
    let minX = nativeW;
    let minY = nativeH;
    let maxX = -1;
    let maxY = -1;
    for (let y = 0; y < nativeH; y++) {
      for (let x = 0; x < nativeW; x++) {
        const idx = (y * nativeW + x) * 4;
        const r = pixels[idx] ?? 0;
        const g = pixels[idx + 1] ?? 0;
        const b = pixels[idx + 2] ?? 0;
        if (r + g + b <= threshold) {
          if (x < minX) minX = x;
          if (y < minY) minY = y;
          if (x > maxX) maxX = x;
          if (y > maxY) maxY = y;
        }
      }
    }
    if (maxX < 0 || maxY < 0) {
      setTrimHint(
        t('tools.crop.noTrim', { defaultValue: 'No trimmable margins found.' }),
      );
      return;
    }
    // Convert native canvas pixels → CSS px.
    const nativeToCss = dims.cssWidth / nativeW;
    const cssBox: CssRect = {
      x: minX * nativeToCss,
      y: minY * nativeToCss,
      width: (maxX - minX + 1) * nativeToCss,
      height: (maxY - minY + 1) * nativeToCss,
    };
    // Require > 10% margin somewhere.
    const marginLeft = cssBox.x / dims.cssWidth;
    const marginTop = cssBox.y / dims.cssHeight;
    const marginRight = (dims.cssWidth - (cssBox.x + cssBox.width)) / dims.cssWidth;
    const marginBottom = (dims.cssHeight - (cssBox.y + cssBox.height)) / dims.cssHeight;
    const maxMargin = Math.max(marginLeft, marginTop, marginRight, marginBottom);
    if (maxMargin <= 0.1) {
      setTrimHint(
        t('tools.crop.noTrim', { defaultValue: 'No trimmable margins found.' }),
      );
      return;
    }
    setRect(cssToPdf(clampRect(cssBox, dims), dims));
  }, [canvas, dims, setRect, t]);

  const canRun = !!file && !!rect && !busy && !isIngesting;

  const handleRun = useCallback(async () => {
    if (!file || !rect) return;
    setBusy(true);
    setResult(null);
    setProgress(0);
    setNote('');
    const ac = new AbortController();
    abortRef.current = ac;
    try {
      const options: CropOptions = {
        rect,
        applyToAll,
        currentPageIndex,
      };
      const res = await cropProcessor({
        files: [file],
        options,
        signal: ac.signal,
        onProgress: (f, n) => {
          setProgress(f);
          if (n) setNote(n);
        },
      });
      const out = res.outputs[0];
      if (!out) throw new Error('No output produced.');
      await downloadBlob(out.blob, out.name);
      setResult({ size: out.blob.size });
    } catch (e) {
      if (ac.signal.aborted || (e as Error).message === 'aborted') {
        // user cancelled — silent
      } else {
        toast({ message: t('tools.crop.failed', { message: (e as Error).message }), variant: 'error' });
      }
    } finally {
      setBusy(false);
      abortRef.current = null;
    }
  }, [file, rect, applyToAll, currentPageIndex, t]);

  const handlePrev = useCallback(() => {
    setCurrentPageIndex(Math.max(0, currentPageIndex - 1));
  }, [currentPageIndex, setCurrentPageIndex]);

  const handleNext = useCallback(() => {
    setCurrentPageIndex(Math.min(pageCount - 1, currentPageIndex + 1));
  }, [currentPageIndex, pageCount, setCurrentPageIndex]);

  return (
    <ToolShell
      title={t('tools.crop.name')}
      tagline={t('tools.crop.description')}
      onStartOver={file ? clear : undefined}
      sidebar={
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <input
                type="radio"
                name="crop-scope"
                checked={applyToAll}
                onChange={() => setApplyToAll(true)}
                className="accent-brand-500"
              />
              <span className="font-medium text-ink">
                {t('tools.crop.cropAllPages')}
              </span>
            </label>
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <input
                type="radio"
                name="crop-scope"
                checked={!applyToAll}
                onChange={() => setApplyToAll(false)}
                className="accent-brand-500"
              />
              <span className="font-medium text-ink">
                {t('tools.crop.cropCurrentOnly')}
              </span>
            </label>
          </div>

          {file && (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={handleAutoTrim}
              disabled={!canvas || !dims}
            >
              <WandSparkles className="h-4 w-4" />
              {t('tools.crop.autoTrim')}
            </Button>
          )}

          {rect && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleReset}
            >
              {t('tools.crop.reset')}
            </Button>
          )}

          <div className="text-sm text-ink-muted">
            {!file && t('tools.crop.hintEmpty')}
            {file && !rect && t('tools.crop.drag')}
          </div>

          {trimHint && (
            <div className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
              {trimHint}
            </div>
          )}

          <ProcessButton
            label={t('tools.crop.cta')}
            onClick={handleRun}
            disabled={!canRun}
            loading={busy}
          />

          {result && (
            <div className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900">
              {t('tools.crop.success', { size: formatBytes(result.size) })}
            </div>
          )}
          {error && <div className="text-sm text-red-600">{error}</div>}
        </div>
      }
    >
      {!file ? (
        <FileDropzone
          onFiles={addFiles}
          multiple={false}
          isIngesting={isIngesting}
        />
      ) : (
        <div className="flex flex-col gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="min-w-0">
                <div
                  className="truncate text-sm font-medium text-ink"
                  title={file.name}
                >
                  {file.name}
                </div>
                <div className="mt-0.5 text-xs text-ink-muted">
                  {formatBytes(file.size)} · {file.pageCount}{' '}
                  {t('common.pages')}
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="flex flex-col items-center gap-3">
            <div
              className="relative select-none rounded-card border border-black/10 bg-white shadow-card"
              style={{
                width: dims ? `${dims.cssWidth}px` : `${PREVIEW_WIDTH_PX}px`,
                height: dims ? `${dims.cssHeight}px` : undefined,
              }}
            >
              <div ref={canvasMountRef} className="absolute inset-0" />
              {dims && (
                <div
                  ref={overlayRef}
                  onPointerDown={(e) => {
                    // Start new rect only if the target is this overlay itself
                    // (i.e. not a child element like the rect body / a handle).
                    if (e.target === e.currentTarget) {
                      onPointerDown(e, 'new');
                    }
                  }}
                  onPointerMove={onPointerMove}
                  onPointerUp={onPointerUp}
                  onPointerCancel={onPointerUp}
                  className="absolute inset-0 touch-none cursor-crosshair"
                  role="presentation"
                >
                  {cssRect && (
                    <CropOverlay
                      rect={cssRect}
                      dims={dims}
                      onPointerDownHandle={onPointerDown}
                    />
                  )}
                </div>
              )}
            </div>

            <div className="flex items-center gap-3">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={handlePrev}
                disabled={currentPageIndex <= 0}
                aria-label={t('common.previous', { defaultValue: 'Previous' })}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="tabular-nums text-sm text-ink">
                {t('common.page')} {currentPageIndex + 1} / {pageCount}
              </span>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={handleNext}
                disabled={currentPageIndex >= pageCount - 1}
                aria-label={t('common.next', { defaultValue: 'Next' })}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      )}
      <ProgressOverlay
        open={busy}
        label={note || t('tools.crop.progress')}
        fraction={progress}
        onCancel={() => abortRef.current?.abort()}
      />
    </ToolShell>
  );
}

interface CropOverlayProps {
  rect: CssRect;
  dims: PageDims;
  onPointerDownHandle: (
    e: ReactPointerEvent<HTMLDivElement>,
    handle: HandleId,
  ) => void;
}

function CropOverlay({ rect, dims, onPointerDownHandle }: CropOverlayProps) {
  const dimStyle = 'absolute bg-black/40 pointer-events-none';
  return (
    <>
      {/* Four dim rectangles around selection */}
      <div
        className={dimStyle}
        style={{ left: 0, top: 0, width: dims.cssWidth, height: rect.y }}
      />
      <div
        className={dimStyle}
        style={{
          left: 0,
          top: rect.y + rect.height,
          width: dims.cssWidth,
          height: dims.cssHeight - (rect.y + rect.height),
        }}
      />
      <div
        className={dimStyle}
        style={{
          left: 0,
          top: rect.y,
          width: rect.x,
          height: rect.height,
        }}
      />
      <div
        className={dimStyle}
        style={{
          left: rect.x + rect.width,
          top: rect.y,
          width: dims.cssWidth - (rect.x + rect.width),
          height: rect.height,
        }}
      />

      {/* Selection rectangle body — drag to move */}
      <div
        onPointerDown={(e) => onPointerDownHandle(e, 'move')}
        className="absolute border-2 border-brand-500 cursor-move"
        style={{
          left: rect.x,
          top: rect.y,
          width: rect.width,
          height: rect.height,
        }}
      />

      {/* Resize handles */}
      <Handle
        x={rect.x}
        y={rect.y}
        cursor="nwse-resize"
        onPointerDown={(e) => onPointerDownHandle(e, 'nw')}
      />
      <Handle
        x={rect.x + rect.width / 2}
        y={rect.y}
        cursor="ns-resize"
        onPointerDown={(e) => onPointerDownHandle(e, 'n')}
      />
      <Handle
        x={rect.x + rect.width}
        y={rect.y}
        cursor="nesw-resize"
        onPointerDown={(e) => onPointerDownHandle(e, 'ne')}
      />
      <Handle
        x={rect.x + rect.width}
        y={rect.y + rect.height / 2}
        cursor="ew-resize"
        onPointerDown={(e) => onPointerDownHandle(e, 'e')}
      />
      <Handle
        x={rect.x + rect.width}
        y={rect.y + rect.height}
        cursor="nwse-resize"
        onPointerDown={(e) => onPointerDownHandle(e, 'se')}
      />
      <Handle
        x={rect.x + rect.width / 2}
        y={rect.y + rect.height}
        cursor="ns-resize"
        onPointerDown={(e) => onPointerDownHandle(e, 's')}
      />
      <Handle
        x={rect.x}
        y={rect.y + rect.height}
        cursor="nesw-resize"
        onPointerDown={(e) => onPointerDownHandle(e, 'sw')}
      />
      <Handle
        x={rect.x}
        y={rect.y + rect.height / 2}
        cursor="ew-resize"
        onPointerDown={(e) => onPointerDownHandle(e, 'w')}
      />
    </>
  );
}

interface HandleProps {
  x: number;
  y: number;
  cursor: 'ns-resize' | 'ew-resize' | 'nwse-resize' | 'nesw-resize';
  onPointerDown: (e: ReactPointerEvent<HTMLDivElement>) => void;
}

function Handle({ x, y, cursor, onPointerDown }: HandleProps) {
  const size = 10;
  return (
    <div
      onPointerDown={onPointerDown}
      className="absolute rounded-sm border border-brand-500 bg-white shadow-sm"
      style={{
        left: x - size / 2,
        top: y - size / 2,
        width: size,
        height: size,
        cursor,
      }}
    />
  );
}

export default CropPage;
