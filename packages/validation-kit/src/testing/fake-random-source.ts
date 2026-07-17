import type { RandomSource } from '../production-runtime';

export class FakeRandomSource implements RandomSource {
  private index = 0;

  constructor(private readonly values: number[] = [0]) {
    if (values.length === 0 || values.some((value) => !Number.isFinite(value) || value < 0 || value >= 1)) {
      throw new Error('FakeRandomSource values must be finite numbers in the range [0, 1).');
    }
  }

  next(): number {
    const value = this.values[this.index % this.values.length]!;
    this.index += 1;
    return value;
  }

  reset(): void {
    this.index = 0;
  }
}
