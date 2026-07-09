import { useCallback, useRef, useState } from 'react';
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
import { cn } from '@/lib/utils/cn';
import type { CompressLevel } from '@/lib/pdf/compressImages';
import { useCompressStore } from './useCompressStore';
import { compressProcessor, type CompressOptions } from './compressProcessor';

interface CompressResult {
  inputBytes: number;
  outputBytes: number;
}

export function CompressPage() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { files, addFiles, clear, isIngesting, error } = useIngestedPdfs();
  const { level, setLevel } = useCompressStore();

  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [note, setNote] = useState('');
  const abortRef = useRef<AbortController | null>(null);
  const [result, setResult] = useState<CompressResult | null>(null);

  const canCompress = files.length === 1 && !busy && !isIngesting;

  const handleCompress = useCallback(async () => {
    setBusy(true);
    setResult(null);
    setProgress(0);
    setNote('');
    const ac = new AbortController();
    abortRef.current = ac;
    try {
      const options: CompressOptions = { level };
      const res = await compressProcessor({
        files,
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
      if (res.stats) {
        setResult({
          inputBytes: res.stats.inputBytes,
          outputBytes: res.stats.outputBytes,
        });
      }
    } catch (e) {
      if (ac.signal.aborted || (e as Error).message === 'aborted') {
        // user cancelled — silent
      } else {
        toast({ message: t('tools.compress.failed', { message: (e as Error).message }), variant: 'error' });
      }
    } finally {
      setBusy(false);
      abortRef.current = null;
    }
  }, [files, level, t]);

  const levels: { key: CompressLevel; name: string; desc: string }[] = [
    {
      key: 'low',
      name: t('tools.compress.levelLow'),
      desc: t('tools.compress.levelLowDesc'),
    },
    {
      key: 'medium',
      name: t('tools.compress.levelMedium'),
      desc: t('tools.compress.levelMediumDesc'),
    },
    {
      key: 'high',
      name: t('tools.compress.levelHigh'),
      desc: t('tools.compress.levelHighDesc'),
    },
  ];

  return (
    <ToolShell
      title={t('tools.compress.name')}
      tagline={t('tools.compress.description')}
      onStartOver={files.length > 0 ? clear : undefined}
      sidebar={
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            {levels.map((l) => {
              const selected = level === l.key;
              return (
                <button
                  key={l.key}
                  type="button"
                  onClick={() => setLevel(l.key)}
                  className={cn(
                    'w-full rounded-card border p-3 text-left transition-colors',
                    selected
                      ? 'border-brand-500 bg-brand-50'
                      : 'border-black/10 bg-white hover:border-black/20',
                  )}
                  aria-pressed={selected}
                >
                  <div className="flex items-start gap-3">
                    <span
                      className={cn(
                        'mt-1 flex h-4 w-4 flex-none items-center justify-center rounded-full border',
                        selected
                          ? 'border-brand-500 bg-brand-500'
                          : 'border-black/30 bg-white',
                      )}
                      aria-hidden
                    >
                      {selected && (
                        <span className="h-1.5 w-1.5 rounded-full bg-white" />
                      )}
                    </span>
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-ink">{l.name}</div>
                      <div className="mt-0.5 text-xs text-ink-muted">
                        {l.desc}
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          <div className="text-sm text-ink-muted">
            {files.length === 0 && t('tools.compress.hintEmpty')}
          </div>

          <ProcessButton
            label={t('tools.compress.cta')}
            onClick={handleCompress}
            disabled={!canCompress}
            loading={busy}
          />

          {result && (
            <div className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900">
              {(() => {
                const { inputBytes, outputBytes } = result;
                const ratio =
                  inputBytes > 0
                    ? Math.round(
                        ((inputBytes - outputBytes) / inputBytes) * 100,
                      )
                    : 0;
                if (ratio <= 3) {
                  const saved = Math.max(0, inputBytes - outputBytes);
                  return t('tools.compress.noSavings', {
                    size: formatBytes(saved),
                  });
                }
                return t('tools.compress.success', {
                  ratio,
                  before: formatBytes(inputBytes),
                  after: formatBytes(outputBytes),
                });
              })()}
            </div>
          )}

          {error && <div className="text-sm text-red-600">{error}</div>}

          <p className="text-xs text-ink-muted">{t('tools.compress.note')}</p>
        </div>
      }
    >
      {files.length === 0 ? (
        <FileDropzone
          onFiles={addFiles}
          multiple={false}
          isIngesting={isIngesting}
        />
      ) : (
        <Card>
          <CardContent className="p-6">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="truncate text-base font-medium text-ink">
                  {files[0]?.name}
                </div>
                <div className="mt-1 text-sm text-ink-muted">
                  {formatBytes(files[0]?.size ?? 0)}
                  {' · '}
                  {files[0]?.pageCount} {t('common.pages')}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
      <ProgressOverlay
        open={busy}
        label={note || t('tools.compress.progress')}
        fraction={progress}
        onCancel={() => abortRef.current?.abort()}
      />
    </ToolShell>
  );
}

export default CompressPage;
