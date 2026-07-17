import type {
  DiscoveryProvider,
  DiscoveryProviderInput,
  DiscoveryProviderItem,
  ProviderMode,
} from '../production-runtime';

type DiscoveryOutcome = DiscoveryProviderItem[] | Error;

export class FakeDiscoveryProvider implements DiscoveryProvider {
  readonly calls: DiscoveryProviderInput[] = [];
  private readonly outcomes: DiscoveryOutcome[] = [];

  constructor(
    initialOutcomes: DiscoveryOutcome[] = [],
    readonly mode: ProviderMode = 'fixture',
  ) {
    this.outcomes.push(...initialOutcomes);
  }

  enqueue(items: DiscoveryProviderItem[]): void {
    this.outcomes.push(items);
  }

  enqueueError(error: Error | string): void {
    this.outcomes.push(error instanceof Error ? error : new Error(error));
  }

  async search(input: DiscoveryProviderInput): Promise<DiscoveryProviderItem[]> {
    this.calls.push(clone(input));
    const outcome = this.outcomes.shift() ?? [];
    if (outcome instanceof Error) throw outcome;
    return outcome.map((item) => clone(item));
  }
}

function clone<T>(value: T): T {
  return structuredClone(value);
}
