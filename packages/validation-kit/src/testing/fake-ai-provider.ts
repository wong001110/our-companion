import type { AiProvider, AiProviderRequest, ProviderMode } from '../production-runtime';

type AiOutcome = unknown | Error;

export class FakeAiProvider implements AiProvider {
  readonly calls: AiProviderRequest[] = [];
  private readonly outcomes: AiOutcome[] = [];

  constructor(
    initialOutcomes: AiOutcome[] = [],
    readonly mode: ProviderMode = 'mock',
  ) {
    this.outcomes.push(...initialOutcomes);
  }

  enqueue<T>(value: T): void {
    this.outcomes.push(value);
  }

  enqueueError(error: Error | string): void {
    this.outcomes.push(error instanceof Error ? error : new Error(error));
  }

  async complete<T = unknown>(request: AiProviderRequest): Promise<T> {
    this.calls.push(structuredClone(request));
    const outcome = this.outcomes.shift();
    if (outcome instanceof Error) throw outcome;
    return structuredClone(outcome) as T;
  }
}
