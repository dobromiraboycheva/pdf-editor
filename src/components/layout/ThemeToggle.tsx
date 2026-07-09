import { useTranslation } from 'react-i18next';
import { Moon, Monitor, Sun } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useTheme, type Theme } from '@/hooks/useTheme';
import { cn } from '@/lib/utils/cn';

/**
 * Compact theme toggle for the app header.
 * Cycles light → dark → system and shows an icon for the current choice.
 */
const ORDER: Theme[] = ['light', 'dark', 'system'];

const ICONS: Record<Theme, LucideIcon> = {
  light: Sun,
  dark: Moon,
  system: Monitor,
};

export function ThemeToggle({ className }: { className?: string }) {
  const { t } = useTranslation();
  const { theme, setTheme } = useTheme();

  const labels: Record<Theme, string> = {
    light: t('header.themeLight'),
    dark: t('header.themeDark'),
    system: t('header.themeSystem'),
  };

  const Icon = ICONS[theme];

  const cycle = () => {
    const next = ORDER[(ORDER.indexOf(theme) + 1) % ORDER.length];
    setTheme(next);
  };

  return (
    <button
      type="button"
      onClick={cycle}
      title={`${t('header.theme')}: ${labels[theme]}`}
      aria-label={`${t('header.theme')}: ${labels[theme]}`}
      className={cn(
        'inline-flex h-9 items-center gap-1.5 rounded-button px-2 text-sm text-ink-muted transition-colors hover:bg-surface-muted hover:text-ink focus:outline-none focus:ring-2 focus:ring-brand-500/40',
        className,
      )}
    >
      <Icon className="h-4 w-4" aria-hidden="true" />
      <span className="hidden sm:inline">{labels[theme]}</span>
    </button>
  );
}

export default ThemeToggle;
