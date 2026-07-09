import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { FileText, X } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

export interface PageThumbnailProps {
  name: string;
  pageCount: number;
  canvas?: HTMLCanvasElement;
  onRemove?: () => void;
  className?: string;
}

export function PageThumbnail({
  name,
  pageCount,
  canvas,
  onRemove,
  className,
}: PageThumbnailProps) {
  const { t } = useTranslation();
  const mountRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = mountRef.current;
    if (!el || !canvas) return;
    // Mount the shared canvas into this tile.
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

  return (
    <div
      className={cn(
        'group relative flex h-[200px] w-40 flex-col overflow-hidden rounded-card border border-black/5 bg-white shadow-card',
        className,
      )}
    >
      <div className="relative flex flex-1 items-center justify-center overflow-hidden bg-surface-muted">
        {canvas ? (
          <div
            ref={mountRef}
            className="flex h-full w-full items-center justify-center p-2"
          />
        ) : (
          <FileText
            className="h-12 w-12 text-ink-muted/60"
            aria-hidden="true"
          />
        )}
        {onRemove && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onRemove();
            }}
            aria-label={`Remove ${name}`}
            className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-white/95 text-ink shadow-sm opacity-0 transition-opacity hover:bg-white group-hover:opacity-100 focus-visible:opacity-100"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      <div className="border-t border-black/5 px-3 py-2">
        <p className="truncate text-xs font-medium text-ink" title={name}>
          {name}
        </p>
        <p className="mt-0.5 text-[11px] text-ink-muted">
          {pageCount} {pageCount === 1 ? t('common.page') : t('common.pages')}
        </p>
      </div>
    </div>
  );
}

export default PageThumbnail;
