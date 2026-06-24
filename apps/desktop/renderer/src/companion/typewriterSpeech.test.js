import { describe, expect, it } from 'vitest';
import { getMsPerWord, splitWords } from './typewriterSpeech';
describe('typewriterSpeech helpers', () => {
    it('splits words for reveal pacing', () => {
        expect(splitWords('Hello there Ann')).toEqual(['Hello', 'there', 'Ann']);
        expect(splitWords('   ')).toEqual([]);
    });
    it('enforces a minimum per-word delay', () => {
        expect(getMsPerWord('one two three four')).toBeGreaterThanOrEqual(35);
    });
});
