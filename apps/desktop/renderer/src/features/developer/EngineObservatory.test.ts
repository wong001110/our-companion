import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { EngineSnapshot, EngineTrace } from '@our-companion/shared';
import {
  AvailableActionsPanel,
  DiscoveryInspector,
  EngineTraceTimeline,
  ResearchObservatory,
  TurnInspector,
} from './EngineObservatory';

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

describe('TurnInspector', () => {
  it('renders bounded Memory selection, action validation, permission, execution, and Memory outcomes', () => {
    const snapshot = {
      turnInspections: [{
        turnId: 'turn-1',
        companionId: 'ann',
        inputSource: 'panel_text',
        inputSummary: 'open YouTube',
        memoryItemsSelected: [{ memoryId: 'memory-1', category: 'preference', selectedBecause: 'user_preference' }],
        memoryBudget: { itemCount: 1, characterCount: 18, maxItems: 18, maxCharacters: 4_800 },
        deterministicActionMatch: 'open_url',
        validatedActions: [{ toolName: 'open_url', args: { url: 'youtube.com' }, reason: 'rule' }],
        rejectedActions: [],
        permissionState: 'granted',
        executionResult: 'executed',
        memoryCandidates: [{ type: 'user_preference', summary: 'local-first', evidence: 'I prefer local-first', confidence: 0.9 }],
        memoryOutcomes: [{ memoryId: 'memory-2', summary: 'local-first', outcome: 'created' }],
        finalReplySource: 'deterministic_action_result',
        createdAt: '2026-07-18T00:00:00.000Z',
      }],
    } as unknown as EngineSnapshot;
    const markup = renderToStaticMarkup(createElement(TurnInspector, { snapshot }));
    expect(markup).toContain('Turn Inspector');
    expect(markup).toContain('preference:memory-1');
    expect(markup).toContain('1/18 items');
    expect(markup).toContain('open_url');
    expect(markup).toContain('granted');
    expect(markup).toContain('executed');
    expect(markup).toContain('created:local-first');
    expect(markup).toContain('deterministic_action_result');
  });
});

describe('DiscoveryInspector', () => {
  it('renders intent, capabilities, bounded context, dedup layers, material updates, and saturation', () => {
    const snapshot = {
      discoveryInspection: {
        cycleId: 'cycle-1',
        companionId: 'ann',
        mode: 'wildcard',
        intentQuestion: 'What surprising connection could help?',
        expectedValue: 'A useful new connection',
        freshness: 'any',
        trustRequirement: 'open',
        languages: ['en'],
        regions: [],
        contextCount: 32,
        connectorCapabilities: [{ id: 'brave-search', mode: 'live', available: true }],
        selectedBases: [{ id: 'base-1', connectorId: 'rss', state: 'trial', locator: 'https://example.test/feed' }],
        candidatesAccepted: ['candidate-1'],
        candidatesRejected: [{ candidateId: 'candidate-2', reason: 'content_hash_already_seen' }],
        dedupHits: { content_hash: 1 },
        duplicateCount: 1,
        revivalCount: 0,
        materialUpdateCount: 1,
        newCount: 1,
        saturationPenalty: 0.6,
        createdAt: '2026-07-18T00:00:00.000Z',
      },
    } as unknown as EngineSnapshot;
    const markup = renderToStaticMarkup(createElement(DiscoveryInspector, { snapshot }));
    expect(markup).toContain('wildcard');
    expect(markup).toContain('What surprising connection');
    expect(markup).toContain('32/40 summaries');
    expect(markup).toContain('brave-search:live');
    expect(markup).toContain('rss:trial');
    expect(markup).toContain('content_hash:1');
    expect(markup).toContain('material update 1');
    expect(markup).toContain('0.60');
  });
});
