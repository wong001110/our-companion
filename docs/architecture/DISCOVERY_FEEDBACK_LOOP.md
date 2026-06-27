# Discovery Feedback Loop

## Overview

The feedback loop learns from user reactions to improve future discovery sharing.

---

## User Reactions

- `viewed` — User looked at discovery
- `discussed` — User engaged in discussion
- `saved` — User saved discovery
- `dismissed` — User dismissed discovery
- `not_interested` — User marked not interested
- `explore_more` — User wants to explore further
- `converted_to_journey` — User created journey from discovery
- `opened_source` — User opened source link

---

## Memory Updates

### Positive Signals (saved, discussed, explore_more)
- Reinforce related memories
- Increase interest strength
- Strengthen related patterns
- Increase future curiosity priority

### Negative Signals (dismissed, not_interested)
- Reduce similar share priority
- Mark topic fatigue
- Avoid repeated suggestions

---

## Public API

```typescript
processReaction(item, reaction): { updatedItem, memoryUpdates, shouldCreateFollowUp }
shouldSuppressFutureShares(reactions, topic, threshold): boolean
```
