import {
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { useTranslation } from 'react-i18next';
import type { PDFDocumentProxy } from 'pdfjs-dist';
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
import { renderThumbnail } from '@/lib/pdf/renderThumbnails';
import { cn } from '@/lib/utils/cn';
import { PageThumbnailTile } from './PageThumbnailTile';

export interface PageGridProps {
  pdfjsDoc: PDFDocumentProxy;
  pageCount: number;
  /** 0-based indices — optional (unselectable mode when omitted) */
  selectedPages?: Set<number>;
  onTogglePage?: (pageIndex: number) => void;
  /** 0-based indices per range, for rendering group boundaries */
  ranges?: number[][];
  /** When true, render "Range 1" etc. and separator dots between groups */
  showRangeLabels?: boolean;
  /** Rendered in the top-right of each tile, e.g. rotation badge / delete button */
  pageBadges?: (pageIndex: number) => ReactNode | undefined;
  /** When set, enable drag-drop reorder */
  onReorder?: (fromIndex: number, toIndex: number) => void;
  /** Cap at 200 by default for memory. */
  maxThumbnails?: number;
  className?: string;
}

const DEFAULT_MAX_THUMBNAILS = 200;
const THUMB_WIDTH_PX = 140;

// Per-range accent ring colors. v1 trade-off:
// The iLovePDF reference wraps each range in its own dashed box with a "Range N"
// label sitting *inside* a responsive CSS grid. Doing that faithfully requires
// coordinating grid-column offsets to keep row wrapping consistent across
// breakpoints, which fights the built-in `grid-cols-*` responsive utilities.
// For v1 we opt for a simpler visual affordance: every range gets a distinct
// ring/tint hue via a stable rotation on the range index, and we skip the
// dashed-border grouping and inter-range ellipsis. This preserves the
// "here are my ranges" scanability while keeping the grid trivial.
const RANGE_ACCENTS: ReadonlyArray<{ ring: string; tint: string }> = [
  { ring: 'ring-2 ring-brand-500 ring-offset-1 ring-offset-white', tint: 'bg-brand-50' },
  { ring: 'ring-2 ring-emerald-500 ring-offset-1 ring-offset-white', tint: 'bg-emerald-50' },
  { ring: 'ring-2 ring-amber-500 ring-offset-1 ring-offset-white', tint: 'bg-amber-50' },
  { ring: 'ring-2 ring-fuchsia-500 ring-offset-1 ring-offset-white', tint: 'bg-fuchsia-50' },
  { ring: 'ring-2 ring-sky-500 ring-offset-1 ring-offset-white', tint: 'bg-sky-50' },
  { ring: 'ring-2 ring-rose-500 ring-offset-1 ring-offset-white', tint: 'bg-rose-50' },
];

interface RangeInfo {
  index: number;
  accent: { ring: string; tint: string };
}

interface SortableTileProps {
  id: string;
  pageIndex: number;
  canvas?: HTMLCanvasElement;
  isSelected: boolean;
  onClick?: () => void;
  badge?: ReactNode;
  rangeClassName?: string;
}

function SortableTile({
  id,
  pageIndex,
  canvas,
  isSelected,
  onClick,
  badge,
  rangeClassName,
}: SortableTileProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 10 : undefined,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className="touch-none"
    >
      <PageThumbnailTile
        pageIndex={pageIndex}
        canvas={canvas}
        isSelected={isSelected}
        onClick={onClick}
        badge={badge}
        rangeClassName={rangeClassName}
      />
    </div>
  );
}

/**
 * Full-width responsive grid of page thumbnails for a single PDF document.
 * Renders thumbnails progressively during idle time and caches the rendered
 * canvases in-memory. Selection, per-range accent coloring, badges, and
 * drag-drop reordering are all opt-in via props.
 */
