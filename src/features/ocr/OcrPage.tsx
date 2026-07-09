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
import { ocrProcessor, type OcrOptions } from './ocrProcessor';
import { useOcrStore, type OcrLanguage } from './useOcrStore';

interface OcrResult {
  size: number;
}

const LANGUAGE_OPTIONS: { value: OcrLanguage; labelKey: string }[] = [
  { value: 'eng', labelKey: 'tools.ocr.langEng' },
  { value: 'bul', labelKey: 'tools.ocr.langBul' },
  { value: 'eng+bul', labelKey: 'tools.ocr.langBoth' },
];

export function OcrPage() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { files, addFiles, clear, isIngesting, error } = useIngestedPdfs();
  const { language, setLanguage } = useOcrStore();

  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [note, setNote] = useState('');
  const abortRef = useRef<AbortController | null>(null);
  const [result, setResult] = useState<OcrResult | null>(null);

  const canRun = files.length === 1 && !busy && !isIngesting;

  const handleRun = useCallback(async () => {
    setBusy(true);
    setResult(null);
    setProgress(0);
    setNote('');
    const ac = new AbortController();
    abortRef.current = ac;
    try {
      const options: OcrOptions = { language };
      const res = await ocrProcessor({
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
      setResult({ size: out.blob.size });
    } catch (e) {
      if (ac.signal.aborted || (e as Error).message === 'aborted') {
        // user cancelled — silent
      } else {
        toast({ message: t('tools.ocr.failed', { message: (e as Error).message }), variant: 'error' });
      }
    } finally {
      setBusy(false);
      abortRef.current = null;
    }
  }, [files, language, t]);

  return (
    <ToolShell
      title={t('tools.ocr.name')}
      tagline={t('tools.ocr.description')}
      onStartOver={files.length > 0 ? clear : undefined}
      sidebar={
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium text-ink">
              {t('tools.ocr.language')}
            </span>
            <div
              role="radiogroup"
              aria-label={t('tools.ocr.language')}
              className="flex flex-col gap-2"
            >
              {LANGUAGE_OPTIONS.map((opt) => {
                const selected = language === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => setLanguage(opt.value)}
                    className={cn(
                      'w-full rounded-card border p-3 text-left transition-colors',
                      selected
                        ? 'border-brand-500 bg-brand-50'
                        : 'border-black/10 bg-white hover:border-black/20',
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <span
                        className={cn(
                          'flex h-4 w-4 flex-none items-center justify-center rounded-full border',
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
                      <span className="text-sm font-medium text-ink">
                        {t(opt.labelKey)}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <ProcessButton
            label={t('tools.ocr.cta')}
            onClick={handleRun}
            disabled={!canRun}
            loading={busy}
          />

          {result && (
            <div className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900">
              {t('tools.ocr.success', { size: formatBytes(result.size) })}
            </div>
          )}
          {error && <div className="text-sm text-red-600">{error}</div>}

          <p className="text-xs text-ink-muted">{t('tools.ocr.note')}</p>
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
          </CardContent>
        </Card>
      )}
      <ProgressOverlay
        open={busy}
        label={note || t('tools.ocr.progress')}
        fraction={progress}
        onCancel={() => abortRef.current?.abort()}
      />
    </ToolShell>
  );
}

export default OcrPage;
