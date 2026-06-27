# Character Runtime

## Overview

The Character Runtime manages Ann's lifecycle, state, and behaviour execution.

---

## State Machine

States: `booting`, `idle`, `observing`, `thinking`, `listening`, `speaking`, `exploring`, `sharing`, `performing`, `waiting`, `sleeping`, `error`

Valid transitions ensure safe state changes.

---

## Behaviour Request

```typescript
interface BehaviourRequest {
  id: string;
  source: 'brain' | 'discovery' | 'speech' | 'action' | 'journey' | 'system';
  type: BehaviourType;
  priority: number;
  interruptible: boolean;
  payload?: unknown;
  requestedEmotion?: string;
  requestedPerformance?: string;
  timeoutMs?: number;
  createdAt: string;
}
```

---

## Public API

```typescript
createRuntimeContext(input): CharacterRuntimeContext
canTransition(from, to): boolean
transitionRuntimeState(current, target): CharacterRuntimeStateV2
submitBehaviour(context, request): BehaviourSubmissionResult
startBehaviour(context, request): { context, execution }
completeBehaviour(context): CharacterRuntimeContext
interruptBehaviour(context, reason): { context, result }
```