export function PageGrid({
  pdfjsDoc,
  pageCount,
  selectedPages,
  onTogglePage,
  ranges,
  showRangeLabels = false,
  pageBadges,
  onReorder,
  maxThumbnails = DEFAULT_MAX_THUMBNAILS,
  className,
}: PageGridProps) {
  const { t } = useTranslation();
  const [canvases, setCanvases] = useState<Map<number, HTMLCanvasElement>>(
    () => new Map(),
  );

  const visibleCount = Math.min(pageCount, maxThumbnails);
  const truncated = pageCount > maxThumbnails;

  // Progressive rendering via requestIdleCallback, cancelable on unmount.
  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;
    let cancelled = false;
    let idleHandle: number | null = null;

    // Local mutable cache — mirror into React state so tiles re-render as
    // canvases arrive. Bounded by `maxThumbnails` (acts as a simple LRU cap
    // in insertion order: we only ever render the first N pages).
    const cache = new Map<number, HTMLCanvasElement>();

    const renderNext = async (i: number): Promise<void> => {
      if (cancelled || signal.aborted) return;
      if (i >= visibleCount) return;
      if (cache.has(i)) {
        scheduleIdle(() => {
          void renderNext(i + 1);
        });
        return;
      }
      try {
        const canvas = await renderThumbnail(pdfjsDoc, i, {
          widthPx: THUMB_WIDTH_PX,
          dpr: 2,
          signal,
        });
        if (cancelled || signal.aborted) return;
        cache.set(i, canvas);
        // Evict oldest if we somehow exceed the cap (defensive).
        if (cache.size > maxThumbnails) {
          const oldest = cache.keys().next().value;
          if (typeof oldest === 'number') cache.delete(oldest);
        }
        setCanvases(new Map(cache));
      } catch (err) {
        if ((err as DOMException).name === 'AbortError') return;
        // Skip failed pages; keep rendering the rest.
      }
      scheduleIdle(() => {
        void renderNext(i + 1);
      });
    };

    const scheduleIdle = (cb: () => void): void => {
      if (cancelled || signal.aborted) return;
      const w = window as Window &
        typeof globalThis & {
          requestIdleCallback?: (cb: IdleRequestCallback) => number;
          cancelIdleCallback?: (handle: number) => void;
        };
      if (typeof w.requestIdleCallback === 'function') {
        idleHandle = w.requestIdleCallback(() => cb());
      } else {
        idleHandle = window.setTimeout(cb, 16);
      }
    };

    scheduleIdle(() => {
      void renderNext(0);
    });

    return () => {
      cancelled = true;
      controller.abort();
      if (idleHandle !== null) {
        const w = window as Window &
          typeof globalThis & {
            cancelIdleCallback?: (handle: number) => void;
          };
        if (typeof w.cancelIdleCallback === 'function') {
          w.cancelIdleCallback(idleHandle);
        } else {
          window.clearTimeout(idleHandle);
        }
      }
    };
  }, [pdfjsDoc, visibleCount, maxThumbnails]);

  // Map page index -> range info (for per-range accent styling).
  const pageToRange = useMemo<Map<number, RangeInfo>>(() => {
    const map = new Map<number, RangeInfo>();
    if (!ranges) return map;
    ranges.forEach((range, rangeIdx) => {
      const accent = RANGE_ACCENTS[rangeIdx % RANGE_ACCENTS.length];
      for (const pageIdx of range) {
        map.set(pageIdx, { index: rangeIdx, accent });
      }
    });
    return map;
  }, [ranges]);

  const sortableIds = useMemo(
    () => Array.from({ length: visibleCount }, (_, i) => `page-${i}`),
    [visibleCount],
  );

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragEnd = (event: DragEndEvent): void => {
    if (!onReorder) return;
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const fromIdx = sortableIds.indexOf(String(active.id));
    const toIdx = sortableIds.indexOf(String(over.id));
    if (fromIdx === -1 || toIdx === -1) return;
    onReorder(fromIdx, toIdx);
  };

  const gridClasses = 'grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5';

  const renderTile = (i: number): ReactNode => {
    const canvas = canvases.get(i);
    const isSelected = selectedPages?.has(i) ?? false;
    const rangeInfo = pageToRange.get(i);
    const badge = pageBadges?.(i);

    // Range coloring wins over the default selection ring when the tile is
    // part of a labeled range group.
    let rangeClassName: string | undefined;
    if (rangeInfo && showRangeLabels) {
      rangeClassName = cn(rangeInfo.accent.ring, rangeInfo.accent.tint);
    } else if (rangeInfo) {
      rangeClassName = rangeInfo.accent.ring;
    }

    const onClick = onTogglePage ? () => onTogglePage(i) : undefined;

    if (onReorder) {
      return (
        <SortableTile
          key={i}
          id={sortableIds[i]}
          pageIndex={i}
          canvas={canvas}
          isSelected={isSelected}
          onClick={onClick}
          badge={badge}
          rangeClassName={rangeClassName}
        />
      );
    }

    return (
      <PageThumbnailTile
        key={i}
        pageIndex={i}
        canvas={canvas}
        isSelected={isSelected}
        onClick={onClick}
        badge={badge}
        rangeClassName={rangeClassName}
      />
    );
  };

  const tiles = Array.from({ length: visibleCount }, (_, i) => renderTile(i));

  const content = onReorder ? (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <SortableContext items={sortableIds} strategy={rectSortingStrategy}>
        <div className={gridClasses}>{tiles}</div>
      </SortableContext>
    </DndContext>
  ) : (
    <div className={gridClasses}>{tiles}</div>
  );

  return (
    <div className={cn('w-full', className)}>
      {content}
      {truncated ? (
        <p className="mt-6 text-center text-xs text-ink-muted">
          {t('common.showingFirstN', { shown: maxThumbnails, total: pageCount })}
        </p>
      ) : null}
    </div>
  );
}

export default PageGrid;
