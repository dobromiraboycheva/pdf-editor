import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { KeyRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useApiKeyStore } from './useApiKeyStore';

export interface GoogleKeyPromptProps {
  /** i18n root, e.g. `tools.translate`. */
  i18nKey: string;
}

function maskKey(key: string): string {
  if (key.length <= 8) return '••••';
  return `${key.slice(0, 6)}…${key.slice(-4)}`;
}

export function GoogleKeyPrompt({ i18nKey }: GoogleKeyPromptProps) {
  const { t } = useTranslation();
  const savedKey = useApiKeyStore((s) => s.googleKey);
  const setGoogleKey = useApiKeyStore((s) => s.setGoogleKey);

  const [draft, setDraft] = useState<string>('');

  const handleSave = (): void => {
    if (draft.trim().length === 0) return;
    setGoogleKey(draft.trim());
    setDraft('');
  };

  const handleClear = (): void => {
    setGoogleKey('');
    setDraft('');
  };

  return (
    <Card className="mx-auto w-full max-w-lg">
      <CardContent className="flex flex-col gap-4 p-6">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-sky-50 text-sky-600">
            <KeyRound className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-ink">
              {t(`${i18nKey}.googleKeyTitle`)}
            </h2>
            <p className="text-xs text-ink-muted">
              {t(`${i18nKey}.googleKeyNote`)}
            </p>
          </div>
        </div>

        {savedKey ? (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
            <p className="font-medium">{t(`${i18nKey}.keySaved`)}</p>
            <p className="mt-1 font-mono text-xs">{maskKey(savedKey)}</p>
          </div>
        ) : null}

        <div className="flex flex-col gap-1">
          <label
            htmlFor="google-key-input"
            className="text-xs font-medium text-ink-muted"
          >
            {t(`${i18nKey}.apiKeyLabel`)}
          </label>
          <input
            id="google-key-input"
            type="password"
            autoComplete="off"
            spellCheck={false}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="AIza…"
            className="h-10 rounded-button border border-black/10 bg-white px-3 font-mono text-sm text-ink focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            onClick={handleSave}
            disabled={draft.trim().length === 0}
          >
            {t(`${i18nKey}.saveKey`)}
          </Button>
          {savedKey ? (
            <Button type="button" variant="secondary" onClick={handleClear}>
              {t(`${i18nKey}.clearKey`)}
            </Button>
          ) : null}
          <a
            href="https://console.cloud.google.com/apis/library/translate.googleapis.com"
            target="_blank"
            rel="noopener noreferrer"
            className="ml-auto text-xs font-medium text-brand-600 hover:text-brand-700 hover:underline"
          >
            {t(`${i18nKey}.googleGetKey`)}
          </a>
        </div>
      </CardContent>
    </Card>
  );
}

export default GoogleKeyPrompt;
