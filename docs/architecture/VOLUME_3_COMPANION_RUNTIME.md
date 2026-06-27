# Volume 3 — Companion Runtime & Presence

## Overview

Volume 3 builds the Companion Runtime Layer that turns intelligence into believable companion behaviour.

---

## Architecture

```
Companion Brain (decision)
  ↓
Character Runtime (execution)
  ↓
Presence System (interruption safety)
  ↓
Performance Engine (animation/speech)
  ↓
Desktop Renderer (visual display)
```

---

## Components

### Character Runtime
- State machine with 12 states
- Behaviour queue with priority
- Interruption handling
- Cooldown management

### Presence System
- 9 presence modes
- Attention state tracking
- Interruption cost evaluation
- Do-not-disturb support

### Performance Engine
- Script-based animation
- Timeline with cues
- Default performance library
- Execution management

### Action Engine V2
- Intent → Plan conversion
- Risk assessment
- Permission checking
- Execution with results

### Speech Engine V2
- STT/TTS provider interfaces
- Listening session management
- Mock providers for testing

### Journey Engine V2
- Enhanced milestone management
- Memory/insight linking
- Progress tracking

---

## Integration Points

### For Companion Brain
- Receive decisions via BehaviourRequest
- Report state changes via events

### For Desktop Renderer
- Consume CharacterRuntimeContext
- Render animations via PerformanceEngine
- Display presence state

### For Memory/Insight Engines
- Link discoveries to journeys
- Record action results
