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
| `MIN_GROUNDING_SUPPORT_SIMILARITY` | 0.87 | Above the observed 0.8652 non-support maximum. It remains a calibration reference for E5 retrieval and undeclared-Memory auditing; it is not an entailment gate for an explicitly selected, application-rendered Memory reference. |
| `UNDECLARED_MEMORY_SIMILARITY_THRESHOLD` | 0.89 | Four explicit undeclared-Memory cases scored 0.8980–0.9197, while the four allowed current-turn/general cases scored 0.7213–0.7491 against Memory. |
| `UNDECLARED_MEMORY_CURRENT_TURN_MARGIN` | 0.12 | Explicit undeclared-Memory margins were 0.1207–0.1620; allowed cases were -0.2154 to -0.1020. |

Per-language positive means were: English 0.8820, Simplified Chinese 0.7690, Traditional Chinese 0.7606, Malay 0.9032, Japanese 0.7979, Korean 0.7877, mixed English/Chinese 0.9389, and mixed Malay/English 0.9161.

The additional production-style undeclared-Memory audit correctly separated all four undeclared cases from all four permitted current-turn/general cases at the selected 0.89 similarity and 0.12 margin gates.

Known limitations: this is a compact release-calibration corpus, not a demographic or safety benchmark. The 66.7% false-rejection result at 0.87 is retained as an audit finding. Explicit selected Memory is now rendered deterministically by the application, so that score is no longer the sole acceptance gate for the exact rendered fact; E5 remains required for retrieval and undeclared-Memory auditing. If validation-time E5 fails after Memory exposure, the turn regenerates once with no durable Memory and otherwise falls back. Run `npm run e5:setup` explicitly to install the model, then re-run `npm run qa:e5-grounding` with `OUR_COMPANION_E5_CACHE` set to the installed cache whenever model, text policy, or corpus changes.

## Canonical Memory rendering

Explicit Memory replies render only verified canonical evidence: exact user evidence, deterministic structured boundary metadata, or an explicitly user-confirmed representation. AI-generated candidate summaries are retained only as unverified interpretations and never become reply facts by default. Legacy records without verified canonical evidence remain available for retrieval but are non-renderable until reviewed.

Boundary prompt constraints and displayed acknowledgements are separate. A prompt may receive the structured target needed to honor a boundary; normal user-facing output, especially for `do_not_mention`, never exposes that target. Final assembled replies include application-rendered Memory text in the 4,000-character limit, and each Memory ID may appear at most once.

## Phase 0A.4 sensitive capture and canonical bounds

Memory capture and Proposal Privacy use one shared sensitive-descriptor classifier. Phase 0 rejects durable capture of credentials, private canaries, email addresses, phone numbers, account and financial values, medical and government-like identifiers, and street addresses; it does not introduce a private vault. Existing records are not deleted, but their stored fields are re-evaluated at disclosure time, so a legacy record containing a descriptor is excluded from generation, repair prompts, rendered replies, undeclared-Memory auditing, and external Action payloads even if old metadata says `normal`.

Canonical user evidence is capped at `MAX_CANONICAL_MEMORY_CHARACTERS` (1,000). Over-limit evidence is rejected before persistence rather than summarized or truncated. Validated AI Memory candidates attached to an Action Turn are retained only after the Action completes successfully or partially and permission is granted; cancellation, denial, invalid Actions, privacy/Grounding failures, and adapter failures do not persist them. User-facing canonical framing is localized for English and Simplified Chinese while the original user-authored evidence remains unchanged.
