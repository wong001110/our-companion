# Current-to-Target Cognitive Mapping

## Existing discovery-engine

Target responsibilities:

- accept Signal input
- create Discovery
- deduplicate
- score novelty
- emit DiscoveryCreated

Remove over time:

- direct speech calls
- direct UI calls
- direct character animation calls
- source-specific fetching

## Existing curiosity-engine

Target responsibilities:

- maintain curiosity gaps
- calculate growth value
- manage curiosity budget
- detect current curiosity season

Remove over time:

- direct recommendation display
- UI-specific output

## Existing pattern-engine

Target responsibilities:

- detect repeated concepts
- cluster related discoveries
- identify trend signals

Input:

- Discovery
- Concept
- Knowledge

Output:

- PatternDetected

## Existing insight-engine

Target responsibilities:

- produce higher-level meaning
- summarize concept clusters
- generate insight candidates

Input:

- Pattern
- Concept
- DiscoveryCluster

Output:

- InsightGenerated

## Existing memory-engine

For Volume 02, only depend on it through a KnowledgeReader or MemoryReader interface.

The cognitive brain should not write memory directly except through Knowledge events.

## Existing journey-engine

For Volume 02, journey is used as context only.

Curiosity can ask:

- What journey is active?
- What concepts are currently explored?
- What gaps exist?

## Existing diary-engine

Reflection events may target diary later, but Volume 02 should only emit reflection-ready events.
