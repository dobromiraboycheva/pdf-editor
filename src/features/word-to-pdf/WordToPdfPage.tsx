import { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useToast } from '@/hooks/useToast';
import { FileText, X } from 'lucide-react';
import { ToolShell } from '@/components/layout/ToolShell';
import { FileDropzone } from '@/components/pdf/FileDropzone';
import { ProcessButton } from '@/components/pdf/ProcessButton';
import { ProgressOverlay } from '@/components/pdf/ProgressOverlay';
import { Card, CardContent } from '@/components/ui/card';
import { downloadBlob } from '@/lib/files/download';
import { formatBytes } from '@/lib/utils/formatBytes';
import { cn } from '@/lib/utils/cn';
import { wordToPdfProcessor } from './wordToPdfProcessor';
import { useWordToPdfStore, type WordToPdfPageSize } from './useStore';

const DOCX_MIME =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

export function WordToPdfPage() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const file = useWordToPdfStore((s) => s.file);
  const pageSize = useWordToPdfStore((s) => s.pageSize);
  const setFile = useWordToPdfStore((s) => s.setFile);
  const setPageSize = useWordToPdfStore((s) => s.setPageSize);

  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [note, setNote] = useState('');
  const [result, setResult] = useState<{ name: string; size: number } | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const handleFiles = useCallback(
    (files: File[]) => {
      setError(null);
      setResult(null);
      const picked = files.find(
        (f) => f.type === DOCX_MIME || /\.docx$/i.test(f.name),
      );
      if (picked) setFile(picked);
    },
    [setFile],
  );

  const clear = useCallback(() => {
    setFile(null);
    setResult(null);
    setError(null);
  }, [setFile]);

  const canRun = file !== null && !busy;

  const handleRun = useCallback(async () => {
    if (!file) return;
    setBusy(true);
    setResult(null);
    setError(null);
    setProgress(0);
    setNote('');
    const ac = new AbortController();
    abortRef.current = ac;
    try {
      const res = await wordToPdfProcessor(
        { file, pageSize },
        (f, n) => {
          setProgress(f);
          if (n) setNote(n);
        },
        ac.signal,
      );
      const out = res.outputs[0];
      if (!out) throw new Error('No output produced.');
      await downloadBlob(out.blob, out.name);
      setResult({ name: out.name, size: out.blob.size });
    } catch (e) {
      if (ac.signal.aborted || (e as Error).message === 'aborted') {
        // user cancelled — silent
      } else {
        const msg = (e as Error).message;
        setError(msg);
        toast({ message: t('tools.wordToPdf.failed', { message: msg }), variant: 'error' });
      }
    } finally {
      setBusy(false);
      abortRef.current = null;
    }
  }, [file, pageSize, t]);

  const pageSizeOptions: { value: WordToPdfPageSize; label: string }[] = [
    { value: 'a4', label: t('tools.jpgToPdf.pageSizeA4') },
    { value: 'letter', label: t('tools.jpgToPdf.pageSizeLetter') },
  ];

  return (
    <ToolShell
      title={t('tools.wordToPdf.name')}
      tagline={t('tools.wordToPdf.description')}
      onStartOver={file ? clear : undefined}
      sidebar={
        <div className="flex flex-col gap-4">
          <div className="text-sm text-ink-muted">
            {!file && t('tools.wordToPdf.hintEmpty')}
          </div>

          <div className="flex flex-col gap-2">
            <span className="text-xs font-medium text-ink-muted">
              {t('tools.wordToPdf.pageSize')}
            </span>
            <div
              role="radiogroup"
              className="flex flex-col gap-1 rounded-card border border-black/5 bg-white p-1"
            >
              {pageSizeOptions.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  role="radio"
                  aria-checked={pageSize === opt.value}
                  onClick={() => setPageSize(opt.value)}
                  className={cn(
                    'rounded-button px-3 py-2 text-left text-sm transition-colors',
                    pageSize === opt.value
                      ? 'bg-brand-500 text-white'
                      : 'text-ink hover:bg-surface-muted',
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <ProcessButton
            label={t('tools.wordToPdf.cta')}
            onClick={handleRun}
            disabled={!canRun}
            loading={busy}
          />
          {result && (
            <div className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900">
              {t('tools.wordToPdf.success', {
                name: result.name,
                size: formatBytes(result.size),
              })}
            </div>
          )}
          {error && <div className="text-sm text-red-600">{error}</div>}
        </div>
      }
    >
      {!file ? (
        <FileDropzone
          onFiles={handleFiles}
          multiple={false}
          accept={[DOCX_MIME, '.docx']}
        />
      ) : (
        <Card>
          <CardContent className="flex items-center gap-4 p-6">
            <div className="flex h-12 w-12 items-center justify-center rounded-card bg-blue-50 text-blue-600">
              <FileText className="h-6 w-6" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-ink" title={file.name}>
                {file.name}
              </p>
              <p className="text-xs text-ink-muted">{formatBytes(file.size)}</p>
            </div>
            <button
              type="button"
              onClick={clear}
              aria-label={t('common.remove')}
              className="flex h-8 w-8 items-center justify-center rounded-full text-ink-muted hover:bg-surface-muted hover:text-ink"
            >
              <X className="h-4 w-4" />
            </button>
          </CardContent>
        </Card>
      )}
      <ProgressOverlay
        open={busy}
        label={note || t('tools.wordToPdf.progress')}
        fraction={progress}
        onCancel={() => abortRef.current?.abort()}
      />
    </ToolShell>
  );
}

export default WordToPdfPage;
