import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { EngineSnapshot, EngineTrace } from '@our-companion/shared';
import { AvailableActionsPanel, EngineTraceTimeline, ResearchObservatory } from './EngineObservatory';

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

describe('ResearchObservatory', () => {
  it('renders live capability status, provenance domains, and a normal empty evidence state', () => {
    const base = {
      researchIntent: {
        id: 'intent', userId: 'user', companionId: 'companion', cycleId: 'cycle', curiosityTargetId: 'target', topic: 'Local-first AI',
        objective: 'find_implementation_examples', preferredSourceTypes: ['official', 'code'], evidenceRequirements: { minimumSources: 1 }, createdAt: 'now'
      },
      researchPlan: {
        id: 'plan', userId: 'user', companionId: 'companion', cycleId: 'cycle', researchIntentId: 'intent', queries: ['local-first AI'],
        selectedCapabilities: ['brave-search'], limits: { maxQueries: 3, maxSearchResultsPerQuery: 10, maxPagesToRead: 5, maxLinkDepth: 1, maxTotalCharacters: 250000, timeoutMs: 10000 }, createdAt: 'now'
      },
      researchEvidence: [], researchCapabilities: [{ id: 'brave-search', sourceTypes: ['open_web'], mode: 'unavailable', available: false }],
      researchCoverage: { sourceCount: 0, independentDomainCount: 0, hasPrimarySource: false, hasContrastingSource: false, requirementsSatisfied: false, missing: ['minimum_sources'] },
      researchStopReason: 'no_valid_external_evidence', engineTraces: [trace()]
    } as unknown as EngineSnapshot;
    const markup = renderToStaticMarkup(createElement(ResearchObservatory, { snapshot: base }));
    expect(markup).toContain('brave-search: unavailable');
    expect(markup).toContain('No valid external evidence found.');
    expect(markup).toContain('no_valid_external_evidence');
  });
});

describe('AvailableActionsPanel', () => {
  it('renders the registry-backed tools, permissions, examples, and exact AI summary', () => {
    const markup = renderToStaticMarkup(createElement(AvailableActionsPanel));
    expect(markup).toContain('Available Actions');
    expect(markup).toContain('open_url');
    expect(markup).toContain('browser');
    expect(markup).toContain('open youtube.com');
    expect(markup).toContain('Allowed arguments: url:string (required)');
    expect(markup).toContain('Unavailable capabilities: none');
  });
});
