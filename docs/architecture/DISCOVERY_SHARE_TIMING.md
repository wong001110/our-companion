# Discovery Share Timing

## Overview

Share timing decides when Ann should share a discovery.

---

## Share Candidate

```typescript
interface DiscoveryShareCandidate {
  id: string;
  poolItemId: string;
  reason: string;
  priority: number;
  urgency: number;
  expectedUserValue: number;
  interruptionCost: number;
  confidence: number;
  suggestedTone: 'soft' | 'excited' | 'curious' | 'brief' | 'quiet';
  suggestedTiming: 'now' | 'soon' | 'later' | 'only_when_asked';
}
```

---

## Timing Rules

- Block when interruption cost is high
- Keep low-priority items in pool
- Allow soft share when user recently discussed topic
- Share gently when user is idle and item is high relevance
- Delay or suppress when user dismissed similar items recently
- Increase share priority when user saved similar items before

---

## Interruption Levels

- `none` — No interruption
- `badge_only` — Badge indicator only
- `soft_prompt` — Gentle notification
- `panel_peek` — Panel becomes available
- `direct_share` — Full share (rare)

---

## Public API

```typescript
evaluateShareCandidate(item, attention, recentDismissals): DiscoveryShareCandidate
determineInterruptionLevel(candidate, attention): DiscoveryInterruptionLevel
shouldShareNow(candidate, attention): boolean
```
