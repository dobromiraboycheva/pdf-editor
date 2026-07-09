import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Lock, Zap, Heart, Search, Sparkles } from 'lucide-react';
import type { ToolCategory, PdfTool } from '@/types/tool';
import { TOOLS } from '@/tools/registry';
import { cn } from '@/lib/utils/cn';

type FilterKey = 'all' | ToolCategory;

const FILTERS: { key: FilterKey; labelKey: string }[] = [
  { key: 'all', labelKey: 'home.filterAll' },
  { key: 'organize', labelKey: 'home.categoryOrganize' },
  { key: 'optimize', labelKey: 'home.categoryOptimize' },
  { key: 'edit', labelKey: 'home.categoryEdit' },
  { key: 'security', labelKey: 'home.categorySecurity' },
];

// Tools that are placeholders — get a "Coming soon" badge on the card
// Tools that are placeholders — get a "Coming soon" badge on the card.
// All previously-placeholder tools now have real implementations.
const COMING_SOON_IDS = new Set<string>([]);

// Tools tagged as "new" (fresh additions vs. iLovePDF's baseline set)
const NEW_IDS = new Set<string>([
  'edit',
  'ocr',
  'pdf-to-markdown',
  'compare',
  'forms',
  'scan',
  'summarize',
  'translate',
  'word-to-pdf',
  'excel-to-pdf',
  'powerpoint-to-pdf',
  'pdf-to-word',
  'pdf-to-excel',
  'pdf-to-powerpoint',
]);

export function HomePage() {
  const { t } = useTranslation();
  const [filter, setFilter] = useState<FilterKey>('all');
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    let list: PdfTool[] = TOOLS;
    if (filter !== 'all') list = list.filter((tool) => tool.category === filter);
    const q = query.trim().toLowerCase();
    if (q) {
      list = list.filter((tool) => {
        const name = (tool.i18nKey ? t(`${tool.i18nKey}.name`) : tool.name).toLowerCase();
        const tagline = (tool.i18nKey ? t(`${tool.i18nKey}.tagline`) : tool.tagline).toLowerCase();
        return name.includes(q) || tagline.includes(q) || tool.id.includes(q);
      });
    }
    return list;
  }, [filter, query, t]);

  return (
    <div className="mx-auto w-full max-w-7xl px-6 pb-24">
      {/* Hero */}
      <section className="mx-auto max-w-3xl py-14 text-center sm:py-16">
        <h1 className="text-4xl font-semibold tracking-tight text-ink md:text-5xl">
          {t('home.heroTitle')}
        </h1>
        <p className="mt-4 text-lg text-ink-muted">{t('home.heroSubtitle')}</p>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-2 text-sm text-ink-muted">
          <TrustChip icon={Lock} label={t('home.trustPrivacy')} />
          <TrustChip icon={Zap} label={t('home.trustSpeed')} />
          <TrustChip icon={Heart} label={t('home.trustFree')} />
        </div>
      </section>

      {/* Search */}
      <div className="mx-auto mb-6 max-w-xl">
        <label className="relative flex items-center">
          <Search className="pointer-events-none absolute left-3 h-4 w-4 text-ink-muted" aria-hidden />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('home.searchPlaceholder')}
            className="h-11 w-full rounded-full border border-black/10 bg-white pl-10 pr-4 text-sm text-ink shadow-sm placeholder:text-ink-muted focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
          />
        </label>
      </div>

      {/* Category filter pills */}
      <div className="mb-8 flex flex-wrap justify-center gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setFilter(f.key)}
            className={cn(
              'inline-flex h-9 items-center rounded-full border px-4 text-sm font-medium transition-colors',
              filter === f.key
                ? 'border-brand-500 bg-brand-500 text-white shadow-sm'
                : 'border-black/10 bg-white text-ink hover:bg-surface-muted',
            )}
          >
            {t(f.labelKey)}
          </button>
        ))}
      </div>

      {/* Tool grid */}
      {filtered.length === 0 ? (
        <div className="mx-auto max-w-md py-16 text-center text-ink-muted">
          <p className="text-sm">{t('home.noResults')}</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:gap-4 xl:grid-cols-5">
          {filtered.map((tool) => {
            const Icon = tool.icon;
            const name = tool.i18nKey ? t(`${tool.i18nKey}.name`) : tool.name;
            const tagline = tool.i18nKey ? t(`${tool.i18nKey}.tagline`) : tool.tagline;
            const isComingSoon = COMING_SOON_IDS.has(tool.id);
            const isNew = NEW_IDS.has(tool.id);
            return (
              <Link
                key={tool.id}
                to={tool.route}
                className={cn(
                  'group relative flex flex-col gap-3 rounded-card border border-black/5 bg-white p-4 shadow-sm transition',
                  'hover:-translate-y-0.5 hover:shadow-lg',
                  isComingSoon && 'opacity-70',
                )}
              >
                {isNew && (
                  <span className="absolute right-3 top-3 rounded-full bg-brand-500 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
                    {t('home.badgeNew')}
                  </span>
                )}
                {isComingSoon && (
                  <span className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-800">
                    <Sparkles className="h-2.5 w-2.5" aria-hidden />
                    {t('home.badgeSoon')}
                  </span>
                )}
                <div
                  className={cn(
                    'flex h-12 w-12 items-center justify-center rounded-xl',
                    softenAccent(tool.accent),
                  )}
                >
                  <Icon className={cn('h-6 w-6', accentTextColor(tool.accent))} aria-hidden />
                </div>
                <div className="flex-1">
                  <div className="text-[15px] font-semibold leading-tight text-ink">{name}</div>
                  <div className="mt-1 line-clamp-2 text-xs text-ink-muted">{tagline}</div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

function TrustChip({ icon: Icon, label }: { icon: typeof Lock; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-surface-muted px-3 py-1.5">
      <Icon className="h-3.5 w-3.5 text-brand-500" aria-hidden />
      {label}
    </span>
  );
}

/**
 * Convert an accent class like `bg-emerald-500 text-white` into a soft variant
 * `bg-emerald-100` for the icon square background. Falls back to brand-50 if unrecognised.
 */
function softenAccent(accent: string): string {
  const match = accent.match(/bg-([a-z]+)-\d+/);
  if (!match) return 'bg-brand-50';
  return `bg-${match[1]}-100`;
}

function accentTextColor(accent: string): string {
  const match = accent.match(/bg-([a-z]+)-\d+/);
  if (!match) return 'text-brand-600';
  return `text-${match[1]}-600`;
}
