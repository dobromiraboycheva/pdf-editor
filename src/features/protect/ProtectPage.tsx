import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useToast } from '@/hooks/useToast';
import { ToolShell } from '@/components/layout/ToolShell';
import { FileDropzone } from '@/components/pdf/FileDropzone';
import { ProcessButton } from '@/components/pdf/ProcessButton';
import { ProgressOverlay } from '@/components/pdf/ProgressOverlay';
import { Card, CardContent } from '@/components/ui/card';
import { useIngestedPdfs } from '@/hooks/useIngestedPdfs';
import { downloadBlob } from '@/lib/files/download';
import { formatBytes } from '@/lib/utils/formatBytes';
import { protectProcessor, type ProtectOptions } from './protectProcessor';

interface Result {
  size: number;
}

export function ProtectPage() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { files, addFiles, clear, isIngesting, error } = useIngestedPdfs();
  const file = files[0];

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [note, setNote] = useState('');
  const [result, setResult] = useState<Result | null>(null);

  const passwordLongEnough = password.length >= 4;
  const passwordsMatch = password.length > 0 && password === confirm;
  const canRun =
    !!file && passwordLongEnough && passwordsMatch && !busy && !isIngesting;

  const handleRun = useCallback(async () => {
    if (!file) return;
    setBusy(true);
    setResult(null);
    setProgress(0);
    setNote('');
    try {
      const options: ProtectOptions = { password };
      const res = await protectProcessor({
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
      toast({ message: t('tools.protect.failed', { message: (e as Error).message }), variant: 'error' });
    } finally {
      setBusy(false);
    }
  }, [file, password, t]);

  return (
    <ToolShell
      title={t('tools.protect.name')}
      tagline={t('tools.protect.description')}
      onStartOver={file ? clear : undefined}
      sidebar={
        <div className="flex flex-col gap-4">
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-ink">
              {t('tools.protect.passwordLabel')}
            </span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="h-10 rounded-button border border-black/10 bg-white px-3 text-sm text-ink outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/30"
            />
            {password.length > 0 && !passwordLongEnough && (
              <span className="text-xs text-red-600">
                {t('tools.protect.passwordTooShort')}
              </span>
            )}
          </label>

          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-ink">
              {t('tools.protect.passwordConfirm')}
            </span>
            <input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className="h-10 rounded-button border border-black/10 bg-white px-3 text-sm text-ink outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/30"
            />
            {confirm.length > 0 && !passwordsMatch && (
              <span className="text-xs text-red-600">
                {t('tools.protect.passwordMismatch')}
              </span>
            )}
          </label>

          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-900">
            {t('tools.protect.note')}
          </div>

          <ProcessButton
            label={t('tools.protect.cta')}
            onClick={handleRun}
            disabled={!canRun}
            loading={busy}
          />

          {result && (
            <div className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900">
              {t('tools.protect.success', { size: formatBytes(result.size) })}
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
          <CardContent className="p-6">
            <div className="min-w-0">
              <div className="truncate text-base font-medium text-ink">
                {file.name}
              </div>
              <div className="mt-1 text-sm text-ink-muted">
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
        label={note || t('tools.protect.progress')}
        fraction={progress}
      />
    </ToolShell>
  );
}

export default ProtectPage;
