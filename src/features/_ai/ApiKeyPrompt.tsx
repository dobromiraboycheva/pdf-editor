import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { KeyRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useApiKeyStore, type ClaudeModel } from './useApiKeyStore';

export interface ApiKeyPromptProps {
  /** i18n root, e.g. `tools.summarize` or `tools.translate`. */
  i18nKey: string;
}

function maskKey(key: string): string {
  if (key.length <= 8) return '••••';
  return `${key.slice(0, 6)}…${key.slice(-4)}`;
}

export function ApiKeyPrompt({ i18nKey }: ApiKeyPromptProps) {
  const { t } = useTranslation();
  const savedKey = useApiKeyStore((s) => s.anthropicKey);
  const model = useApiKeyStore((s) => s.model);
  const setKey = useApiKeyStore((s) => s.setKey);
  const setModel = useApiKeyStore((s) => s.setModel);
  const clear = useApiKeyStore((s) => s.clear);

  const [draft, setDraft] = useState<string>('');

  const modelOptions: { value: ClaudeModel; label: string }[] = [
    { value: 'claude-haiku-4-5-20251001', label: 'Haiku (fast)' },
    { value: 'claude-sonnet-5', label: 'Sonnet (balanced)' },
  ];

  const handleSave = (): void => {
    if (draft.trim().length === 0) return;
    setKey(draft.trim());
    setDraft('');
  };

  return (
    <Card className="mx-auto w-full max-w-lg">
      <CardContent className="flex flex-col gap-4 p-6">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-violet-50 text-violet-600">
            <KeyRound className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-ink">
              {t(`${i18nKey}.apiKeyTitle`)}
            </h2>
            <p className="text-xs text-ink-muted">
              {t(`${i18nKey}.apiKeyNote`)}
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
            htmlFor="anthropic-key-input"
            className="text-xs font-medium text-ink-muted"
          >
            {t(`${i18nKey}.apiKeyLabel`)}
          </label>
          <input
            id="anthropic-key-input"
            type="password"
            autoComplete="off"
            spellCheck={false}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="sk-ant-…"
            className="h-10 rounded-button border border-black/10 bg-white px-3 font-mono text-sm text-ink focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label
            htmlFor="anthropic-model-select"
            className="text-xs font-medium text-ink-muted"
          >
            {t(`${i18nKey}.modelLabel`)}
          </label>
          <select
            id="anthropic-model-select"
            value={model}
            onChange={(e) => setModel(e.target.value as ClaudeModel)}
            className="h-10 rounded-button border border-black/10 bg-white px-3 text-sm text-ink focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-500"
          >
            {modelOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
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
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                clear();
                setDraft('');
              }}
            >
              {t(`${i18nKey}.clearKey`)}
            </Button>
          ) : null}
          <a
            href="https://console.anthropic.com/settings/keys"
            target="_blank"
            rel="noopener noreferrer"
            className="ml-auto text-xs font-medium text-brand-600 hover:text-brand-700 hover:underline"
          >
            {t(`${i18nKey}.getKeyLink`)}
          </a>
        </div>
      </CardContent>
    </Card>
  );
}

export default ApiKeyPrompt;
