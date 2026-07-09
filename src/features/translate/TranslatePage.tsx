import { useCallback, useMemo, useState } from 'react';
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
import { ApiKeyPrompt } from '../_ai/ApiKeyPrompt';
import { GoogleKeyPrompt } from '../_ai/GoogleKeyPrompt';
import { useApiKeyStore } from '../_ai/useApiKeyStore';
import {
  LANGUAGE_OPTIONS,
  translateProcessor,
  type TranslateProvider,
} from './translateProcessor';

const I18N = 'tools.translate';

function stripPdfExt(name: string): string {
  return name.replace(/\.pdf$/i, '');
}

export function TranslatePage() {
  const { t } = useTranslation();
  const anthropicKey = useApiKeyStore((s) => s.anthropicKey);
  const googleKey = useApiKeyStore((s) => s.googleKey);
  const model = useApiKeyStore((s) => s.model);
  const { files, addFiles, clear, isIngesting, error } = useIngestedPdfs();

  const [provider, setProvider] = useState<TranslateProvider>('mymemory');
  const [targetCode, setTargetCode] = useState<string>(
    LANGUAGE_OPTIONS[0].code,
  );
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [note, setNote] = useState('');
  const [result, setResult] = useState<{
    original: string;
    translated: string;
  } | null>(null);
  const [runError, setRunError] = useState<string | null>(null);

  const targetOption = useMemo(
    () =>
      LANGUAGE_OPTIONS.find((o) => o.code === targetCode) ??
      LANGUAGE_OPTIONS[0],
    [targetCode],
  );

  const file = files[0];
  const activeKey = provider === 'anthropic' ? anthropicKey : googleKey;
  const hasKey = provider === 'mymemory' ? true : activeKey.length > 0;
  const canRun = !!file && !busy && !isIngesting && hasKey;

  const handleRun = useCallback(async () => {
    if (!file) return;
    setBusy(true);
    setResult(null);
    setRunError(null);
    setProgress(0);
    setNote('');
    try {
      const res = await translateProcessor(
        provider === 'anthropic'
          ? {
              file,
              provider: 'anthropic',
              anthropicKey,
              model,
              targetLanguage: targetOption.name,
            }
          : provider === 'google'
            ? {
                file,
                provider: 'google',
                googleKey,
                targetLanguage: targetOption.code,
              }
            : {
                file,
                provider: 'mymemory',
                targetLanguage: targetOption.code,
                sourceLanguage: 'auto',
              },
        (f, n) => {
          setProgress(f);
          if (n) setNote(n);
        },
      );
      setResult({ original: res.original, translated: res.translated });
    } catch (e) {
      setRunError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }, [file, provider, anthropicKey, googleKey, model, targetOption]);

  const handleDownload = useCallback(() => {
    if (!result || !file) return;
    const blob = new Blob([result.translated], {
      type: 'text/plain;charset=utf-8',
    });
    void downloadBlob(
      blob,
      `${stripPdfExt(file.name)}.${targetOption.code}.txt`,
    );
  }, [result, file, targetOption]);

  const providerToggle = (
    <div className="flex flex-col gap-2">
      <span className="text-xs font-medium text-ink-muted">
        {t(`${I18N}.providerLabel`)}
      </span>
      <div className="inline-flex rounded-button border border-black/10 bg-white p-0.5 text-xs font-medium">
        <button
          type="button"
          onClick={() => setProvider('mymemory')}
          className={`flex-1 rounded-[calc(theme(borderRadius.button)-2px)] px-3 py-2 transition ${
            provider === 'mymemory'
              ? 'bg-brand-500 text-white shadow-sm'
              : 'text-ink-muted hover:text-ink'
          }`}
        >
          {t(`${I18N}.providerFree`)}
        </button>
        <button
          type="button"
          onClick={() => setProvider('google')}
          className={`flex-1 rounded-[calc(theme(borderRadius.button)-2px)] px-3 py-2 transition ${
            provider === 'google'
              ? 'bg-brand-500 text-white shadow-sm'
              : 'text-ink-muted hover:text-ink'
          }`}
        >
          {t(`${I18N}.providerGoogle`)}
        </button>
        <button
          type="button"
          onClick={() => setProvider('anthropic')}
          className={`flex-1 rounded-[calc(theme(borderRadius.button)-2px)] px-3 py-2 transition ${
            provider === 'anthropic'
              ? 'bg-brand-500 text-white shadow-sm'
              : 'text-ink-muted hover:text-ink'
          }`}
        >
          {t(`${I18N}.providerAnthropic`)}
        </button>
      </div>
    </div>
  );

  const sidebar = hasKey ? (
    <div className="flex flex-col gap-4">
      {providerToggle}

      <div className="flex flex-col gap-2">
        <label
          htmlFor="translate-target"
          className="text-xs font-medium text-ink-muted"
        >
          {t(`${I18N}.targetLabel`)}
        </label>
        <select
          id="translate-target"
          value={targetCode}
          onChange={(e) => setTargetCode(e.target.value)}
          className="h-10 rounded-button border border-black/10 bg-white px-3 text-sm text-ink focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-500"
        >
          {LANGUAGE_OPTIONS.map((lang) => (
            <option key={lang.code} value={lang.code}>
              {lang.name}
            </option>
          ))}
        </select>
      </div>

      <ProcessButton
        label={t(`${I18N}.cta`)}
        onClick={handleRun}
        disabled={!canRun}
        loading={busy}
      />
      {result && !busy && (
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
      <p className="text-xs text-ink-muted">
        {provider === 'anthropic'
          ? t(`${I18N}.apiKeyNote`)
          : provider === 'google'
            ? t(`${I18N}.googleKeyNote`)
            : t(`${I18N}.providerFreeHint`)}
      </p>
    </div>
  ) : (
    <div className="flex flex-col gap-4">
      {providerToggle}
      <div className="text-xs text-ink-muted">
        {provider === 'anthropic'
          ? t(`${I18N}.apiKeyNote`)
          : provider === 'google'
            ? t(`${I18N}.googleKeyNote`)
            : t(`${I18N}.providerFreeHint`)}
      </div>
    </div>
  );

  return (
    <ToolShell
      title={t(`${I18N}.name`)}
      tagline={t(`${I18N}.description`)}
      onStartOver={file ? clear : undefined}
      sidebar={sidebar}
    >
      {!hasKey ? (
        provider === 'anthropic' ? (
          <ApiKeyPrompt i18nKey={I18N} />
        ) : (
          <GoogleKeyPrompt i18nKey={I18N} />
        )
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

          {result && (
            <Card>
              <CardContent className="flex flex-col gap-3 p-6">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-sm font-semibold text-ink">
                    {t(`${I18N}.name`)} → {targetOption.name}
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
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <div className="flex min-w-0 flex-col gap-1">
                    <span className="text-xs font-medium text-ink-muted">
                      Source
                    </span>
                    <div className="max-h-[60vh] overflow-auto whitespace-pre-wrap rounded-card border border-black/5 bg-surface-muted p-4 text-sm leading-relaxed text-ink">
                      {result.original}
                    </div>
                  </div>
                  <div className="flex min-w-0 flex-col gap-1">
                    <span className="text-xs font-medium text-ink-muted">
                      {targetOption.name}
                    </span>
                    <div className="max-h-[60vh] overflow-auto whitespace-pre-wrap rounded-card border border-black/5 bg-surface-muted p-4 text-sm leading-relaxed text-ink">
                      {result.translated}
                    </div>
                  </div>
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

export default TranslatePage;
