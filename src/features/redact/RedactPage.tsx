import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { useTranslation } from 'react-i18next';
import { useToast } from '@/hooks/useToast';
import { ChevronLeft, ChevronRight, Trash2, X } from 'lucide-react';
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
import { uuid } from '@/lib/utils/uuid';
import { useRedactStore, type RedactRect } from './useRedactStore';
import { redactProcessor, type RedactOptions } from './redactProcessor';

const PREVIEW_WIDTH_PX = 600;
const DPR = 2;

interface PageDims {
  cssWidth: number;
  cssHeight: number;
}

interface DragState {
  startX: number;
  startY: number;
  rectId: string;
}

interface Result {
  size: number;
}

export function RedactPage() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { files, addFiles, clear, isIngesting, error } = useIngestedPdfs();
  const file = files[0];
  const pageCount = file?.pageCount ?? 0;

  const rects = useRedactStore((s) => s.rects);
  const currentPageIndex = useRedactStore((s) => s.currentPageIndex);
  const addRect = useRedactStore((s) => s.addRect);
  const updateRect = useRedactStore((s) => s.updateRect);
  const removeRect = useRedactStore((s) => s.removeRect);
  const setCurrentPageIndex = useRedactStore((s) => s.setCurrentPageIndex);
  const resetStore = useRedactStore((s) => s.reset);

  const [canvas, setCanvas] = useState<HTMLCanvasElement | null>(null);
  const [dims, setDims] = useState<PageDims | null>(null);
  const canvasMountRef = useRef<HTMLDivElement | null>(null);
  const overlayRef = useRef<HTMLDivElement | null>(null);

  const [drag, setDrag] = useState<DragState | null>(null);

  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [note, setNote] = useState('');
  const abortRef = useRef<AbortController | null>(null);
  const [result, setResult] = useState<Result | null>(null);

  useEffect(() => {
    resetStore();
    setResult(null);
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
        const cssWidth = PREVIEW_WIDTH_PX;
        const cssHeight = cssWidth * (baseViewport.height / baseViewport.width);
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
        setDims({ cssWidth, cssHeight });
      } catch {
        // ignore
      }
    })();
    return () => {
      cancelled = true;
      ac.abort();
    };
  }, [file, currentPageIndex]);

  useEffect(() => {
    const el = canvasMountRef.current;
    if (!el || !canvas) return;
    el.appendChild(canvas);
    return () => {
      if (canvas.parentElement === el) el.removeChild(canvas);
    };
  }, [canvas]);

  const getLocal = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>): { x: number; y: number } => {
      const el = overlayRef.current;
      if (!el) return { x: 0, y: 0 };
      const b = el.getBoundingClientRect();
      return { x: e.clientX - b.left, y: e.clientY - b.top };
    },
    [],
  );

  const clampToDims = useCallback(
    (v: number, max: number) => Math.max(0, Math.min(max, v)),
    [],
  );

  const onPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (!dims) return;
      if (e.target !== e.currentTarget) return;
      e.preventDefault();
      const el = overlayRef.current;
      if (el) el.setPointerCapture(e.pointerId);
      const p = getLocal(e);
      const id = uuid();
      const rect: RedactRect = {
        id,
        pageIndex: currentPageIndex,
        x: p.x,
        y: p.y,
        width: 0,
        height: 0,
        overlayCssWidth: dims.cssWidth,
        overlayCssHeight: dims.cssHeight,
      };
      addRect(rect);
      setDrag({ startX: p.x, startY: p.y, rectId: id });
    },
    [dims, getLocal, currentPageIndex, addRect],
  );

  const onPointerMove = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (!drag || !dims) return;
      const p = getLocal(e);
      const x = Math.min(drag.startX, p.x);
      const y = Math.min(drag.startY, p.y);
      const width = Math.abs(p.x - drag.startX);
      const height = Math.abs(p.y - drag.startY);
      const cx = clampToDims(x, dims.cssWidth);
      const cy = clampToDims(y, dims.cssHeight);
      const cw = Math.min(dims.cssWidth - cx, width);
      const ch = Math.min(dims.cssHeight - cy, height);
      updateRect(drag.rectId, { x: cx, y: cy, width: cw, height: ch });
    },
    [drag, dims, getLocal, clampToDims, updateRect],
  );

  const onPointerUp = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (!drag) return;
      const el = overlayRef.current;
      if (el && el.hasPointerCapture(e.pointerId)) {
        el.releasePointerCapture(e.pointerId);
      }
      // Remove degenerate rects.
      const created = rects.find((r) => r.id === drag.rectId);
      if (created && (created.width < 4 || created.height < 4)) {
        removeRect(drag.rectId);
      }
      setDrag(null);
    },
    [drag, rects, removeRect],
  );

  const handlePrev = useCallback(() => {
    setCurrentPageIndex(Math.max(0, currentPageIndex - 1));
  }, [currentPageIndex, setCurrentPageIndex]);
  const handleNext = useCallback(() => {
    setCurrentPageIndex(Math.min(pageCount - 1, currentPageIndex + 1));
  }, [currentPageIndex, pageCount, setCurrentPageIndex]);

  const canRun = !!file && rects.length > 0 && !busy && !isIngesting;

  const handleRun = useCallback(async () => {
    if (!file) return;
    setBusy(true);
    setResult(null);
    setProgress(0);
    setNote('');
    const ac = new AbortController();
    abortRef.current = ac;
    try {
      const options: RedactOptions = {
        rects: rects.map((r) => ({
          pageIndex: r.pageIndex,
          x: r.x,
          y: r.y,
          width: r.width,
          height: r.height,
          overlayCssWidth: r.overlayCssWidth,
          overlayCssHeight: r.overlayCssHeight,
        })),
      };
      const res = await redactProcessor({
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
        toast({ message: t('tools.redact.failed', { message: (e as Error).message }), variant: 'error' });
      }
    } finally {
      setBusy(false);
      abortRef.current = null;
    }
  }, [file, rects, t]);

  const pageRects = rects.filter((r) => r.pageIndex === currentPageIndex);

  return (
    <ToolShell
      title={t('tools.redact.name')}
      tagline={t('tools.redact.description')}
      onStartOver={file ? clear : undefined}
      sidebar={
        <div className="flex flex-col gap-4">
          <div className="text-sm text-ink-muted">
            {!file && t('tools.redact.drag')}
            {file && t('tools.redact.drag')}
          </div>

          <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
            {t('tools.redact.note')}
          </div>

          {rects.length > 0 && (
            <div className="flex flex-col gap-2">
              <div className="text-xs font-medium text-ink-muted">
                {rects.length} × {t('tools.redact.name')}
              </div>
              <div className="max-h-40 overflow-auto rounded-lg border border-black/10 bg-white">
                {rects.map((r, i) => (
                  <div
                    key={r.id}
                    className="flex items-center justify-between border-b border-black/5 px-2 py-1.5 text-xs last:border-b-0"
                  >
                    <span className="truncate text-ink">
                      #{i + 1} · {t('common.page')} {r.pageIndex + 1}
                    </span>
                    <button
                      type="button"
                      onClick={() => removeRect(r.id)}
                      className="flex h-6 w-6 items-center justify-center rounded text-ink-muted hover:bg-red-50 hover:text-red-600"
                      aria-label={t('common.remove')}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <ProcessButton
            label={t('tools.redact.cta')}
            onClick={handleRun}
            disabled={!canRun}
            loading={busy}
          />

          {result && (
            <div className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900">
              {t('tools.redact.success', { size: formatBytes(result.size) })}
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
                  onPointerDown={onPointerDown}
                  onPointerMove={onPointerMove}
                  onPointerUp={onPointerUp}
                  onPointerCancel={onPointerUp}
                  className="absolute inset-0 cursor-crosshair touch-none"
                  role="presentation"
                >
                  {pageRects.map((r) => (
                    <div
                      key={r.id}
                      className="absolute bg-black"
                      style={{
                        left: r.x,
                        top: r.y,
                        width: r.width,
                        height: r.height,
                      }}
                    >
                      <button
                        type="button"
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={(e) => {
                          e.stopPropagation();
                          removeRect(r.id);
                        }}
                        className="absolute right-0.5 top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-white/90 text-ink shadow-sm hover:bg-red-500 hover:text-white"
                        aria-label={t('common.remove')}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
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
                aria-label={t('tools.edit.prevPage')}
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
                aria-label={t('tools.edit.nextPage')}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      )}
      <ProgressOverlay
        open={busy}
        label={note || t('tools.redact.progress')}
        fraction={progress}
        onCancel={() => abortRef.current?.abort()}
      />
    </ToolShell>
  );
}

export default RedactPage;
