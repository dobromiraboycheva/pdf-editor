import { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useToast } from '@/hooks/useToast';
import { MonitorPlay, X } from 'lucide-react';
import { ToolShell } from '@/components/layout/ToolShell';
import { FileDropzone } from '@/components/pdf/FileDropzone';
import { ProcessButton } from '@/components/pdf/ProcessButton';
import { ProgressOverlay } from '@/components/pdf/ProgressOverlay';
import { Card, CardContent } from '@/components/ui/card';
import { downloadBlob } from '@/lib/files/download';
import { formatBytes } from '@/lib/utils/formatBytes';
import {
  powerpointToPdfProcessor,
  type PowerpointToPdfOptions,
} from './powerpointToPdfProcessor';

export function PowerpointToPdfPage() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [file, setFile] = useState<File | null>(null);
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
      const options: PowerpointToPdfOptions = { file };
      const res = await powerpointToPdfProcessor(options, (f, n) => {
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
        toast({ message: t('tools.powerpointToPdf.failed', { message: msg }), variant: 'error' });
      }
    } finally {
      setBusy(false);
      abortRef.current = null;
    }
  }, [file, t]);

  return (
    <ToolShell
      title={t('tools.powerpointToPdf.name')}
      tagline={t('tools.powerpointToPdf.description')}
      onStartOver={file ? handleClear : undefined}
      sidebar={
        <div className="flex flex-col gap-4">
          <div className="text-sm text-ink-muted">
            {!file && t('tools.powerpointToPdf.hintEmpty')}
          </div>

          <div className="flex flex-col gap-2">
            <span className="text-xs font-medium text-ink-muted">
              {t('tools.powerpointToPdf.pageSize')}
            </span>
            <div className="rounded-card border border-black/5 bg-white px-3 py-2 text-sm text-ink">
              10 × 7.5 in (720 × 540 pt)
            </div>
          </div>

          <ProcessButton
            label={t('tools.powerpointToPdf.cta')}
            onClick={handleRun}
            disabled={!canRun}
            loading={busy}
          />
          {result && (
            <div className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900">
              {t('tools.powerpointToPdf.success', {
                size: formatBytes(result.size),
              })}
            </div>
          )}
          {error && <div className="text-sm text-red-600">{error}</div>}
          <p className="text-xs text-ink-muted">
            {t('tools.powerpointToPdf.noteLimitation')}
          </p>
        </div>
      }
    >
      {file ? (
        <Card>
          <CardContent className="flex items-center justify-between gap-4 p-6">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-red-100 text-red-600">
                <MonitorPlay className="h-5 w-5" />
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
            'application/vnd.openxmlformats-officedocument.presentationml.presentation',
          ]}
        />
      )}
      <ProgressOverlay
        open={busy}
        label={note || t('tools.powerpointToPdf.progress')}
        fraction={progress}
        onCancel={() => abortRef.current?.abort()}
      />
    </ToolShell>
  );
}

export default PowerpointToPdfPage;
