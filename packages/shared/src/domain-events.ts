export const DOMAIN_EVENT_TYPES = {
  CharacterStateChanged: 'CharacterStateChanged',
  CharacterEmotionChanged: 'CharacterEmotionChanged',
  DiscoveryReadyToShare: 'DiscoveryReadyToShare',
  DiscoveryAnnounced: 'DiscoveryAnnounced',
  AnnMessageQueued: 'AnnMessageQueued',
  MemoryCreated: 'MemoryCreated',
  JourneyUpdated: 'JourneyUpdated',
  ActionPlanCreated: 'ActionPlanCreated',
  ActionExecuted: 'ActionExecuted',
  FoundationEventLogged: 'FoundationEventLogged',
  PerformanceStarted: 'PerformanceStarted',
  ExperienceCaptured: 'ExperienceCaptured',
} as const;

export type DomainEventType = (typeof DOMAIN_EVENT_TYPES)[keyof typeof DOMAIN_EVENT_TYPES];

export interface CharacterStateChangedPayload {
  characterId: string;
  coreState: string;
  intent: string;
}

export interface CharacterEmotionChangedPayload {
  characterId: string;
  reason: string;
}

export interface DiscoveryReadyToSharePayload {
  discoveryId: string;
  source: string;
}

export interface DiscoveryAnnouncedPayload {
  discoveryId: string;
  title: string;
  message: string;
}

export interface AnnMessageQueuedPayload {
  characterId?: string;
  source?: string;
  message?: string;
  status?: string;
  discoveryId?: string;
  cycleId?: string;
}

export interface MemoryCreatedPayload {
  memoryId: string;
  title: string;
}

export interface JourneyUpdatedPayload {
  journeyId: string;
  milestoneId?: string;
}

export interface ActionPlanCreatedPayload {
  planId: string;
  summary: string;
}

export interface ActionExecutedPayload {
  planId?: string;
  actionId?: string;
  status: string;
}

export interface FoundationEventLoggedPayload {
  event: {
    id: string;
    type: string;
    timestamp: string;
    source: string;
    payload?: Record<string, unknown>;
  };
}

export interface PerformanceStartedPayload {
  script: unknown;
}

export interface ExperienceCapturedPayload {
  experienceId: string;
  type: string;
  source: string;
  summary: string;
}

export type DomainEventPayloadMap = {
  CharacterStateChanged: CharacterStateChangedPayload;
  CharacterEmotionChanged: CharacterEmotionChangedPayload;
  DiscoveryReadyToShare: DiscoveryReadyToSharePayload;
  DiscoveryAnnounced: DiscoveryAnnouncedPayload;
  AnnMessageQueued: AnnMessageQueuedPayload;
  MemoryCreated: MemoryCreatedPayload;
  JourneyUpdated: JourneyUpdatedPayload;
  ActionPlanCreated: ActionPlanCreatedPayload;
  ActionExecuted: ActionExecutedPayload;
  FoundationEventLogged: FoundationEventLoggedPayload;
  PerformanceStarted: PerformanceStartedPayload;
  ExperienceCaptured: ExperienceCapturedPayload;
};
