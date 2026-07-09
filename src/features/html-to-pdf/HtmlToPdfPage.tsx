import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useToast } from '@/hooks/useToast';
import { ToolShell } from '@/components/layout/ToolShell';
import { ProcessButton } from '@/components/pdf/ProcessButton';
import { ProgressOverlay } from '@/components/pdf/ProgressOverlay';
import { Card, CardContent } from '@/components/ui/card';
import { downloadBlob } from '@/lib/files/download';
import { formatBytes } from '@/lib/utils/formatBytes';
import { cn } from '@/lib/utils/cn';
import {
  htmlToPdfProcessor,
  type HtmlToPdfOptions,
} from './htmlToPdfProcessor';
import {
  useHtmlToPdfStore,
  type HtmlToPdfPageSize,
  type HtmlToPdfSource,
} from './useStore';

export function HtmlToPdfPage() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const source = useHtmlToPdfStore((s) => s.source);
  const url = useHtmlToPdfStore((s) => s.url);
  const html = useHtmlToPdfStore((s) => s.html);
  const pageSize = useHtmlToPdfStore((s) => s.pageSize);
  const setSource = useHtmlToPdfStore((s) => s.setSource);
  const setUrl = useHtmlToPdfStore((s) => s.setUrl);
  const setHtml = useHtmlToPdfStore((s) => s.setHtml);
  const setPageSize = useHtmlToPdfStore((s) => s.setPageSize);

  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [note, setNote] = useState('');
  const [result, setResult] = useState<{ size: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const canRun =
    !busy &&
    ((source === 'url' && url.trim().length > 0) ||
      (source === 'html' && html.trim().length > 0));

  const handleRun = useCallback(async () => {
    setBusy(true);
    setResult(null);
    setError(null);
    setProgress(0);
    setNote('');
    try {
      const options: HtmlToPdfOptions = {
        source,
        url: source === 'url' ? url : undefined,
        html: source === 'html' ? html : undefined,
        pageSize,
      };
      const res = await htmlToPdfProcessor(options, (f, n) => {
        setProgress(f);
        if (n) setNote(n);
      });
      const out = res.outputs[0];
      if (!out) throw new Error('No output produced.');
      await downloadBlob(out.blob, out.name);
      setResult({ size: out.blob.size });
    } catch (e) {
      const msg = (e as Error).message;
      setError(msg);
      toast({ message: t('tools.htmlToPdf.failed', { message: msg }), variant: 'error' });
    } finally {
      setBusy(false);
    }
  }, [source, url, html, pageSize, t]);

  const pageSizeOptions: { value: HtmlToPdfPageSize; label: string }[] = [
    { value: 'a4', label: t('tools.jpgToPdf.pageSizeA4') },
    { value: 'letter', label: t('tools.jpgToPdf.pageSizeLetter') },
  ];

  const sourceOptions: { value: HtmlToPdfSource; label: string }[] = [
    { value: 'url', label: t('tools.htmlToPdf.urlLabel') },
    { value: 'html', label: t('tools.htmlToPdf.htmlLabel') },
  ];

  return (
    <ToolShell
      title={t('tools.htmlToPdf.name')}
      tagline={t('tools.htmlToPdf.description')}
      sidebar={
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <span className="text-xs font-medium text-ink-muted">
              {t('tools.htmlToPdf.pageSize')}
            </span>
            <div
              role="radiogroup"
              className="flex flex-col gap-1 rounded-card border border-black/5 bg-white p-1"
            >
              {pageSizeOptions.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  role="radio"
                  aria-checked={pageSize === opt.value}
                  onClick={() => setPageSize(opt.value)}
                  className={cn(
                    'rounded-button px-3 py-2 text-left text-sm transition-colors',
                    pageSize === opt.value
                      ? 'bg-brand-500 text-white'
                      : 'text-ink hover:bg-surface-muted',
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <ProcessButton
            label={t('tools.htmlToPdf.cta')}
            onClick={handleRun}
            disabled={!canRun}
            loading={busy}
          />
          {result && (
            <div className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900">
              {t('tools.htmlToPdf.success', {
                size: formatBytes(result.size),
              })}
            </div>
          )}
          {error && <div className="text-sm text-red-600">{error}</div>}
          <p className="text-xs text-ink-muted">{t('tools.htmlToPdf.note')}</p>
        </div>
      }
    >
      <Card>
        <CardContent className="flex flex-col gap-4 p-6">
          <div
            role="radiogroup"
            className="flex gap-1 rounded-card border border-black/5 bg-white p-1"
          >
            {sourceOptions.map((opt) => (
              <button
                key={opt.value}
                type="button"
                role="radio"
                aria-checked={source === opt.value}
                onClick={() => setSource(opt.value)}
                className={cn(
                  'flex-1 rounded-button px-3 py-2 text-center text-sm transition-colors',
                  source === opt.value
                    ? 'bg-brand-500 text-white'
                    : 'text-ink hover:bg-surface-muted',
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {source === 'url' ? (
            <div className="flex flex-col gap-1">
              <label
                htmlFor="html-to-pdf-url"
                className="text-xs font-medium text-ink-muted"
              >
                {t('tools.htmlToPdf.urlLabel')}
              </label>
              <input
                id="html-to-pdf-url"
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder={t('tools.htmlToPdf.urlPlaceholder')}
                className="h-10 rounded-button border border-black/10 bg-white px-3 text-sm text-ink focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
          ) : (
            <div className="flex flex-col gap-1">
              <label
                htmlFor="html-to-pdf-html"
                className="text-xs font-medium text-ink-muted"
              >
                {t('tools.htmlToPdf.htmlLabel')}
              </label>
              <textarea
                id="html-to-pdf-html"
                value={html}
                onChange={(e) => setHtml(e.target.value)}
                rows={16}
                placeholder="<h1>Hello</h1><p>...</p>"
                className="min-h-[220px] rounded-card border border-black/10 bg-white p-3 font-mono text-xs text-ink focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
          )}
        </CardContent>
      </Card>
      <ProgressOverlay
        open={busy}
        label={note || t('tools.htmlToPdf.progress')}
        fraction={progress}
      />
    </ToolShell>
  );
}

export default HtmlToPdfPage;
