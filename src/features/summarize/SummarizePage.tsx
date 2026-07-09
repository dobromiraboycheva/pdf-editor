import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Download } from 'lucide-react';
import { ToolShell } from '@/components/layout/ToolShell';
import { FileDropzone } from '@/components/pdf/FileDropzone';
import { ProcessButton } from '@/components/pdf/ProcessButton';
import { ProgressOverlay } from '@/components/pdf/ProgressOverlay';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useIngestedPdfs } from '@/hooks/useIngestedPdfs';
import { downloadBlob } from '@/lib/files/download';
import { formatBytes } from '@/lib/utils/formatBytes';
import { cn } from '@/lib/utils/cn';
import { ApiKeyPrompt } from '../_ai/ApiKeyPrompt';
import {
  useApiKeyStore,
  type SummarizeProvider,
} from '../_ai/useApiKeyStore';
import {
  summarizeProcessor,
  type SummarizeLanguage,
  type SummarizeLength,
} from './summarizeProcessor';

const I18N = 'tools.summarize';

function stripPdfExt(name: string): string {
  return name.replace(/\.pdf$/i, '');
}

export function SummarizePage() {
  const { t } = useTranslation();
  const apiKey = useApiKeyStore((s) => s.anthropicKey);
  const model = useApiKeyStore((s) => s.model);
  const provider = useApiKeyStore((s) => s.summarizeProvider);
  const setProvider = useApiKeyStore((s) => s.setSummarizeProvider);
  const { files, addFiles, clear, isIngesting, error } = useIngestedPdfs();

  const [language, setLanguage] = useState<SummarizeLanguage>('auto');
  const [length, setLength] = useState<SummarizeLength>('medium');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [note, setNote] = useState('');
  const [summary, setSummary] = useState<string>('');
  const [runError, setRunError] = useState<string | null>(null);

  const file = files[0];
  const needsKey = provider === 'anthropic' && apiKey.length === 0;
  const canRun = !!file && !busy && !isIngesting && !needsKey;

  const handleRun = useCallback(async () => {
    if (!file) return;
    setBusy(true);
    setSummary('');
    setRunError(null);
    setProgress(0);
    setNote('');
    try {
      const res = await summarizeProcessor(
        {
          file,
          provider,
          apiKey: provider === 'anthropic' ? apiKey : undefined,
          model: provider === 'anthropic' ? model : undefined,
          language,
          length,
        },
        (f, n) => {
          setProgress(f);
          if (n) setNote(n);
        },
      );
      setSummary(res.summary);
    } catch (e) {
      const message = (e as Error).message;
      setRunError(message);
    } finally {
      setBusy(false);
    }
  }, [file, provider, apiKey, model, language, length]);

  const handleDownload = useCallback(() => {
    if (!summary || !file) return;
    const blob = new Blob([summary], { type: 'text/plain;charset=utf-8' });
    void downloadBlob(blob, `${stripPdfExt(file.name)}.summary.txt`);
  }, [summary, file]);

  const languageOptions: { value: SummarizeLanguage; label: string }[] = [
    { value: 'en', label: t('tools.ocr.langEng') },
    { value: 'bg', label: t('tools.ocr.langBul') },
    { value: 'auto', label: t(`${I18N}.langAuto`) },
  ];

  const lengthOptions: { value: SummarizeLength; label: string }[] = [
    { value: 'short', label: t(`${I18N}.lengthShort`) },
    { value: 'medium', label: t(`${I18N}.lengthMedium`) },
    { value: 'detailed', label: t(`${I18N}.lengthDetailed`) },
  ];

  const providerOptions: {
    value: SummarizeProvider;
    label: string;
    hint: string;
  }[] = [
    {
      value: 'local',
      label: t(`${I18N}.providerLocal`),
      hint: t(`${I18N}.providerLocalHint`),
    },
    {
      value: 'anthropic',
      label: t(`${I18N}.providerAnthropic`),
      hint: t(`${I18N}.providerAnthropicHint`),
    },
  ];

  const providerToggle = (
    <div className="flex flex-col gap-2">
      <span className="text-xs font-medium text-ink-muted">
        {t(`${I18N}.providerLabel`)}
      </span>
      <div
        role="radiogroup"
        className="flex flex-col gap-1 rounded-card border border-black/5 bg-white p-1"
      >
        {providerOptions.map((opt) => (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={provider === opt.value}
            onClick={() => setProvider(opt.value)}
            className={cn(
              'flex flex-col gap-0.5 rounded-button px-3 py-2 text-left text-sm transition-colors',
              provider === opt.value
                ? 'bg-brand-500 text-white'
                : 'text-ink hover:bg-surface-muted',
            )}
          >
            <span className="font-medium">{opt.label}</span>
            <span
              className={cn(
                'text-xs',
                provider === opt.value ? 'text-white/80' : 'text-ink-muted',
              )}
            >
              {opt.hint}
            </span>
          </button>
        ))}
      </div>
    </div>
  );

  const sidebar = (
    <div className="flex flex-col gap-4">
      {providerToggle}

      <div className="flex flex-col gap-2">
        <span className="text-xs font-medium text-ink-muted">
          {t(`${I18N}.langLabel`)}
        </span>
        <div
          role="radiogroup"
          className="flex flex-col gap-1 rounded-card border border-black/5 bg-white p-1"
        >
          {languageOptions.map((opt) => (
            <button
              key={opt.value}
              type="button"
              role="radio"
              aria-checked={language === opt.value}
              onClick={() => setLanguage(opt.value)}
              className={cn(
                'rounded-button px-3 py-2 text-left text-sm transition-colors',
                language === opt.value
                  ? 'bg-brand-500 text-white'
                  : 'text-ink hover:bg-surface-muted',
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-xs font-medium text-ink-muted">
          {t(`${I18N}.lengthLabel`)}
        </span>
        <div
          role="radiogroup"
          className="flex flex-col gap-1 rounded-card border border-black/5 bg-white p-1"
        >
          {lengthOptions.map((opt) => (
            <button
              key={opt.value}
              type="button"
              role="radio"
              aria-checked={length === opt.value}
              onClick={() => setLength(opt.value)}
              className={cn(
                'rounded-button px-3 py-2 text-left text-sm transition-colors',
                length === opt.value
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
        label={t(`${I18N}.cta`)}
        onClick={handleRun}
        disabled={!canRun}
        loading={busy}
      />
      {summary && !busy && (
        <div className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900">
          {t(`${I18N}.success`)}
        </div>
      )}
      {runError && (
        <div className="text-sm text-red-600">
          {t(`${I18N}.failed`, { message: runError })}
        </div>
      )}
      {error && <div className="text-sm text-red-600">{error}</div>}
      {provider === 'anthropic' && (
        <p className="text-xs text-ink-muted">{t(`${I18N}.apiKeyNote`)}</p>
      )}
    </div>
  );

  return (
    <ToolShell
      title={t(`${I18N}.name`)}
      tagline={t(`${I18N}.description`)}
      onStartOver={file ? clear : undefined}
      sidebar={sidebar}
    >
      {needsKey ? (
        <ApiKeyPrompt i18nKey={I18N} />
      ) : !file ? (
        <FileDropzone
          onFiles={addFiles}
          multiple={false}
          isIngesting={isIngesting}
        />
      ) : (
        <div className="flex flex-col gap-4">
          <Card>
            <CardContent className="p-6">
              <p
                className="truncate text-base font-medium text-ink"
                title={file.name}
              >
                {file.name}
              </p>
              <p className="mt-1 text-sm text-ink-muted">
                {file.pageCount} {t('common.pages')} ·{' '}
                {formatBytes(file.size)}
              </p>
            </CardContent>
          </Card>

          {summary && (
            <Card>
              <CardContent className="flex flex-col gap-3 p-6">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-sm font-semibold text-ink">
                    {t(`${I18N}.name`)}
                  </h2>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={handleDownload}
                  >
                    <Download className="h-4 w-4" />
                    {t(`${I18N}.downloadTxt`)}
                  </Button>
                </div>
                <div className="max-h-[60vh] overflow-auto whitespace-pre-wrap rounded-card border border-black/5 bg-surface-muted p-4 text-sm leading-relaxed text-ink">
                  {summary}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}
      <ProgressOverlay
        open={busy}
        label={note || t(`${I18N}.progress`)}
        fraction={progress}
      />
    </ToolShell>
  );
}

export default SummarizePage;
