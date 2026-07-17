import type {
  AiProvider,
  Clock,
  DiscoveryProvider,
  ProductionRuntimeCommand,
  ProductionRuntimeExecution,
  ProductionRuntimeGateway,
  RandomSource,
  RendererGateway,
  ToolAdapters as ValidationToolAdapters
} from '@our-companion/validation-kit';
import type {
  CompanionCommand,
  CompanionCommandAck,
  CompanionPersonality,
  DiscoverySource,
  EngineTrace
} from '@our-companion/shared';
import { DOMAIN_EVENT_TYPES } from '@our-companion/shared';
import type { DiscoveryConnector } from '@our-companion/discovery-engine';
import { InProcessEventBus } from '@our-companion/event-bus';
import { DiscoveryScheduler } from './discoveryScheduler';
import { DiscoveryShareOrchestrator } from './discoveryShareOrchestrator';
import { AppServices } from './services';

const DISCOVERY_SOURCES = new Set<DiscoverySource>([
  'internet',
  'github',
  'rss',
  'youtube',
  'reddit',
  'hackernews',
  'user',
  'local_file',
  'calendar',
  'companion',
  'community',
  'system'
]);

export interface ProductionValidationDependencies {
  clock: Clock;
  random: RandomSource;
  discoveryProvider: DiscoveryProvider;
  aiProvider: AiProvider;
  toolAdapters: ValidationToolAdapters;
  renderer: RendererGateway;
}

/**
 * Application-layer validation adapter. It owns the same AppServices,
 * CompanionRuntime, lifecycle orchestrator, scheduler, and SQLite adapters used
 * by the desktop app, with only external boundaries replaced by deterministic
 * ports.
 */
export class ProductionValidationGateway implements ProductionRuntimeGateway {
  readonly services: AppServices;
  private readonly rendererTasks = new Set<Promise<void>>();
  private readonly orchestrator: DiscoveryShareOrchestrator;

  constructor(private readonly dependencies: ProductionValidationDependencies) {
    const eventBus = new InProcessEventBus();
    this.services = new AppServices(':memory:', eventBus, {
      now: () => new Date(dependencies.clock.now()),
      random: () => dependencies.random.next(),
      setTimer: (callback, delayMs) => dependencies.clock.setTimeout(callback, delayMs),
      clearTimer: (handle) => dependencies.clock.clearTimeout(handle),
      discoveryConnectors: [toDiscoveryConnector(dependencies.discoveryProvider)],
      aiProvider: dependencies.aiProvider,
      toolAdapters: dependencies.toolAdapters
    });
    bootstrapCompanion(this.services);

    this.orchestrator = new DiscoveryShareOrchestrator({
      performance: {
        begin: (companionId) => {
          this.services.runtime.beginDiscoveryPresentation(companionId);
        },
        settle: (companionId) => {
          this.services.runtime.settleDiscoveryPresentation(companionId);
        }
      },
      generateReason: (discovery) => this.services.ai.generateDiscoveryReason({ discovery }),
      markPresenting: (id, commandId) => {
        this.services.db.transitionDiscoveryStatus(id, 'presenting', { commandId });
      },
      markAnnounced: (id, commandId) => {
        this.services.db.transitionDiscoveryStatus(id, 'announced', { commandId });
      },
      markDeferred: (id, reason) => {
        this.services.db.transitionDiscoveryStatus(id, 'eligible', { reason });
      },
      canAnnounce: () => this.services.canAnnounceDiscovery(),
      shouldInterruptShare: () => this.services.shouldInterruptShare(),
      eventBus,
      now: () => dependencies.clock.nowIso()
    });
    this.services.attachShareOrchestrator(this.orchestrator);
    this.services.attachAutonomyBroadcasters({
      explorationEvent: () => {},
      command: (command) => {
        const task = Promise.resolve().then(() => this.dispatchRendererCommand(command));
        this.rendererTasks.add(task);
        void task.finally(() => this.rendererTasks.delete(task));
      }
    });
  }

