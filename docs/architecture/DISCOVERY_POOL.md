# Discovery Pool

## Overview

The Discovery Pool stores returned discoveries until they are shared, saved, discussed, or expired.

---

## Pool Item

```typescript
interface DiscoveryPoolItem {
  id: string;
  sourceDiscoveryId: string;
  title: string;
  summary: string;
  evidence: DiscoveryEvidence[];
  tags: string[];
  noveltyScore: number;
  relevanceScore: number;
  confidenceScore: number;
  sharePriority: number;
  status: DiscoveryExperienceStatus;
  createdAt: string;
  returnedAt: string;
  lastUpdatedAt: string;
  expiresAt?: string;
  userReaction?: DiscoveryUserReaction;
}
```

---

## Pool Rules

- Do not show everything immediately
- Low-confidence items stay hidden
- Duplicates merge into one stronger item
- High-priority items become share candidates
- User-dismissed topics lower future priority
- Saved topics reinforce memory

---

## Public API

```typescript
createPoolItem(result): DiscoveryPoolItem
addToPool(pool, item): DiscoveryPoolItem[]
removeFromPool(pool, id): DiscoveryPoolItem[]
updatePoolItemStatus(pool, id, status): DiscoveryPoolItem[]
getShareCandidates(pool): DiscoveryPoolItem[]
filterPool(pool, query): DiscoveryPoolItem[]
expireStaleItems(pool, maxAgeDays): DiscoveryPoolItem[]
```
