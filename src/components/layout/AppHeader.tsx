import { Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, FileText, HelpCircle, Lock } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { useShortcutsHelp } from '@/hooks/useShortcutsHelp';
import { LanguageSwitcher } from './LanguageSwitcher';
import { ThemeToggle } from './ThemeToggle';

export interface AppHeaderProps {
  className?: string;
}

export function AppHeader({ className }: AppHeaderProps) {
  const location = useLocation();
  const { t } = useTranslation();
  const setShortcutsOpen = useShortcutsHelp((s) => s.setOpen);
  const isToolPage = location.pathname !== '/' && location.pathname !== '';

  return (
    <header
      className={cn(
        'sticky top-0 z-30 h-14 w-full border-b border-black/5 bg-surface/80 backdrop-blur dark:border-white/5',
        className,
      )}
    >
      <div className="mx-auto flex h-full max-w-6xl items-center justify-between px-4 sm:px-6">
        <div className="flex items-center gap-3">
          {isToolPage && (
            <Link
              to="/"
              aria-label={t('common.back')}
              className="inline-flex h-9 w-9 items-center justify-center rounded-button text-ink-muted transition-colors hover:bg-surface-muted hover:text-ink"
            >
              <ArrowLeft className="h-4 w-4" />
            </Link>
          )}
          <Link to="/" className="flex items-center gap-2">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-button bg-brand-500 text-white shadow-sm">
              <FileText className="h-4 w-4" />
            </span>
            <span className="text-base font-semibold tracking-tight text-ink">
              {t('header.appName')}
            </span>
          </Link>
        </div>

        <div className="flex items-center gap-3">
          <span className="hidden sm:inline-flex items-center gap-1.5 rounded-full border border-black/5 bg-surface-muted px-2.5 py-1 text-xs font-medium text-ink-muted">
            <Lock className="h-3 w-3" aria-hidden="true" />
            <span>{t('common.offline')}</span>
          </span>
          <ThemeToggle />
          <LanguageSwitcher />
          <button
            type="button"
            aria-label={t('shortcuts.title')}
            title={t('shortcuts.title')}
            onClick={() => setShortcutsOpen(true)}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full text-ink-muted transition-colors hover:bg-surface-muted hover:text-ink"
          >
            <HelpCircle className="h-4 w-4" />
          </button>
        </div>
      </div>
    </header>
  );
}

export default AppHeader;
