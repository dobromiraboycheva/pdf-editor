/**
 * Local extractive summarizer.
 *
 * Free, keyless, offline. Uses TextRank-lite scoring:
 *   - normalized word-frequency (stopword-filtered)
 *   - position bonus for the first few sentences
 *   - length penalty for very short or very long sentences
 *
 * Language: English + Bulgarian stopword lists, auto-detected via the ratio
 * of Cyrillic to Latin characters in the input.
 */

export type LocalSummarizeLanguage = 'en' | 'bg' | 'auto';
export type LocalSummarizeLength = 'short' | 'medium' | 'detailed';

export interface LocalSummarizeOptions {
  text: string;
  language: LocalSummarizeLanguage;
  length: LocalSummarizeLength;
}

const STOPWORDS_EN: ReadonlySet<string> = new Set([
  'a', 'about', 'above', 'after', 'again', 'against', 'all', 'am', 'an', 'and',
  'any', 'are', 'as', 'at', 'be', 'because', 'been', 'before', 'being', 'below',
  'between', 'both', 'but', 'by', 'can', 'could', 'did', 'do', 'does', 'doing',
  'down', 'during', 'each', 'few', 'for', 'from', 'further', 'had', 'has',
  'have', 'having', 'he', 'her', 'here', 'hers', 'herself', 'him', 'himself',
  'his', 'how', 'i', 'if', 'in', 'into', 'is', 'it', 'its', 'itself', 'just',
  'me', 'more', 'most', 'my', 'myself', 'no', 'nor', 'not', 'now', 'of', 'off',
  'on', 'once', 'only', 'or', 'other', 'our', 'ours', 'ourselves', 'out',
  'over', 'own', 'same', 'she', 'should', 'so', 'some', 'such', 'than', 'that',
  'the', 'their', 'theirs', 'them', 'themselves', 'then', 'there', 'these',
  'they', 'this', 'those', 'through', 'to', 'too', 'under', 'until', 'up',
  'very', 'was', 'we', 'were', 'what', 'when', 'where', 'which', 'while',
  'who', 'whom', 'why', 'will', 'with', 'would', 'you', 'your', 'yours',
  'yourself', 'yourselves',
]);

const STOPWORDS_BG: ReadonlySet<string> = new Set([
  'а', 'ако', 'аз', 'ами', 'без', 'би', 'бил', 'била', 'били', 'било', 'близо',
  'бъдат', 'бъде', 'бяха', 'в', 'вас', 'ваш', 'ваша', 'вече', 'взема', 'ви',
  'вие', 'винаги', 'все', 'всеки', 'всички', 'всичко', 'всяка', 'във', 'въпреки',
  'върху', 'г', 'ги', 'главно', 'го', 'да', 'дали', 'до', 'докато', 'докога',
  'дори', 'досега', 'доста', 'е', 'едва', 'един', 'ето', 'за', 'зад', 'заедно',
  'заради', 'засега', 'затова', 'защо', 'защото', 'и', 'из', 'или', 'им', 'има',
  'имат', 'иска', 'й', 'каза', 'как', 'каква', 'какво', 'както', 'какъв', 'като',
  'кога', 'когато', 'което', 'които', 'кой', 'който', 'колко', 'която', 'къде',
  'където', 'към', 'ли', 'м', 'ме', 'между', 'мен', 'ми', 'мнозина', 'мога',
  'могат', 'може', 'моля', 'момента', 'му', 'н', 'на', 'над', 'назад', 'най',
  'направи', 'напред', 'например', 'нас', 'не', 'него', 'нея', 'ни', 'ние',
  'никой', 'нито', 'но', 'някои', 'някой', 'няма', 'обаче', 'около', 'освен',
  'особено', 'от', 'отгоре', 'отново', 'още', 'пак', 'по', 'повече', 'повечето',
  'под', 'поне', 'поради', 'после', 'почти', 'прави', 'пред', 'преди', 'през',
  'при', 'пък', 'първо', 'с', 'са', 'само', 'се', 'сега', 'си', 'скоро', 'след',
  'сме', 'според', 'сред', 'срещу', 'сте', 'съм', 'със', 'също', 'т', 'тази',
  'така', 'такива', 'такъв', 'там', 'твой', 'те', 'тези', 'ти', 'то', 'това',
  'този', 'той', 'толкова', 'точно', 'три', 'трябва', 'тук', 'тъй', 'тя', 'тях',
  'у', 'харесва', 'ще', 'щом', 'юмрук', 'я',
]);

