# Decision Context

## Overview

The decision context gathers all relevant information for decision making.

---

## Context Snapshots

### UserContextSnapshot
```typescript
{
  mode: 'idle' | 'focused' | 'chatting' | 'working' | 'away';
  localTime: string;
  recentActions: string[];
  fatigueScore: number;
  lastInteractionAt?: string;
}
```

### ConversationContextSnapshot
```typescript
{
  recentMessages: string[];
  activeTopic?: string;
  messageCount: number;
  lastMessageAt?: string;
}
```

### MemoryContextSnapshot
```typescript
{
  relevantMemories: string[];
  memoryCount: number;
  topMemoryImportance: number;
}
```

### PatternContextSnapshot
```typescript
{
  activePatterns: string[];
  patternCount: number;
  topPatternConfidence: number;
}
```

### InsightContextSnapshot
```typescript
{
  recentInsights: string[];
  insightCount: number;
  topInsightImportance: number;
}
```

### CuriosityContextSnapshot
```typescript
{
  curiosityTargets: string[];
  targetCount: number;
  topCuriosityScore: number;
}
```

### CharacterContextSnapshot
```typescript
{
  mood: string;
  energy: number;
  lastActivityAt?: string;
}
```

---

## Context Building

The context builder can use:
1. Direct input from `CompanionDecisionInput`
2. Provider interfaces for real-time data
3. Defaults for missing values

Default values ensure safe behavior when context is incomplete.
