# Memory Review and Control

## Purpose

The Memory page helps the user understand what the Companion may use and gives bounded control without turning Memory into a free-form database editor.

## Fixed MVP Decision

Normal users do not directly create, rewrite or delete durable Memory records in the MVP. Memory content remains evidence-backed and application-controlled.

The normal review surface supports:

- viewing what is remembered;
- viewing Memory type, source and confidence;
- viewing whether the Memory is active or paused;
- confirming a Memory;
- asking the Companion to confirm it again;
- disputing and pausing use of a Memory;
- viewing summarized downstream influence counts.

Direct CRUD and raw impact IDs remain Developer-only capabilities.

## Review States

| State | Meaning | Runtime behavior |
| --- | --- | --- |
| `unreviewed` | No explicit user review | Active when all other policy gates allow |
| `confirmed` | User affirmed the Memory | Active and `lastConfirmedAt` updated |
| `needs_confirmation` | User is uncertain | Status becomes `review_pending`; excluded from retrieval and new cognitive effects |
| `user_disputed` | User says it is wrong or should not be used | Status becomes `review_pending`; excluded until confirmed again |

Review actions do not rewrite canonical evidence, title, summary or provenance.

## Review Item Fields

The user-facing item may display:

- title and safe summary;
- typed Memory category;
- review and lifecycle state;
- source type and canonical evidence class;
- confidence and observation count;
- created/updated/last-used dates;
- source URL when relevant;
- summarized influence counts.

The normal UI must not display raw Memory IDs, Pattern IDs, Curiosity IDs, Research IDs, Candidate IDs or internal prompt text.

## Runtime Rules

- Only `active` Memory may enter prompt retrieval, Vector indexing and Discovery personalization.
- `review_pending`, superseded, archived, expired and sensitive Memory remain visible for review but do not influence new behavior.
- Confirming a review-pending Memory restores it to `active` without changing content.
- Disputing a Memory does not silently delete it; provenance remains available for audit and correction workflows.

## Acceptance Criteria

1. The normal Memory page has no Add, Edit or Delete controls.
2. Confirm, Ask Again and Pause Use actions persist across restart.
3. Paused Memory is excluded from conversation retrieval and Discovery personalization.
4. Confirming the same Memory restores active use.
5. The influence panel shows counts rather than internal IDs.
6. English and Simplified Chinese UI strings are complete.
