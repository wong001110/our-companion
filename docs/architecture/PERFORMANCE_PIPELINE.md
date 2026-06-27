# Performance Pipeline

## Overview

The Performance Pipeline turns behaviours into animation and speech instructions.

---

## Performance Script

```typescript
interface PerformanceScriptV2 {
  id: string;
  name: string;
  behaviourType: string;
  emotion?: string;
  animationSequence: PerformanceCue[];
  expressionSequence?: PerformanceCue[];
  speechTiming?: PerformanceCue[];
  durationMs?: number;
  interruptible: boolean;
  cooldownMs?: number;
  tags?: string[];
}
```

---

## Performance Cue

```typescript
interface PerformanceCue {
  id: string;
  type: 'animation' | 'expression' | 'emotion' | 'speech' | 'wait' | 'event';
  startMs: number;
  durationMs?: number;
  payload?: unknown;
}
```

---

## Default Scripts

- `idle` — Idle animation
- `thinking` — Thinking animation
- `speaking` — Speaking animation
- `share_discovery` — Discovery sharing
- `sleeping` — Sleep animation

---

## Public API

```typescript
class PerformanceEngine {
  loadScript(script): void
  playScript(scriptId): PerformanceExecution | undefined
  completeExecution(executionId): void
  cancelExecution(executionId): void
  getActiveExecution(): PerformanceExecution | undefined
}
```
