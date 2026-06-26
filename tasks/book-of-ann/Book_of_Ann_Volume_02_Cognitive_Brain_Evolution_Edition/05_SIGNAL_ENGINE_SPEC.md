# Signal Engine Specification

## Purpose

The Signal Engine is the perception layer.

It receives observations from anywhere and converts them into normalized signals.

## Current Sources

- Hacker News
- GitHub
- RSS
- Reddit
- YouTube
- user conversation
- desktop action result

## Future Sources

- Companion visit
- community discovery
- cloud sync
- local files
- calendar
- browser history
- podcast transcript

## Interface

```ts
interface SignalEngine {
  capture(input: CaptureSignalInput): Promise<Signal>
  normalize(signal: Signal): Promise<NormalizedSignal>
}
```

## Capture Input

```ts
type CaptureSignalInput = {
  sourceType: SignalSourceType
  provider?: string
  title: string
  summary?: string
  url?: string
  rawContent?: string
  metadata?: Record<string, unknown>
}
```

## Output Event

```txt
SignalCaptured
SignalNormalized
SignalRejected
```

## Rules

- Signal Engine does not decide importance.
- Signal Engine does not call Speech.
- Signal Engine does not update Journey.
- Signal Engine should not require LLM.
- Signal Engine should normalize URL and metadata deterministically.

## Migration

If discovery-engine currently fetches sources:

1. Keep fetch behavior temporarily.
2. Wrap fetched item as Signal.
3. Emit SignalCaptured.
4. Pass Signal to discovery logic.
5. Later move source fetchers to providers/sources.
