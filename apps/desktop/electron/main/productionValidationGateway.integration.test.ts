import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CompanionPersonality, Discovery } from '@our-companion/shared';
import {
  FakeAiProvider,
  FakeClock,
  FakeDiscoveryProvider,
  FakeRandomSource,
  FakeRendererGateway,
  FakeToolAdapters,
  FakeWebPageFetcher,
  FakeWebSearchProvider,
  SimulationEngine
} from '@our-companion/validation-kit';
import { ProductionValidationGateway } from './productionValidationGateway';

vi.mock('electron', () => ({
  app: { getPath: vi.fn(() => ':memory:') },
  dialog: {},
  shell: { openExternal: vi.fn(async () => undefined) }
}));

const openGateways: ProductionValidationGateway[] = [];
const reasonFixture = JSON.stringify({
  why_this_matters: 'This is connected to the user’s current technical interests.',
  recommended_action: 'view',
  short_message: 'I found a small technical signal that looks unusually relevant to what you are building.',
  card_title: 'Relevant technical signal',
  card_body: 'A focused reference connected to the current work.',
  tags: ['frontend']
});

afterEach(() => {
  for (const gateway of openGateways.splice(0)) gateway.close();
});

function createGateway(input: {
  provider?: FakeDiscoveryProvider;
  webSearchProvider?: FakeWebSearchProvider;
  webPageFetcher?: FakeWebPageFetcher;
  ai?: FakeAiProvider;
  renderer?: FakeRendererGateway;
} = {}): {
  gateway: ProductionValidationGateway;
  provider: FakeDiscoveryProvider;
  webSearchProvider?: FakeWebSearchProvider;
  webPageFetcher?: FakeWebPageFetcher;
  ai: FakeAiProvider;
  renderer: FakeRendererGateway;
} {
  const clock = new FakeClock('2026-07-17T10:00:00.000Z');
  const provider = input.provider ?? new FakeDiscoveryProvider();
  const ai = input.ai ?? new FakeAiProvider();
  const renderer = input.renderer ?? new FakeRendererGateway(clock);
  const gateway = new ProductionValidationGateway({
    clock,
    random: new FakeRandomSource([0.1, 0.3, 0.7]),
    discoveryProvider: provider,
    webSearchProvider: input.webSearchProvider,
    webPageFetcher: input.webPageFetcher,
    aiProvider: ai,
    toolAdapters: new FakeToolAdapters(),
    renderer
  });
  openGateways.push(gateway);
  return { gateway, provider, ai, renderer, webSearchProvider: input.webSearchProvider, webPageFetcher: input.webPageFetcher };
}

function highValueDiscovery(gateway: ProductionValidationGateway, id: string): Discovery {
  const companionId = gateway.services.db.resolveActiveCompanionId();
  return {
    id,
    companionId,
    source: 'github',
    title: 'High-value renderer lifecycle fixture',
    summary: 'A specific and useful technical result.',
    url: `https://example.com/${id}`,
    tags: ['frontend'],
    raw: {},
    userInterestScore: 0.95,
    userHistoryScore: 0.9,
    characterExpertiseScore: 0.9,
    noveltyScore: 0.95,
    usefulnessScore: 0.95,
    finalScore: 0.95,
    status: 'eligible',
    eligibleAt: '2026-07-17T10:00:00.000Z',
    createdAt: '2026-07-17T10:00:00.000Z',
    updatedAt: '2026-07-17T10:00:00.000Z'
  };
}

function webFixtures() {
  const url = 'https://evidence.example/local-first';
  return {
    webSearchProvider: new FakeWebSearchProvider([
      { id: 'web-result', title: 'Local-first implementation evidence', url, domain: 'evidence.example', rank: 1 }
    ]),
    webPageFetcher: new FakeWebPageFetcher({
      [url]: {
        canonicalUrl: url,
        title: 'Local-first implementation evidence',
        extractedText: 'Detailed public evidence for local-first TypeScript architecture.',
        excerpt: 'Detailed public evidence for local-first TypeScript architecture.',
        contentHash: 'fixture-content-hash',
        contentType: 'text/html'
      }
    })
  };
}

