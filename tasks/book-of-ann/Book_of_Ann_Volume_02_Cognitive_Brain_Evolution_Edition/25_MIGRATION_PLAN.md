# Volume 02 Migration Plan

## Phase 1 — Wrap Existing Discovery

Current discovery result becomes Signal + DiscoveryCandidate.

Do not change UI yet.

## Phase 2 — Add Deduplication

Add deterministic URL and fingerprint deduplication.

Keep old discovery results visible for compatibility.

## Phase 3 — Add Concept

Map discoveries to concepts.

Do not require Journey integration yet.

## Phase 4 — Add Curiosity

Score growth value and gap match.

Do not change display behavior yet.

## Phase 5 — Add Decision

Decision Engine decides speak / queue / remember / ignore.

Existing speech flow may still consume `speak`.

## Phase 6 — Remove Direct Speech from Discovery

Discovery no longer calls speech directly.

## Phase 7 — Prepare Volume 03

Pass CompanionDecision to Character and Expression systems.
