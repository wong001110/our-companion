# Discovery Pipeline Specification

## Purpose

The Discovery Pipeline turns normalized signals into candidate discoveries.

## Pipeline

```txt
NormalizedSignal
  ↓
Quality Filter
  ↓
Canonicalization
  ↓
Fingerprint
  ↓
Duplicate Check
  ↓
Semantic Understanding
  ↓
Scoring
  ↓
DiscoveryCreated
```

## Discovery Type

```ts
type Discovery = {
  id: string
  signalId: string
  origin: DiscoveryOrigin
  title: string
  summary: string
  canonicalUrl?: string
  fingerprint: string
  tags: string[]
  status: DiscoveryStatus
  noveltyScore: number
  relevanceScore: number
  growthValue: number
  confidenceScore: number
  createdAt: string
}
```

## Discovery Origin

```ts
type DiscoveryOrigin = {
  type: 'internet' | 'user' | 'companion' | 'community' | 'local'
  provider?: string
  displayName?: string
}
```

## Important UI Rule

Discovery is not a speech bubble.

Discovery should later be presented as card or gift.
The bubble belongs to Expression.

## Events

```txt
DiscoveryCandidateCreated
DiscoveryRejected
DiscoveryCreated
DiscoveryQueued
DiscoveryShared
DiscoverySaved
DiscoveryIgnored
DiscoveryArchived
```

## LLM Usage

LLM may be used for semantic understanding after deduplication.

Do not call LLM before cheap duplicate filters.
