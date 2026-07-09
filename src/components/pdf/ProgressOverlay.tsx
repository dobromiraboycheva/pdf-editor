import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils/cn';

export interface ProgressOverlayProps {
  open: boolean;
  label: string;
  /** 0..1 fraction. */
  fraction: number;
  onCancel?: () => void;
  className?: string;
}

export function ProgressOverlay({
  open,
  label,
  fraction,
  onCancel,
  className,
}: ProgressOverlayProps) {
  const { t } = useTranslation();
  const pct = Math.round(Math.max(0, Math.min(1, fraction)) * 100);

  return (
    <div
      role="status"
      aria-live="polite"
      aria-hidden={!open}
      className={cn(
        'fixed inset-x-0 bottom-0 z-40 border-t border-black/5 bg-white/95 shadow-card backdrop-blur transition-transform duration-300 ease-out',
        open ? 'translate-y-0' : 'translate-y-full',
        className,
      )}
    >
      <div className="mx-auto flex h-[120px] w-full max-w-6xl flex-col justify-center gap-3 px-4 sm:px-6">
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-ink">{label}</p>
          </div>
          <div className="flex items-center gap-3">
            <span className="tabular-nums text-sm text-ink-muted">{pct}%</span>
            {onCancel && (
              <Button variant="ghost" size="sm" onClick={onCancel}>
                {t('common.cancel')}
              </Button>
            )}
          </div>
        </div>
        <Progress value={pct} />
      </div>
    </div>
  );
}

export default ProgressOverlay;
