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
import { downloadZip } from '@/lib/files/downloadZip';
import { formatBytes } from '@/lib/utils/formatBytes';
import { cn } from '@/lib/utils/cn';
import { pdfToJpgProcessor, type PdfToJpgOptions } from './pdfToJpgProcessor';
import { usePdfToJpgStore, type JpgQuality } from './useStore';

function stripPdfExt(name: string): string {
  return name.replace(/\.pdf$/i, '');
}

interface PdfToJpgResult {
  count: number;
  size: number;
}

export function PdfToJpgPage() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { files, addFiles, clear, isIngesting, error } = useIngestedPdfs();
  const quality = usePdfToJpgStore((s) => s.quality);
  const dpi = usePdfToJpgStore((s) => s.dpi);
  const setQuality = usePdfToJpgStore((s) => s.setQuality);
  const setDpi = usePdfToJpgStore((s) => s.setDpi);

  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [note, setNote] = useState('');
  const abortRef = useRef<AbortController | null>(null);
  const [result, setResult] = useState<PdfToJpgResult | null>(null);

  const file = files[0];
  const canRun = files.length === 1 && !busy && !isIngesting;

  const handleRun = useCallback(async () => {
    if (!file) return;
    setBusy(true);
    setResult(null);
    setProgress(0);
    setNote('');
    const ac = new AbortController();
    abortRef.current = ac;
    try {
      const options: PdfToJpgOptions = { quality, dpi };
      const res = await pdfToJpgProcessor({
        files: [file],
        options,
        signal: ac.signal,
        onProgress: (f, n) => {
          setProgress(f);
          if (n) setNote(n);
        },
      });
      const basename = stripPdfExt(file.name);
      if (res.outputs.length === 1) {
        const only = res.outputs[0];
        if (only) {
          await downloadBlob(only.blob, only.name);
          setResult({ count: 1, size: only.blob.size });
        }
      } else if (res.outputs.length > 1) {
        await downloadZip(res.outputs, `${basename}-jpg.zip`);
        const total = res.outputs.reduce((a, o) => a + o.blob.size, 0);
        setResult({ count: res.outputs.length, size: total });
      }
    } catch (e) {
      if (ac.signal.aborted || (e as Error).message === 'aborted') {
        // user cancelled — silent
      } else {
        toast({ message: t('tools.pdfToJpg.failed', { message: (e as Error).message }), variant: 'error' });
      }
    } finally {
      setBusy(false);
      abortRef.current = null;
    }
  }, [file, quality, dpi, t]);

  const qualityOptions: { value: JpgQuality; label: string }[] = [
    { value: 'high', label: t('tools.pdfToJpg.qualityHigh') },
    { value: 'medium', label: t('tools.pdfToJpg.qualityMedium') },
    { value: 'low', label: t('tools.pdfToJpg.qualityLow') },
  ];

  return (
    <ToolShell
      title={t('tools.pdfToJpg.name')}
      tagline={t('tools.pdfToJpg.description')}
      onStartOver={file ? clear : undefined}
      sidebar={
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <span className="text-xs font-medium text-ink-muted">
              {t('tools.pdfToJpg.qualityLabel')}
            </span>
            {qualityOptions.map((opt) => {
              const selected = quality === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setQuality(opt.value)}
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
                      <div className="text-sm font-medium text-ink">
                        {opt.label}
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          <div className="flex flex-col gap-1">
            <label
              htmlFor="pdf-to-jpg-dpi"
              className="flex items-center justify-between text-xs font-medium text-ink-muted"
            >
              <span>{t('tools.pdfToJpg.dpiLabel')}</span>
              <span className="tabular-nums">{dpi}</span>
            </label>
            <input
              id="pdf-to-jpg-dpi"
              type="range"
              min={72}
              max={300}
              step={1}
              value={dpi}
              onChange={(e) => {
                const v = Number.parseInt(e.target.value, 10);
                if (!Number.isNaN(v)) setDpi(v);
              }}
              className="w-full"
            />
          </div>

          <ProcessButton
            label={t('tools.pdfToJpg.cta')}
            onClick={handleRun}
            disabled={!canRun}
            loading={busy}
          />
          {result && (
            <div className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900">
              {t('tools.pdfToJpg.success', {
                count: result.count,
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
          onFiles={addFiles}
          multiple={false}
          isIngesting={isIngesting}
        />
      ) : (
        <Card>
          <CardContent className="flex items-center justify-between gap-4 p-6">
            <div className="min-w-0">
              <p
                className="truncate text-base font-medium text-ink"
                title={file.name}
              >
                {file.name}
              </p>
              <p className="mt-1 text-sm text-ink-muted">
                {file.pageCount} {t('common.pages')} · {formatBytes(file.size)}
              </p>
            </div>
          </CardContent>
        </Card>
      )}
      <ProgressOverlay
        open={busy}
        label={note || t('tools.pdfToJpg.progress')}
        fraction={progress}
        onCancel={() => abortRef.current?.abort()}
      />
    </ToolShell>
  );
}

export default PdfToJpgPage;
