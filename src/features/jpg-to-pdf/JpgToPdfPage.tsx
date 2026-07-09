import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useToast } from '@/hooks/useToast';
import {
  DndContext,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  closestCenter,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  rectSortingStrategy,
  useSortable,
  sortableKeyboardCoordinates,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { X, Plus } from 'lucide-react';
import { ToolShell } from '@/components/layout/ToolShell';
import { FileDropzone } from '@/components/pdf/FileDropzone';
import { ProcessButton } from '@/components/pdf/ProcessButton';
import { ProgressOverlay } from '@/components/pdf/ProgressOverlay';
import { downloadBlob } from '@/lib/files/download';
import { formatBytes } from '@/lib/utils/formatBytes';
import { cn } from '@/lib/utils/cn';
import {
  jpgToPdfProcessor,
  type JpgToPdfOptions,
} from './jpgToPdfProcessor';
import {
  useJpgToPdfStore,
  type JpgToPdfOrientation,
  type JpgToPdfPageSize,
} from './useStore';

interface ImageEntry {
  id: string;
  file: File;
  url: string;
}

interface SortableThumbProps {
  entry: ImageEntry;
  index: number;
  onRemove: (index: number) => void;
  removeLabel: string;
}

function SortableThumb({
  entry,
  index,
  onRemove,
  removeLabel,
}: SortableThumbProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: entry.id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 10 : undefined,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="relative w-40 select-none"
    >
      <div
        {...attributes}
        {...listeners}
        className="group relative flex h-[200px] w-40 cursor-grab items-center justify-center overflow-hidden rounded-card border border-black/10 bg-white touch-none active:cursor-grabbing"
      >
        <img
          src={entry.url}
          alt={entry.file.name}
          className="max-h-full max-w-full object-contain"
          draggable={false}
        />
        <div className="absolute bottom-1 left-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white">
          {index + 1}
        </div>
      </div>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onRemove(index);
        }}
        aria-label={removeLabel}
        className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-white text-ink shadow-card ring-1 ring-black/10 hover:bg-red-50 hover:text-red-600"
      >
        <X className="h-3.5 w-3.5" />
      </button>
      <p
        className="mt-1 truncate text-xs text-ink-muted"
        title={entry.file.name}
      >
        {entry.file.name}
      </p>
    </div>
  );
}

