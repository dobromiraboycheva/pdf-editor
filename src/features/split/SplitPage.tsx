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
import { downloadZip } from '@/lib/files/downloadZip';
import { parsePageRanges } from '@/lib/pdf/pageRangeParse';
import { formatBytes } from '@/lib/utils/formatBytes';
import { cn } from '@/lib/utils/cn';
import { splitProcessor, type SplitMode } from './splitProcessor';
import { useSplitStore } from './useSplitStore';

function stripPdfExt(name: string): string {
  return name.replace(/\.pdf$/i, '');
}

export function SplitPage() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { files, addFiles, clear, isIngesting, error } = useIngestedPdfs();
  const mode = useSplitStore((s) => s.mode);
  const rangesSpec = useSplitStore((s) => s.rangesSpec);
  const everyN = useSplitStore((s) => s.everyN);
  const setMode = useSplitStore((s) => s.setMode);
  const setRangesSpec = useSplitStore((s) => s.setRangesSpec);
  const setEveryN = useSplitStore((s) => s.setEveryN);

  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [note, setNote] = useState('');
  const abortRef = useRef<AbortController | null>(null);
  const [result, setResult] = useState<{ count: number; size: number } | null>(
    null,
  );

  const file = files[0];
  const pageCount = file?.pageCount ?? 0;

  const rangeValidation = useMemo(() => {
    if (mode !== 'ranges') return { ok: true as const };
    if (!rangesSpec.trim()) return { ok: false as const, empty: true };
    const parsed = parsePageRanges(rangesSpec, pageCount);
    if (!parsed.ok) return { ok: false as const, empty: false };
    return { ok: true as const, groups: parsed.groups };
  }, [mode, rangesSpec, pageCount]);

  const canSplit = (() => {
    if (!file || busy || isIngesting) return false;
    if (mode === 'ranges') return rangeValidation.ok;
    if (mode === 'every') return everyN >= 1 && everyN <= pageCount;
    return true;
  })();

  const handleSplit = useCallback(async () => {
    if (!file) return;
    setBusy(true);
    setResult(null);
    setProgress(0);
    setNote('');
    const ac = new AbortController();
    abortRef.current = ac;
    try {
      const res = await splitProcessor({
        files: [file],
        options: { mode, rangesSpec, everyN },
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
      } else {
        await downloadZip(res.outputs, `${basename}-split.zip`);
        const total = res.outputs.reduce((a, o) => a + o.blob.size, 0);
        setResult({ count: res.outputs.length, size: total });
      }
    } catch (e) {
      if (ac.signal.aborted || (e as Error).message === 'aborted') {
        // user cancelled — silent
      } else {
        toast({ message: t('tools.split.failed', { message: (e as Error).message }), variant: 'error' });
      }
    } finally {
      setBusy(false);
      abortRef.current = null;
    }
  }, [file, mode, rangesSpec, everyN, t]);

  const modeOptions: { value: SplitMode; label: string }[] = [
    { value: 'ranges', label: t('tools.split.modeRanges') },
    { value: 'every', label: t('tools.split.modeEvery') },
    { value: 'single', label: t('tools.split.modeSingle') },
  ];

  return (
    <ToolShell
      title={t('tools.split.name')}
      tagline={t('tools.split.description')}
      onStartOver={file ? clear : undefined}
      sidebar={
        <div className="flex flex-col gap-4">
          <div className="text-sm text-ink-muted">
            {!file && t('tools.split.hintEmpty')}
            {file && t('tools.split.hintReady', { pages: pageCount })}
          </div>

          <div
            role="radiogroup"
            aria-label={t('tools.split.name')}
            className="flex flex-col gap-1 rounded-card border border-black/5 bg-white p-1"
          >
            {modeOptions.map((opt) => (
              <button
                key={opt.value}
                type="button"
                role="radio"
                aria-checked={mode === opt.value}
                onClick={() => setMode(opt.value)}
                className={cn(
                  'rounded-button px-3 py-2 text-left text-sm transition-colors',
                  mode === opt.value
                    ? 'bg-brand-500 text-white'
                    : 'text-ink hover:bg-surface-muted',
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {mode === 'ranges' && (
            <div className="flex flex-col gap-1">
              <label
                htmlFor="split-ranges-input"
                className="text-xs font-medium text-ink-muted"
              >
                {t('tools.split.rangeLabel')}
              </label>
              <input
                id="split-ranges-input"
                type="text"
                value={rangesSpec}
                onChange={(e) => setRangesSpec(e.target.value)}
                placeholder={t('tools.split.rangePlaceholder')}
                className="h-10 rounded-button border border-black/10 bg-white px-3 text-sm text-ink focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
              <p className="text-xs text-ink-muted">
                {t('tools.split.modeRangesHint')}
              </p>
              {file &&
                rangesSpec.trim() !== '' &&
                !rangeValidation.ok &&
                !rangeValidation.empty && (
                  <p className="text-xs text-red-600">
                    {t('tools.split.invalidRange')}
                  </p>
                )}
            </div>
          )}

          {mode === 'every' && (
            <div className="flex flex-col gap-1">
              <label
                htmlFor="split-every-input"
                className="text-xs font-medium text-ink-muted"
              >
                {t('tools.split.everyN')}
              </label>
              <div className="flex items-center gap-2">
                <input
                  id="split-every-input"
                  type="number"
                  min={1}
                  max={Math.max(1, pageCount)}
                  value={everyN}
                  onChange={(e) => {
                    const v = Number.parseInt(e.target.value, 10);
                    if (!Number.isNaN(v)) setEveryN(v);
                  }}
                  className="h-10 w-24 rounded-button border border-black/10 bg-white px-3 text-sm text-ink focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
                <span className="text-sm text-ink-muted">
                  {t('tools.split.pages')}
                </span>
              </div>
            </div>
          )}

          <ProcessButton
            label={t('tools.split.cta')}
            onClick={handleSplit}
            disabled={!canSplit}
            loading={busy}
          />
          {result && (
            <div className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900">
              {t('tools.split.success', {
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
        label={note || t('tools.split.progress')}
        fraction={progress}
        onCancel={() => abortRef.current?.abort()}
      />
    </ToolShell>
  );
}

export default SplitPage;
