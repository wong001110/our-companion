import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { EngineTrace } from '@our-companion/shared';
import { EngineTraceTimeline } from './EngineObservatory';

function trace(overrides: Partial<EngineTrace> = {}): EngineTrace {
  return {
    id: 'trace-1',
    correlationId: 'corr-1',
    companionId: 'companion-1',
    engine: 'Discovery',
    operation: 'provider-search',
    providerMode: 'fixture',
    inputRefs: ['plan:one'],
    outputRefs: [],
    startedAt: '2026-07-17T00:00:00.000Z',
    completedAt: '2026-07-17T00:00:00.022Z',
    durationMs: 22,
    status: 'empty',
    skipReason: 'provider_returned_zero',
    ...overrides,
  };
}

describe('EngineTraceTimeline', () => {
  it('renders every trace field and the canonical empty result message', () => {
    const markup = renderToStaticMarkup(createElement(EngineTraceTimeline, {
      traces: [trace()],
    }));

    for (const heading of [
      'Engine',
      'Operation',
      'Status',
      'Provider mode',
      'Input refs',
      'Output refs',
      'Duration',
      'Skip reason',
      'Error',
      'Correlation ID',
    ]) {
      expect(markup).toContain(`>${heading}<`);
    }
    expect(markup).toContain('No valid discoveries found');
    expect(markup).toContain('provider-search');
    expect(markup).toContain('fixture');
    expect(markup).toContain('plan:one');
    expect(markup).toContain('22 ms');
    expect(markup).toContain('provider_returned_zero');
    expect(markup).toContain('corr-1');
  });

  it('renders failures separately from normal empty results', () => {
    const markup = renderToStaticMarkup(createElement(EngineTraceTimeline, {
      traces: [trace({
        id: 'trace-failed',
        status: 'failed',
        error: 'provider unavailable',
      })],
    }));

    expect(markup).toContain('>failed<');
    expect(markup).toContain('provider unavailable');
    expect(markup).not.toContain('No valid discoveries found');
  });
});
