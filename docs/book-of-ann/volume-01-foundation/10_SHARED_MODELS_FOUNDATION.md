# Shared Models Foundation

These are the minimum shared models Volume 01 expects.

## Signal

```ts
type SignalSourceType =
  | 'internet'
  | 'github'
  | 'rss'
  | 'youtube'
  | 'user'
  | 'local_file'
  | 'calendar'
  | 'companion'
  | 'community'
  | 'system'

type Signal = {
  id: string
  sourceType: SignalSourceType
  provider?: string
  title: string
  summary?: string
  url?: string
  rawContent?: string
  capturedAt: string
  metadata?: Record<string, unknown>
}
```

## Experience

```ts
type ExperienceType =
  | 'internet_discovery'
  | 'user_conversation'
  | 'desktop_action'
  | 'reflection'
  | 'future_companion_visit'
  | 'future_cloud_sync'

type Experience = {
  id: string
  type: ExperienceType
  signalIds?: string[]
  description: string
  occurredAt: string
  privacyLevel: 'private' | 'local' | 'shareable' | 'public'
}
```

## Discovery

```ts
type DiscoveryStatus =
  | 'new'
  | 'queued'
  | 'shared'
  | 'viewed'
  | 'saved'
  | 'ignored'
  | 'journey'
  | 'archived'

type Discovery = {
  id: string
  signalId: string
  title: string
  summary: string
  canonicalUrl?: string
  fingerprint: string
  tags: string[]
  noveltyScore: number
  relevanceScore: number
  growthValue: number
  status: DiscoveryStatus
  createdAt: string
  lastSeenAt?: string
}
```

## CompanionDecision

```ts
type CompanionDecisionAction =
  | 'speak'
  | 'queue_for_later'
  | 'remember_only'
  | 'ignore'
  | 'perform_action'
  | 'stay_silent'

type CompanionDecision = {
  id: string
  action: CompanionDecisionAction
  priority: 'low' | 'normal' | 'high'
  timing: 'now' | 'next_idle' | 'later'
  reason: string
  createdAt: string
}
```

## CharacterState

```ts
type AnnMood =
  | 'neutral'
  | 'curious'
  | 'happy'
  | 'thinking'
  | 'focused'
  | 'tired'
  | 'concerned'

type AnnIntent =
  | 'idle'
  | 'present_discovery'
  | 'wait_response'
  | 'perform_task'
  | 'reflect'
  | 'return_home'

type CharacterState = {
  mood: AnnMood
  intent: AnnIntent
  energy: number
  currentAnimation?: string
}
```
