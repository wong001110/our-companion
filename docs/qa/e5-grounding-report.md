# E5 grounding QA report

Executed locally on **2026-07-24T05:01:09.113Z** with `Xenova/multilingual-e5-small`, 384 dimensions, Transformers.js local ONNX, mean pooling, normalization, a 512-token limit, and the production `query: ` / `passage: ` prefixes. The corpus boundary decodes the repository's legacy mojibake fixtures before embedding, so the run used real Chinese, Japanese, and Korean text. Remote model access was disabled for the QA run.

The 24-case corpus covers English, Simplified Chinese, Traditional Chinese, Malay, Japanese, Korean, mixed English/Chinese, and mixed Malay/English; all six conversational Memory types; direct/paraphrased/cross-language support; weak, different-fact, different-preference and opposite-preference cases; negation, contradiction, unrelated, short-ambiguous, and composite text.

| Metric | Result |
| --- | --- |
| First local load | 828.09 ms |
| Mean pair inference | 8.97 ms |
| Positive distribution | n=12; min 0.7298; median 0.8031; p95 0.9161; max 0.9389; mean 0.8296 |
| Negative distribution | n=8; min 0.7298; median 0.7950; p95 0.8384; max 0.8652; mean 0.8033 |
| Contradiction distribution | n=4; min 0.7650; median 0.8125; p95 0.8473; max 0.8630; mean 0.8219 |
| False acceptance at 0.87 | 0/12 (0%) |
| False rejection at 0.87 | 8/12 (66.7%) |

## Selected thresholds

| Constant | Value | Evidence and rationale |
| --- | ---: | --- |
| `MIN_GROUNDING_SUPPORT_SIMILARITY` | 0.87 | Above the observed 0.8652 non-support maximum. Phase 0A chooses safe regeneration/fallback for uncertain multilingual paraphrases instead of accepting a potentially contradictory Memory statement. |
| `UNDECLARED_MEMORY_SIMILARITY_THRESHOLD` | 0.89 | Four explicit undeclared-Memory cases scored 0.8980–0.9197, while the four allowed current-turn/general cases scored 0.7213–0.7491 against Memory. |
| `UNDECLARED_MEMORY_CURRENT_TURN_MARGIN` | 0.12 | Explicit undeclared-Memory margins were 0.1207–0.1620; allowed cases were -0.2154 to -0.1020. |

Per-language positive means were: English 0.8820, Simplified Chinese 0.7690, Traditional Chinese 0.7606, Malay 0.9032, Japanese 0.7979, Korean 0.7877, mixed English/Chinese 0.9389, and mixed Malay/English 0.9161.

The additional production-style undeclared-Memory audit correctly separated all four undeclared cases from all four permitted current-turn/general cases at the selected 0.89 similarity and 0.12 margin gates.

Known limitations: this is a compact release-calibration corpus, not a demographic or safety benchmark. The chosen support threshold intentionally sacrifices recall for safety; rejected valid paraphrases regenerate once and then receive a non-Memory fallback. Run `npm run e5:setup` explicitly to install the model, then re-run `npm run qa:e5-grounding` with `OUR_COMPANION_E5_CACHE` set to the installed cache whenever model, text policy, or corpus changes.
