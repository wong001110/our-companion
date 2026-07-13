# Speech bubble execution log

- Sentence splitting retains closing quotes and brackets with the preceding terminator.
- Markdown/HTML-only messages complete without rendering a stuck empty bubble.
- Typewriter completion uses a generation token so stale callbacks cannot complete a newer response.
- Existing abbreviation, decimal, CJK, emoji, markdown, list, and code-fence behavior remains covered by tests.

## Verification

- `apps/desktop/renderer/src/companion/typewriterSpeech.test.ts` — 13 tests passed.
- Full client regression: 54 test files and 402 tests passed.
