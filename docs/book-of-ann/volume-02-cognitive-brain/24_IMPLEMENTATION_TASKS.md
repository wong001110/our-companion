# Volume 02 Implementation Tasks

## Task 01 — Signal Engine

- Add SignalEngine interface
- Add SignalCaptured events
- Wrap current source items as Signal

## Task 02 — Discovery Pipeline

- Add DiscoveryCandidate
- Add fingerprint
- Add quality filter
- Add DiscoveryCreated event

## Task 03 — Deduplication

- Add URL normalization
- Add fingerprint matching
- Add duplicate result types

## Task 04 — Concept System

- Add Concept model
- Add concept matching interface
- Emit ConceptCreated / ConceptMatched

## Task 05 — Pattern Engine

- Define Pattern model
- Detect repeated topics and cross-source trends

## Task 06 — Insight Engine

- Add Insight model
- Add LLM prompt contract
- Emit InsightGenerated

## Task 07 — Curiosity Engine

- Add CuriosityAssessment
- Add Gap / Debt / Investment models
- Add budget and momentum scaffolding

## Task 08 — Attention Model

- Add AttentionAssessment
- Add attention scoring rules

## Task 09 — Decision Engine

- Add DecisionInput
- Add CompanionDecision
- Implement rule-based decisions

## Task 10 — Event Flow Integration

- Wire events from Signal to Decision
- Keep existing UI compatibility
