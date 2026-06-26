# Deduplication Specification

## Purpose

Avoid showing the same discovery repeatedly.

Deduplication must handle:

- same URL
- URL with tracking parameters
- same article from different source
- same GitHub repo discussed elsewhere
- same concept resurfacing without meaningful update

## Deduplication Layers

### Layer 1 — URL

Normalize:

- remove UTM params
- remove ref params
- normalize trailing slash
- lowercase host
- canonical GitHub repo URL

### Layer 2 — Fingerprint

Create deterministic fingerprint from:

```txt
normalizedTitle
canonicalUrl
entities
topics
sourceType
```

### Layer 3 — Embedding Similarity

Use embedding similarity for near-duplicates.

### Layer 4 — Concept Cluster

If not same discovery but same concept, apply topic cooldown.

## Duplicate Result

```ts
type DuplicateResult =
  | { type: 'new' }
  | { type: 'duplicate'; existingDiscoveryId: string }
  | { type: 'revival_candidate'; existingConceptId: string; reason: string }
```

## Events

```txt
DuplicateDetected
NearDuplicateDetected
RevivalCandidateDetected
```

## Rule

Duplicate does not always mean ignore.

Sometimes it means:

```txt
revive old concept
```

## Migration

If current system only deduplicates by URL, keep it as Layer 1 and add later layers incrementally.
