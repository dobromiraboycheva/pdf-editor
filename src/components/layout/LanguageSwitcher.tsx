import { useTranslation } from 'react-i18next';
import { Languages } from 'lucide-react';
import { SUPPORTED_LANGUAGES } from '@/i18n';
import { cn } from '@/lib/utils/cn';

/**
 * Compact language switcher for the app header.
 * Uses a native <select> for accessibility + zero-dependency dropdown.
 */
export function LanguageSwitcher({ className }: { className?: string }) {
  const { i18n, t } = useTranslation();
  const current = i18n.resolvedLanguage ?? 'en';

  return (
    <label className={cn('inline-flex items-center gap-1.5 text-sm', className)}>
      <Languages size={16} className="text-ink-muted" aria-hidden />
      <span className="sr-only">{t('header.language')}</span>
      <select
        value={current}
        onChange={(e) => {
          void i18n.changeLanguage(e.target.value);
        }}
        className="bg-transparent border-0 rounded-md px-1 py-0.5 text-ink hover:bg-surface-muted focus:outline-none focus:ring-2 focus:ring-brand-500/40 cursor-pointer"
        aria-label={t('header.language')}
      >
        {SUPPORTED_LANGUAGES.map((lang) => (
          <option key={lang.code} value={lang.code}>
            {lang.flag} {lang.label}
          </option>
        ))}
      </select>
    </label>
  );
}
