import { getSpeechDuration } from './runtime/companionBehavior';

export const MIN_MS_PER_CHARACTER = 24;
export const HOLD_AFTER_COMPLETE_MS = 1500;
export const MAX_CHUNK_CHARACTERS = 160;
// Only genuinely tiny fragments ("Ok.", "Sure!") merge onto the next bubble;
// normal sentences each get their own bubble.
export const MIN_CHUNK_CHARACTERS = 16;

export function splitCharacters(message: string): string[] {
  return Array.from(message);
}

// The companion "speaks", so raw markdown syntax has no place in a speech
// bubble. Reduce it to plain readable prose: keep the words, drop the markup.
export function stripMarkdown(text: string): string {
  return stripMarkdownLinks(text)
    .replace(/```[a-zA-Z0-9]*\n?/g, '')          // fenced code delimiters (keep inner text)
    .replace(/`([^`]+)`/g, '$1')                  // inline code
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')     // images -> alt text
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')      // links -> link text
    .replace(/<\/?[a-z][^>]*>/gi, '')                // HTML wrappers have no spoken form
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')           // headings
    .replace(/^\s*>+\s?/gm, '')                   // blockquotes
    .replace(/^\s*(?:[-*+]|\d+\.)\s+/gm, '')      // list markers
    .replace(/^\s*(?:[-*_] *){3,}$/gm, '')        // horizontal rules
    .replace(/(\*\*|__)(.*?)\1/g, '$2')           // bold (before italic)
    .replace(/(\*|_)(.*?)\1/g, '$2')              // italic
    .replace(/~~(.*?)~~/g, '$2')                  // strikethrough
    .replace(/[ \t]+/g, ' ')
    .replace(/ ?\n ?/g, '\n')
    .replace(/\n{2,}/g, '\n')
    .trim();
}

// Terms whose trailing "." is not a sentence end. Node.js / 3.14 / file.txt are
// already handled by the "terminator must be followed by whitespace" rule
// (their dot is followed by a letter/digit); this list covers abbreviations
// that DO have a space after them.
const SENTENCE_ABBREVIATIONS = new Set([
  'e.g', 'i.e', 'etc', 'vs', 'mr', 'mrs', 'ms', 'dr', 'prof', 'sr', 'jr', 'st',
  'a.m', 'p.m', 'approx', 'fig', 'inc', 'ltd', 'co', 'cf', 'al', 'u.s', 'ph.d', 'no',
]);

function isAbbreviation(precedingText: string): boolean {
  const token = (precedingText.trim().split(/\s+/).pop() ?? '').toLowerCase();
  const normalized = token.replace(/[^a-z.]/g, '').replace(/\.+$/, '');
  return normalized.length > 0 && SENTENCE_ABBREVIATIONS.has(normalized);
}

// Split into sentences the way a reader would: a Latin terminator (. ! ? ...)
// only ends a sentence when followed by whitespace/end and not part of a term
// or abbreviation, while CJK terminators (。！？…) always end one. Newlines are
// hard breaks. Whole sentences are never cut, so a bubble may exceed maxChars.
function splitSentences(text: string): string[] {
  const out: string[] = [];
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const boundary = /[.!?…。！？]+/g;
    let start = 0;
    let match: RegExpExecArray | null;
    while ((match = boundary.exec(trimmed)) !== null) {
      let end = boundary.lastIndex;
      while (/["'”’）)\]}」』》〉】〕〗〙〛]/.test(trimmed[end] ?? '')) end++;
      const after = trimmed[end];
      const atEnd = end >= trimmed.length;
      const alwaysBreaks = /[。！？…]/.test(match[0][match[0].length - 1]);
      if (!alwaysBreaks && !atEnd && after !== ' ' && after !== '\t') continue;
      if (isAbbreviation(trimmed.slice(start, match.index))) continue;
      out.push(trimmed.slice(start, end).trim());
      start = end;
    }
    const tail = trimmed.slice(start).trim();
    if (tail) out.push(tail);
  }
  return out;
}

// Markdown URLs can contain balanced parentheses. Scan them instead of using a
// greedy regular expression so spoken text never inherits a trailing `)`.
function stripMarkdownLinks(text: string): string {
  let output = '';
  for (let index = 0; index < text.length;) {
    const image = text[index] === '!' && text[index + 1] === '[';
    if (text[index] !== '[' && !image) { output += text[index++]; continue; }
    const labelStart = index + (image ? 2 : 1);
    let cursor = labelStart; let brackets = 1;
    for (; cursor < text.length && brackets; cursor++) {
      if (text[cursor] === '[') brackets++;
      else if (text[cursor] === ']') brackets--;
    }
    if (brackets || text[cursor] !== '(') { output += text[index++]; continue; }
    const label = text.slice(labelStart, cursor - 1);
    let urlCursor = cursor + 1; let parentheses = 1;
    for (; urlCursor < text.length && parentheses; urlCursor++) {
      if (text[urlCursor] === '(') parentheses++;
      else if (text[urlCursor] === ')') parentheses--;
    }
    if (parentheses) { output += text[index++]; continue; }
    output += label;
    index = urlCursor;
  }
  return output;
}

const hasWords = (text: string): boolean => /[\p{L}\p{N}]/u.test(text);

// Rough display width: CJK/full-width characters read as "wide", so a short
// hanzi sentence is not mistaken for a tiny Latin fragment.
const displayWidth = (text: string): number =>
  Array.from(text).reduce((w, ch) => w + (/[　-鿿＀-￯]/.test(ch) ? 2 : 1), 0);

// Break a long reply into bubble-sized chunks so the companion "talks" in a
// few paced messages instead of one wall of text: strip markdown, then emit
// one sentence per bubble. Sentences are never split, so a bubble may run past
// maxChars. Genuinely tiny fragments and word-less bits (a lone emoji) merge
// onto the neighbouring bubble instead of standing alone.
export function splitIntoChunks(message: string, maxChars = MAX_CHUNK_CHARACTERS): string[] {
  const clean = stripMarkdown(message);
  if (!clean) return [];

  const chunks: string[] = [];
  for (const raw of splitSentences(clean)) {
    // A leading emoji run belongs to the sentence just spoken ("Nice! 🎉 Next.").
    const lead = raw.match(/^(?:[\p{Extended_Pictographic}☀-➿️‍]|\s)+/u);
    let sentence = raw;
    if (lead && lead[0].trim() && chunks.length > 0) {
      chunks[chunks.length - 1] = `${chunks[chunks.length - 1]} ${lead[0].trim()}`;
      sentence = raw.slice(lead[0].length).trim();
    }
    if (!sentence) continue;

    const prev = chunks[chunks.length - 1];
    const wordless = !hasWords(sentence); // trailing emoji / punctuation only -> stick to previous
    const prevTiny = prev !== undefined && !/[　-鿿＀-￯]/.test(prev) && displayWidth(prev) < MIN_CHUNK_CHARACTERS && prev.length + 1 + sentence.length <= maxChars;
    if (prev !== undefined && (wordless || prevTiny)) {
      chunks[chunks.length - 1] = `${prev} ${sentence}`;
    } else {
      chunks.push(sentence);
    }
  }
  return chunks;
}

export function getMsPerCharacter(_message: string, minMsPerCharacter = MIN_MS_PER_CHARACTER): number {
  return minMsPerCharacter;
}
