# Cognitive Event Flow

## Main Flow

```txt
SignalCaptured
  ↓
SignalNormalized
  ↓
DiscoveryCandidateCreated
  ↓
DuplicateCheckCompleted
  ↓
DiscoveryCreated
  ↓
ConceptMatched
  ↓
PatternDetected
  ↓
InsightGenerated
  ↓
CuriosityAssessmentCreated
  ↓
AttentionAssessmentCreated
  ↓
DecisionRequested
  ↓
CompanionDecisionMade
```

## Remember-Only Flow

```txt
CompanionDecisionMade(action='remember_only')
  ↓
KnowledgeUpdateRequested
  ↓
MemoryUpdated
```

## Speak Flow

```txt
CompanionDecisionMade(action='speak')
  ↓
AnnMessageQueued
  ↓
CharacterStateRequested
  ↓
ExpressionRequested
```

## Queue Flow

```txt
CompanionDecisionMade(action='queue_for_later')
  ↓
DiscoveryQueued
  ↓
SchedulerUpdated
```

## Ignore Flow

```txt
CompanionDecisionMade(action='ignore')
  ↓
DiscoveryArchived or DiscoveryIgnored
```
