import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Download } from 'lucide-react';

export function AppFooter() {
  const { t } = useTranslation();
  const year = 2026;
  return (
    <footer className="mt-auto border-t border-black/5 bg-white/50 py-5">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-center gap-2 px-4 text-center sm:px-6">
        <Link
          to="/download"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-600 transition-colors hover:text-brand-700"
        >
          <Download className="h-4 w-4" aria-hidden />
          {t('nav.download')}
        </Link>
        <p className="text-sm font-medium text-ink">
          {t('footer.createdBy')} Dobromira Boycheva
        </p>
        <p className="text-xs text-ink-muted">
          © {year} · {t('footer.tagline')}
        </p>
      </div>
    </footer>
  );
}

export default AppFooter;
