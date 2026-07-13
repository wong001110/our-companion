import { describe, expect, it } from 'vitest';
import { MAX_CHUNK_CHARACTERS, getMsPerCharacter, splitCharacters, splitIntoChunks, stripMarkdown } from './typewriterSpeech';

describe('typewriterSpeech helpers', () => {
  it('splits characters for letter-by-letter reveal', () => {
    expect(splitCharacters('Back')).toEqual(['B', 'a', 'c', 'k']);
    expect(splitCharacters('Hi Ann')).toEqual(['H', 'i', ' ', 'A', 'n', 'n']);
  });

  it('enforces a minimum per-character delay', () => {
    expect(getMsPerCharacter('one two three four')).toBeGreaterThanOrEqual(24);
  });

  it('keeps short messages as a single chunk', () => {
    expect(splitIntoChunks('Hi Ann!')).toEqual(['Hi Ann!']);
    expect(splitIntoChunks('')).toEqual([]);
  });

  it('emits one sentence per bubble', () => {
    const chunks = splitIntoChunks('First sentence here. Second sentence follows. Third one keeps going.');
    expect(chunks).toEqual([
      'First sentence here.',
      'Second sentence follows.',
      'Third one keeps going.',
    ]);
  });

  it('merges only genuinely tiny fragments', () => {
    expect(splitIntoChunks('Ok. Got it, doing that now for you.')).toEqual([
      'Ok. Got it, doing that now for you.',
    ]);
  });

  it('strips markdown down to clean speech', () => {
    const chunks = splitIntoChunks('## Plan\n- **Do** the thing\n- Then read [the docs](http://x.com)');
    const joined = chunks.join(' ');
    expect(joined).not.toMatch(/[*#`\[\]]/);
    expect(joined).toContain('the docs');
    expect(joined).not.toContain('http');
  });

  it('reduces standalone markdown tokens', () => {
    expect(stripMarkdown('Use `npm run dev` and see [here](http://x)')).toBe('Use npm run dev and see here');
    expect(stripMarkdown('# Heading\n\nBody text.')).toBe('Heading\nBody text.');
  });

  it('does not break on dots inside terms, decimals, or abbreviations', () => {
    expect(splitIntoChunks('Node.js is fast. It runs everywhere.')).toEqual([
      'Node.js is fast.',
      'It runs everywhere.',
    ]);
    expect(splitIntoChunks('It costs 3.14 dollars per file.txt today.')).toEqual([
      'It costs 3.14 dollars per file.txt today.',
    ]);
    expect(splitIntoChunks('Use a bundler, e.g. Vite, for speed.')).toEqual([
      'Use a bundler, e.g. Vite, for speed.',
    ]);
  });

  it('keeps a trailing emoji with its sentence', () => {
    expect(splitIntoChunks('Great job today everyone! 🎉 See you tomorrow.')).toEqual([
      'Great job today everyone! 🎉',
      'See you tomorrow.',
    ]);
  });

  it('keeps a whole sentence together even past the char limit', () => {
    const long = `${'word '.repeat(60).trim()}.`; // one sentence, ~360 chars
    const chunks = splitIntoChunks(long);
    expect(chunks).toEqual([long]);
    expect(chunks[0].length).toBeGreaterThan(MAX_CHUNK_CHARACTERS);
  });

  it('splits CJK sentences without trailing spaces', () => {
    expect(splitIntoChunks('你好，很高兴认识你。我们一起玩吧！')).toEqual([
      '你好，很高兴认识你。',
      '我们一起玩吧！',
    ]);
  });

  it('keeps closing quotes and brackets with their sentence terminator', () => {
    const chunks = splitIntoChunks('She said "Ready!" Next (go now.) Then.');
    expect(chunks[0]).toBe('She said "Ready!"');
    expect(chunks.join(' ')).toContain('Next (go now.)');
  });

  it('reduces markdown-only replies to no chunks and removes HTML wrappers', () => {
    expect(splitIntoChunks('---\n```ts\n```\n<strong></strong>')).toEqual([]);
    expect(splitIntoChunks('> [Read **this**](https://example.test)\n- `now`')).toEqual(['Read this now']);
  });
});
