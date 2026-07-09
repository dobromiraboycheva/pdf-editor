import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useToast } from '@/hooks/useToast';
import { RotateCcw, RotateCw, FlipHorizontal2 } from 'lucide-react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { ToolShell } from '@/components/layout/ToolShell';
import { FileDropzone } from '@/components/pdf/FileDropzone';
import { ProcessButton } from '@/components/pdf/ProcessButton';
import { ProgressOverlay } from '@/components/pdf/ProgressOverlay';
import { Button } from '@/components/ui/button';
import { useIngestedPdfs } from '@/hooks/useIngestedPdfs';
import { downloadBlob } from '@/lib/files/download';
import { renderThumbnail } from '@/lib/pdf/renderThumbnails';
import { formatBytes } from '@/lib/utils/formatBytes';
import { cn } from '@/lib/utils/cn';
import { rotateProcessor } from './rotateProcessor';
import { useRotateStore, type RotateAngle } from './useRotateStore';

const MAX_GRID_PAGES = 60;

interface RotatableThumbProps {
  index: number;
  label: string;
  canvas?: HTMLCanvasElement;
  rotation: RotateAngle;
  onClick: () => void;
}

function RotatableThumb({ label, canvas, rotation, onClick }: RotatableThumbProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = mountRef.current;
    if (!el || !canvas) return;
    canvas.classList.add('h-full', 'w-full', 'object-contain');
    canvas.style.maxWidth = '100%';
    canvas.style.maxHeight = '100%';
    el.appendChild(canvas);
    return () => {
      if (canvas.parentElement === el) {
        el.removeChild(canvas);
      }
    };
  }, [canvas]);

  return (
    <button
      type="button"
      onClick={onClick}
      className="group relative flex h-[200px] w-40 flex-col overflow-hidden rounded-card border border-black/5 bg-white shadow-card transition-transform hover:-translate-y-0.5 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
    >
      <div className="relative flex flex-1 items-center justify-center overflow-hidden bg-surface-muted">
        {canvas ? (
          <div
            ref={mountRef}
            className="flex h-full w-full items-center justify-center p-2 transition-transform"
            style={{ transform: `rotate(${rotation}deg)` }}
          />
        ) : (
          <div className="h-full w-full animate-pulse bg-black/5" />
        )}
        {rotation !== 0 && (
          <span className="absolute right-1.5 top-1.5 rounded-full bg-brand-500 px-2 py-0.5 text-[10px] font-semibold text-white shadow-sm">
            {rotation}°
          </span>
        )}
      </div>
      <div className="border-t border-black/5 px-3 py-2 text-left">
        <p className="text-xs font-medium capitalize text-ink">
          {label}
        </p>
      </div>
    </button>
  );
}

