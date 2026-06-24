# IPC Contract

Renderer must use preload APIs only.

## Character
- `character.getState(characterId?: string)`
- `character.getActive()`
- `character.setPrimary(characterId: string)`
- `character.updatePosition(input)`
- `character.triggerBehavior(input)`

## Discovery
- `discovery.getFeed(input)`
- `discovery.refresh(input)`
- `discovery.markInterested(discoveryId)`
- `discovery.markNotInterested(discoveryId)`
- `discovery.addToJourney(input)`

## Memory
- `memory.createNode(input)`
- `memory.updateNode(input)`
- `memory.deleteNode(id)`
- `memory.createEdge(input)`
- `memory.getGraph(input)`
- `memory.search(query)`

## Journey
- `journey.create(input)`
- `journey.getActive()`
- `journey.getTimeline(input)`
- `journey.addMilestone(input)`

## Diary
- `diary.getEntries(input)`
- `diary.generateDaily(input)`

## Tools
- `tool.execute(input)`
- `tool.preview(input)`

## AI
- `ai.chat(input)`
- `ai.generateDiscoveryReason(input)`
- `ai.summarizeMemory(input)`
