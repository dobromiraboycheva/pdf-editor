import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { ToolShell } from '@/components/layout/ToolShell';
import { FileDropzone } from '@/components/pdf/FileDropzone';
import { Button } from '@/components/ui/button';
import { useIngestedPdfs } from '@/hooks/useIngestedPdfs';
import { formatBytes } from '@/lib/utils/formatBytes';
import { renderThumbnail } from '@/lib/pdf/renderThumbnails';

const CANVAS_WIDTH_PX = 500;

interface RenderedPage {
  canvas: HTMLCanvasElement;
  width: number;
  height: number;
}

async function renderPage(
  doc: PDFDocumentProxy,
  pageIndex: number,
  signal: AbortSignal,
): Promise<RenderedPage> {
  const canvas = await renderThumbnail(doc, pageIndex, {
    widthPx: CANVAS_WIDTH_PX,
    dpr: 1,
    signal,
  });
  return { canvas, width: canvas.width, height: canvas.height };
}

/**
 * Pixel-diff two rendered pages. Aligns to the intersection of their sizes
 * (top-left anchored) and paints differing pixels red on a transparent
 * background. Non-matching areas outside the intersection are highlighted too.
 */
function buildDiffCanvas(
  left: RenderedPage,
  right: RenderedPage,
  threshold = 32,
): HTMLCanvasElement {
  const width = Math.max(left.width, right.width);
  const height = Math.max(left.height, right.height);
  const out = document.createElement('canvas');
  out.width = width;
  out.height = height;
  const ctx = out.getContext('2d');
  if (!ctx) return out;

  const lCtx = left.canvas.getContext('2d');
  const rCtx = right.canvas.getContext('2d');
  if (!lCtx || !rCtx) return out;

  const lData = lCtx.getImageData(0, 0, left.width, left.height).data;
  const rData = rCtx.getImageData(0, 0, right.width, right.height).data;
  const diff = ctx.createImageData(width, height);
  const dData = diff.data;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const dIdx = (y * width + x) * 4;
      const inLeft = x < left.width && y < left.height;
      const inRight = x < right.width && y < right.height;
      let different = false;
      if (inLeft && inRight) {
        const lIdx = (y * left.width + x) * 4;
        const rIdx = (y * right.width + x) * 4;
        const dr = Math.abs((lData[lIdx] ?? 0) - (rData[rIdx] ?? 0));
        const dg = Math.abs((lData[lIdx + 1] ?? 0) - (rData[rIdx + 1] ?? 0));
        const db = Math.abs((lData[lIdx + 2] ?? 0) - (rData[rIdx + 2] ?? 0));
        different = dr + dg + db > threshold;
      } else if (inLeft !== inRight) {
        different = true;
      }
      if (different) {
        dData[dIdx] = 239; // red-500
        dData[dIdx + 1] = 68;
        dData[dIdx + 2] = 68;
        dData[dIdx + 3] = 140;
      }
    }
  }
  ctx.putImageData(diff, 0, 0);
  return out;
}

interface CanvasMountProps {
  canvas?: HTMLCanvasElement;
  overlay?: HTMLCanvasElement;
}

function CanvasMount({ canvas, overlay }: CanvasMountProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || !canvas) return;
    // Clear before re-mounting to allow swapping.
    while (el.firstChild) el.removeChild(el.firstChild);
    canvas.style.width = '100%';
    canvas.style.height = 'auto';
    canvas.style.display = 'block';
    el.appendChild(canvas);
    if (overlay) {
      overlay.style.position = 'absolute';
      overlay.style.top = '0';
      overlay.style.left = '0';
      overlay.style.width = '100%';
      overlay.style.height = '100%';
      overlay.style.pointerEvents = 'none';
      el.appendChild(overlay);
    }
    return () => {
      while (el.firstChild) el.removeChild(el.firstChild);
    };
  }, [canvas, overlay]);
  return (
    <div
      ref={ref}
      className="relative flex w-full items-center justify-center overflow-hidden rounded-card border border-black/5 bg-white shadow-sm"
    />
  );
}

