import type { IngestedPdf } from '@/types/tool';
import { callClaude } from '../_ai/callClaude';
import { callGoogleTranslate } from '../_ai/callGoogleTranslate';

interface PdfTextItem {
  str: string;
  transform: number[];
  hasEOL: boolean;
}

function isTextItem(x: unknown): x is PdfTextItem {
  if (typeof x !== 'object' || x === null) return false;
  const o = x as { str?: unknown; transform?: unknown };
  return typeof o.str === 'string' && Array.isArray(o.transform);
}

const MAX_SOURCE_CHARS = 50_000;

export type TranslateProvider = 'anthropic' | 'google' | 'mymemory';

export interface LanguageOption {
  /** ISO 639-1 code, used by Google. */
  code: string;
  /** Human-readable English name, used by Claude and as the UI label. */
  name: string;
}

export const LANGUAGE_OPTIONS: LanguageOption[] = [
  { code: 'en', name: 'English' },
  { code: 'bg', name: 'Bulgarian' },
  { code: 'de', name: 'German' },
  { code: 'fr', name: 'French' },
  { code: 'es', name: 'Spanish' },
  { code: 'it', name: 'Italian' },
  { code: 'ru', name: 'Russian' },
  { code: 'zh', name: 'Chinese' },
  { code: 'ja', name: 'Japanese' },
  { code: 'ar', name: 'Arabic' },
  { code: 'tr', name: 'Turkish' },
  { code: 'pl', name: 'Polish' },
  { code: 'nl', name: 'Dutch' },
  { code: 'pt', name: 'Portuguese' },
  { code: 'ro', name: 'Romanian' },
  { code: 'el', name: 'Greek' },
];

export interface TranslateOptions {
  file: IngestedPdf;
  provider: TranslateProvider;
  anthropicKey?: string;
  googleKey?: string;
  /** Anthropic model id. Required when provider === 'anthropic'. */
  model?: string;
  /**
   * For anthropic: human-readable name, e.g. `"Bulgarian"`.
   * For google: ISO 639-1 code, e.g. `"bg"`.
   */
  targetLanguage: string;
  /** Optional ISO 639-1 source code for google. */
  sourceLanguage?: string;
}

export interface TranslateResult {
  original: string;
  translated: string;
  sourceCharCount: number;
  truncated: boolean;
}

async function extractPdfText(
  file: IngestedPdf,
  onProgress?: (fraction: number, note?: string) => void,
  signal?: AbortSignal,
): Promise<string> {
  const chunks: string[] = [];
  for (let i = 1; i <= file.pageCount; i++) {
    if (signal?.aborted) throw new Error('aborted');
    const page = await file.pdfjsDoc.getPage(i);
    const content = await page.getTextContent();
    const items: PdfTextItem[] = [];
    for (const it of content.items) {
      if (isTextItem(it)) items.push(it);
    }
    let pageText = '';
    for (const it of items) {
      pageText += it.str;
      if (it.hasEOL) pageText += '\n';
      else if (!it.str.endsWith(' ')) pageText += ' ';
    }
    chunks.push(pageText.trim());
    onProgress?.((i / file.pageCount) * 0.4, `Reading page ${i}/${file.pageCount}`);
  }
  return chunks.join('\n\n').replace(/[ \t]+\n/g, '\n').trim();
}

export async function translateProcessor(
  options: TranslateOptions,
  onProgress?: (fraction: number, note?: string) => void,
  signal?: AbortSignal,
): Promise<TranslateResult> {
  const rawText = await extractPdfText(options.file, onProgress, signal);
  const truncated = rawText.length > MAX_SOURCE_CHARS;
  const text = truncated ? rawText.slice(0, MAX_SOURCE_CHARS) : rawText;

  if (text.trim().length === 0) {
    throw new Error(
      'No selectable text found in this PDF. Try OCR first, then translate.',
    );
  }

  let translated: string;

  if (options.provider === 'google') {
    if (!options.googleKey) {
      throw new Error('Google Cloud API key is required for the Google provider.');
    }
    onProgress?.(0.5, 'Sending to Google Translate…');
    translated = await callGoogleTranslate(
      {
        apiKey: options.googleKey,
        text,
        targetLanguage: options.targetLanguage,
        sourceLanguage: options.sourceLanguage,
        signal,
      },
      (fraction) => {
        // Map Google's 0..1 chunk progress into the 0.5..1.0 band.
        onProgress?.(0.5 + fraction * 0.5, 'Translating…');
      },
    );
  } else if (options.provider === 'mymemory') {
    onProgress?.(0.5, 'Sending to MyMemory…');
    const { callMyMemory } = await import('@/features/_ai/callMyMemory');
    translated = await callMyMemory(
      {
        text,
        targetLanguage: options.targetLanguage,
        sourceLanguage: options.sourceLanguage,
        signal,
      },
      (f) => onProgress?.(0.5 + f * 0.5, 'Translating…'),
    );
  } else {
    if (!options.anthropicKey) {
      throw new Error('Anthropic API key is required for the Claude provider.');
    }
    if (!options.model) {
      throw new Error('Model is required for the Claude provider.');
    }
    onProgress?.(0.5, 'Sending to Claude…');

    const system =
      `Translate the following text to ${options.targetLanguage}. ` +
      'Preserve paragraph breaks and formatting cues. ' +
      'Only return the translation, no commentary.';

    const prompt = truncated
      ? `Source text (truncated to ${MAX_SOURCE_CHARS.toLocaleString()} characters):\n\n${text}`
      : text;

    translated = await callClaude({
      apiKey: options.anthropicKey,
      model: options.model,
      system,
      prompt,
      maxTokens: 8192,
      signal,
    });
  }

  onProgress?.(1, 'Done');
  return {
    original: text,
    translated: translated.trim(),
    sourceCharCount: rawText.length,
    truncated,
  };
}
