import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import { useTranslation } from 'react-i18next';
import { useToast } from '@/hooks/useToast';
import { Plus, RotateCw, Trash2 } from 'lucide-react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ToolShell } from '@/components/layout/ToolShell';
import { FileDropzone } from '@/components/pdf/FileDropzone';
import { ProcessButton } from '@/components/pdf/ProcessButton';
import { ProgressOverlay } from '@/components/pdf/ProgressOverlay';
import { Button } from '@/components/ui/button';
import { useIngestedPdfs } from '@/hooks/useIngestedPdfs';
import { downloadBlob } from '@/lib/files/download';
import { renderThumbnail } from '@/lib/pdf/renderThumbnails';
import { formatBytes } from '@/lib/utils/formatBytes';
import { cn } from '@/lib/utils/cn';
import { organizeProcessor } from './organizeProcessor';
import {
  BLANK_PAGE_MARKER,
  useOrganizeStore,
  type OrganizeRotation,
} from './useOrganizeStore';

const MAX_THUMB_PAGES = 200;

interface OrganizeTileProps {
  id: string;
  positionIdx: number;
  sourceIdx: number;
  canvas?: HTMLCanvasElement;
  rotation: OrganizeRotation;
  onDelete: () => void;
  onRotate: () => void;
  label: string;
  deleteLabel: string;
  rotateLabel: string;
  blankLabel: string;
}

function OrganizeTile({
  id,
  positionIdx,
  sourceIdx,
  canvas,
  rotation,
  onDelete,
  onRotate,
  label,
  deleteLabel,
  rotateLabel,
  blankLabel,
}: OrganizeTileProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });
  const mountRef = useRef<HTMLDivElement | null>(null);
  const isBlank = sourceIdx === BLANK_PAGE_MARKER;

  useEffect(() => {
    const el = mountRef.current;
    if (!el || !canvas) return;
    canvas.classList.add('h-full', 'w-full', 'object-contain');
    canvas.style.maxWidth = '100%';
    canvas.style.maxHeight = '100%';
    el.appendChild(canvas);
    return () => {
      if (canvas.parentElement === el) {
        el.removeChild(canvas);
      }
    };
  }, [canvas]);

  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 10 : undefined,
  };

  const handleContextMenu = (e: React.MouseEvent): void => {
    e.preventDefault();
    onRotate();
  };

  return (
    <div ref={setNodeRef} style={style} className="touch-none">
      <div
        className={cn(
          'group relative flex flex-col items-center gap-2 rounded-card transition-all',
        )}
      >
        <div
          {...attributes}
          {...listeners}
          onContextMenu={handleContextMenu}
          className={cn(
            'relative flex aspect-[3/4] w-full cursor-grab items-center justify-center overflow-hidden rounded-card border border-black/5 bg-white shadow-sm transition-all group-hover:shadow-card active:cursor-grabbing',
          )}
        >
          {isBlank ? (
            <span className="text-xs font-medium text-ink-muted">
              {blankLabel}
            </span>
          ) : canvas ? (
            <div
              ref={mountRef}
              className="flex h-full w-full items-center justify-center p-2 transition-transform"
              style={{ transform: `rotate(${rotation}deg)` }}
            />
          ) : (
            <div className="h-full w-full animate-pulse bg-black/5" />
          )}
          {rotation !== 0 && !isBlank && (
            <span className="absolute right-1.5 bottom-1.5 rounded-full bg-brand-500 px-2 py-0.5 text-[10px] font-semibold text-white shadow-sm">
              {rotation}°
            </span>
          )}
          <button
            type="button"
            aria-label={rotateLabel}
            title={rotateLabel}
            onClick={(e) => {
              e.stopPropagation();
              onRotate();
            }}
            onPointerDown={(e) => e.stopPropagation()}
            className="absolute left-1.5 top-1.5 z-10 flex h-6 w-6 items-center justify-center rounded-full bg-white/95 text-ink shadow-sm ring-1 ring-black/10 hover:bg-brand-50 hover:text-brand-600"
          >
            <RotateCw className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            aria-label={deleteLabel}
            title={deleteLabel}
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            onPointerDown={(e) => e.stopPropagation()}
            className="absolute right-1.5 top-1.5 z-10 flex h-6 w-6 items-center justify-center rounded-full bg-white/95 text-red-600 shadow-sm ring-1 ring-black/10 hover:bg-red-50"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
        <p className="text-[11px] font-medium text-ink-muted">
          {label} {positionIdx + 1}
        </p>
      </div>
    </div>
  );
}

