import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useToast } from '@/hooks/useToast';
import { ToolShell } from '@/components/layout/ToolShell';
import { FileDropzone } from '@/components/pdf/FileDropzone';
import { ProcessButton } from '@/components/pdf/ProcessButton';
import { ProgressOverlay } from '@/components/pdf/ProgressOverlay';
import { Card, CardContent } from '@/components/ui/card';
import { downloadBlob } from '@/lib/files/download';
import { formatBytes } from '@/lib/utils/formatBytes';
import { unlockPdfFile } from './unlockProcessor';

/**
 * Unlock PDF page — deliberately bypasses `useIngestedPdfs` because encrypted
 * PDFs can't be pre-ingested (pdf.js needs the password to render, pdf-lib
 * refuses to load). We work with the raw File directly and pass it into
 * `unlockPdfFile` which uses pdf.js's password-aware loader.
 */
export function UnlockPage() {
  const { t } = useTranslation();
  const { toast } = useToast();

  const [file, setFile] = useState<File | null>(null);
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [note, setNote] = useState('');
  const [result, setResult] = useState<{ size: number } | null>(null);

  const canRun = !!file && !busy;

  const handleFiles = useCallback((files: File[]) => {
    const f = files[0];
    if (!f) return;
    setFile(f);
    setResult(null);
  }, []);

  const handleClear = useCallback(() => {
    setFile(null);
    setPassword('');
    setResult(null);
  }, []);

  const handleRun = useCallback(async () => {
    if (!file) return;
    setBusy(true);
    setResult(null);
    setProgress(0);
    setNote('');
    try {
      const blob = await unlockPdfFile(file, password, (f, n) => {
        setProgress(f);
        if (n) setNote(n);
      });
      await downloadBlob(blob, 'unlocked.pdf');
      setResult({ size: blob.size });
    } catch (e) {
      const msg = (e as Error).message;
      const message =
        msg === 'wrongPassword'
          ? t('tools.unlock.wrongPassword')
          : t('tools.unlock.failed', { message: msg });
      toast({ message, variant: 'error' });
    } finally {
      setBusy(false);
    }
  }, [file, password, t, toast]);

  return (
    <ToolShell
      title={t('tools.unlock.name')}
      tagline={t('tools.unlock.description')}
      onStartOver={file ? handleClear : undefined}
      sidebar={
        <div className="flex flex-col gap-4">
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-ink">
              {t('tools.unlock.passwordLabel')}
            </span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="h-10 rounded-button border border-black/10 bg-white px-3 text-sm text-ink outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/30"
              autoComplete="off"
            />
          </label>

          <ProcessButton
            label={t('tools.unlock.cta')}
            onClick={handleRun}
            disabled={!canRun}
            loading={busy}
          />

          {result && (
            <div className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900">
              {t('tools.unlock.success', { size: formatBytes(result.size) })}
            </div>
          )}
        </div>
      }
    >
      {!file ? (
        <FileDropzone onFiles={handleFiles} multiple={false} />
      ) : (
        <Card>
          <CardContent className="p-6">
            <div className="min-w-0">
              <div className="truncate text-base font-medium text-ink">
                {file.name}
              </div>
              <div className="mt-1 text-sm text-ink-muted">
                {formatBytes(file.size)}
              </div>
            </div>
          </CardContent>
        </Card>
      )}
      <ProgressOverlay
        open={busy}
        label={note || t('tools.unlock.progress')}
        fraction={progress}
      />
    </ToolShell>
  );
}

export default UnlockPage;
