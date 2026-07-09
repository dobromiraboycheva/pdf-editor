import { useMemo } from 'react';
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
import { Plus } from 'lucide-react';
import { PageThumbnail } from './PageThumbnail';
import { cn } from '@/lib/utils/cn';

export interface ThumbnailStripFile {
  id: string;
  name: string;
  pageCount: number;
  canvas?: HTMLCanvasElement;
}

export interface ThumbnailStripProps {
  files: ThumbnailStripFile[];
  onReorder: (fromIdx: number, toIdx: number) => void;
  onRemove: (id: string) => void;
  onAddMore?: () => void;
  className?: string;
}

interface SortableItemProps {
  file: ThumbnailStripFile;
  onRemove: (id: string) => void;
}

function SortableItem({ file, onRemove }: SortableItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: file.id });

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
      {...attributes}
      {...listeners}
      className="cursor-grab touch-none active:cursor-grabbing"
    >
      <PageThumbnail
        name={file.name}
        pageCount={file.pageCount}
        canvas={file.canvas}
        onRemove={() => onRemove(file.id)}
      />
    </div>
  );
}

export function ThumbnailStrip({
  files,
  onReorder,
  onRemove,
  onAddMore,
  className,
}: ThumbnailStripProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const ids = useMemo(() => files.map((f) => f.id), [files]);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const fromIdx = ids.indexOf(String(active.id));
    const toIdx = ids.indexOf(String(over.id));
    if (fromIdx === -1 || toIdx === -1) return;
    onReorder(fromIdx, toIdx);
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <SortableContext items={ids} strategy={rectSortingStrategy}>
        <div className={cn('flex flex-wrap gap-4', className)}>
          {files.map((file) => (
            <SortableItem key={file.id} file={file} onRemove={onRemove} />
          ))}
          {onAddMore && (
            <button
              type="button"
              onClick={onAddMore}
              className="flex h-[200px] w-40 flex-col items-center justify-center gap-2 rounded-card border-2 border-dashed border-black/10 bg-white text-ink-muted transition-colors hover:border-brand-300 hover:bg-surface-muted hover:text-brand-500"
            >
              <Plus className="h-6 w-6" />
              <span className="text-xs font-medium">Add more files</span>
            </button>
          )}
        </div>
      </SortableContext>
    </DndContext>
  );
}

export default ThumbnailStrip;
