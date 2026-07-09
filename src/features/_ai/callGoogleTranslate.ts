/**
 * Direct-to-Google Cloud Translation API v2 client for browser use.
 * Requires the user's own API key. Splits large payloads into chunks so
 * we stay under Google's per-request body-size limit.
 */

export interface GoogleTranslateOptions {
  apiKey: string;
  text: string;
  /** ISO 639-1 target language code (e.g. 'bg', 'en', 'de'). */
  targetLanguage: string;
  /** Optional source code. Google auto-detects when omitted. */
  sourceLanguage?: string;
  signal?: AbortSignal;
}

interface GoogleTranslateResponse {
  data: {
    translations: { translatedText: string }[];
  };
}

/** Chunking thresholds — Google's API caps at ~30KB per request. */
const CHUNK_TRIGGER = 25_000;
const CHUNK_TARGET = 20_000;

function splitIntoChunks(text: string, maxSize: number): string[] {
  if (text.length <= maxSize) return [text];

  const paragraphs = text.split('\n\n');
  const chunks: string[] = [];
  let current = '';

  for (const para of paragraphs) {
    // A single paragraph is too large — split it on single newlines as a fallback.
    if (para.length > maxSize) {
      if (current.length > 0) {
        chunks.push(current);
        current = '';
      }
      const lines = para.split('\n');
      let buf = '';
      for (const line of lines) {
        if (line.length > maxSize) {
          // Extremely long line — slice hard.
          if (buf.length > 0) {
            chunks.push(buf);
            buf = '';
          }
          for (let i = 0; i < line.length; i += maxSize) {
            chunks.push(line.slice(i, i + maxSize));
          }
          continue;
        }
        const next = buf.length === 0 ? line : `${buf}\n${line}`;
        if (next.length > maxSize) {
          chunks.push(buf);
          buf = line;
        } else {
          buf = next;
        }
      }
      if (buf.length > 0) chunks.push(buf);
      continue;
    }

    const separator = current.length === 0 ? '' : '\n\n';
    const next = current + separator + para;
    if (next.length > maxSize) {
      chunks.push(current);
      current = para;
    } else {
      current = next;
    }
  }
  if (current.length > 0) chunks.push(current);
  return chunks;
}

async function translateOne(
  opts: GoogleTranslateOptions,
  text: string,
): Promise<string> {
  const url = new URL('https://translation.googleapis.com/language/translate/v2');
  url.searchParams.set('key', opts.apiKey);
  const body: Record<string, string> = {
    q: text,
    target: opts.targetLanguage,
    format: 'text',
  };
  if (opts.sourceLanguage) body.source = opts.sourceLanguage;

  const response = await fetch(url.toString(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: opts.signal,
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    throw new Error(
      `Google Translate API ${response.status}: ${errText || response.statusText}`,
    );
  }
  const data = (await response.json()) as GoogleTranslateResponse;
  return data.data.translations.map((t) => t.translatedText).join('\n');
}

export async function callGoogleTranslate(
  opts: GoogleTranslateOptions,
  onProgress?: (fraction: number) => void,
): Promise<string> {
  if (opts.text.length <= CHUNK_TRIGGER) {
    const out = await translateOne(opts, opts.text);
    onProgress?.(1);
    return out;
  }

  const chunks = splitIntoChunks(opts.text, CHUNK_TARGET);
  const results: string[] = [];
  for (let i = 0; i < chunks.length; i++) {
    const translated = await translateOne(opts, chunks[i]);
    results.push(translated);
    onProgress?.((i + 1) / chunks.length);
  }
  return results.join('\n\n');
}