  async execute(command: ProductionRuntimeCommand): Promise<ProductionRuntimeExecution> {
    const startedAt = this.dependencies.clock.nowIso();
    const traceIdsBefore = new Set(this.services.db.listEngineTraces({ limit: 10_000 }).map((trace) => trace.id));
    try {
      const outcome = await this.executeProductionOperation(command);
      await this.flushRenderer();
      const traces = this.services.db
        .listEngineTraces({ limit: 10_000 })
        .filter((trace) => !traceIdsBefore.has(trace.id));
      return {
        operation: outcome.operation,
        status: outcome.status,
        description: outcome.description,
        correlationId: traces[0]?.correlationId,
        traceIds: traces.map((trace) => trace.id),
        inputRefs: unique(traces.flatMap((trace) => trace.inputRefs)),
        outputRefs: unique(traces.flatMap((trace) => trace.outputRefs)),
        state: await this.getState(),
        startedAt,
        completedAt: this.dependencies.clock.nowIso(),
        error: outcome.error
      };
    } catch (error) {
      const traces = this.services.db
        .listEngineTraces({ limit: 10_000 })
        .filter((trace) => !traceIdsBefore.has(trace.id));
      return {
        operation: `${command.category}:${String(command.params.operation ?? 'execute')}`,
        status: 'failed',
        traceIds: traces.map((trace) => trace.id),
        correlationId: traces[0]?.correlationId,
        inputRefs: unique(traces.flatMap((trace) => trace.inputRefs)),
        outputRefs: unique(traces.flatMap((trace) => trace.outputRefs)),
        state: await this.getState(),
        startedAt,
        completedAt: this.dependencies.clock.nowIso(),
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  async getState(): Promise<Record<string, unknown>> {
    const companionId = this.services.db.resolveActiveCompanionId();
    const discoveries = this.services.db.listDiscoveries({ limit: 10_000 });
    return {
      companionId,
      memoryCount: this.services.db.listMemoryNodes(companionId).length,
      patternCount: this.services.db.listPatterns('default', 10_000).length,
      discoveryCount: discoveries.length,
      eligibleCount: discoveries.filter((item) => item.status === 'eligible').length,
      queuedCount: discoveries.filter((item) => item.status === 'queued').length,
      presentingCount: discoveries.filter((item) => item.status === 'presenting').length,
      announcedCount: discoveries.filter((item) => item.status === 'announced').length,
      insightCount: this.services.db.listCompanionInsights('default', 10_000).length,
      cycleCount: this.services.db.listExplorationCycles(10_000).length,
      pendingActionCount: this.services.db.listPendingActions(companionId, 'local').length,
      journeyCount: this.services.db.listActiveJourneys().length,
      milestoneCount: this.services.db.listMilestones().length,
      feedbackCount: this.services.db.listDiscoveryFeedback(10_000).length,
      relationship: this.services.db.getRelationship('local', companionId),
      characterState: this.services.db.getCharacterState(companionId),
      activeCommand: await this.services.companion.getActiveCommand(),
      traceCount: this.services.db.listEngineTraces({ limit: 10_000 }).length
    };
  }

  getTraces(): EngineTrace[] {
    return this.services.db.listEngineTraces({ limit: 10_000 });
  }

  close(): void {
    this.orchestrator.stop();
    this.services.db.close();
  }

  private async executeProductionOperation(command: ProductionRuntimeCommand): Promise<{
    operation: string;
    status: ProductionRuntimeExecution['status'];
    description: string;
    error?: string;
  }> {
    const operation = String(command.params.operation ?? defaultOperation(command.category));
    if (command.category === 'discovery' && operation === 'scheduled-refresh') {
      const scheduler = new DiscoveryScheduler({
        refresh: () => this.services.runDiscoveryRefresh(),
        getDiscoveryScore: () => this.services.getEffectiveDiscoveryScore(),
        countAnnouncedToday: () => this.services.db.countAnnouncedToday(),
        getOldestQueuedDiscovery: () => Promise.resolve(this.services.db.getOldestQueuedDiscovery()),
        presentationGateway: {
          isBusy: () => this.services.isDiscoveryPresentationBusy(),
          hasPending: () => this.services.hasPendingDiscoveryPresentation(),
          requestPresentation: (discovery) => {
            this.services.requestDiscoveryPresentation(discovery);
          }
        }
      });
      const result = await scheduler.runOnce();
      return {
        operation,
        status: result.status,
        description: result.reason ?? 'Scheduled refresh completed safely.',
        error: result.error
      };
    }
    if (command.category === 'discovery' && operation === 'autonomous-cycle') {
      const result = await this.services.autonomy.startExploration({
        userId: stringParam(command, 'userId') ?? 'default',
        trigger: 'manual'
      });
      return {
        operation,
        status: result.discoveryCandidates.length === 0 ? 'empty' : 'completed',
        description: `Autonomous cycle produced ${result.discoveryCandidates.length} candidate(s).`
      };
    }
    if (command.category === 'memory' && operation === 'conversation-turn') {
      await this.services.companion.turn({
        characterId: this.services.db.resolveActiveCompanionId(),
        message: stringParam(command, 'message') ?? 'I prefer concise technical explanations.',
        source: 'companion_text'
      });
      return {
        operation,
        status: 'completed',
        description: 'Conversation turn ran through production memory extraction.'
      };
    }
    if (command.category === 'runtime' && operation === 'focus-mode') {
      await this.services.companion.setAttentionMode(
        booleanParam(command, 'enabled') === false ? 'available' : 'focused'
      );
      return {
        operation,
        status: 'completed',
        description: 'Production attention mode updated.'
      };
    }
    if (command.category === 'context' && operation === 'presentation-interruption') {
      await this.services.companion.reportDragging({ dragging: true });
      return {
        operation,
        status: 'completed',
        description: 'Production presentation interruption signal applied.'
      };
    }
    if (command.category === 'journey' && operation === 'create') {
      const journey = await this.services.journey.create({
        title: stringParam(command, 'title') ?? 'Validation journey',
        description: stringParam(command, 'description')
      });
      return {
        operation,
        status: 'completed',
        description: `Created journey ${journey.id}.`
      };
    }
    return {
      operation,
      status: 'skipped',
      description: `No production command is registered for ${command.category}:${operation}.`
    };
  }

  private async dispatchRendererCommand(command: CompanionCommand): Promise<void> {
    await Promise.resolve();
    await this.services.companion.reportCommandAck(toAck(command, 'received', this.dependencies.clock.nowIso()));
    await this.services.companion.reportCommandAck(toAck(command, 'started', this.dependencies.clock.nowIso()));
    await Promise.resolve();
    const acknowledgement = await this.dependencies.renderer.dispatch({
      id: command.id,
      companionId: command.companionId,
      kind: 'companion-command',
      payload: {
        discoveryId: command.discoveryId,
        decisionId: command.decision.id,
        displayHint: command.decision.displayHint
      }
    });
    if (acknowledgement.status === 'received' || acknowledgement.status === 'started') return;
    await this.services.companion.reportCommandAck({
      commandId: command.id,
      companionId: command.companionId,
      status: acknowledgement.status,
      reportedAt: acknowledgement.reportedAt,
      reason: acknowledgement.reason
    });
  }

  private async flushRenderer(): Promise<void> {
    while (this.rendererTasks.size > 0) {
      await Promise.all([...this.rendererTasks]);
    }
  }
}

function toDiscoveryConnector(provider: DiscoveryProvider): DiscoveryConnector {
  return {
    source: 'github',
    providerMode: provider.mode,
    fetch: async (input) => (await provider.search(input)).map((item) => ({ ...item })),
    normalize: (item) => {
      const sourceValue = typeof item.source === 'string' ? item.source : 'github';
      const source = DISCOVERY_SOURCES.has(sourceValue as DiscoverySource)
        ? sourceValue as DiscoverySource
        : 'internet';
      return {
        source,
        externalId: String(item.id ?? item.title),
        title: String(item.title),
        summary: item.summary ? String(item.summary) : undefined,
        url: item.url ? String(item.url) : undefined,
        tags: Array.isArray(item.tags) ? item.tags.map(String) : [source],
        raw: item.raw ?? item
      };
    }
  };
}

function bootstrapCompanion(services: AppServices): void {
  const personality: CompanionPersonality = {
    energy: 50,
    curiosity: 70,
    sociability: 50,
    diligence: 70,
    playfulness: 50,
    confidence: 60,
    calmness: 70,
    shyness: 30
  };
  const companion = services.db.createCompanion({
    name: 'Validation Companion',
    personalityDescription: 'Deterministic production validation Companion.',
    personalityAnalysisId: 'validation-fixture',
    personality,
    assetRoot: 'companion://validation/assets'
  });
  services.db.setPrimaryCompanion(companion.id);
}

function toAck(
  command: CompanionCommand,
  status: CompanionCommandAck['status'],
  reportedAt: string
): CompanionCommandAck {
  return {
    commandId: command.id,
    companionId: command.companionId,
    status,
    reportedAt
  };
}

function defaultOperation(category: ProductionRuntimeCommand['category']): string {
  if (category === 'discovery') return 'scheduled-refresh';
  if (category === 'memory') return 'conversation-turn';
  return 'execute';
}

function stringParam(command: ProductionRuntimeCommand, key: string): string | undefined {
  const value = command.params[key];
  return typeof value === 'string' ? value : undefined;
}

function booleanParam(command: ProductionRuntimeCommand, key: string): boolean | undefined {
  const value = command.params[key];
  return typeof value === 'boolean' ? value : undefined;
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}
