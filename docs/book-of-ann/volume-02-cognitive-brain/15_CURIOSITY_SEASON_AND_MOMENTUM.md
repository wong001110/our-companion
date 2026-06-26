# Curiosity Season and Momentum

## Curiosity Season

A temporary focus period.

Example:

```txt
Current Season: AI Companion Memory
```

Seasons prevent old interests from dominating forever.

## Type

```ts
type CuriositySeason = {
  id: string
  name: string
  relatedConceptIds: string[]
  startedAt: string
  lastActiveAt: string
  strength: number
  status: 'active' | 'fading' | 'ended'
}
```

## Momentum

Momentum measures whether the user is currently engaged with an exploration direction.

Positive momentum:

- saved discoveries
- asked follow-up questions
- added to journey
- used related concepts in project

Negative momentum:

- repeated ignore
- no follow-up
- dismissals
- fatigue

## Events

```txt
CuriositySeasonStarted
CuriositySeasonUpdated
CuriositySeasonEnded
UserMomentumChanged
```

## Rule

Do not assume all historic interests are current interests.

Ann should respect seasons.
