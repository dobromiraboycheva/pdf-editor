import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useToast } from '@/hooks/useToast';
import {
  ChevronLeft,
  ChevronRight,
  Maximize2,
  Minimize2,
  X,
  RotateCcw,
  Lock,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { ToolShell } from '@/components/layout/ToolShell';
import { FileDropzone } from '@/components/pdf/FileDropzone';
import { ProcessButton } from '@/components/pdf/ProcessButton';
import { ProgressOverlay } from '@/components/pdf/ProgressOverlay';
import { Card, CardContent } from '@/components/ui/card';
import { useIngestedPdfs } from '@/hooks/useIngestedPdfs';
import { downloadBlob } from '@/lib/files/download';
import { formatBytes } from '@/lib/utils/formatBytes';
import { cn } from '@/lib/utils/cn';
import { EditCanvas } from './EditCanvas';
import { EditToolbar } from './EditToolbar';
import { useEditStore } from './useEditStore';
import { editProcessor } from './editProcessor';

export function EditPage() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { files, addFiles, clear, isIngesting, error } = useIngestedPdfs();

  const annotations = useEditStore((s) => s.annotations);
  const currentTool = useEditStore((s) => s.currentTool);
  const currentPageIndex = useEditStore((s) => s.currentPageIndex);
  const setCurrentPage = useEditStore((s) => s.setCurrentPage);
  const undo = useEditStore((s) => s.undo);
  const redo = useEditStore((s) => s.redo);
  const clearPage = useEditStore((s) => s.clearPage);
  const reset = useEditStore((s) => s.reset);

  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [note, setNote] = useState('');
  const abortRef = useRef<AbortController | null>(null);
  const [result, setResult] = useState<{ size: number } | null>(null);
  const [jumpValue, setJumpValue] = useState('1');
  const [fullscreen, setFullscreen] = useState(false);
  const [mode, setMode] = useState<'annotate' | 'edit'>('annotate');

  const file = files[0];
  const pageCount = file?.pageCount ?? 0;
  const lastFileIdRef = useRef<string | null>(null);

  // Reset the store when the loaded file changes.
  useEffect(() => {
    const id = file?.id ?? null;
    if (id !== lastFileIdRef.current) {
      lastFileIdRef.current = id;
      reset();
      setResult(null);
      setJumpValue('1');
    }
  }, [file, reset]);

  useEffect(() => {
    setJumpValue(String(currentPageIndex + 1));
  }, [currentPageIndex]);

  // Auto-enter fullscreen the moment a file is loaded — this is a full-editor experience.
  useEffect(() => {
    if (file) setFullscreen(true);
  }, [file]);

  // Global shortcuts.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const inField =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable);
      if (inField) return;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if (mod && ((e.key === 'z' && e.shiftKey) || e.key === 'y')) {
        e.preventDefault();
        redo();
      } else if (e.key === 'Escape' && fullscreen) {
        setFullscreen(false);
      } else if (e.key === 'F11') {
        e.preventDefault();
        setFullscreen((v) => !v);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo, redo, fullscreen]);

  // Lock body scroll while fullscreen so the workspace is fully immersive.
  useEffect(() => {
    if (!fullscreen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [fullscreen]);

  const handleSave = useCallback(async () => {
    if (!file) return;
    setBusy(true);
    setProgress(0);
    setNote('');
    setResult(null);
    const ac = new AbortController();
    abortRef.current = ac;
    try {
      const res = await editProcessor({
        files: [file],
        options: { annotations: useEditStore.getState().annotations },
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
        toast({ message: t('tools.edit.failed', { message: (e as Error).message }), variant: 'error' });
      }
    } finally {
      setBusy(false);
      abortRef.current = null;
    }
  }, [file, t]);

  const goToPage = useCallback(
    (idx: number) => {
      if (!file) return;
      const clamped = Math.max(0, Math.min(file.pageCount - 1, idx));
      setCurrentPage(clamped);
    },
    [file, setCurrentPage],
  );

  const commitJump = () => {
    const parsed = parseInt(jumpValue, 10);
    if (!Number.isNaN(parsed)) goToPage(parsed - 1);
    else setJumpValue(String(currentPageIndex + 1));
  };

  const canSave = !!file && !busy && !isIngesting;

  // Fullscreen mode: replaces the whole viewport with a pro editor layout.
  if (fullscreen && file) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col bg-surface-muted">
        {/* Top bar */}
        <div className="flex h-14 flex-none items-center justify-between border-b border-black/10 bg-white px-4 shadow-sm">
          <div className="flex min-w-0 items-center gap-3">
            <Link
              to="/"
              className="flex h-9 w-9 items-center justify-center rounded-button text-ink-muted hover:bg-surface-muted"
              title={t('common.back')}
            >
              <X className="h-4 w-4" />
            </Link>
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-ink">
                {t('tools.edit.name')}
              </div>
              <div className="truncate text-xs text-ink-muted">
                {file.name} · {formatBytes(file.size)} · {file.pageCount}{' '}
                {t('common.pages')}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="hidden sm:inline-flex items-center gap-1.5 rounded-full border border-black/5 bg-surface-muted px-2.5 py-1 text-xs font-medium text-ink-muted">
              <Lock className="h-3 w-3" aria-hidden />
              {t('common.offline')}
            </span>
            <button
              type="button"
              onClick={clear}
              className="inline-flex h-9 items-center gap-1.5 rounded-button border border-black/10 bg-white px-3 text-sm text-ink hover:bg-surface-muted"
              title={t('common.startOver')}
            >
              <RotateCcw className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{t('common.startOver')}</span>
            </button>
            <button
              type="button"
              onClick={() => setFullscreen(false)}
              className="inline-flex h-9 items-center gap-1.5 rounded-button border border-black/10 bg-white px-3 text-sm text-ink hover:bg-surface-muted"
              title={t('common.exitFullscreen')}
            >
              <Minimize2 className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">
                {t('common.exitFullscreen')}
              </span>
            </button>
          </div>
        </div>

        {/* Toolbar row */}
        <div className="flex-none border-b border-black/10 bg-white px-4 py-2">
          <div className="mb-3 flex justify-center">
            <div className="inline-flex rounded-full border border-black/10 bg-white p-1 shadow-sm">
              <button
                type="button"
                onClick={() => setMode('annotate')}
                aria-pressed={mode === 'annotate'}
                className={cn(
                  'rounded-full px-4 py-1.5 text-sm font-medium transition-colors',
                  mode === 'annotate'
                    ? 'bg-brand-500 text-white'
                    : 'text-ink-muted hover:text-ink',
                )}
              >
                {t('tools.edit.modeAnnotate')}
              </button>
              <button
                type="button"
                onClick={() => setMode('edit')}
                aria-pressed={mode === 'edit'}
                className={cn(
                  'rounded-full px-4 py-1.5 text-sm font-medium transition-colors',
                  mode === 'edit'
                    ? 'bg-brand-500 text-white'
                    : 'text-ink-muted hover:text-ink',
                )}
              >
                {t('tools.edit.modeEdit')}
              </button>
            </div>
          </div>
          <EditToolbar currentPageIndex={currentPageIndex} mode={mode} />
        </div>

        {/* Main workspace: canvas fills remaining vertical space */}
        <div className="flex min-h-0 flex-1">
          {/* Canvas area — fills available space */}
          <div className="flex min-w-0 flex-1 flex-col">
            <div className="flex-1 overflow-auto p-6">
              <div className="mx-auto flex items-start justify-center">
                <EditCanvas
                  pdfjsDoc={file.pdfjsDoc}
                  pageIndex={currentPageIndex}
                />
              </div>
            </div>

            {/* Page navigator at bottom of canvas area */}
            <div className="flex flex-none items-center justify-center gap-3 border-t border-black/10 bg-white py-3">
              <button
                type="button"
                onClick={() => goToPage(currentPageIndex - 1)}
                disabled={currentPageIndex === 0}
                aria-label={t('tools.edit.prevPage')}
                className={cn(
                  'flex h-9 w-9 items-center justify-center rounded-button border border-black/10 bg-white transition-colors',
                  currentPageIndex === 0
                    ? 'text-ink-muted/40'
                    : 'text-ink hover:bg-surface-muted',
                )}
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <div className="flex items-center gap-1 text-sm text-ink">
                <input
                  type="text"
                  inputMode="numeric"
                  value={jumpValue}
                  onChange={(e) => setJumpValue(e.target.value)}
                  onBlur={commitJump}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      commitJump();
                    }
                  }}
                  className="h-9 w-14 rounded-button border border-black/10 bg-white text-center text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/30"
                />
                <span className="text-ink-muted">/ {pageCount}</span>
              </div>
              <button
                type="button"
                onClick={() => goToPage(currentPageIndex + 1)}
                disabled={currentPageIndex >= pageCount - 1}
                aria-label={t('tools.edit.nextPage')}
                className={cn(
                  'flex h-9 w-9 items-center justify-center rounded-button border border-black/10 bg-white transition-colors',
                  currentPageIndex >= pageCount - 1
                    ? 'text-ink-muted/40'
                    : 'text-ink hover:bg-surface-muted',
                )}
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Sidebar */}
          <aside className="hidden w-80 flex-none flex-col gap-4 overflow-y-auto border-l border-black/10 bg-white p-4 md:flex">
            <div className="text-sm text-ink-muted">
              {t('tools.edit.annotationsCount', { count: annotations.length })}
            </div>
            <div className="text-xs text-ink-muted">
              {t('tools.edit.selectHint')}
            </div>
            {currentTool === 'select' && (
              <div className="rounded-md border border-brand-100 bg-brand-50 p-2 text-[11px] leading-snug text-brand-700">
                {t('tools.edit.selectableText')}
              </div>
            )}

            <ProcessButton
              label={t('tools.edit.cta')}
              onClick={handleSave}
              disabled={!canSave}
              loading={busy}
            />

            <button
              type="button"
              onClick={() => clearPage(currentPageIndex)}
              className="h-9 rounded-button border border-black/10 bg-white text-sm text-ink hover:bg-surface-muted"
            >
              {t('tools.edit.clearPage')}
            </button>

            {result && (
              <div className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900">
                {t('tools.edit.success', { size: formatBytes(result.size) })}
              </div>
            )}
            {error && <div className="text-sm text-red-600">{error}</div>}

            <div className="mt-auto text-[11px] leading-relaxed text-ink-muted">
              <kbd className="rounded border border-black/10 bg-surface-muted px-1">
                Esc
              </kbd>{' '}
              {t('common.exitFullscreen').toLowerCase()} ·{' '}
              <kbd className="rounded border border-black/10 bg-surface-muted px-1">
                ⌘Z
              </kbd>{' '}
              {t('tools.edit.undo').toLowerCase()}
            </div>
          </aside>
        </div>

        {/* Mobile save button (when sidebar hidden) */}
        <div className="flex-none border-t border-black/10 bg-white p-3 md:hidden">
          <ProcessButton
            label={t('tools.edit.cta')}
            onClick={handleSave}
            disabled={!canSave}
            loading={busy}
          />
        </div>

        <ProgressOverlay
          open={busy}
          label={note || t('tools.edit.progress')}
          fraction={progress}
          onCancel={() => abortRef.current?.abort()}
        />
      </div>
    );
  }

  // Non-fullscreen: keeps the ToolShell frame (for the empty state / drop zone).
  return (
    <ToolShell
      title={t('tools.edit.name')}
      tagline={t('tools.edit.tagline')}
      onStartOver={files.length > 0 ? clear : undefined}
      sidebar={
        <div className="flex flex-col gap-4">
          <div className="text-sm text-ink-muted">
            {!file && t('tools.edit.hintEmpty')}
            {file && (
              <span>
                {t('tools.edit.annotationsCount', { count: annotations.length })}
              </span>
            )}
          </div>

          {file && (
            <>
              <button
                type="button"
                onClick={() => setFullscreen(true)}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-button bg-brand-500 px-4 text-sm font-medium text-white shadow-sm transition-colors hover:bg-brand-600"
              >
                <Maximize2 className="h-4 w-4" />
                {t('common.openFullscreen')}
              </button>
              <div className="text-xs text-ink-muted">
                {t('tools.edit.selectHint')}
              </div>
            </>
          )}

          <ProcessButton
            label={t('tools.edit.cta')}
            onClick={handleSave}
            disabled={!canSave}
            loading={busy}
          />

          {result && (
            <div className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900">
              {t('tools.edit.success', { size: formatBytes(result.size) })}
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
        <Card>
          <CardContent className="p-4">
            <div className="min-w-0">
              <div className="truncate text-sm font-medium text-ink">
                {file.name}
              </div>
              <div className="mt-0.5 text-xs text-ink-muted">
                {formatBytes(file.size)}
                {' · '}
                {file.pageCount} {t('common.pages')}
              </div>
            </div>
          </CardContent>
        </Card>
      )}
      <ProgressOverlay
        open={busy}
        label={note || t('tools.edit.progress')}
        fraction={progress}
        onCancel={() => abortRef.current?.abort()}
      />
    </ToolShell>
  );
}

export default EditPage;
