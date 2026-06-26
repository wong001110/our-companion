# Volume 02 Implementation Summary

## Added Cognitive Contracts

- `SignalEngine`, `CaptureSignalInput`, `NormalizedSignal`
- `Concept`, `ConceptMatcher`, `ConceptMatchResult`
- `DuplicateResult`
- `Insight`
- `CuriosityAssessment`, `CuriosityGap`, `CuriosityDebt`, `CuriosityInvestment`, `CuriosityBudget`, `CuriositySeason`
- `AttentionAssessment`
- `DecisionInput`, `UserContext`, `CompanionContext`

## Engine Additions

- `discovery-engine`
  - deterministic signal capture and normalization
  - URL canonicalization with tracking parameter removal
  - deterministic discovery fingerprints
  - quality filtering
  - duplicate/revival result helper
  - signal-to-discovery compatibility conversion

- `memory-engine`
  - stable concept keys
  - concept creation and matching
  - related discovery and entity/topic updates

- `pattern-engine`
  - cognitive pattern adapter for `repeated_topic` and `cross_source_trend`

- `insight-engine`
  - pure cognitive `Insight` generation from concepts, patterns, and candidates

- `curiosity-engine`
  - curiosity assessment
  - gap matching
  - budget creation/spending
  - momentum and investment scoring

- `decision-engine`
  - attention assessment
  - rule-based companion decisions

- `ai-engine`
  - Volume 02 JSON validators for discovery understanding, cognitive insight, curiosity assessment, and decisions

## Event Flow Integration

Discovery refresh now emits:

- `SignalCaptured`
- `DiscoveryCreated`
- `CuriosityAssessmentCreated`
- `AttentionAssessmentCreated`
- `DecisionRequested`
- `CompanionDecisionMade`
- `SilenceChosen` when the rule-based decision chooses silence

The bridge is additive. Existing database writes, discovery sharing, renderer broadcasts, and compatibility outputs remain unchanged.
