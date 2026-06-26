import { describe, expect, it } from 'vitest';
import { getMsPerCharacter, splitCharacters } from './typewriterSpeech';

describe('typewriterSpeech helpers', () => {
  it('splits characters for letter-by-letter reveal', () => {
    expect(splitCharacters('Back')).toEqual(['B', 'a', 'c', 'k']);
    expect(splitCharacters('Hi Ann')).toEqual(['H', 'i', ' ', 'A', 'n', 'n']);
  });

  it('enforces a minimum per-character delay', () => {
    expect(getMsPerCharacter('one two three four')).toBeGreaterThanOrEqual(24);
  });
});
