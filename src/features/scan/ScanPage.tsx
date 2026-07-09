import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
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
import { Camera, ImagePlus, X } from 'lucide-react';
import { ToolShell } from '@/components/layout/ToolShell';
import { ProcessButton } from '@/components/pdf/ProcessButton';
import { ProgressOverlay } from '@/components/pdf/ProgressOverlay';
import { Button } from '@/components/ui/button';
import { downloadBlob } from '@/lib/files/download';
import { formatBytes } from '@/lib/utils/formatBytes';
import { uuid } from '@/lib/utils/uuid';
import { cn } from '@/lib/utils/cn';
import { scanProcessor } from './scanProcessor';
import { useScanStore, type ScanPageSize } from './useScanStore';

interface PageEntry {
  id: string;
  url: string;
}

interface SortableThumbProps {
  entry: PageEntry;
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
    <div ref={setNodeRef} style={style} className="relative w-32 select-none">
      <div
        {...attributes}
        {...listeners}
        className="group relative flex h-40 w-32 cursor-grab items-center justify-center overflow-hidden rounded-card border border-black/10 bg-white touch-none active:cursor-grabbing"
      >
        <img
          src={entry.url}
          alt={`Page ${index + 1}`}
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
    </div>
  );
}

/**
 * Rasterize an arbitrary image File (PNG/JPEG/etc.) into a JPEG Blob so
 * the downstream processor can always embed it via `embedJpg`.
 */
