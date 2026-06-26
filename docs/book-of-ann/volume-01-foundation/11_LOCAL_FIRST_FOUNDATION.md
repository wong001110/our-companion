# Local-First Foundation

## Why Local-First

Our Companion handles sensitive personal context:

- memory
- curiosity
- journeys
- diary
- user behavior
- future relationship data
- future custom character assets

The default should be local ownership.

## Rules

1. Core memory must work offline.
2. Discovery history should not require cloud.
3. Character package should load locally.
4. Cloud sync must be optional.
5. Future Companion Society features must require explicit user permission.
6. Personal memory should not leave device unless intentionally shared.

## Storage Layers

```txt
Hot Layer
Recent signals, active queue, current decisions.

Warm Layer
Recent discoveries, active journeys, concepts, memory.

Cold Layer
Archived discoveries, compressed summaries, fingerprints, embeddings.
```

## Future Cloud Compatibility

Every persisted entity should have:

```ts
{
  id: string
  createdAt: string
  updatedAt: string
  version: number
  syncStatus?: 'local' | 'pending' | 'synced' | 'conflict'
}
```

## Privacy Defaults

```txt
Private by default.
Shareable only by explicit classification.
Public never automatic.
```

## Migration Rule

If current storage is simple SQLite or local JSON, do not replace it immediately.

Add repository interfaces first:

```ts
interface Repository<T> {
  get(id: string): Promise<T | null>
  list(query?: unknown): Promise<T[]>
  save(entity: T): Promise<void>
  delete(id: string): Promise<void>
}
```
