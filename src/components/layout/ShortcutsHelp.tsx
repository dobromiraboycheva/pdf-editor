import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { useShortcutsHelp } from '@/hooks/useShortcutsHelp';

/** A single shortcut row: description on the left, key(s) on the right. */
interface ShortcutRow {
  keys: string;
  label: string;
}

interface ShortcutGroup {
  title: string;
  rows: ShortcutRow[];
}

function Kbd({ children }: { children: string }) {
  return (
    <span className="inline-flex flex-wrap items-center justify-end gap-1">
      {children.split(' ').map((part, i) =>
        part === '·' || part === '/' ? (
          <span key={i} className="text-ink-muted">
            {part}
          </span>
        ) : (
          <kbd
            key={i}
            className="inline-flex min-w-[1.75rem] items-center justify-center rounded-button border border-black/10 bg-surface-muted px-1.5 py-0.5 text-xs font-medium text-ink shadow-sm dark:border-white/10"
          >
            {part}
          </kbd>
        ),
      )}
    </span>
  );
}

export function ShortcutsHelp() {
  const { t } = useTranslation();
  const open = useShortcutsHelp((s) => s.open);
  const setOpen = useShortcutsHelp((s) => s.setOpen);

  // Close on Escape.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, setOpen]);

  if (!open) return null;

  const groups: ShortcutGroup[] = [
    {
      title: t('shortcuts.generalTitle'),
      rows: [
        { keys: '?', label: t('shortcuts.showHelp') },
        { keys: 'Cmd / Ctrl O', label: t('shortcuts.openFile') },
      ],
    },
    {
      title: t('shortcuts.editTitle'),
      rows: [
        { keys: 'Cmd / Ctrl Z', label: t('shortcuts.undo') },
        { keys: 'Cmd / Ctrl Shift Z', label: t('shortcuts.redo') },
        { keys: 'Delete / Backspace', label: t('shortcuts.deleteSelected') },
        { keys: 'Cmd / Ctrl C', label: t('shortcuts.copy') },
        { keys: 'Cmd / Ctrl V', label: t('shortcuts.paste') },
        { keys: 'Cmd / Ctrl D', label: t('shortcuts.duplicate') },
        { keys: 'Cmd / Ctrl + / - / 0', label: t('shortcuts.zoom') },
        { keys: '← ↑ → ↓', label: t('shortcuts.nudge') },
        { keys: 'Esc', label: t('shortcuts.deselect') },
        { keys: 'F11', label: t('shortcuts.fullscreen') },
      ],
    },
  ];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t('shortcuts.title')}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={() => setOpen(false)}
    >
      <div
        className={cn(
          'w-full max-w-lg overflow-hidden rounded-card bg-surface shadow-card',
          'max-h-[85vh] overflow-y-auto',
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-black/5 px-5 py-4 dark:border-white/5">
          <h2 className="text-base font-semibold text-ink">
            {t('shortcuts.title')}
          </h2>
          <button
            type="button"
            aria-label={t('common.close')}
            onClick={() => setOpen(false)}
            className="inline-flex h-8 w-8 items-center justify-center rounded-button text-ink-muted transition-colors hover:bg-surface-muted hover:text-ink"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-6 px-5 py-4">
          {groups.map((group) => (
            <div key={group.title} className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
                {group.title}
              </h3>
              <dl className="divide-y divide-black/5 dark:divide-white/5">
                {group.rows.map((row) => (
                  <div
                    key={row.label}
                    className="flex items-center justify-between gap-4 py-2"
                  >
                    <dt className="text-sm text-ink">{row.label}</dt>
                    <dd className="shrink-0 text-right">
                      <Kbd>{row.keys}</Kbd>
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default ShortcutsHelp;
