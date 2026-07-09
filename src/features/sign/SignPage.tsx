import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { useTranslation } from 'react-i18next';
import { useToast } from '@/hooks/useToast';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
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
import { cn } from '@/lib/utils/cn';
import { useSignStore, type SignStamp } from './useSignStore';
import {
  signProcessor,
  type SignOptions,
  type SignStampSpec,
} from './signProcessor';

const PREVIEW_WIDTH_PX = 600;
const DPR = 2;
const STAMP_DEFAULT_WIDTH = 160;
const STAMP_DEFAULT_HEIGHT = 60;

type SigTab = 'draw' | 'type' | 'upload';

interface PageDims {
  cssWidth: number;
  cssHeight: number;
}

interface Result {
  size: number;
}

export function SignPage() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { files, addFiles, clear, isIngesting, error } = useIngestedPdfs();
  const file = files[0];
  const pageCount = file?.pageCount ?? 0;

  const signatureDataUrl = useSignStore((s) => s.signatureDataUrl);
  const signatureBlob = useSignStore((s) => s.signatureBlob);
  const stamps = useSignStore((s) => s.stamps);
  const currentPageIndex = useSignStore((s) => s.currentPageIndex);
  const setSignature = useSignStore((s) => s.setSignature);
  const addStamp = useSignStore((s) => s.addStamp);
  const removeStamp = useSignStore((s) => s.removeStamp);
  const setCurrentPageIndex = useSignStore((s) => s.setCurrentPageIndex);
  const resetStore = useSignStore((s) => s.reset);

  const [tab, setTab] = useState<SigTab>('draw');
  const [typedName, setTypedName] = useState('');

  const [canvas, setCanvas] = useState<HTMLCanvasElement | null>(null);
  const [dims, setDims] = useState<PageDims | null>(null);
  const canvasMountRef = useRef<HTMLDivElement | null>(null);

  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [note, setNote] = useState('');
  const [result, setResult] = useState<Result | null>(null);

  // Reset on file change.
  useEffect(() => {
    resetStore();
    setResult(null);
    setCanvas(null);
    setDims(null);
    setTypedName('');
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
        // ignore render errors
      }
    })();

    return () => {
      cancelled = true;
      ac.abort();
    };
  }, [file, currentPageIndex]);

  // Mount canvas.
  useEffect(() => {
    const el = canvasMountRef.current;
    if (!el || !canvas) return;
    el.appendChild(canvas);
    return () => {
      if (canvas.parentElement === el) el.removeChild(canvas);
    };
  }, [canvas]);

  const handlePrev = useCallback(() => {
    setCurrentPageIndex(Math.max(0, currentPageIndex - 1));
  }, [currentPageIndex, setCurrentPageIndex]);
  const handleNext = useCallback(() => {
    setCurrentPageIndex(Math.min(pageCount - 1, currentPageIndex + 1));
  }, [currentPageIndex, pageCount, setCurrentPageIndex]);

  // Handle click on the PDF overlay -> add stamp centred at click.
  const handleOverlayClick = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (!signatureBlob || !dims) return;
      const bounds = e.currentTarget.getBoundingClientRect();
      const localX = e.clientX - bounds.left;
      const localY = e.clientY - bounds.top;
      const width = STAMP_DEFAULT_WIDTH;
      const height = STAMP_DEFAULT_HEIGHT;
      const stamp: SignStamp = {
        id: uuid(),
        pageIndex: currentPageIndex,
        x: Math.max(0, Math.min(dims.cssWidth - width, localX - width / 2)),
        y: Math.max(0, Math.min(dims.cssHeight - height, localY - height / 2)),
        width,
        height,
        overlayCssWidth: dims.cssWidth,
        overlayCssHeight: dims.cssHeight,
      };
      addStamp(stamp);
    },
    [signatureBlob, dims, currentPageIndex, addStamp],
  );

  const canRun =
    !!file && !!signatureBlob && stamps.length > 0 && !busy && !isIngesting;

  const handleRun = useCallback(async () => {
    if (!file || !signatureBlob) return;
    setBusy(true);
    setResult(null);
    setProgress(0);
    setNote('');
    try {
      const stampSpecs: SignStampSpec[] = stamps.map((s) => ({
        pageIndex: s.pageIndex,
        x: s.x,
        y: s.y,
        width: s.width,
        height: s.height,
        overlayCssWidth: s.overlayCssWidth,
        overlayCssHeight: s.overlayCssHeight,
      }));
      const options: SignOptions = {
        signature: signatureBlob,
        stamps: stampSpecs,
      };
      const res = await signProcessor({
        files: [file],
        options,
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
      toast({ message: t('tools.sign.failed', { message: (e as Error).message }), variant: 'error' });
    } finally {
      setBusy(false);
    }
  }, [file, signatureBlob, stamps, t]);

  const pageStamps = useMemo(
    () => stamps.filter((s) => s.pageIndex === currentPageIndex),
    [stamps, currentPageIndex],
  );

  return (
    <ToolShell
      title={t('tools.sign.name')}
      tagline={t('tools.sign.description')}
      onStartOver={file ? clear : undefined}
      sidebar={
        <div className="flex flex-col gap-4">
          {/* Tab bar */}
          <div
            role="tablist"
            aria-label={t('tools.sign.name')}
            className="grid grid-cols-3 gap-1 rounded-button border border-black/10 bg-white p-1"
          >
            {(['draw', 'type', 'upload'] as SigTab[]).map((tk) => {
              const selected = tab === tk;
              return (
                <button
                  key={tk}
                  role="tab"
                  aria-selected={selected}
                  type="button"
                  onClick={() => setTab(tk)}
                  className={cn(
                    'h-9 rounded-button text-sm font-medium transition-colors',
                    selected
                      ? 'bg-brand-500 text-white'
                      : 'text-ink hover:bg-surface-muted',
                  )}
                >
                  {tk === 'draw'
                    ? t('tools.sign.drawTab')
                    : tk === 'type'
                      ? t('tools.sign.typeTab')
                      : t('tools.sign.uploadTab')}
                </button>
              );
            })}
          </div>

          {tab === 'draw' && (
            <SignatureDrawPad
              onCommit={(blob, dataUrl) => setSignature(dataUrl, blob)}
              onClear={() => setSignature(null, null)}
              clearLabel={t('tools.sign.clearSignature')}
            />
          )}

          {tab === 'type' && (
            <SignatureTypeInput
              value={typedName}
              onChange={setTypedName}
              placeholder={t('tools.sign.typePlaceholder')}
              onCommit={(blob, dataUrl) => setSignature(dataUrl, blob)}
              onClear={() => {
                setSignature(null, null);
                setTypedName('');
              }}
              clearLabel={t('tools.sign.clearSignature')}
            />
          )}

          {tab === 'upload' && (
            <SignatureUploadInput
              onCommit={(blob, dataUrl) => setSignature(dataUrl, blob)}
              onClear={() => setSignature(null, null)}
              clearLabel={t('tools.sign.clearSignature')}
            />
          )}

          {signatureDataUrl && (
            <div className="rounded-lg border border-black/10 bg-white p-2">
              <img
                src={signatureDataUrl}
                alt="signature preview"
                className="max-h-24 w-full object-contain"
              />
            </div>
          )}

          <div className="text-sm text-ink-muted">
            {!file && t('tools.sign.dropSignatureHint')}
            {file && !signatureBlob && t('tools.sign.dropSignatureHint')}
          </div>

          <ProcessButton
            label={t('tools.sign.cta')}
            onClick={handleRun}
            disabled={!canRun}
            loading={busy}
          />

          {result && (
            <div className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900">
              {t('tools.sign.success', { size: formatBytes(result.size) })}
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
                  onPointerDown={(e) => {
                    if (e.target === e.currentTarget) {
                      handleOverlayClick(e);
                    }
                  }}
                  className={cn(
                    'absolute inset-0 touch-none',
                    signatureBlob ? 'cursor-copy' : 'cursor-not-allowed',
                  )}
                  role="presentation"
                >
                  {pageStamps.map((s) => (
                    <div
                      key={s.id}
                      className="absolute overflow-hidden rounded border-2 border-brand-500/70 bg-white/60"
                      style={{
                        left: s.x,
                        top: s.y,
                        width: s.width,
                        height: s.height,
                      }}
                    >
                      {signatureDataUrl && (
                        <img
                          src={signatureDataUrl}
                          alt=""
                          className="h-full w-full object-contain"
                          draggable={false}
                        />
                      )}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          removeStamp(s.id);
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
        label={note || t('tools.sign.progress')}
        fraction={progress}
      />
    </ToolShell>
  );
}

/* --- Signature input components --- */

interface CommitFn {
  (blob: Blob, dataUrl: string): void;
}

interface DrawPadProps {
  onCommit: CommitFn;
  onClear: () => void;
  clearLabel: string;
}

function SignatureDrawPad({ onCommit, onClear, clearLabel }: DrawPadProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawing = useRef(false);
  const lastPoint = useRef<{ x: number; y: number } | null>(null);
  const hasInkRef = useRef(false);

  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.strokeStyle = '#111827';
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
  }, []);

  const getPoint = (
    e: ReactPointerEvent<HTMLCanvasElement>,
  ): { x: number; y: number } => {
    const c = canvasRef.current;
    if (!c) return { x: 0, y: 0 };
    const rect = c.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * c.width,
      y: ((e.clientY - rect.top) / rect.height) * c.height,
    };
  };

  const onDown = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const c = canvasRef.current;
    if (!c) return;
    c.setPointerCapture(e.pointerId);
    drawing.current = true;
    lastPoint.current = getPoint(e);
  };
  const onMove = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    const c = canvasRef.current;
    const last = lastPoint.current;
    if (!c || !last) return;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    const p = getPoint(e);
    ctx.beginPath();
    ctx.moveTo(last.x, last.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    lastPoint.current = p;
    hasInkRef.current = true;
  };
  const onUp = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    drawing.current = false;
    lastPoint.current = null;
    const c = canvasRef.current;
    if (!c) return;
    if (c.hasPointerCapture(e.pointerId)) {
      c.releasePointerCapture(e.pointerId);
    }
    if (!hasInkRef.current) return;
    c.toBlob((blob) => {
      if (!blob) return;
      onCommit(blob, c.toDataURL('image/png'));
    }, 'image/png');
  };

  const clear = () => {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, c.width, c.height);
    hasInkRef.current = false;
    onClear();
  };

  return (
    <div className="flex flex-col gap-2">
      <canvas
        ref={canvasRef}
        width={600}
        height={200}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        className="h-32 w-full touch-none rounded-lg border border-black/10 bg-white"
      />
      <Button type="button" variant="ghost" size="sm" onClick={clear}>
        {clearLabel}
      </Button>
    </div>
  );
}

interface TypeProps {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  onCommit: CommitFn;
  onClear: () => void;
  clearLabel: string;
}

function SignatureTypeInput({
  value,
  onChange,
  placeholder,
  onCommit,
  onClear,
  clearLabel,
}: TypeProps) {
  const onCommitRef = useRef(onCommit);
  const onClearRef = useRef(onClear);
  useEffect(() => {
    onCommitRef.current = onCommit;
    onClearRef.current = onClear;
  }, [onCommit, onClear]);

  // Render typed name onto an offscreen canvas whenever value changes.
  useEffect(() => {
    if (!value.trim()) {
      onClearRef.current();
      return;
    }
    const c = document.createElement('canvas');
    c.width = 600;
    c.height = 200;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.fillStyle = '#111827';
    ctx.font = 'italic 80px "Segoe Script", "Bradley Hand", cursive';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(value, c.width / 2, c.height / 2);
    c.toBlob((blob) => {
      if (!blob) return;
      onCommitRef.current(blob, c.toDataURL('image/png'));
    }, 'image/png');
  }, [value]);

  return (
    <div className="flex flex-col gap-2">
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-12 rounded-button border border-black/10 bg-white px-3 text-xl italic text-ink outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/30"
        style={{ fontFamily: '"Segoe Script", "Bradley Hand", cursive' }}
      />
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => onChange('')}
      >
        {clearLabel}
      </Button>
    </div>
  );
}

interface UploadProps {
  onCommit: CommitFn;
  onClear: () => void;
  clearLabel: string;
}

function SignatureUploadInput({
  onCommit,
  onClear,
  clearLabel,
}: UploadProps) {
  const [name, setName] = useState<string | null>(null);

  const onFile = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setName(f.name);
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result);
      onCommit(f, dataUrl);
    };
    reader.readAsDataURL(f);
  };

  return (
    <div className="flex flex-col gap-2">
      <input
        type="file"
        accept="image/png,image/jpeg"
        onChange={onFile}
        className="text-sm text-ink file:mr-3 file:cursor-pointer file:rounded-button file:border-0 file:bg-brand-500 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-white hover:file:bg-brand-600"
      />
      {name && (
        <span className="truncate text-xs text-ink-muted">{name}</span>
      )}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => {
          setName(null);
          onClear();
        }}
      >
        {clearLabel}
      </Button>
    </div>
  );
}

export default SignPage;