function detectLanguage(text: string): 'en' | 'bg' {
  let cyr = 0;
  let lat = 0;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code >= 0x0400 && code <= 0x04ff) cyr++;
    else if ((code >= 0x41 && code <= 0x5a) || (code >= 0x61 && code <= 0x7a))
      lat++;
  }
  return cyr > lat ? 'bg' : 'en';
}

interface SentenceEntry {
  index: number;
  text: string;
  score: number;
}

function splitSentences(text: string): string[] {
  // Split on sentence-ending punctuation followed by whitespace and an
  // uppercase or Cyrillic capital letter. Also split on newline pairs (which
  // usually mark paragraph boundaries in extracted PDF text).
  const cleaned = text.replace(/\r\n?/g, '\n');
  const parts = cleaned
    .split(/(?<=[.!?…])\s+(?=["“(]?[A-ZА-ЯЁ0-9])|\n{2,}/g)
    .map((s) => s.replace(/\s+/g, ' ').trim())
    .filter((s) => s.length > 0);
  return parts;
}

function tokenize(sentence: string): string[] {
  return sentence
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 0);
}

function sentenceLimit(length: LocalSummarizeLength): number {
  if (length === 'short') return 3;
  if (length === 'medium') return 8;
  return 15;
}

export function localSummarize(options: LocalSummarizeOptions): string {
  const text = options.text.trim();
  if (text.length === 0) return '';

  const lang: 'en' | 'bg' =
    options.language === 'auto' ? detectLanguage(text) : options.language;
  const stopwords = lang === 'bg' ? STOPWORDS_BG : STOPWORDS_EN;

  const sentences = splitSentences(text);
  if (sentences.length === 0) return '';

  // Word-frequency map across the whole document (stopword-filtered).
  const freq = new Map<string, number>();
  const perSentenceTokens: string[][] = [];
  for (const s of sentences) {
    const tokens = tokenize(s);
    perSentenceTokens.push(tokens);
    for (const tok of tokens) {
      if (stopwords.has(tok)) continue;
      if (tok.length < 2) continue;
      freq.set(tok, (freq.get(tok) ?? 0) + 1);
    }
  }

  let maxFreq = 0;
  for (const v of freq.values()) if (v > maxFreq) maxFreq = v;
  if (maxFreq === 0) {
    // Degenerate: no content words. Just return the first N sentences.
    return sentences.slice(0, sentenceLimit(options.length)).join(' ');
  }

  // Score each sentence.
  const entries: SentenceEntry[] = sentences.map((s, index) => {
    const tokens = perSentenceTokens[index];
    if (tokens.length === 0) return { index, text: s, score: 0 };

    let sum = 0;
    for (const tok of tokens) {
      if (stopwords.has(tok)) continue;
      if (tok.length < 2) continue;
      sum += (freq.get(tok) ?? 0) / maxFreq;
    }
    let score = sum / Math.sqrt(tokens.length);

    // Position bonus for the first 3 sentences (intro is usually key).
    if (index < 3) score *= 1.3;

    // Length penalty.
    if (tokens.length < 5) score *= 0.6;
    else if (tokens.length > 60) score *= 0.7;

    return { index, text: s, score };
  });

  const limit = Math.min(sentenceLimit(options.length), entries.length);
  const picked = [...entries]
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .sort((a, b) => a.index - b.index);

  return picked.map((p) => p.text).join(' ');
}
