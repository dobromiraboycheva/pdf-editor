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
import { useWatermarkStore } from './useWatermarkStore';
import {
  watermarkProcessor,
  type WatermarkKind,
  type WatermarkOptions,
  type WatermarkPosition,
} from './watermarkProcessor';

const POSITIONS: WatermarkPosition[] = [
  'top-left',
  'top-center',
  'top-right',
  'middle-left',
  'center',
  'middle-right',
  'bottom-left',
  'bottom-center',
  'bottom-right',
];

const POSITION_LABEL_KEYS: Record<WatermarkPosition, string> = {
  'top-left': 'topLeft',
  'top-center': 'topCenter',
  'top-right': 'topRight',
  'middle-left': 'middleLeft',
  center: 'center',
  'middle-right': 'middleRight',
  'bottom-left': 'bottomLeft',
  'bottom-center': 'bottomCenter',
  'bottom-right': 'bottomRight',
};

interface WatermarkResult {
  size: number;
}

export function WatermarkPage() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { files, addFiles, clear, isIngesting, error } = useIngestedPdfs();
  const {
    kind,
    text,
    fontSize,
    colorHex,
    opacity,
    angleDeg,
    position,
    image,
    imageScale,
    setKind,
    setText,
    setFontSize,
    setColorHex,
    setOpacity,
    setAngleDeg,
    setPosition,
    setImage,
    setImageScale,
  } = useWatermarkStore();

  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [note, setNote] = useState('');
  const abortRef = useRef<AbortController | null>(null);
  const [result, setResult] = useState<WatermarkResult | null>(null);

  const hasInputs =
    files.length === 1 &&
    (kind === 'text' ? text.trim().length > 0 : image !== null);
  const canRun = hasInputs && !busy && !isIngesting;

  const handleRun = useCallback(async () => {
    setBusy(true);
    setResult(null);
    setProgress(0);
    setNote('');
    const ac = new AbortController();
    abortRef.current = ac;
    try {
      const options: WatermarkOptions = {
        kind,
        text,
        fontSize,
        colorHex,
        opacity,
        angleDeg,
        position,
        image: image ?? undefined,
        imageScale,
      };
      const res = await watermarkProcessor({
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
        toast({ message: t('tools.watermark.failed', { message: (e as Error).message }), variant: 'error' });
      }
    } finally {
      setBusy(false);
      abortRef.current = null;
    }
  }, [
    files,
    kind,
    text,
    fontSize,
    colorHex,
    opacity,
    angleDeg,
    position,
    image,
    imageScale,
    t,
  ]);

  return (
    <ToolShell
      title={t('tools.watermark.name')}
      tagline={t('tools.watermark.description')}
      onStartOver={files.length > 0 ? clear : undefined}
      sidebar={
        <div className="flex flex-col gap-4">
          {/* Kind segmented control */}
          <div
            role="tablist"
            aria-label={t('tools.watermark.name')}
            className="grid grid-cols-2 gap-1 rounded-button border border-black/10 bg-white p-1"
          >
            {(['text', 'image'] as WatermarkKind[]).map((k) => {
              const selected = kind === k;
              return (
                <button
                  key={k}
                  role="tab"
                  aria-selected={selected}
                  type="button"
                  onClick={() => setKind(k)}
                  className={cn(
                    'h-9 rounded-button text-sm font-medium transition-colors',
                    selected
                      ? 'bg-brand-500 text-white'
                      : 'text-ink hover:bg-surface-muted',
                  )}
                >
                  {k === 'text'
                    ? t('tools.watermark.typeText')
                    : t('tools.watermark.typeImage')}
                </button>
              );
            })}
          </div>

          {kind === 'text' ? (
            <div className="flex flex-col gap-3">
              <label className="flex flex-col gap-1 text-sm">
                <span className="font-medium text-ink">
                  {t('tools.watermark.textLabel')}
                </span>
                <input
                  type="text"
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder={t('tools.watermark.textPlaceholder')}
                  className="h-10 rounded-button border border-black/10 bg-white px-3 text-sm text-ink outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/30"
                />
              </label>

              <SliderRow
                label={`${t('tools.watermark.fontSize')}: ${fontSize}`}
                min={12}
                max={200}
                step={1}
                value={fontSize}
                onChange={setFontSize}
              />
              <SliderRow
                label={`${t('tools.watermark.opacity')}: ${opacity.toFixed(2)}`}
                min={0.1}
                max={1}
                step={0.05}
                value={opacity}
                onChange={setOpacity}
              />
              <SliderRow
                label={`${t('tools.watermark.angle')}: ${angleDeg}°`}
                min={-90}
                max={90}
                step={15}
                value={angleDeg}
                onChange={setAngleDeg}
              />
              <label className="flex items-center justify-between gap-3 text-sm">
                <span className="font-medium text-ink">
                  {t('tools.watermark.color')}
                </span>
                <input
                  type="color"
                  value={colorHex}
                  onChange={(e) => setColorHex(e.target.value)}
                  className="h-8 w-14 cursor-pointer rounded border border-black/10 bg-white"
                />
              </label>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <label className="flex flex-col gap-1 text-sm">
                <span className="font-medium text-ink">
                  {t('tools.watermark.imageLabel')}
                </span>
                <input
                  type="file"
                  accept="image/png,image/jpeg"
                  onChange={(e) => {
                    const f = e.target.files?.[0] ?? null;
                    setImage(f);
                  }}
                  className="text-sm text-ink file:mr-3 file:cursor-pointer file:rounded-button file:border-0 file:bg-brand-500 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-white hover:file:bg-brand-600"
                />
                {image && (
                  <span className="mt-1 truncate text-xs text-ink-muted">
                    {image.name}
                  </span>
                )}
              </label>
              <SliderRow
                label={`${t('tools.watermark.imageLabel')}: ${imageScale.toFixed(2)}`}
                min={0.1}
                max={1}
                step={0.05}
                value={imageScale}
                onChange={setImageScale}
              />
              <SliderRow
                label={`${t('tools.watermark.opacity')}: ${opacity.toFixed(2)}`}
                min={0.1}
                max={1}
                step={0.05}
                value={opacity}
                onChange={setOpacity}
              />
              <SliderRow
                label={`${t('tools.watermark.angle')}: ${angleDeg}°`}
                min={-90}
                max={90}
                step={15}
                value={angleDeg}
                onChange={setAngleDeg}
              />
            </div>
          )}

          {/* Position grid */}
          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium text-ink">
              {t('tools.watermark.position')}
            </span>
            <div className="grid grid-cols-3 gap-1.5">
              {POSITIONS.map((p) => {
                const selected = position === p;
                const key = POSITION_LABEL_KEYS[p];
                const label = t(`tools.watermark.positions.${key}`);
                return (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPosition(p)}
                    aria-label={label}
                    aria-pressed={selected}
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
            {files.length === 0 && t('tools.watermark.hintEmpty')}
          </div>

          <ProcessButton
            label={t('tools.watermark.cta')}
            onClick={handleRun}
            disabled={!canRun}
            loading={busy}
          />

          {result && (
            <div className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900">
              {t('tools.watermark.success', { size: formatBytes(result.size) })}
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
        label={note || t('tools.watermark.progress')}
        fraction={progress}
        onCancel={() => abortRef.current?.abort()}
      />
    </ToolShell>
  );
}

interface SliderRowProps {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (v: number) => void;
}

function SliderRow({ label, min, max, step, value, onChange }: SliderRowProps) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="font-medium text-ink">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="accent-brand-500"
      />
    </label>
  );
}

export default WatermarkPage;
