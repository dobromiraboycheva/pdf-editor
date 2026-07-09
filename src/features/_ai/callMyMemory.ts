export interface MyMemoryOptions {
  text: string;
  targetLanguage: string; // ISO 639-1 code
  sourceLanguage?: string; // ISO 639-1 code; if omitted, use 'auto' or 'en'
  signal?: AbortSignal;
}

interface MyMemoryResponse {
  responseStatus: number;
  responseData: { translatedText: string; match?: number };
  responseDetails?: string;
}

export async function callMyMemory(
  opts: MyMemoryOptions,
  onProgress?: (fraction: number) => void,
): Promise<string> {
  const source = opts.sourceLanguage || 'en';
  const target = opts.targetLanguage;
  const langpair = `${source}|${target}`;

  // Split text into ~450-char chunks at sentence boundaries.
  const CHUNK_LIMIT = 450;
  const chunks = splitIntoChunks(opts.text, CHUNK_LIMIT);

  const results: string[] = [];
  for (let i = 0; i < chunks.length; i++) {
    if (opts.signal?.aborted) throw new Error('aborted');
    const chunk = chunks[i];
    const url = new URL('https://api.mymemory.translated.net/get');
    url.searchParams.set('q', chunk);
    url.searchParams.set('langpair', langpair);
    // Adding an email boosts the daily quota to ~50k words. Optional.
    // url.searchParams.set('de', 'user@example.com');

    const response = await fetch(url.toString(), { signal: opts.signal });
    if (!response.ok) {
      throw new Error(
        `MyMemory API ${response.status}: ${response.statusText}`,
      );
    }
    const data = (await response.json()) as MyMemoryResponse;
    if (data.responseStatus !== 200) {
      throw new Error(
        data.responseDetails || `MyMemory error ${data.responseStatus}`,
      );
    }
    results.push(data.responseData.translatedText);
    onProgress?.((i + 1) / chunks.length);

    // Small delay to be polite to the free API.
    if (i < chunks.length - 1) {
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  return results.join(' ');
}

function splitIntoChunks(text: string, maxLen: number): string[] {
  const chunks: string[] = [];
  const sentences = text.split(/(?<=[.!?])\s+/);
  let current = '';
  for (const s of sentences) {
    if (s.length > maxLen) {
      // Split hard on maxLen
      if (current) {
        chunks.push(current);
        current = '';
      }
      for (let i = 0; i < s.length; i += maxLen) {
        chunks.push(s.slice(i, i + maxLen));
      }
      continue;
    }
    if ((current + ' ' + s).length > maxLen) {
      if (current) chunks.push(current);
      current = s;
    } else {
      current = current ? current + ' ' + s : s;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}