export function RotatePage() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { files, addFiles, clear, isIngesting, error } = useIngestedPdfs();
  const rotations = useRotateStore((s) => s.rotations);
  const rotate = useRotateStore((s) => s.rotate);
  const rotateAll = useRotateStore((s) => s.rotateAll);
  const reset = useRotateStore((s) => s.reset);
  const setPageCount = useRotateStore((s) => s.setPageCount);

  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [note, setNote] = useState('');
  const abortRef = useRef<AbortController | null>(null);
  const [result, setResult] = useState<{ size: number } | null>(null);
  const [thumbs, setThumbs] = useState<Record<number, HTMLCanvasElement>>({});

  const file = files[0];
  const pageCount = file?.pageCount ?? 0;
  const gridCount = Math.min(pageCount, MAX_GRID_PAGES);

  // Sync pageCount into store and reset rotations when file changes.
  useEffect(() => {
    setPageCount(pageCount);
    reset();
    setThumbs({});
    setResult(null);
  }, [file?.id, pageCount, setPageCount, reset]);

  // Render thumbnails serially.
  useEffect(() => {
    if (!file) return;
    const pdfjsDoc: PDFDocumentProxy = file.pdfjsDoc;
    const ac = new AbortController();
    (async () => {
      for (let i = 0; i < gridCount; i++) {
        try {
          const canvas = await renderThumbnail(pdfjsDoc, i, {
            widthPx: 140,
            signal: ac.signal,
          });
          if (ac.signal.aborted) return;
          setThumbs((prev) => ({ ...prev, [i]: canvas }));
        } catch {
          if (ac.signal.aborted) return;
          // Ignore render errors for individual pages.
        }
      }
    })();
    return () => ac.abort();
  }, [file, gridCount]);

  const anyRotation = useMemo(
    () => Object.values(rotations).some((r) => r !== 0),
    [rotations],
  );

  const canRotate = !!file && !busy && !isIngesting && anyRotation;

  const handleRotate = useCallback(async () => {
    if (!file) return;
    setBusy(true);
    setResult(null);
    setProgress(0);
    setNote('');
    const ac = new AbortController();
    abortRef.current = ac;
    try {
      const res = await rotateProcessor({
        files: [file],
        options: { pageRotations: rotations },
        signal: ac.signal,
        onProgress: (f, n) => {
          setProgress(f);
          if (n) setNote(n);
        },
      });
      const out = res.outputs[0];
      if (out) {
        await downloadBlob(out.blob, out.name);
        setResult({ size: out.blob.size });
      }
    } catch (e) {
      if (ac.signal.aborted || (e as Error).message === 'aborted') {
        // user cancelled — silent
      } else {
        toast({ message: t('tools.rotate.failed', { message: (e as Error).message }), variant: 'error' });
      }
    } finally {
      setBusy(false);
      abortRef.current = null;
    }
  }, [file, rotations, t]);

  return (
    <ToolShell
      title={t('tools.rotate.name')}
      tagline={t('tools.rotate.description')}
      onStartOver={file ? clear : undefined}
      sidebar={
        <div className="flex flex-col gap-4">
          <div className="text-sm text-ink-muted">
            {!file && t('tools.rotate.hintEmpty')}
            {file && t('tools.rotate.clickToRotate')}
          </div>
          <ProcessButton
            label={t('tools.rotate.cta')}
            onClick={handleRotate}
            disabled={!canRotate}
            loading={busy}
          />
          {result && (
            <div className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900">
              {t('tools.rotate.success', { size: formatBytes(result.size) })}
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
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-black/5 bg-white p-3 shadow-card">
            <div className="min-w-0">
              <p
                className="truncate text-sm font-medium text-ink"
                title={file.name}
              >
                {file.name}
              </p>
              <p className="text-xs text-ink-muted">
                {file.pageCount} {t('common.pages')} · {formatBytes(file.size)}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => rotateAll(-90)}
              >
                <RotateCcw className="h-4 w-4" />
                {t('tools.rotate.left')}
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => rotateAll(90)}
              >
                <RotateCw className="h-4 w-4" />
                {t('tools.rotate.right')}
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => rotateAll(180)}
              >
                <FlipHorizontal2 className="h-4 w-4" />
                {t('tools.rotate.flip')}
              </Button>
            </div>
          </div>

          <div
            className={cn(
              'grid gap-4',
              'grid-cols-[repeat(auto-fill,minmax(160px,1fr))]',
            )}
          >
            {Array.from({ length: gridCount }).map((_, i) => (
              <RotatableThumb
                key={i}
                index={i}
                label={`${t('common.page')} ${i + 1}`}
                canvas={thumbs[i]}
                rotation={rotations[i] ?? 0}
                onClick={() => rotate(i, 90)}
              />
            ))}
          </div>
        </div>
      )}
      <ProgressOverlay
        open={busy}
        label={note || t('tools.rotate.progress')}
        fraction={progress}
        onCancel={() => abortRef.current?.abort()}
      />
    </ToolShell>
  );
}

export default RotatePage;
