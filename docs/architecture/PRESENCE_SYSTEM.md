# Presence System

## Overview

Presence defines how Ann exists on the desktop when not actively chatting.

---

## Presence Modes

- `available` — Ready to interact
- `quiet` — Minimal activity
- `observing` — Watching user activity
- `curious` — Thinking or exploring
- `focused` — Working on something
- `exploring` — Background exploration
- `ready_to_share` — Has discovery to share
- `sleeping` — Reduced activity
- `do_not_disturb` — No interruptions

---

## Attention State

```typescript
interface AttentionState {
  userActive: boolean;
  appFocused: boolean;
  recentInteraction: boolean;
  doNotDisturb: boolean;
  estimatedInterruptCost: number;
  lastUserInputAt?: string;
}
```

---

## Interruption Rules

- Block when `doNotDisturb` is true
- Allow low-cost interruptions when user is idle
- Block high-cost interruptions when user is focused
- Reduce priority after recent dismissals

---

## Public API

```typescript
createAttentionState(): AttentionState
determinePresenceMode(context, attention): PresenceMode
shouldAllowInterruption(attention, interruptionCost): boolean
updateAttentionState(current, updates): AttentionState
```
