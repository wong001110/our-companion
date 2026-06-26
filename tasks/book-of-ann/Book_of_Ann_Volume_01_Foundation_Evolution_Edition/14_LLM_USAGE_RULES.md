# LLM Usage Rules

## Core Rule

LLM is a tool, not the controller.

The Companion should not call LLM for every step.

## No LLM Needed

Use rules, local code, or embeddings for:

- URL normalization
- fingerprinting
- exact deduplication
- daily share count
- focus mode checks
- timing rules
- animation mapping
- command execution
- permission checks

## LLM Useful

Use LLM for:

- semantic understanding
- concept extraction
- insight generation
- companion phrasing
- daily reflection
- ambiguous intent parsing

## Two LLM Roles

### Understanding AI

Low-frequency and cacheable.

Responsible for:

- summary
- concept extraction
- topic extraction
- growth value reasoning
- semantic explanation

### Companion AI

Short, expressive, character-aware.

Responsible for:

- warm bubble sentence
- why this matters
- recommended action language
- reflection phrasing

## Cache Rule

If the same fingerprint or concept was already understood, reuse cached understanding.

## Provider Rule

Brain modules should not import DeepSeek, OpenAI, or any provider directly.

Use:

```ts
interface LlmProvider {
  completeJson<T>(request: LlmJsonRequest): Promise<T>
  completeText(request: LlmTextRequest): Promise<string>
}
```

## Prompt Output Rule

All AI outputs that affect system state must be valid JSON and schema-validated.
