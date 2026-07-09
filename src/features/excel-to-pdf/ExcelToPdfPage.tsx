import { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useToast } from '@/hooks/useToast';
import { FileSpreadsheet, X } from 'lucide-react';
import { ToolShell } from '@/components/layout/ToolShell';
import { FileDropzone } from '@/components/pdf/FileDropzone';
import { ProcessButton } from '@/components/pdf/ProcessButton';
import { ProgressOverlay } from '@/components/pdf/ProgressOverlay';
import { Card, CardContent } from '@/components/ui/card';
import { downloadBlob } from '@/lib/files/download';
import { formatBytes } from '@/lib/utils/formatBytes';
import { cn } from '@/lib/utils/cn';
import {
  excelToPdfProcessor,
  type ExcelToPdfOptions,
} from './excelToPdfProcessor';

type PageSize = 'a4' | 'letter';
type Orientation = 'portrait' | 'landscape';

export function ExcelToPdfPage() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [pageSize, setPageSize] = useState<PageSize>('a4');
  const [orientation, setOrientation] = useState<Orientation>('portrait');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [note, setNote] = useState('');
  const [result, setResult] = useState<{ size: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const handleFiles = useCallback((files: File[]) => {
    const picked = files[0];
    if (!picked) return;
    setFile(picked);
    setResult(null);
    setError(null);
  }, []);

  const handleClear = useCallback(() => {
    setFile(null);
    setResult(null);
    setError(null);
  }, []);

  const canRun = !!file && !busy;

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
      const options: ExcelToPdfOptions = { file, pageSize, orientation };
      const res = await excelToPdfProcessor(options, (f, n) => {
        setProgress(f);
        if (n) setNote(n);
      }, ac.signal);
      const out = res.outputs[0];
      if (!out) throw new Error('No output produced.');
      await downloadBlob(out.blob, out.name);
      setResult({ size: out.blob.size });
    } catch (e) {
      if (ac.signal.aborted || (e as Error).message === 'aborted') {
        // user cancelled — silent
      } else {
        const msg = (e as Error).message;
        setError(msg);
        toast({ message: t('tools.excelToPdf.failed', { message: msg }), variant: 'error' });
      }
    } finally {
      setBusy(false);
      abortRef.current = null;
    }
  }, [file, pageSize, orientation, t]);

  const pageSizeOptions: { value: PageSize; label: string }[] = [
    { value: 'a4', label: 'A4' },
    { value: 'letter', label: 'Letter' },
  ];

  const orientationOptions: { value: Orientation; label: string }[] = [
    { value: 'portrait', label: t('tools.excelToPdf.portrait') },
    { value: 'landscape', label: t('tools.excelToPdf.landscape') },
  ];

  return (
    <ToolShell
      title={t('tools.excelToPdf.name')}
      tagline={t('tools.excelToPdf.description')}
      onStartOver={file ? handleClear : undefined}
      sidebar={
        <div className="flex flex-col gap-4">
          <div className="text-sm text-ink-muted">
            {!file && t('tools.excelToPdf.hintEmpty')}
          </div>

          <div className="flex flex-col gap-2">
            <span className="text-xs font-medium text-ink-muted">
              {t('tools.excelToPdf.pageSize')}
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

          <div className="flex flex-col gap-2">
            <span className="text-xs font-medium text-ink-muted">
              {t('tools.excelToPdf.orientation')}
            </span>
            <div
              role="radiogroup"
              className="flex flex-col gap-1 rounded-card border border-black/5 bg-white p-1"
            >
              {orientationOptions.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  role="radio"
                  aria-checked={orientation === opt.value}
                  onClick={() => setOrientation(opt.value)}
                  className={cn(
                    'rounded-button px-3 py-2 text-left text-sm transition-colors',
                    orientation === opt.value
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
            label={t('tools.excelToPdf.cta')}
            onClick={handleRun}
            disabled={!canRun}
            loading={busy}
          />
          {result && (
            <div className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900">
              {t('tools.excelToPdf.success', { size: formatBytes(result.size) })}
            </div>
          )}
          {error && <div className="text-sm text-red-600">{error}</div>}
          <p className="text-xs text-ink-muted">
            {t('tools.excelToPdf.noteLimitation')}
          </p>
        </div>
      }
    >
      {file ? (
        <Card>
          <CardContent className="flex items-center justify-between gap-4 p-6">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-green-100 text-green-700">
                <FileSpreadsheet className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-ink">
                  {file.name}
                </p>
                <p className="text-xs text-ink-muted">{formatBytes(file.size)}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={handleClear}
              aria-label={t('common.remove')}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-ink-muted hover:bg-surface-muted hover:text-red-600"
            >
              <X className="h-4 w-4" />
            </button>
          </CardContent>
        </Card>
      ) : (
        <FileDropzone
          onFiles={handleFiles}
          multiple={false}
          accept={[
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          ]}
        />
      )}
      <ProgressOverlay
        open={busy}
        label={note || t('tools.excelToPdf.progress')}
        fraction={progress}
        onCancel={() => abortRef.current?.abort()}
      />
    </ToolShell>
  );
}

export default ExcelToPdfPage;
