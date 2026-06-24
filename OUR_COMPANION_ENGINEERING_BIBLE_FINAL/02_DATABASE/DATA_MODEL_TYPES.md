# TypeScript Domain Types

```ts
export type CoreState =
  | 'idle'
  | 'walking'
  | 'sleeping'
  | 'observing'
  | 'thinking'
  | 'discovering'
  | 'talking'
  | 'executing'
  | 'returning'
  | 'organizing_backpack';

export type EmotionName =
  | 'neutral'
  | 'curious'
  | 'happy'
  | 'excited'
  | 'shy'
  | 'confused'
  | 'focused'
  | 'tired'
  | 'proud'
  | 'concerned';

export type Intent =
  | 'wandering'
  | 'waiting'
  | 'sharing_discovery'
  | 'asking_permission'
  | 'helping_task'
  | 'reviewing_memory'
  | 'reflecting_journey'
  | 'organizing_backpack';

export interface EmotionState {
  neutral: number;
  curious: number;
  happy: number;
  excited: number;
  shy: number;
  confused: number;
  focused: number;
  tired: number;
  proud: number;
  concerned: number;
}

export interface CharacterRuntimeState {
  characterId: string;
  coreState: CoreState;
  emotion: EmotionState;
  intent: Intent;
  position?: { x: number; y: number };
  lastActivityAt?: string;
}

export type MemoryNodeType =
  | 'topic'
  | 'discovery'
  | 'resource'
  | 'question'
  | 'decision'
  | 'outcome';

export type MemoryRelation =
  | 'related_to'
  | 'inspired_by'
  | 'evolved_into'
  | 'depends_on'
  | 'caused_by';

export interface MemoryNode {
  id: string;
  type: MemoryNodeType;
  title: string;
  summary?: string;
  content?: string;
  importanceScore: number;
  source?: string;
  sourceUrl?: string;
  createdAt: string;
  updatedAt: string;
}
```
