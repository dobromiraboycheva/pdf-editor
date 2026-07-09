import { useCallback, useMemo } from 'react';
import { useDropzone, type Accept } from 'react-dropzone';
import { useTranslation } from 'react-i18next';
import { Clock, Loader2, UploadCloud } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils/cn';
import { formatBytes } from '@/lib/utils/formatBytes';
import { useRecentFiles } from '@/hooks/useRecentFiles';

export interface FileDropzoneProps {
  onFiles: (files: File[]) => void;
  multiple?: boolean;
  accept?: string[];
  isIngesting?: boolean;
  className?: string;
}

/** Compact relative-time label ("just now", "5m ago", "2h ago", "3d ago"). */
function relativeTime(ts: number): string {
  const diff = Date.now() - ts;
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  return `${day}d ago`;
}

export function FileDropzone({
  onFiles,
  multiple = true,
  accept,
  isIngesting = false,
  className,
}: FileDropzoneProps) {
  const { t } = useTranslation();
  const recent = useRecentFiles((s) => s.recent);
  const clearRecent = useRecentFiles((s) => s.clearRecent);
  const acceptMap: Accept = useMemo(() => {
    if (accept && accept.length > 0) {
      return accept.reduce<Accept>((acc, mime) => {
        acc[mime] = [];
        return acc;
      }, {});
    }
    return { 'application/pdf': ['.pdf'] };
  }, [accept]);

  const handleDrop = useCallback(
    (accepted: File[]) => {
      if (accepted.length > 0) onFiles(accepted);
    },
    [onFiles],
  );

  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    onDrop: handleDrop,
    accept: acceptMap,
    multiple,
    noClick: false,
    noKeyboard: false,
    disabled: isIngesting,
  });

  return (
    <div className={cn('flex w-full flex-col gap-4', className)}>
      <div
        {...getRootProps({
          className: cn(
            'group relative flex min-h-64 w-full cursor-pointer flex-col items-center justify-center gap-3 rounded-card border-2 border-dashed border-black/10 bg-surface px-6 py-10 text-center transition-colors dark:border-white/10',
            'hover:border-brand-300 hover:bg-surface-muted/60',
            isDragActive && 'border-brand-500 bg-brand-50',
            isIngesting && 'cursor-wait opacity-80',
          ),
        })}
      >
        <input {...getInputProps()} />

        {isIngesting ? (
          <div className="flex flex-col items-center gap-3 text-ink-muted">
            <Loader2 className="h-10 w-10 animate-spin text-brand-500" />
            <p className="text-sm font-medium">{t('dropzone.reading')}</p>
          </div>
        ) : (
          <>
            <div
              className={cn(
                'flex h-14 w-14 items-center justify-center rounded-full bg-brand-50 text-brand-500 transition-transform',
                'group-hover:scale-105',
                isDragActive && 'scale-110',
              )}
            >
              <UploadCloud className="h-8 w-8" />
            </div>
            <div className="space-y-1">
              <p className="text-base font-semibold text-ink sm:text-lg">
                {t('dropzone.dropHere')}
              </p>
              <p className="text-sm text-ink-muted">
                {t('dropzone.subLabel')}
              </p>
            </div>
            <Button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                open();
              }}
              className="mt-2"
            >
              {t('dropzone.selectFiles')}
            </Button>
          </>
        )}
      </div>

      {/* Recent files: a memory aid only. We never store file contents, so a
          click cannot re-open the file directly — it re-opens the picker. */}
      {!isIngesting && recent.length > 0 && (
        <div className="rounded-card border border-black/5 bg-surface px-4 py-3 dark:border-white/5">
          <div className="mb-2 flex items-center justify-between">
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-ink-muted">
              <Clock className="h-3.5 w-3.5" aria-hidden="true" />
              {t('recent.title')}
            </span>
            <button
              type="button"
              onClick={() => clearRecent()}
              className="text-xs font-medium text-ink-muted underline-offset-2 transition-colors hover:text-ink hover:underline"
            >
              {t('recent.clear')}
            </button>
          </div>
          <ul className="flex flex-col gap-1.5">
            {recent.map((f) => (
              <li key={`${f.name}-${f.size}`}>
                <button
                  type="button"
                  title={t('recent.hint')}
                  onClick={() => open()}
                  className="flex w-full items-center justify-between gap-3 rounded-button px-2 py-1.5 text-left transition-colors hover:bg-surface-muted"
                >
                  <span className="min-w-0 flex-1 truncate text-sm text-ink">
                    {f.name}
                  </span>
                  <span className="shrink-0 tabular-nums text-xs text-ink-muted">
                    {formatBytes(f.size)} · {relativeTime(f.lastOpened)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-ink-muted">{t('recent.hint')}</p>
        </div>
      )}
    </div>
  );
}

export default FileDropzone;
