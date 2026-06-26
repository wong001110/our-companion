export type SignalSourceType = 'internet' | 'github' | 'rss' | 'youtube' | 'user' | 'local_file' | 'calendar' | 'companion' | 'community' | 'system';
export interface Signal {
    id: string;
    sourceType: SignalSourceType;
    provider?: string;
    title: string;
    summary?: string;
    url?: string;
    rawContent?: string;
    capturedAt: string;
    metadata?: Record<string, unknown>;
}
export interface CaptureSignalInput {
    sourceType: SignalSourceType;
    provider?: string;
    title: string;
    summary?: string;
    url?: string;
    rawContent?: string;
    metadata?: Record<string, unknown>;
}
export interface NormalizedSignal extends Signal {
    canonicalUrl?: string;
    normalizedTitle: string;
    qualityScore: number;
}
export type ExperienceType = 'internet_discovery' | 'user_conversation' | 'desktop_action' | 'reflection' | 'future_companion_visit' | 'future_cloud_sync';
export interface Experience {
    id: string;
    type: ExperienceType;
    signalIds?: string[];
    description: string;
    occurredAt: string;
    privacyLevel: 'private' | 'local' | 'shareable' | 'public';
}
export type CompanionDecisionAction = 'speak' | 'queue_for_later' | 'remember_only' | 'ignore' | 'perform_action' | 'stay_silent';
export interface CompanionDecision {
    id: string;
    action: CompanionDecisionAction;
    priority: 'low' | 'normal' | 'high';
    timing: 'now' | 'next_idle' | 'later';
    reason: string;
    createdAt: string;
}
export type AnnMood = 'neutral' | 'curious' | 'happy' | 'thinking' | 'focused' | 'tired' | 'concerned';
export type AnnIntent = 'idle' | 'present_discovery' | 'wait_response' | 'perform_task' | 'reflect' | 'return_home';
export interface CharacterState {
    mood: AnnMood;
    intent: AnnIntent;
    energy: number;
    currentAnimation?: string;
}
export type BehaviourState = 'idle' | 'observe' | 'present_discovery' | 'wait' | 'perform_task' | 'reflect' | 'return_home';
export type AnimationKey = 'idle' | 'curious' | 'thinking' | 'discovery_present' | 'task_start' | 'typing' | 'task_success' | 'task_failed' | 'return';
export interface AnimationRequest {
    id: string;
    characterId: string;
    animationKey: AnimationKey;
    interruptSafe: boolean;
    reason: string;
    createdAt: string;
}
export interface SpeechPayload {
    id: string;
    text: string;
    mood: AnnMood;
    actionLabel?: string;
    createdAt: string;
}
export interface DiscoveryPresentationCard {
    id: string;
    title: string;
    summary: string;
    source: string;
    actions: Array<'view' | 'save' | 'ignore' | 'add_to_journey'>;
}
export interface NotificationPayload {
    id: string;
    title: string;
    body: string;
    shouldNotify: boolean;
    reason: string;
    createdAt: string;
}
export interface PerformanceStep {
    animationKey: AnimationKey;
    label: string;
    durationMs: number;
}
export interface PerformanceScript {
    id: string;
    actionId: string;
    steps: PerformanceStep[];
    createdAt: string;
}
export type PermissionScope = 'browser' | 'files' | 'clipboard' | 'calendar' | 'automation';
export type PermissionDecision = 'granted' | 'denied' | 'ask';
export type ActionPermissionState = Record<PermissionScope, PermissionDecision>;
export type ActionExecutionState = 'idle' | 'planning' | 'await_permission' | 'executing' | 'performing' | 'completed' | 'failed';
export interface ActionStep {
    id: string;
    toolName: string;
    args: Record<string, unknown>;
    waitMs?: number;
    requiredScopes: PermissionScope[];
}
export interface ActionPlan {
    id: string;
    summary: string;
    steps: ActionStep[];
    source: 'rule' | 'llm';
    createdAt: string;
}
export type ActionRunResult = {
    status: 'completed';
    planId: string;
    performedSteps: number;
} | {
    status: 'blocked';
    planId: string;
    reason: string;
} | {
    status: 'await_permission';
    planId: string;
    requiredScopes: PermissionScope[];
} | {
    status: 'failed';
    planId: string;
    step?: number;
    errorMessage: string;
};
export interface BaseEvent {
    id: string;
    type: string;
    timestamp: string;
    source: string;
    correlationId?: string;
    causationId?: string;
    payload?: Record<string, unknown>;
}
export interface DiscoveryOrigin {
    type: 'internet' | 'user' | 'companion' | 'community' | 'local';
    provider?: string;
    displayName?: string;
}
export type DuplicateResult = {
    type: 'new';
} | {
    type: 'duplicate';
    existingDiscoveryId: string;
} | {
    type: 'revival_candidate';
    existingConceptId: string;
    reason: string;
};
export interface Concept {
    id: string;
    key: string;
    name: string;
    summary: string;
    topics: string[];
    entities: string[];
    relatedDiscoveryIds: string[];
    firstSeenAt: string;
    lastSeenAt: string;
    strength: number;
    status: 'active' | 'dormant' | 'archived';
}
export interface Insight {
    id: string;
    title: string;
    explanation: string;
    relatedConceptIds: string[];
    relatedPatternIds: string[];
    confidence: number;
    growthValue: number;
    createdAt: string;
    status: 'candidate' | 'accepted' | 'dismissed' | 'archived';
}
export interface CuriosityGap {
    id: string;
    conceptId?: string;
    journeyId?: string;
    description: string;
    priority: number;
    status: 'open' | 'exploring' | 'satisfied' | 'paused';
    createdAt: string;
}
export interface CuriosityGapMatch {
    gapId: string;
    strength: number;
    reason: string;
}
export interface CuriosityAssessment {
    id: string;
    targetId: string;
    targetType: 'discovery' | 'concept' | 'insight' | 'journey';
    growthValue: number;
    gapMatch?: CuriosityGapMatch;
    budgetCost: number;
    reason: string;
}
export interface CuriosityDebt {
    id: string;
    gapId: string;
    description: string;
    priority: number;
    createdAt: string;
    resolvedAt?: string;
}
export interface CuriosityInvestment {
    id: string;
    targetId: string;
    longTermValue: number;
    projectRelevance: number;
    knowledgeGap: number;
    userMomentum: number;
    novelty: number;
    diminishingReturns: number;
    score: number;
    updatedAt: string;
}
export interface CuriosityBudget {
    date: string;
    total: number;
    used: number;
    remaining: number;
    allocations: {
        discovery: number;
        journey: number;
        reflection: number;
        conversation: number;
    };
}
export interface CuriositySeason {
    id: string;
    name: string;
    relatedConceptIds: string[];
    startedAt: string;
    lastActiveAt: string;
    strength: number;
    status: 'active' | 'fading' | 'ended';
}
export interface AttentionAssessment {
    id: string;
    targetId: string;
    targetType: string;
    deservesAttention: boolean;
    attentionCost: number;
    attentionValue: number;
    reason: string;
}
export interface UserContext {
    mode: 'idle' | 'focused' | 'chatting' | 'working' | 'away';
    localTime: string;
    recentActions: string[];
    fatigueScore: number;
}
export interface CompanionContext {
    dailySharedCount: number;
    lastSpokenAt?: string;
    attentionBudgetRemaining: number;
    curiosityBudgetRemaining: number;
    trustScore: number;
}
export interface DecisionInput {
    eventType: string;
    targetId?: string;
    discovery?: import('../index').Discovery;
    insight?: Insight;
    curiosity?: CuriosityAssessment;
    attention?: AttentionAssessment;
    userContext: UserContext;
    companionContext: CompanionContext;
}
export interface DiscoveryUnderstanding {
    summary: string;
    concepts: string[];
    entities: string[];
    tags: string[];
    growth_value: number;
    confidence: number;
    reason: string;
}
export type KnowledgeStatus = 'active' | 'archived';
export interface MemoryReference {
    id: string;
    kind: 'concept' | 'insight' | 'journey' | 'experience' | 'discovery';
    title: string;
    summary?: string;
}
export interface Knowledge {
    id: string;
    title: string;
    summary: string;
    conceptIds: string[];
    insightIds: string[];
    journeyIds: string[];
    experienceIds: string[];
    references: MemoryReference[];
    confidence: number;
    strength: number;
    status: KnowledgeStatus;
    createdAt: string;
    updatedAt: string;
    archivedAt?: string;
    revivedAt?: string;
}
export type KnowledgeEdgeType = 'supports' | 'contradicts' | 'related_to' | 'derived_from';
export interface KnowledgeGraphNode {
    id: string;
    kind: MemoryReference['kind'] | 'knowledge';
    title: string;
}
export interface KnowledgeGraphEdge {
    id: string;
    fromId: string;
    toId: string;
    type: KnowledgeEdgeType;
    confidence: number;
}
export interface KnowledgeGraph {
    nodes: KnowledgeGraphNode[];
    edges: KnowledgeGraphEdge[];
}
export interface Reflection {
    id: string;
    title: string;
    summary: string;
    changedUnderstanding: string[];
    whyItMattered: string;
    relatedKnowledgeIds: string[];
    createdAt: string;
}
export interface PersonalityPreset {
    traits: Array<'curious' | 'calm' | 'playful' | 'analytical' | 'gentle' | string>;
    corePersonality?: string[];
    expertise?: string[];
    speakingStyle?: {
        tone: string;
        length: string;
        avoid: string[];
    };
}
export interface CharacterAsset {
    id: string;
    type: 'spritesheet' | 'spine' | 'live2d_reserved' | 'rive_reserved';
    path: string;
    version: string;
    checksum?: string;
    frameWidth?: number;
    frameHeight?: number;
}
export interface AssetManifest {
    assets: CharacterAsset[];
}
export interface AnimationManifest {
    mappings: Record<string, string>;
    required: string[];
}
export interface CharacterPackageMetadata {
    author?: string;
    description?: string;
    thumbnail?: string;
    tags?: string[];
}
export interface CharacterPackage {
    id: string;
    name: string;
    version: string;
    personalityPreset: PersonalityPreset;
    assetManifest: AssetManifest;
    animationManifest: AnimationManifest;
    metadata?: CharacterPackageMetadata;
    futureVoice?: Record<string, unknown>;
    futureTts?: Record<string, unknown>;
}
export interface ValidationIssue {
    severity: 'error' | 'warning';
    code: string;
    message: string;
}
export interface ValidationResult {
    valid: boolean;
    issues: ValidationIssue[];
}
export interface CharacterRuntimeDescriptor {
    packageId: string;
    characterId: string;
    displayName: string;
    defaultAnimation: string;
    animations: Record<string, string>;
    personalityPreset: PersonalityPreset;
}
export interface UserIdentity {
    id: string;
    displayName?: string;
    privacyScope: 'local' | 'device' | 'account';
}
export interface DeviceIdentity {
    id: string;
    userId: string;
    name: string;
    createdAt: string;
}
export interface CompanionIdentity {
    id: string;
    userId: string;
    characterPackageId: string;
    displayName: string;
    publicKey?: string;
    createdAt: string;
}
export interface TrustProfile {
    identityId: string;
    sourceReputation: number;
    sharedHistory: number;
    userPermission: boolean;
    confidence: number;
    freshness: number;
}
export type RelationshipStage = 'unknown' | 'met' | 'familiar' | 'trusted' | 'close';
export interface CompanionRelationship {
    id: string;
    fromCompanionId: string;
    toCompanionId: string;
    stage: RelationshipStage;
    affinity: number;
    successfulInteractions: number;
    updatedAt: string;
}
export interface KnowledgeExchangePackage {
    id: string;
    fromCompanionId: string;
    toCompanionId?: string;
    concepts: Concept[];
    insights: Insight[];
    journeySummaries: string[];
    privacyLevel: 'shareable' | 'public';
    createdAt: string;
}
export interface CompanionVisit {
    id: string;
    fromCompanionId: string;
    toCompanionId: string;
    state: 'invited' | 'permission_requested' | 'visiting' | 'exchanging' | 'summarized' | 'returned' | 'rejected';
    maxDurationMinutes: number;
    summary?: string;
    createdAt: string;
    updatedAt: string;
}
export type VersionVector = Record<string, number>;
export interface SyncEnvelope<TPayload = unknown> {
    id: string;
    ownerUserId: string;
    payload: TPayload;
    versionVector: VersionVector;
    encrypted: boolean;
    createdAt: string;
}
export interface SyncConflict<TPayload = unknown> {
    id: string;
    local: SyncEnvelope<TPayload>;
    remote: SyncEnvelope<TPayload>;
    reason: string;
    requiresReview: boolean;
}
