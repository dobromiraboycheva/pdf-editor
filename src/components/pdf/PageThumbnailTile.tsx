import { useEffect, useRef, type KeyboardEvent, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { FileText } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

export interface PageThumbnailTileProps {
  pageIndex: number;
  canvas?: HTMLCanvasElement;
  isSelected?: boolean;
  onClick?: () => void;
  badge?: ReactNode;
  /**
   * Optional additional visual treatment when the tile participates in a
   * range group (e.g. tinted background, custom ring color).
   */
  rangeClassName?: string;
  className?: string;
}

/**
 * A single page-thumbnail tile. Renders a pdf.js canvas via the append-child
 * pattern so the underlying bitmap can be shared / reparented safely.
 */
export function PageThumbnailTile({
  pageIndex,
  canvas,
  isSelected,
  onClick,
  badge,
  rangeClassName,
  className,
}: PageThumbnailTileProps) {
  const { t } = useTranslation();
  const mountRef = useRef<HTMLDivElement | null>(null);

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

  const clickable = typeof onClick === 'function';

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (!clickable) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onClick?.();
    }
  };

  return (
    <div
      role={clickable ? 'button' : undefined}
      tabIndex={clickable ? 0 : undefined}
      aria-pressed={clickable ? Boolean(isSelected) : undefined}
      aria-label={t('common.pageN', { n: pageIndex + 1 })}
      onClick={clickable ? onClick : undefined}
      onKeyDown={handleKeyDown}
      className={cn(
        'group relative flex flex-col items-center gap-2 rounded-card transition-all',
        clickable && 'cursor-pointer focus:outline-none',
        className,
      )}
    >
      <div
        className={cn(
          'relative flex aspect-[3/4] w-full items-center justify-center overflow-hidden rounded-card border border-black/5 bg-white shadow-sm transition-all',
          'group-hover:shadow-card',
          isSelected && 'ring-2 ring-brand-500 ring-offset-1 ring-offset-white',
          rangeClassName,
        )}
      >
        {canvas ? (
          <div
            ref={mountRef}
            className="flex h-full w-full items-center justify-center p-2"
          />
        ) : (
          <FileText
            className="h-10 w-10 text-ink-muted/50"
            aria-hidden="true"
          />
        )}
        {badge ? (
          <div className="absolute right-1.5 top-1.5 z-10">{badge}</div>
        ) : null}
      </div>
      <p className="text-[11px] font-medium text-ink-muted">
        {t('common.pageN', { n: pageIndex + 1 })}
      </p>
    </div>
  );
}

export default PageThumbnailTile;
