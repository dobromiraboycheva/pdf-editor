import { useCallback, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useToast } from '@/hooks/useToast';
import { ToolShell } from '@/components/layout/ToolShell';
import { FileDropzone } from '@/components/pdf/FileDropzone';
import { ProcessButton } from '@/components/pdf/ProcessButton';
import { ProgressOverlay } from '@/components/pdf/ProgressOverlay';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useIngestedPdfs } from '@/hooks/useIngestedPdfs';
import { downloadBlob } from '@/lib/files/download';
import { parsePageRanges } from '@/lib/pdf/pageRangeParse';
import { formatBytes } from '@/lib/utils/formatBytes';
import { extractProcessor } from './extractProcessor';
import { useExtractStore } from './useExtractStore';

export function ExtractPage() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { files, addFiles, clear, isIngesting, error } = useIngestedPdfs();
  const rangesSpec = useExtractStore((s) => s.rangesSpec);
  const setRangesSpec = useExtractStore((s) => s.setRangesSpec);

  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [note, setNote] = useState('');
  const abortRef = useRef<AbortController | null>(null);
  const [result, setResult] = useState<{ count: number; size: number } | null>(
    null,
  );

  const file = files[0];
  const pageCount = file?.pageCount ?? 0;

  const validation = useMemo(() => {
    if (!rangesSpec.trim()) return { ok: false as const, empty: true };
    const parsed = parsePageRanges(rangesSpec, pageCount);
    if (!parsed.ok) return { ok: false as const, empty: false };
    return {
      ok: true as const,
      count: parsed.indices ? parsed.indices.length : 0,
    };
  }, [rangesSpec, pageCount]);

  const canExtract =
    !!file && !busy && !isIngesting && validation.ok && validation.count > 0;

  const handleExtract = useCallback(async () => {
    if (!file) return;
    setBusy(true);
    setResult(null);
    setProgress(0);
    setNote('');
    const ac = new AbortController();
    abortRef.current = ac;
    try {
      const res = await extractProcessor({
        files: [file],
        options: { rangesSpec },
        signal: ac.signal,
        onProgress: (f, n) => {
          setProgress(f);
          if (n) setNote(n);
        },
      });
      const out = res.outputs[0];
      if (out) {
        await downloadBlob(out.blob, out.name);
        const parsed = parsePageRanges(rangesSpec, pageCount);
        setResult({
          count: parsed.ok && parsed.indices ? parsed.indices.length : 0,
          size: out.blob.size,
        });
      }
    } catch (e) {
      if (ac.signal.aborted || (e as Error).message === 'aborted') {
        // user cancelled — silent
      } else {
        toast({ message: t('tools.extract.failed', { message: (e as Error).message }), variant: 'error' });
      }
    } finally {
      setBusy(false);
      abortRef.current = null;
    }
  }, [file, rangesSpec, pageCount, t]);

  return (
    <ToolShell
      title={t('tools.extract.name')}
      tagline={t('tools.extract.description')}
      onStartOver={file ? clear : undefined}
      sidebar={
        <div className="flex flex-col gap-4">
          <div className="text-sm text-ink-muted">
            {!file && t('tools.extract.hintEmpty')}
            {file &&
              validation.ok &&
              t('tools.extract.hintReady', { count: validation.count })}
          </div>

          <div className="flex flex-col gap-1">
            <label
              htmlFor="extract-ranges-input"
              className="text-xs font-medium text-ink-muted"
            >
              {t('tools.extract.selectionLabel')}
            </label>
            <input
              id="extract-ranges-input"
              type="text"
              value={rangesSpec}
              onChange={(e) => setRangesSpec(e.target.value)}
              placeholder={t('tools.extract.selectionPlaceholder')}
              className="h-10 rounded-button border border-black/10 bg-white px-3 text-sm text-ink focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
            {file &&
              rangesSpec.trim() !== '' &&
              !validation.ok &&
              !validation.empty && (
                <p className="text-xs text-red-600">
                  {t('tools.split.invalidRange')}
                </p>
              )}
          </div>

          <ProcessButton
            label={t('tools.extract.cta')}
            onClick={handleExtract}
            disabled={!canExtract}
            loading={busy}
          />
          {result && (
            <div className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900">
              {t('tools.extract.success', {
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
            <Button variant="secondary" size="sm" onClick={clear}>
              {t('common.startOver')}
            </Button>
          </CardContent>
        </Card>
      )}
      <ProgressOverlay
        open={busy}
        label={note || t('tools.extract.progress')}
        fraction={progress}
        onCancel={() => abortRef.current?.abort()}
      />
    </ToolShell>
  );
}

export default ExtractPage;
