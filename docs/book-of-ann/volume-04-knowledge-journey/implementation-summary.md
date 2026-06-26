# Volume 04 Implementation Summary

## Added Models

- `Knowledge`
- `KnowledgeGraph`
- `KnowledgeGraphNode`
- `KnowledgeGraphEdge`
- `MemoryReference`
- `Reflection`

## Memory And Knowledge

- Creates persistent knowledge from insights and concepts.
- Builds a knowledge graph with derived/related edges.
- Archives and restores knowledge.
- Decays inactive concepts to dormant or archived states.
- Revives dormant concepts when new understanding appears.
- Retrieves knowledge by query, active journey, current concepts, recency/activity, and strength.

## Journey

- Creates journeys grouped by concepts, discoveries, and insights.
- Creates milestones from insights instead of simple save events.

## Reflection And Diary

- Generates growth-focused reflections from active knowledge and milestones.
- Converts reflections to diary entries that emphasize changed understanding and why it mattered.

## Event Bridge

Existing service flows now emit:

- `KnowledgeCreated`
- `JourneyUpdated`
- `ReflectionRequested`
- `ReflectionCreated`

Existing storage behavior remains unchanged.
