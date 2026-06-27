# Companion Brain Architecture

## Overview

The Companion Brain is the central coordination layer that determines what Our Companion should do next. It reasons over user context, memory, patterns, insights, curiosity, and character state.

---

## Intelligence Pipeline

```
Memory Engine → Pattern Engine → Insight Engine → Companion Brain → Action/Character/Discovery
```

---

## Responsibilities

### Should Do
- Build decision context
- Evaluate user and companion state
- Score possible next moves
- Select the best next behavior
- Explain why a decision was made

### Should NOT Do
- Execute actions directly
- Generate UI
- Persist data directly
- Perform discovery itself
- Control animations directly

---

## Public API

```typescript
class CompanionBrain {
  buildContext(input: CompanionDecisionInput): CompanionDecisionContext;
  evaluateCandidates(context: CompanionDecisionContext): CompanionDecisionCandidate[];
  decide(input: CompanionDecisionInput): CompanionDecisionResult;
}
```

---

## Decision Candidates

| Type | Description |
|------|-------------|
| `stay_quiet` | Default safe behavior |
| `respond` | Reply to user message |
| `ask_question` | Ask user a question |
| `share_discovery` | Share an insight or discovery |
| `start_discovery` | Begin exploration |
| `continue_journey` | Resume existing journey |
| `suggest_action` | Propose an action |
| `update_memory` | Consolidate memories |
| `perform_character_reaction` | Update character state |

---

## Provider Interfaces

The Brain uses provider interfaces for loose coupling:

```typescript
interface MemoryContextProvider {
  getMemoryContext(): Promise<MemoryContextSnapshot>;
}

interface PatternContextProvider {
  getPatternContext(): Promise<PatternContextSnapshot>;
}

interface InsightContextProvider {
  getInsightContext(): Promise<InsightContextSnapshot>;
}

interface CuriosityContextProvider {
  getCuriosityContext(): Promise<CuriosityContextSnapshot>;
}

interface CharacterContextProvider {
  getCharacterContext(): Promise<CharacterContextSnapshot>;
}
```

---

## Integration Points

### For Character Engine
- Use `recommendedNextEngine` to route decisions
- Check `shouldInterruptUser` before speaking

### For Action Engine
- Use `recommendedAction` to determine action type
- Check `selectedCandidate.type` for context

### For Discovery Engine
- Use `start_discovery` candidate to begin exploration
- Check `curiosityContext` for targets

### For Speech Engine
- Use `respond` or `ask_question` candidates
- Check `conversationContext` for message history
