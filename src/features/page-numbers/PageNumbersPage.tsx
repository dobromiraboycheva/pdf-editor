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
import { usePageNumbersStore } from './usePageNumbersStore';
import {
  pageNumbersProcessor,
  type PageNumbersFormat,
  type PageNumbersOptions,
  type PageNumbersPosition,
} from './pageNumbersProcessor';

const FORMATS: PageNumbersFormat[] = ['simple', 'ofN', 'page', 'pageOfN'];
const FORMAT_LABEL_KEY: Record<PageNumbersFormat, string> = {
  simple: 'formatSimple',
  ofN: 'formatOfN',
  page: 'formatPage',
  pageOfN: 'formatPageOfN',
};

const POSITIONS: PageNumbersPosition[] = [
  'top-left',
  'top-center',
  'top-right',
  'bottom-left',
  'bottom-center',
  'bottom-right',
];

const POSITION_LABEL_KEYS: Record<PageNumbersPosition, string> = {
  'top-left': 'topLeft',
  'top-center': 'topCenter',
  'top-right': 'topRight',
  'bottom-left': 'bottomLeft',
  'bottom-center': 'bottomCenter',
  'bottom-right': 'bottomRight',
};

interface Result {
  size: number;
}

export function PageNumbersPage() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { files, addFiles, clear, isIngesting, error } = useIngestedPdfs();
  const {
    format,
    startFrom,
    fontSize,
    position,
    setFormat,
    setStartFrom,
    setFontSize,
    setPosition,
  } = usePageNumbersStore();

  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [note, setNote] = useState('');
  const abortRef = useRef<AbortController | null>(null);
  const [result, setResult] = useState<Result | null>(null);

  const canRun = files.length === 1 && !busy && !isIngesting;

  const handleRun = useCallback(async () => {
    setBusy(true);
    setResult(null);
    setProgress(0);
    setNote('');
    const ac = new AbortController();
    abortRef.current = ac;
    try {
      const options: PageNumbersOptions = {
        format,
        startFrom,
        fontSize,
        position,
      };
      const res = await pageNumbersProcessor({
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
        toast({ message: t('tools.pageNumbers.failed', { message: (e as Error).message }), variant: 'error' });
      }
    } finally {
      setBusy(false);
      abortRef.current = null;
    }
  }, [files, format, startFrom, fontSize, position, t]);

  return (
    <ToolShell
      title={t('tools.pageNumbers.name')}
      tagline={t('tools.pageNumbers.description')}
      onStartOver={files.length > 0 ? clear : undefined}
      sidebar={
        <div className="flex flex-col gap-4">
          {/* Format picker */}
          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium text-ink">
              {t('tools.pageNumbers.format')}
            </span>
            <div className="grid grid-cols-2 gap-1.5">
              {FORMATS.map((f) => {
                const selected = format === f;
                return (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setFormat(f)}
                    aria-pressed={selected}
                    className={cn(
                      'h-10 rounded-button border text-sm font-medium transition-colors',
                      selected
                        ? 'border-brand-500 bg-brand-50 text-ink'
                        : 'border-black/10 bg-white text-ink hover:border-black/20',
                    )}
                  >
                    {t(`tools.pageNumbers.${FORMAT_LABEL_KEY[f]}`)}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Start from */}
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-ink">
              {t('tools.pageNumbers.startFrom')}
            </span>
            <input
              type="number"
              min={0}
              value={startFrom}
              onChange={(e) => setStartFrom(Number(e.target.value))}
              className="h-10 rounded-button border border-black/10 bg-white px-3 text-sm text-ink outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/30"
            />
          </label>

          {/* Font size */}
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-ink">
              {t('tools.pageNumbers.fontSize')}
            </span>
            <input
              type="number"
              min={8}
              max={36}
              value={fontSize}
              onChange={(e) => setFontSize(Number(e.target.value))}
              className="h-10 rounded-button border border-black/10 bg-white px-3 text-sm text-ink outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/30"
            />
          </label>

          {/* Position grid 2x3 */}
          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium text-ink">
              {t('tools.pageNumbers.position')}
            </span>
            <div className="grid grid-cols-3 gap-1.5">
              {POSITIONS.map((p) => {
                const selected = position === p;
                const label = t(
                  `tools.watermark.positions.${POSITION_LABEL_KEYS[p]}`,
                );
                return (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPosition(p)}
                    aria-pressed={selected}
                    aria-label={label}
                    title={label}
                    className={cn(
                      'flex h-10 items-center justify-center rounded-button border transition-colors',
                      selected
                        ? 'border-brand-500 bg-brand-50'
                        : 'border-black/10 bg-white hover:border-black/20',
                    )}
                  >
                    <span
                      className={cn(
                        'block h-2 w-2 rounded-full',
                        selected ? 'bg-brand-500' : 'bg-black/30',
                      )}
                    />
                  </button>
                );
              })}
            </div>
          </div>

          <div className="text-sm text-ink-muted">
            {files.length === 0 && t('tools.pageNumbers.hintEmpty')}
          </div>

          <ProcessButton
            label={t('tools.pageNumbers.cta')}
            onClick={handleRun}
            disabled={!canRun}
            loading={busy}
          />

          {result && (
            <div className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900">
              {t('tools.pageNumbers.success', {
                size: formatBytes(result.size),
              })}
            </div>
          )}
          {error && <div className="text-sm text-red-600">{error}</div>}
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
        label={note || t('tools.pageNumbers.progress')}
        fraction={progress}
        onCancel={() => abortRef.current?.abort()}
      />
    </ToolShell>
  );
}

export default PageNumbersPage;
