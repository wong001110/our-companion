# Volume 4 — Discovery Experience & Outside Panel

## Overview

Volume 4 turns intelligence systems into the signature user experience: Ann discovers things, brings them back, waits for the right moment, and shares them gently.

---

## Architecture

```
Curiosity → Discovery → Discovery Pool → Share Timing → Outside Panel → User Response → Memory/Journey Update
```

---

## Components

### Discovery Pool
- Stores returned discoveries
- Deduplicates similar items
- Ranks by priority
- Tracks freshness and share readiness

### Share Timing
- Evaluates share candidates
- Checks interruption safety
- Determines timing (now/soon/later)
- Selects appropriate tone

### Feedback Handling
- Processes user reactions
- Reinforces positive signals
- Weakens negative signals
- Creates follow-up candidates

### Discovery Card System
- Compact, actionable cards
- Explain why discovery matters
- Support required actions

---

## User Experience Flow

1. User shows interest in topic
2. Memory/Pattern/Insight identify meaningful signal
3. Curiosity creates exploration opportunity
4. Discovery executes exploration in background
5. Result enters Discovery Pool
6. Companion Brain decides when to share
7. Presence checks interruption safety
8. Ann returns with soft message
9. Outside Panel shows discovery card
10. User can discuss, save, dismiss, or explore more
11. Reaction updates memory, curiosity, and journey
