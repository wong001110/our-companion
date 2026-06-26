# Prompt Contracts

## Understanding AI Prompt

Purpose:

- summarize signal
- extract concepts
- identify entities
- suggest tags
- estimate growth value

Output JSON:

```json
{
  "summary": "string",
  "concepts": ["string"],
  "entities": ["string"],
  "tags": ["string"],
  "growth_value": 0,
  "confidence": 0,
  "reason": "string"
}
```

## Insight AI Prompt

Purpose:

- turn concept and pattern into meaningful insight

Output JSON:

```json
{
  "title": "string",
  "explanation": "string",
  "related_concepts": ["string"],
  "growth_value": 0,
  "confidence": 0
}
```

## Companion Message Prompt

This belongs partly to Expression, but Volume 02 defines its cognitive input.

Input should include:

- decision reason
- discovery summary
- curiosity reason
- character mood hint

Output JSON:

```json
{
  "why_this_matters": "string",
  "short_message": "string",
  "recommended_action": "view | save | ignore | add_to_journey",
  "tags": ["string"]
}
```

## Rule

All prompt outputs must be schema-validated before affecting system state.
