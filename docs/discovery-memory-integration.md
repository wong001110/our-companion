# Discovery and Memory integration

Discovery personalization is deterministic and local-first.

## Pipeline

```text
eligible Memory + Patterns + Interest Graph + Discovery feedback
→ bounded Memory profile
→ candidate alignment and ranking
→ Boundary and saturation gates
→ evidence synthesis
→ final Discovery scores and subtle relevance themes
```

## Privacy rules

- SQLite remains authoritative for Memory.
- Private, personal, and sensitive Memory never contributes positive Discovery ranking signals.
- Legacy user-authored Memory without explicit sensitivity metadata fails closed.
- User Boundaries are internal hard blockers and are applied before a candidate is persisted.
- Boundary targets and Memory IDs are never written into persisted Discovery alignment metadata.
- The Discovery reason generator receives only bounded public theme terms. It must not claim that the Companion remembers a specific statement or expose internal scores.
- Memory themes do not modify user-visible Discovery tags, and deterministic fallback text does not enumerate those themes.

## Ranking behavior

- `core` mode uses the strongest Memory personalization.
- `adjacent` mode balances Memory with curiosity expansion.
- `wildcard` mode keeps personalization deliberately weak to preserve exploration outside established interests.
- `challenge` mode gives more weight to curiosity and patterns than direct preference matching.
- Saved Discoveries and positive feedback increase future relevance.
- Rejected or dismissed topics apply a bounded negative penalty.

## Persistence

Accepted candidates store a safe `memoryAlignment` snapshot in `rawEvidence` containing only normalized scores, public theme terms, and source counts. It contains no Memory IDs, Pattern IDs, Interest Node IDs, or Boundary data.

Final Discovery rows use real Memory/history/expertise scores instead of fixed placeholder values. Saving a Discovery as Memory also retains its source URL so future reasoning can preserve provenance.
