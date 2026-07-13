# Speech bubble execution log

- Baseline: `d02b8fe149516ba3d3a1d68932890f3e54ee15eb`.
- Empty discovery speech completes its owning command immediately; no completion ref is installed afterward.
- Generation tokens protect newer speech from stale callbacks.
- Sentence parsing consumes English and CJK closing marks, including `」』『》〉】〕〗〙〛`.
- Markdown link scanning handles balanced URL parentheses and does not execute HTML.

## Verification

- Focused speech tests: 15 passed.
- Full Node 22 client regression: 55 files / 407 tests passed.