export function ComparePage() {
  const { t } = useTranslation();
  const { files, addFiles, clear, isIngesting, error } = useIngestedPdfs();
  const [pageIdx, setPageIdx] = useState(0);
  const [showDiff, setShowDiff] = useState(true);
  const [leftPage, setLeftPage] = useState<RenderedPage | null>(null);
  const [rightPage, setRightPage] = useState<RenderedPage | null>(null);
  const [diff, setDiff] = useState<HTMLCanvasElement | null>(null);

  const left = files[0];
  const right = files[1];

  const totalPages = useMemo(() => {
    if (!left || !right) return 0;
    return Math.min(left.pageCount, right.pageCount);
  }, [left, right]);

  useEffect(() => {
    setPageIdx(0);
  }, [left?.id, right?.id]);

  useEffect(() => {
    if (!left || !right) {
      setLeftPage(null);
      setRightPage(null);
      setDiff(null);
      return;
    }
    const ac = new AbortController();
    (async () => {
      try {
        const [l, r] = await Promise.all([
          renderPage(left.pdfjsDoc, pageIdx, ac.signal),
          renderPage(right.pdfjsDoc, pageIdx, ac.signal),
        ]);
        if (ac.signal.aborted) return;
        setLeftPage(l);
        setRightPage(r);
        try {
          setDiff(buildDiffCanvas(l, r));
        } catch {
          setDiff(null);
        }
      } catch {
        if (ac.signal.aborted) return;
      }
    })();
    return () => ac.abort();
  }, [left, right, pageIdx]);

  const handleFiles = useCallback(
    (incoming: File[]) => {
      // Cap at 2 total files.
      const room = 2 - files.length;
      if (room <= 0) return;
      void addFiles(incoming.slice(0, room));
    },
    [files.length, addFiles],
  );

  const sizeMismatch =
    leftPage && rightPage &&
    (leftPage.width !== rightPage.width || leftPage.height !== rightPage.height);

  return (
    <ToolShell
      title={t('tools.compare.name')}
      tagline={t('tools.compare.description')}
      onStartOver={files.length > 0 ? clear : undefined}
      sidebar={
        <div className="flex flex-col gap-4">
          <div className="text-sm text-ink-muted">
            {files.length < 2 && t('tools.compare.hintEmpty')}
          </div>

          <label className="flex cursor-pointer items-center gap-2 text-sm text-ink">
            <input
              type="checkbox"
              checked={showDiff}
              onChange={(e) => setShowDiff(e.target.checked)}
              className="h-4 w-4 accent-brand-500"
            />
            {t('tools.compare.pixelDiff')}
          </label>

          {totalPages > 0 && (
            <div className="flex items-center justify-between gap-2 rounded-card border border-black/10 bg-white p-2">
              <Button
                variant="ghost"
                size="sm"
                disabled={pageIdx <= 0}
                onClick={() => setPageIdx((i) => Math.max(0, i - 1))}
                aria-label={t('tools.edit.prevPage')}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="tabular-nums text-sm text-ink">
                {t('tools.edit.pageOf', { n: pageIdx + 1, total: totalPages })}
              </span>
              <Button
                variant="ghost"
                size="sm"
                disabled={pageIdx >= totalPages - 1}
                onClick={() =>
                  setPageIdx((i) => Math.min(totalPages - 1, i + 1))
                }
                aria-label={t('tools.edit.nextPage')}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          )}

          {sizeMismatch && (
            <div className="rounded-lg bg-amber-50 p-3 text-xs text-amber-900">
              Page sizes differ between files. Diff is aligned to the top-left corner.
            </div>
          )}

          {error && <div className="text-sm text-red-600">{error}</div>}
        </div>
      }
    >
      {files.length < 2 ? (
        <div className="flex flex-col gap-4">
          <FileDropzone
            onFiles={handleFiles}
            multiple
            isIngesting={isIngesting}
          />
          {files.length === 1 && (
            <div className="rounded-card border border-black/5 bg-white p-3 text-sm text-ink shadow-card">
              <div className="font-medium">{t('tools.compare.leftFile')}</div>
              <div className="text-xs text-ink-muted">
                {files[0]?.name} · {formatBytes(files[0]?.size ?? 0)}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="flex flex-col gap-2">
            <div className="text-xs font-medium text-ink-muted">
              {t('tools.compare.leftFile')}
            </div>
            <div className="truncate text-sm text-ink" title={left?.name}>
              {left?.name}
            </div>
            <CanvasMount
              canvas={leftPage?.canvas}
              overlay={showDiff && diff ? diff : undefined}
            />
          </div>
          <div className="flex flex-col gap-2">
            <div className="text-xs font-medium text-ink-muted">
              {t('tools.compare.rightFile')}
            </div>
            <div className="truncate text-sm text-ink" title={right?.name}>
              {right?.name}
            </div>
            <CanvasMount canvas={rightPage?.canvas} />
          </div>
        </div>
      )}
    </ToolShell>
  );
}

export default ComparePage;
