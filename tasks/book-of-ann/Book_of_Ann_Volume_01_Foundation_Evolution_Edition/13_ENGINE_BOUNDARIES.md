# Engine Boundaries

## Signal Engine

Can:
- collect raw signals
- normalize source metadata
- emit SignalCaptured

Cannot:
- decide whether to show user
- write journey directly
- trigger character animation

## Thinking Engine

Can:
- create discoveries
- deduplicate
- identify concepts
- generate insights

Cannot:
- directly show UI
- decide interruption timing
- execute desktop commands

## Curiosity Engine

Can:
- identify gaps
- score growth value
- maintain curiosity budget
- detect seasons and momentum

Cannot:
- force speech
- directly open UI
- execute actions

## Knowledge Engine

Can:
- store memory
- update concepts
- update journeys
- archive old knowledge

Cannot:
- decide whether to interrupt
- generate bubble copy directly

## Decision Engine

Can:
- decide speak / wait / remember / ignore / act
- account for timing, focus, fatigue, trust

Cannot:
- write final speech style
- choose sprite frames directly
- execute commands

## Character Engine

Can:
- choose mood
- choose behavior state
- map intent to animation
- update energy

Cannot:
- decide business logic
- execute OS commands
- fetch discoveries

## Expression Engine

Can:
- generate bubble payloads
- render UI payloads
- prepare notification payloads

Cannot:
- decide whether something is important
- store long-term knowledge

## Action Engine

Can:
- plan actions
- request permission
- execute commands
- create performance scripts

Cannot:
- fake real action through animation clicks
- modify memory unless action result event is emitted