describe('production Validation Kit gateway', () => {
  it('treats an empty scheduled refresh as healthy and traces the empty result', async () => {
    const { gateway, provider, renderer } = createGateway({
      provider: new FakeDiscoveryProvider([[]])
    });
    const simulation = new SimulationEngine({
      gateway,
      emitEvent: () => {}
    });

    const result = await simulation.execute({
      category: 'discovery',
      params: { operation: 'scheduled-refresh' }
    });

    expect(result).toMatchObject({ success: true, status: 'empty' });
    expect(provider.calls).toHaveLength(0);
    expect(renderer.commands).toHaveLength(0);
    expect(gateway.services.db.listDiscoveries({ limit: 100 })).toEqual([]);
    expect(gateway.services.db.listCompanionInsights('default', 100)).toEqual([]);
    expect(gateway.getTraces()).toEqual(expect.arrayContaining([
      expect.objectContaining({
        operation: 'research-source:route',
        status: 'empty'
      }),
      expect.objectContaining({
        operation: 'collect-candidates',
        status: 'empty'
      })
    ]));
  });

  it('keeps unavailable research empty and remains healthy next cycle', async () => {
    const provider = new FakeDiscoveryProvider([new Error('provider unavailable')]);
    const { gateway, renderer } = createGateway({ provider });

    const first = await gateway.execute({
      category: 'discovery',
      params: { operation: 'scheduled-refresh' }
    });
    const second = await gateway.execute({
      category: 'discovery',
      params: { operation: 'scheduled-refresh' }
    });

    expect(first.status).toBe('empty');
    expect(second.status).toBe('empty');
    expect(provider.calls).toHaveLength(0);
    expect(renderer.commands).toHaveLength(0);
    expect(gateway.services.db.listDiscoveries({ limit: 100 })).toEqual([]);
    expect(gateway.getTraces()).toEqual(expect.arrayContaining([
      expect.objectContaining({
        operation: 'research-pass:stop',
        status: 'completed'
      })
    ]));
  });

  it('persists event-handler failures as causal engine traces', () => {
    const { gateway } = createGateway();
    gateway.services.eventBus.subscribe('ValidationHandlerFailure', () => {
      throw new Error('handler exploded');
    });
    gateway.services.eventBus.emit({
      id: 'event-handler-fixture',
      type: 'ValidationHandlerFailure',
      source: 'integration-test',
      timestamp: '2026-07-17T10:00:00.000Z',
      correlationId: 'correlation-handler-fixture'
    });

    expect(gateway.getTraces()).toContainEqual(expect.objectContaining({
      correlationId: 'correlation-handler-fixture',
      causationId: 'event-handler-fixture',
      engine: 'event-bus',
      operation: 'handle:ValidationHandlerFailure',
      status: 'failed',
      error: 'handler exploded'
    }));
  });

  it('runs conversation → one scoped UnitScore memory that cognitive engines consume', async () => {
    const ai = new FakeAiProvider(['I will keep that preference in mind.']);
    const provider = new FakeDiscoveryProvider([[]]);
    const { gateway } = createGateway({ ai, provider, ...webFixtures() });
    const companionId = gateway.services.db.resolveActiveCompanionId();

    await gateway.execute({
      category: 'memory',
      params: {
        operation: 'conversation-turn',
        message: 'I prefer concise TypeScript explanations with concrete examples.'
      }
    });
    const memories = gateway.services.db.listMemoryNodes(companionId);
    expect(memories).toHaveLength(1);
    expect(memories[0]).toEqual(expect.objectContaining({
      companionId,
      userId: 'local',
      importance: 0.85,
      memoryType: 'user_preference'
    }));

    const cycle = await gateway.execute({
      category: 'discovery',
      params: { operation: 'autonomous-cycle' }
    });
    expect(cycle.status).toBe('completed');
    expect(gateway.services.db.getInterestGraph('default').nodes.length).toBeGreaterThan(0);
    expect(gateway.getTraces().find((trace) => trace.operation === 'load-context')?.outputRefs)
      .toContain(memories[0]!.id);
  });

  it('runs one causally ordered autonomous cycle without duplicate final intent', async () => {
    const provider = new FakeDiscoveryProvider([[
      {
        id: 'provider-item-1',
        title: 'Typed local-first state machines',
        summary: 'A concrete approach to reliable local-first state transitions.',
        url: 'https://example.com/local-first-state',
        tags: ['frontend', 'local-first'],
        source: 'github'
      }
    ]]);
    const ai = new FakeAiProvider([
      'I will remember that.',
      reasonFixture
    ]);
    const { gateway, renderer } = createGateway({ provider, ai, ...webFixtures() });
    await gateway.execute({
      category: 'memory',
      params: {
        operation: 'conversation-turn',
        message: 'I prefer local-first TypeScript state machines for desktop products.'
      }
    });

    const result = await gateway.execute({
      category: 'discovery',
      params: { operation: 'autonomous-cycle' }
    });
    const traces = gateway.getTraces().filter((trace) => trace.correlationId === result.correlationId);
    const operations = traces.map((trace) => trace.operation);

    expect(result.status).toBe('completed');
    expect(operations).toEqual(expect.arrayContaining([
      'load-context',
      'detect',
      'build-interest-graph',
      'generate-targets',
      'research-intent:create',
      'research-plan:create',
      'research-source:route',
      'web-search:validation-web-search',
      'web-page:fetch',
      'collect-candidates',
      'generate',
      'evaluate',
      'enqueue'
    ]));
    expect(new Set(traces.map((trace) => trace.id)).size).toBe(traces.length);
    expect(traces.slice(1).every((trace, index) => trace.causationId === traces[index]!.id)).toBe(true);
    expect(gateway.services.db.listExplorationCycles(10)).toHaveLength(1);
    expect(gateway.services.db.listCompanionInsights('default', 10)).toHaveLength(1);
    expect(gateway.services.db.listDiscoveries({ limit: 10 })).toHaveLength(1);
    expect(renderer.commands.length).toBeLessThanOrEqual(1);
  });

  it('collects structured connector candidates without a Brave key or an unavailable-capability stop', async () => {
    const provider = new FakeDiscoveryProvider([[
      {
        id: 'structured-only-item',
        title: 'Typed local-first state machines',
        summary: 'A concrete approach to reliable local-first state transitions.',
        url: 'https://example.com/structured-only-state',
        tags: ['frontend', 'local-first'],
        source: 'github'
      }
    ]]);
    const ai = new FakeAiProvider(['I will remember that.', reasonFixture]);
    const { gateway } = createGateway({ provider, ai });
    const companionId = gateway.services.db.resolveActiveCompanionId();

    await gateway.execute({
      category: 'memory',
      params: {
        operation: 'conversation-turn',
        message: 'I prefer local-first TypeScript state machines for desktop products.'
      }
    });
    const result = await gateway.execute({ category: 'discovery', params: { operation: 'autonomous-cycle' } });
    const traces = gateway.getTraces().filter((trace) => trace.correlationId === result.correlationId);

    expect(result.status).toBe('completed');
    expect(provider.calls).toHaveLength(1);
    expect(gateway.services.db.listResearchSearchRecords({ companionId })).toEqual([]);
    expect(gateway.services.db.listWebPageEvidence({ companionId })).toEqual([]);
    expect(gateway.services.db.listDiscoveryCandidates('default', 20, companionId)).toHaveLength(1);
    expect(traces).toEqual(expect.arrayContaining([
      expect.objectContaining({ operation: 'research-source:route', status: 'completed' }),
      expect.objectContaining({ operation: 'research-pass:stop', skipReason: 'structured_research_completed' })
    ]));
  });

  it('defers exactly once in focus mode and emits at most one command after focus ends', async () => {
    const provider = new FakeDiscoveryProvider([[
      {
        id: 'focus-item',
        title: 'High-confidence frontend state architecture',
        summary: 'A highly relevant state architecture reference.',
        url: 'https://example.com/focus-item',
        tags: ['frontend', 'ux', 'local-first'],
        source: 'github'
      }
    ]]);
    const ai = new FakeAiProvider([reasonFixture]);
    const { gateway, renderer } = createGateway({ provider, ai, ...webFixtures() });

    await gateway.execute({
      category: 'runtime',
      params: { operation: 'focus-mode', enabled: true }
    });
    await gateway.execute({
      category: 'discovery',
      params: { operation: 'scheduled-refresh' }
    });

    const companionId = gateway.services.db.resolveActiveCompanionId();
    expect(gateway.services.db.listPendingActions(companionId, 'local').length).toBeLessThanOrEqual(1);
    expect(renderer.commands).toHaveLength(0);

    await gateway.execute({
      category: 'runtime',
      params: { operation: 'focus-mode', enabled: false }
    });
    expect(renderer.commands.length).toBeLessThanOrEqual(1);
    expect(gateway.services.db.listPendingActions(companionId, 'local').length).toBeLessThanOrEqual(1);
  });

  it('does not announce an interrupted presentation or dispatch it twice', async () => {
    const renderer = new FakeRendererGateway(
      new FakeClock('2026-07-17T10:00:00.000Z')
    );
    renderer.enqueueAcknowledgement('cancelled', 'user_dragging');
    const ai = new FakeAiProvider([reasonFixture]);
    const { gateway } = createGateway({ renderer, ai });
    const discovery = highValueDiscovery(gateway, 'interrupted-discovery');
    gateway.services.db.insertDiscovery(discovery);

    gateway.services.requestDiscoveryPresentation(discovery);
    await gateway.execute({
      category: 'runtime',
      params: { operation: 'execute' }
    });

    expect(renderer.commands).toHaveLength(1);
    expect(gateway.services.db.getDiscovery(discovery.id)).toEqual(expect.objectContaining({
      status: 'eligible',
      announcedAt: undefined,
      statusReason: 'user_dragging'
    }));
    expect(gateway.services.db.countAnnouncedToday(discovery.companionId)).toBe(0);
  });

  it('applies saved feedback once and preserves Companion isolation on switch', async () => {
    const provider = new FakeDiscoveryProvider([[
      {
        id: 'feedback-item',
        title: 'Local-first feedback loops',
        summary: 'A feedback-loop implementation reference.',
        url: 'https://example.com/feedback-loop',
        tags: ['frontend', 'local-first'],
        source: 'github'
      }
    ]]);
    const ai = new FakeAiProvider([
      'I will remember that preference.',
      reasonFixture
    ]);
    const { gateway } = createGateway({ provider, ai });
    const firstCompanionId = gateway.services.db.resolveActiveCompanionId();
    await gateway.execute({
      category: 'memory',
      params: {
        operation: 'conversation-turn',
        message: 'I prefer local-first feedback loops in TypeScript.'
      }
    });
    await gateway.execute({
      category: 'discovery',
      params: { operation: 'autonomous-cycle' }
    });
    const cycle = gateway.services.db.listExplorationCycles(1)[0]!;
    const insightId = cycle.selectedInsightId!;
    const before = {
      memories: gateway.services.db.listMemoryNodes(firstCompanionId).length,
      milestones: gateway.services.db.listMilestones().length,
      feedback: gateway.services.db.listDiscoveryFeedback(100).length,
      trust: gateway.services.db.getRelationship('local', firstCompanionId).trust
    };

    await gateway.services.autonomy.submitFeedback({
      cycleId: cycle.id,
      insightId,
      value: 'saved',
      note: 'local-first'
    });
    await gateway.services.autonomy.submitFeedback({
      cycleId: cycle.id,
      insightId,
      value: 'saved',
      note: 'local-first'
    });

    expect(gateway.services.db.listMemoryNodes(firstCompanionId)).toHaveLength(before.memories + 1);
    expect(gateway.services.db.listMilestones()).toHaveLength(before.milestones + 1);
    expect(gateway.services.db.listDiscoveryFeedback(100)).toHaveLength(before.feedback + 1);
    expect(gateway.services.db.getRelationship('local', firstCompanionId).trust)
      .toBeCloseTo(before.trust + 0.0025);

    const personality: CompanionPersonality = {
      energy: 50,
      curiosity: 50,
      sociability: 50,
      diligence: 50,
      playfulness: 50,
      confidence: 50,
      calmness: 50,
      shyness: 50
    };
    const second = gateway.services.db.createCompanion({
      name: 'Second Validation Companion',
      personalityDescription: 'Isolation fixture.',
      personalityAnalysisId: 'isolation-fixture',
      personality,
      assetRoot: 'companion://second/assets'
    });
    await gateway.services.character.setPrimary(second.id);

    expect(gateway.services.db.listMemoryNodes(second.id)).toEqual([]);
    expect(gateway.services.db.listPendingActions(second.id, 'local')).toEqual([]);
    expect(gateway.services.db.getRelationship('local', second.id).trust).toBe(0.1);
    expect(gateway.services.db.getCharacterState(second.id).characterId).toBe(second.id);
    expect(gateway.services.db.getExplorationCycle(cycle.id)?.companionId).toBe(firstCompanionId);
  });
});
