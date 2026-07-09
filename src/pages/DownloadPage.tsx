import type { ComponentType } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Laptop,
  Monitor,
  Smartphone,
  Globe,
  Download as DownloadIcon,
  ArrowRight,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils/cn';

// GitHub Releases page — real repo. Direct download links point at the latest release assets.
const RELEASES_URL = 'https://github.com/dobromiraboycheva/pdf-editor/releases';
const RELEASES_LATEST = 'https://github.com/dobromiraboycheva/pdf-editor/releases/latest';
const WEB_APP_URL = 'https://pdfeditor-app.vercel.app';

interface PlatformCard {
  key: string;
  icon: ComponentType<{ className?: string }>;
  titleKey: string;
  fileKey: string;
  stepKeys: string[];
  noteKey?: string;
}

const PLATFORMS: PlatformCard[] = [
  {
    key: 'mac',
    icon: Laptop,
    titleKey: 'download.mac.title',
    fileKey: 'download.mac.file',
    stepKeys: ['download.mac.step1', 'download.mac.step2'],
    noteKey: 'download.mac.note',
  },
  {
    key: 'windows',
    icon: Monitor,
    titleKey: 'download.windows.title',
    fileKey: 'download.windows.file',
    stepKeys: ['download.windows.step1', 'download.windows.step2'],
    noteKey: 'download.windows.note',
  },
  {
    key: 'android',
    icon: Smartphone,
    titleKey: 'download.android.title',
    fileKey: 'download.android.file',
    stepKeys: [
      'download.android.step1',
      'download.android.step2',
      'download.android.step3',
    ],
    noteKey: 'download.android.note',
  },
];

export function DownloadPage() {
  const { t } = useTranslation();

  return (
    <div className="mx-auto w-full max-w-5xl px-6 pb-24">
      {/* Hero */}
      <section className="mx-auto max-w-2xl py-12 text-center sm:py-14">
        <span className="mx-auto mb-4 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-50 text-brand-600">
          <DownloadIcon className="h-6 w-6" aria-hidden />
        </span>
        <h1 className="text-3xl font-semibold tracking-tight text-ink md:text-4xl">
          {t('download.title')}
        </h1>
        <p className="mt-3 text-lg text-ink-muted">{t('download.subtitle')}</p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <Button asChild size="lg">
            <a href={RELEASES_LATEST} target="_blank" rel="noopener noreferrer">
              <DownloadIcon className="h-4 w-4" />
              {t('download.getLatest')}
            </a>
          </Button>
          <Button asChild variant="secondary" size="lg">
            <a href={WEB_APP_URL} target="_blank" rel="noopener noreferrer">
              <Globe className="h-4 w-4" />
              {t('download.openWeb')}
            </a>
          </Button>
        </div>
        <p className="mt-4 text-sm text-ink-muted">
          {t('download.releasesIntro')}{' '}
          <a
            href={RELEASES_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-brand-600 underline underline-offset-2 hover:text-brand-700"
          >
            {t('download.releasesLink')}
          </a>
          .
        </p>
      </section>

      {/* Platform cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {PLATFORMS.map((p) => {
          const Icon = p.icon;
          return (
            <Card key={p.key} className="flex flex-col">
              <CardHeader>
                <div className="mb-2 flex h-11 w-11 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
                  <Icon className="h-6 w-6" aria-hidden />
                </div>
                <CardTitle>{t(p.titleKey)}</CardTitle>
                <p className="text-xs font-medium text-ink-muted">{t(p.fileKey)}</p>
              </CardHeader>
              <CardContent className="flex flex-1 flex-col gap-4">
                <ol className="flex-1 list-decimal space-y-1.5 pl-4 text-sm text-ink-muted">
                  {p.stepKeys.map((k) => (
                    <li key={k}>{t(k)}</li>
                  ))}
                </ol>
                {p.noteKey && (
                  <p className="rounded-button bg-surface-muted px-3 py-2 text-xs text-ink-muted">
                    {t(p.noteKey)}
                  </p>
                )}
                <Button asChild variant="secondary" className="w-full">
                  <a href={RELEASES_URL} target="_blank" rel="noopener noreferrer">
                    <DownloadIcon className="h-4 w-4" />
                    {t('download.getIt')}
                  </a>
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* PWA / browser install */}
      <Card className="mt-6 bg-brand-50/40">
        <CardContent className="flex flex-col items-start gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white text-brand-600 shadow-sm">
              <Globe className="h-6 w-6" aria-hidden />
            </span>
            <div>
              <h2 className="text-lg font-semibold text-ink">{t('download.web.title')}</h2>
              <p className="mt-1 text-sm text-ink-muted">{t('download.web.body')}</p>
              <p className="mt-1 text-xs text-ink-muted">{t('download.web.pwa')}</p>
            </div>
          </div>
          <Button asChild className={cn('shrink-0')}>
            <Link to="/">
              {t('download.web.cta')}
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

export default DownloadPage;