export function JpgToPdfPage() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const images = useJpgToPdfStore((s) => s.images);
  const pageSize = useJpgToPdfStore((s) => s.pageSize);
  const orientation = useJpgToPdfStore((s) => s.orientation);
  const marginPt = useJpgToPdfStore((s) => s.marginPt);
  const addImages = useJpgToPdfStore((s) => s.addImages);
  const removeImage = useJpgToPdfStore((s) => s.removeImage);
  const reorderImages = useJpgToPdfStore((s) => s.reorderImages);
  const clearImages = useJpgToPdfStore((s) => s.clearImages);
  const setPageSize = useJpgToPdfStore((s) => s.setPageSize);
  const setOrientation = useJpgToPdfStore((s) => s.setOrientation);
  const setMarginPt = useJpgToPdfStore((s) => s.setMarginPt);

  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [note, setNote] = useState('');
  const [result, setResult] = useState<{ size: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Track object URLs alongside images. Rebuilt whenever the images array
  // reference changes; revoked in an effect cleanup.
  const entries = useMemo<ImageEntry[]>(
    () =>
      images.map((f) => ({
        id: `${f.name}::${f.size}::${f.lastModified}`,
        file: f,
        url: URL.createObjectURL(f),
      })),
    [images],
  );

  useEffect(() => {
    return () => {
      for (const e of entries) URL.revokeObjectURL(e.url);
    };
  }, [entries]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const ids = useMemo(() => entries.map((e) => e.id), [entries]);

  const handleDragEnd = (event: DragEndEvent): void => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const fromIdx = ids.indexOf(String(active.id));
    const toIdx = ids.indexOf(String(over.id));
    if (fromIdx === -1 || toIdx === -1) return;
    reorderImages(fromIdx, toIdx);
  };

  const handleFiles = useCallback(
    (files: File[]) => {
      setError(null);
      const filtered = files.filter(
        (f) => f.type === 'image/jpeg' || f.type === 'image/png',
      );
      if (filtered.length === 0) return;
      addImages(filtered);
    },
    [addImages],
  );

  const canRun = images.length > 0 && !busy;

  const handleRun = useCallback(async () => {
    if (images.length === 0) return;
    setBusy(true);
    setResult(null);
    setProgress(0);
    setNote('');
    setError(null);
    try {
      const options: JpgToPdfOptions = {
        pageSize,
        orientation,
        marginPt,
        images,
      };
      const res = await jpgToPdfProcessor(options, (f, n) => {
        setProgress(f);
        if (n) setNote(n);
      });
      const out = res.outputs[0];
      if (!out) throw new Error('No output produced.');
      await downloadBlob(out.blob, out.name);
      setResult({ size: out.blob.size });
    } catch (e) {
      const msg = (e as Error).message;
      setError(msg);
      toast({ message: t('tools.jpgToPdf.failed', { message: msg }), variant: 'error' });
    } finally {
      setBusy(false);
    }
  }, [images, pageSize, orientation, marginPt, t]);

  const pageSizeOptions: { value: JpgToPdfPageSize; label: string }[] = [
    { value: 'a4', label: t('tools.jpgToPdf.pageSizeA4') },
    { value: 'letter', label: t('tools.jpgToPdf.pageSizeLetter') },
    { value: 'fit', label: t('tools.jpgToPdf.pageSizeFit') },
  ];

  const orientationOptions: { value: JpgToPdfOrientation; label: string }[] = [
    { value: 'auto', label: t('tools.jpgToPdf.orientation') },
    { value: 'portrait', label: t('tools.jpgToPdf.portrait') },
    { value: 'landscape', label: t('tools.jpgToPdf.landscape') },
  ];

  const openAddInput = (): void => {
    const el = document.getElementById(
      'jpg-to-pdf-add-more-input',
    ) as HTMLInputElement | null;
    el?.click();
  };

  return (
    <ToolShell
      title={t('tools.jpgToPdf.name')}
      tagline={t('tools.jpgToPdf.description')}
      onStartOver={images.length > 0 ? clearImages : undefined}
      sidebar={
        <div className="flex flex-col gap-4">
          <div className="text-sm text-ink-muted">
            {images.length === 0 && t('tools.jpgToPdf.hintEmpty')}
          </div>

          <div className="flex flex-col gap-2">
            <span className="text-xs font-medium text-ink-muted">
              {t('tools.jpgToPdf.pageSize')}
            </span>
            <div
              role="radiogroup"
              className="flex flex-col gap-1 rounded-card border border-black/5 bg-white p-1"
            >
              {pageSizeOptions.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  role="radio"
                  aria-checked={pageSize === opt.value}
                  onClick={() => setPageSize(opt.value)}
                  className={cn(
                    'rounded-button px-3 py-2 text-left text-sm transition-colors',
                    pageSize === opt.value
                      ? 'bg-brand-500 text-white'
                      : 'text-ink hover:bg-surface-muted',
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {pageSize !== 'fit' && (
            <div className="flex flex-col gap-2">
              <span className="text-xs font-medium text-ink-muted">
                {t('tools.jpgToPdf.orientation')}
              </span>
              <div
                role="radiogroup"
                className="flex flex-col gap-1 rounded-card border border-black/5 bg-white p-1"
              >
                {orientationOptions.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    role="radio"
                    aria-checked={orientation === opt.value}
                    onClick={() => setOrientation(opt.value)}
                    className={cn(
                      'rounded-button px-3 py-2 text-left text-sm transition-colors',
                      orientation === opt.value
                        ? 'bg-brand-500 text-white'
                        : 'text-ink hover:bg-surface-muted',
                    )}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="flex flex-col gap-1">
            <label
              htmlFor="jpg-to-pdf-margin"
              className="flex items-center justify-between text-xs font-medium text-ink-muted"
            >
              <span>{t('tools.jpgToPdf.margin')}</span>
              <span className="tabular-nums">{marginPt}pt</span>
            </label>
            <input
              id="jpg-to-pdf-margin"
              type="range"
              min={0}
              max={72}
              step={1}
              value={marginPt}
              onChange={(e) => {
                const v = Number.parseInt(e.target.value, 10);
                if (!Number.isNaN(v)) setMarginPt(v);
              }}
              className="w-full"
            />
          </div>

          <ProcessButton
            label={t('tools.jpgToPdf.cta')}
            onClick={handleRun}
            disabled={!canRun}
            loading={busy}
          />
          {result && (
            <div className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900">
              {t('tools.jpgToPdf.success', { size: formatBytes(result.size) })}
            </div>
          )}
          {error && <div className="text-sm text-red-600">{error}</div>}
        </div>
      }
    >
      {images.length === 0 ? (
        <FileDropzone
          onFiles={handleFiles}
          multiple
          accept={['image/jpeg', 'image/png']}
        />
      ) : (
        <>
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext items={ids} strategy={rectSortingStrategy}>
              <div className="flex flex-wrap gap-4">
                {entries.map((entry, index) => (
                  <SortableThumb
                    key={entry.id}
                    entry={entry}
                    index={index}
                    onRemove={removeImage}
                    removeLabel={t('common.remove')}
                  />
                ))}
                <button
                  type="button"
                  onClick={openAddInput}
                  className="flex h-[200px] w-40 flex-col items-center justify-center gap-2 rounded-card border-2 border-dashed border-black/10 bg-white text-ink-muted transition-colors hover:border-brand-300 hover:bg-surface-muted hover:text-brand-500"
                >
                  <Plus className="h-6 w-6" />
                  <span className="text-xs font-medium">
                    {t('common.addMore')}
                  </span>
                </button>
              </div>
            </SortableContext>
          </DndContext>
          <input
            id="jpg-to-pdf-add-more-input"
            type="file"
            accept="image/jpeg,image/png"
            multiple
            style={{ display: 'none' }}
            onChange={(e) => {
              const list = e.target.files ? Array.from(e.target.files) : [];
              if (list.length) handleFiles(list);
              e.target.value = '';
            }}
          />
        </>
      )}
      <ProgressOverlay
        open={busy}
        label={note || t('tools.jpgToPdf.progress')}
        fraction={progress}
      />
    </ToolShell>
  );
}

export default JpgToPdfPage;