async function imageFileToJpegBlob(file: File): Promise<Blob> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('Failed to decode image.'));
      image.src = url;
    });
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D context unavailable.');
    ctx.drawImage(img, 0, 0);
    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (b) => {
          if (b) resolve(b);
          else reject(new Error('Failed to encode JPEG.'));
        },
        'image/jpeg',
        0.9,
      );
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function ScanPage() {
  const { t } = useTranslation();
  const pages = useScanStore((s) => s.pages);
  const pageSize = useScanStore((s) => s.pageSize);
  const addPage = useScanStore((s) => s.addPage);
  const removePage = useScanStore((s) => s.removePage);
  const reorderPages = useScanStore((s) => s.reorderPages);
  const clear = useScanStore((s) => s.clear);
  const setPageSize = useScanStore((s) => s.setPageSize);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const uploadInputRef = useRef<HTMLInputElement | null>(null);

  const [cameraOn, setCameraOn] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<{ size: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Object URLs for thumbnails, keyed by array index (rebuilt when pages change).
  const entries = useMemo<PageEntry[]>(
    () => pages.map((blob) => ({ id: uuid(), url: URL.createObjectURL(blob) })),
    [pages],
  );

  useEffect(() => {
    return () => {
      for (const e of entries) URL.revokeObjectURL(e.url);
    };
  }, [entries]);

  const stopCamera = useCallback(() => {
    const stream = streamRef.current;
    if (stream) {
      for (const track of stream.getTracks()) track.stop();
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setCameraOn(false);
  }, []);

  const startCamera = useCallback(async () => {
    setCameraError(null);
    try {
      if (
        typeof navigator === 'undefined' ||
        !navigator.mediaDevices?.getUserMedia
      ) {
        throw new Error('getUserMedia unavailable');
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
        audio: false,
      });
      streamRef.current = stream;
      const video = videoRef.current;
      if (video) {
        video.srcObject = stream;
        // Some browsers require an explicit play() call.
        try {
          await video.play();
        } catch {
          /* ignored — autoplay attribute will retry */
        }
      }
      setCameraOn(true);
    } catch {
      setCameraError(t('tools.scan.noCamera'));
      setCameraOn(false);
    }
  }, [t]);

  // Auto-start on mount, stop on unmount.
  useEffect(() => {
    void startCamera();
    return () => {
      stopCamera();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    reorderPages(fromIdx, toIdx);
  };

  const capturePage = useCallback(async () => {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0 || video.videoHeight === 0) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.85);
    });
    if (blob) {
      addPage(blob);
      setResult(null);
    }
  }, [addPage]);

  const handleUpload = useCallback(
    async (files: File[]) => {
      setError(null);
      const images = files.filter((f) => f.type.startsWith('image/'));
      for (const file of images) {
        try {
          const jpeg = await imageFileToJpegBlob(file);
          addPage(jpeg);
        } catch (e) {
          setError((e as Error).message);
        }
      }
      setResult(null);
    },
    [addPage],
  );

  const canRun = pages.length > 0 && !busy;

  const handleRun = useCallback(async () => {
    if (pages.length === 0) return;
    setBusy(true);
    setResult(null);
    setProgress(0);
    setError(null);
    try {
      // Simple progress: bump when done, since scanProcessor is quick.
      setProgress(0.1);
      const res = await scanProcessor({ pages, pageSize });
      setProgress(1);
      const out = res.outputs[0];
      if (!out) throw new Error('No output produced.');
      await downloadBlob(out.blob, out.name);
      setResult({ size: out.blob.size });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }, [pages, pageSize]);

  const handleClearAll = useCallback(() => {
    clear();
    setResult(null);
  }, [clear]);

  const pageSizeOptions: { value: ScanPageSize; label: string }[] = [
    { value: 'a4', label: t('tools.jpgToPdf.pageSizeA4') },
    { value: 'letter', label: t('tools.jpgToPdf.pageSizeLetter') },
    { value: 'fit', label: t('tools.jpgToPdf.pageSizeFit') },
  ];

  return (
    <ToolShell
      title={t('tools.scan.name')}
      tagline={t('tools.scan.description')}
      onStartOver={pages.length > 0 ? handleClearAll : undefined}
      sidebar={
        <div className="flex flex-col gap-4">
          <div className="text-sm text-ink-muted">
            {t('tools.scan.pagesCaptured', { count: pages.length })}
          </div>

          <div className="flex flex-col gap-2">
            <span className="text-xs font-medium text-ink-muted">
              {t('tools.scan.pageSize')}
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

          <ProcessButton
            label={t('tools.scan.cta')}
            onClick={handleRun}
            disabled={!canRun}
            loading={busy}
          />
          {pages.length > 0 && (
            <Button variant="secondary" onClick={handleClearAll}>
              {t('tools.scan.clearAll')}
            </Button>
          )}
          {result && (
            <div className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900">
              {t('tools.scan.success', { size: formatBytes(result.size) })}
            </div>
          )}
          {error && <div className="text-sm text-red-600">{error}</div>}
        </div>
      }
    >
      <div className="flex flex-col gap-6">
        <div className="relative overflow-hidden rounded-card border border-black/10 bg-black">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="block h-auto max-h-[60vh] w-full bg-black object-contain"
          />
          {!cameraOn && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/70 p-6 text-center text-white">
              <Camera className="h-10 w-10 opacity-80" aria-hidden="true" />
              <p className="max-w-md text-sm">
                {cameraError ?? t('tools.scan.startCamera')}
              </p>
              <Button
                variant="secondary"
                onClick={() => void startCamera()}
              >
                {t('tools.scan.startCamera')}
              </Button>
            </div>
          )}
        </div>

        <div className="flex flex-col items-center gap-3">
          <button
            type="button"
            onClick={() => void capturePage()}
            disabled={!cameraOn}
            className={cn(
              'inline-flex h-14 items-center justify-center gap-2 rounded-full px-8 text-base font-semibold text-white shadow-card transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white',
              cameraOn
                ? 'bg-red-600 hover:bg-red-700 active:bg-red-800'
                : 'cursor-not-allowed bg-red-300',
            )}
          >
            <Camera className="h-5 w-5" />
            {t('tools.scan.capture')}
          </button>
          <div className="flex items-center gap-3">
            {cameraOn && (
              <Button variant="ghost" size="sm" onClick={stopCamera}>
                {t('tools.scan.stopCamera')}
              </Button>
            )}
            <Button
              variant="secondary"
              size="sm"
              onClick={() => uploadInputRef.current?.click()}
            >
              <ImagePlus className="h-4 w-4" />
              {t('tools.scan.uploadImages')}
            </Button>
          </div>
          <input
            ref={uploadInputRef}
            type="file"
            accept="image/*"
            multiple
            style={{ display: 'none' }}
            onChange={(e) => {
              const list = e.target.files ? Array.from(e.target.files) : [];
              if (list.length) void handleUpload(list);
              e.target.value = '';
            }}
          />
        </div>

        {entries.length > 0 && (
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
                    onRemove={removePage}
                    removeLabel={t('common.remove')}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}
      </div>

      <ProgressOverlay
        open={busy}
        label={t('tools.scan.progress')}
        fraction={progress}
      />
    </ToolShell>
  );
}

export default ScanPage;