export function OrganizePage() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { files, addFiles, clear, isIngesting, error } = useIngestedPdfs();
  const pageOrder = useOrganizeStore((s) => s.pageOrder);
  const rotations = useOrganizeStore((s) => s.rotations);
  const setPageOrder = useOrganizeStore((s) => s.setPageOrder);
  const reorderPage = useOrganizeStore((s) => s.reorderPage);
  const deletePage = useOrganizeStore((s) => s.deletePage);
  const rotatePage = useOrganizeStore((s) => s.rotatePage);
  const addBlankPage = useOrganizeStore((s) => s.addBlankPage);
  const setPageCount = useOrganizeStore((s) => s.setPageCount);
  const reset = useOrganizeStore((s) => s.reset);

  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [note, setNote] = useState('');
  const abortRef = useRef<AbortController | null>(null);
  const [result, setResult] = useState<{ size: number } | null>(null);
  const [thumbs, setThumbs] = useState<Record<number, HTMLCanvasElement>>({});

  const file = files[0];
  const pageCount = file?.pageCount ?? 0;

  useEffect(() => {
    setPageCount(pageCount);
    setThumbs({});
    setResult(null);
  }, [file?.id, pageCount, setPageCount]);

  useEffect(() => {
    if (!file) return;
    const pdfjsDoc: PDFDocumentProxy = file.pdfjsDoc;
    const ac = new AbortController();
    const limit = Math.min(pageCount, MAX_THUMB_PAGES);
    (async () => {
      for (let i = 0; i < limit; i++) {
        try {
          const canvas = await renderThumbnail(pdfjsDoc, i, {
            widthPx: 140,
            signal: ac.signal,
          });
          if (ac.signal.aborted) return;
          setThumbs((prev) => ({ ...prev, [i]: canvas }));
        } catch {
          if (ac.signal.aborted) return;
        }
      }
    })();
    return () => ac.abort();
  }, [file, pageCount]);

  const sortableIds = useMemo(
    () => pageOrder.map((_, i) => `pos-${i}`),
    [pageOrder],
  );

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const handleDragEnd = (event: DragEndEvent): void => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const fromIdx = sortableIds.indexOf(String(active.id));
    const toIdx = sortableIds.indexOf(String(over.id));
    if (fromIdx === -1 || toIdx === -1) return;
    reorderPage(fromIdx, toIdx);
  };

  const canSave = !!file && !busy && !isIngesting && pageOrder.length > 0;

  const handleSave = useCallback(async () => {
    if (!file) return;
    setBusy(true);
    setResult(null);
    setProgress(0);
    setNote('');
    const ac = new AbortController();
    abortRef.current = ac;
    try {
      const res = await organizeProcessor({
        files: [file],
        options: { pageOrder, rotations },
        signal: ac.signal,
        onProgress: (f, n) => {
          setProgress(f);
          if (n) setNote(n);
        },
      });
      const out = res.outputs[0];
      if (out) {
        await downloadBlob(out.blob, out.name);
        setResult({ size: out.blob.size });
      }
    } catch (e) {
      if (ac.signal.aborted || (e as Error).message === 'aborted') {
        // user cancelled — silent
      } else {
        toast({ message: t('tools.organize.failed', { message: (e as Error).message }), variant: 'error' });
      }
    } finally {
      setBusy(false);
      abortRef.current = null;
    }
  }, [file, pageOrder, rotations, t]);

  const handleStartOver = (): void => {
    reset();
    clear();
    setThumbs({});
    setResult(null);
  };

  return (
    <ToolShell
      title={t('tools.organize.name')}
      tagline={t('tools.organize.description')}
      onStartOver={file ? handleStartOver : undefined}
      sidebar={
        <div className="flex flex-col gap-4">
          <div className="text-sm text-ink-muted">
            {!file && t('tools.rotate.hintEmpty')}
            {file && t('tools.organize.dragToReorder')}
          </div>
          {file && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => addBlankPage()}
            >
              <Plus className="h-4 w-4" />
              {t('tools.organize.addBlank')}
            </Button>
          )}
          <ProcessButton
            label={t('tools.organize.cta')}
            onClick={handleSave}
            disabled={!canSave}
            loading={busy}
          />
          {result && (
            <div className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900">
              {t('tools.organize.success', { size: formatBytes(result.size) })}
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
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-black/5 bg-white p-3 shadow-card">
            <div className="min-w-0">
              <p
                className="truncate text-sm font-medium text-ink"
                title={file.name}
              >
                {file.name}
              </p>
              <p className="text-xs text-ink-muted">
                {pageOrder.length} {t('common.pages')} · {formatBytes(file.size)}
              </p>
            </div>
          </div>

          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={sortableIds}
              strategy={rectSortingStrategy}
            >
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                {pageOrder.map((sourceIdx, position) => (
                  <OrganizeTile
                    key={`${sortableIds[position]}-${sourceIdx}`}
                    id={sortableIds[position]!}
                    positionIdx={position}
                    sourceIdx={sourceIdx}
                    canvas={
                      sourceIdx === BLANK_PAGE_MARKER
                        ? undefined
                        : thumbs[sourceIdx]
                    }
                    rotation={rotations[position] ?? 0}
                    onDelete={() => deletePage(position)}
                    onRotate={() => rotatePage(position, 90)}
                    label={t('common.page')}
                    deleteLabel={t('tools.organize.deletePage')}
                    rotateLabel={t('tools.organize.rotatePage')}
                    blankLabel={t('tools.organize.addBlank')}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>

          {pageOrder.length === 0 && (
            <div className="rounded-card border border-dashed border-black/10 bg-surface-muted/40 p-6 text-center text-sm text-ink-muted">
              {t('tools.organize.dragToReorder')}
              <div className="mt-3">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setPageOrder(Array.from({ length: pageCount }, (_, i) => i))}
                >
                  {t('common.reset')}
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
      <ProgressOverlay
        open={busy}
        label={note || t('tools.organize.progress')}
        fraction={progress}
        onCancel={() => abortRef.current?.abort()}
      />
    </ToolShell>
  );
}

export default OrganizePage;
