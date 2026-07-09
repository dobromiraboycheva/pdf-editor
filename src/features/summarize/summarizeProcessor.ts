import type { IngestedPdf } from '@/types/tool';
import { callClaude } from '../_ai/callClaude';
import { localSummarize } from '../_ai/localSummarize';

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

/** Rough soft cap for the source text we send to Claude. */
const MAX_SOURCE_CHARS = 50_000;

export type SummarizeLanguage = 'en' | 'bg' | 'auto';
export type SummarizeLength = 'short' | 'medium' | 'detailed';
export type SummarizeProvider = 'local' | 'anthropic';

export interface SummarizeOptions {
  file: IngestedPdf;
  provider: SummarizeProvider;
  apiKey?: string;
  model?: string;
  language: SummarizeLanguage;
  length: SummarizeLength;
}

export interface SummarizeResult {
  summary: string;
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
    // Preserve reading order: pdf.js emits items top-down for text layers.
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

function languageLabel(lang: SummarizeLanguage): string {
  if (lang === 'en') return 'English';
  if (lang === 'bg') return 'Bulgarian';
  return 'the same language as the source document';
}

function lengthLabel(length: SummarizeLength): string {
  if (length === 'short') return 'a short summary (3-5 sentences, tight)';
  if (length === 'medium') return 'a medium-length summary (2-4 paragraphs)';
  return 'a detailed summary with bullet points covering all key sections';
}

export async function summarizeProcessor(
  options: SummarizeOptions,
  onProgress?: (fraction: number, note?: string) => void,
  signal?: AbortSignal,
): Promise<SummarizeResult> {
  const rawText = await extractPdfText(options.file, onProgress, signal);
  const truncated = rawText.length > MAX_SOURCE_CHARS;
  const text = truncated ? rawText.slice(0, MAX_SOURCE_CHARS) : rawText;

  if (text.trim().length === 0) {
    throw new Error(
      'No selectable text found in this PDF. Try OCR first, then summarize.',
    );
  }

  if (options.provider === 'local') {
    onProgress?.(0.6, 'Summarizing…');
    const summary = localSummarize({
      text,
      language: options.language,
      length: options.length,
    });
    onProgress?.(1, 'Done');
    return {
      summary: summary.trim(),
      sourceCharCount: rawText.length,
      truncated,
    };
  }

  if (!options.apiKey || !options.model) {
    throw new Error('Anthropic API key and model are required.');
  }

  onProgress?.(0.5, 'Sending to Claude…');

  const system =
    'You are a helpful assistant that summarizes PDF documents. ' +
    `Respond in ${languageLabel(options.language)}. ` +
    `Produce ${lengthLabel(options.length)}. ` +
    'Return only the summary, no preamble or meta-commentary.';

  const prompt = truncated
    ? `The following is the beginning of a PDF (truncated to ${MAX_SOURCE_CHARS.toLocaleString()} characters). Summarize it:\n\n${text}`
    : `Summarize the following PDF content:\n\n${text}`;

  const summary = await callClaude({
    apiKey: options.apiKey,
    model: options.model,
    system,
    prompt,
    maxTokens: options.length === 'detailed' ? 4096 : 2048,
    signal,
  });

  onProgress?.(1, 'Done');
  return {
    summary: summary.trim(),
    sourceCharCount: rawText.length,
    truncated,
  };
}
