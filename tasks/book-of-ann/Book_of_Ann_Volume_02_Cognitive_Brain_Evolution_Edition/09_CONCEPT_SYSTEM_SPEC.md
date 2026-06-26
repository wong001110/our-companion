# Concept System Specification

## Purpose

Concepts prevent the system from becoming a pile of links.

A Concept is the normalized idea behind discoveries.

## Example

Discoveries:

- HN discussion on SQLite personal memory
- GitHub repo using SQLite for local-first apps
- Blog post about SQLite-backed AI memory

Concept:

```txt
SQLite-backed local-first personal memory
```

## Concept Type

```ts
type Concept = {
  id: string
  key: string
  name: string
  summary: string
  topics: string[]
  entities: string[]
  relatedDiscoveryIds: string[]
  firstSeenAt: string
  lastSeenAt: string
  strength: number
  status: 'active' | 'dormant' | 'archived'
}
```

## Concept Key

A stable semantic key.

Example:

```txt
sqlite-local-first-personal-memory
```

## Events

```txt
ConceptCreated
ConceptMatched
ConceptUpdated
ConceptDormant
ConceptArchived
```

## Rules

- Discovery can be many.
- Concept should grow slowly.
- Journey should reference Concept more than raw Discovery.
- Concept is the foundation for Knowledge Graph.
