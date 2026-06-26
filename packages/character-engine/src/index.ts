import type {
  AnimationKey,
  AnimationRequest,
  AnnMood,
  BehaviourState,
  CharacterPackage,
  CharacterRuntimeState,
  CharacterRuntimeDescriptor,
  CharacterState,
  CompanionDecision,
  CoreState,
  EmotionName,
  EmotionState,
  Intent,
  NormalizedDiscovery,
  PerformanceScript,
  ValidationResult
} from '@our-companion/shared';
import { DEFAULT_CHARACTER_ID, createId, nowIso } from '@our-companion/shared';

export const neutralEmotion: EmotionState = {
  neutral: 70,
  curious: 35,
  happy: 20,
  excited: 0,
  shy: 45,
  confused: 0,
  focused: 50,
  tired: 10,
  proud: 0,
  concerned: 0
};

export const requiredCreatorAnimations = [
  'idle',
  'walk',
  'run',
  'thinking',
  'talk',
  'present_discovery',
  'task_start',
  'task_success',
  'task_failed',
  'return',
  'sleep'
];

export const defaultAnnPackage: CharacterPackage = {
  id: 'ann',
  name: 'Ann',
  version: '1.0.0',
  personalityPreset: {
    traits: ['curious', 'calm', 'gentle', 'analytical'],
    corePersonality: ['introverted', 'curious', 'warm', 'observant'],
    expertise: ['web', 'frontend', 'ux'],
    speakingStyle: {
      tone: 'warm',
      length: 'short',
      avoid: ['romantic', 'clingy', 'preachy']
    }
  },
  assetManifest: {
    assets: [
      {
        id: 'ann-spritesheets',
        type: 'spritesheet',
        path: 'assets/characters/ann/animations',
        version: '1.0.0',
        frameWidth: 300,
        frameHeight: 300
      }
    ]
  },
  animationManifest: {
    required: requiredCreatorAnimations,
    mappings: {
      idle: 'idle_laptop',
      walk: 'walk',
      run: 'walk',
      thinking: 'think',
      talk: 'talk',
      present_discovery: 'discovery',
      task_start: 'task_start',
      task_success: 'task_success',
      task_failed: 'task_failed',
      return: 'return',
      sleep: 'idle_tired'
    }
  },
  metadata: {
    description: 'Default Our Companion character package.',
    thumbnail: 'assets/characters/ann/demo.png',
    tags: ['default', 'ann']
  },
  futureVoice: {},
  futureTts: {}
};

export function createInitialCharacterState(characterId = DEFAULT_CHARACTER_ID): CharacterRuntimeState {
  return {
    characterId,
    coreState: 'idle',
    emotion: { ...neutralEmotion },
    intent: 'waiting',
    position: { x: 120, y: 320 },
    lastActivityAt: nowIso(),
    updatedAt: nowIso()
  };
}

export function validateCharacterPackage(pkg: CharacterPackage): ValidationResult {
  const issues: ValidationResult['issues'] = [];
  if (!pkg.id.trim()) issues.push({ severity: 'error', code: 'missing_id', message: 'Character package id is required.' });
  if (!/^\d+\.\d+\.\d+/.test(pkg.version)) {
    issues.push({ severity: 'error', code: 'invalid_version', message: 'Character package version must be semantic.' });
  }
  if (pkg.assetManifest.assets.length === 0) {
    issues.push({ severity: 'error', code: 'missing_assets', message: 'At least one character asset is required.' });
  }
  if (!pkg.animationManifest.mappings.idle) {
    issues.push({ severity: 'error', code: 'missing_idle', message: 'The idle animation mapping is required.' });
  }
  for (const animation of requiredCreatorAnimations) {
    if (!pkg.animationManifest.mappings[animation]) {
      issues.push({ severity: animation === 'idle' ? 'error' : 'warning', code: 'missing_animation', message: `Missing animation mapping: ${animation}.` });
    }
  }
  const frameSizes = new Set(
    pkg.assetManifest.assets
      .filter((asset) => asset.type === 'spritesheet' && asset.frameWidth && asset.frameHeight)
      .map((asset) => `${asset.frameWidth}x${asset.frameHeight}`)
  );
  if (frameSizes.size > 1) {
    issues.push({ severity: 'warning', code: 'inconsistent_frame_size', message: 'Spritesheet frame sizes are inconsistent.' });
  }
  return {
    valid: !issues.some((issue) => issue.severity === 'error'),
    issues
  };
}

export class CharacterPackageRegistry {
  private readonly packages = new Map<string, CharacterPackage>();
  private activePackageId = defaultAnnPackage.id;

  constructor(initialPackages: CharacterPackage[] = [defaultAnnPackage]) {
    for (const pkg of initialPackages) {
      this.register(pkg);
    }
  }

  register(pkg: CharacterPackage): ValidationResult {
    const result = validateCharacterPackage(pkg);
    if (result.valid) {
      this.packages.set(pkg.id, pkg);
    }
    return result;
  }

  get(id: string): CharacterPackage | undefined {
    return this.packages.get(id);
  }

  list(): CharacterPackage[] {
    return [...this.packages.values()];
  }

  activate(id: string): CharacterPackage {
    const pkg = this.packages.get(id) ?? this.packages.get(defaultAnnPackage.id) ?? defaultAnnPackage;
    this.activePackageId = pkg.id;
    return pkg;
  }

  active(): CharacterPackage {
    return this.activate(this.activePackageId);
  }
}

export function createRuntimeDescriptor(pkg: CharacterPackage): CharacterRuntimeDescriptor {
  const validation = validateCharacterPackage(pkg);
  const safePackage = validation.valid ? pkg : defaultAnnPackage;
  return {
    packageId: safePackage.id,
    characterId: safePackage.id,
    displayName: safePackage.name,
    defaultAnimation: safePackage.animationManifest.mappings.idle,
    animations: safePackage.animationManifest.mappings,
    personalityPreset: safePackage.personalityPreset
  };
}

export function loadCharacterPackage(
  pkg: CharacterPackage,
  registry = new CharacterPackageRegistry()
): { package: CharacterPackage; validation: ValidationResult; runtime: CharacterRuntimeDescriptor } {
  const validation = registry.register(pkg);
  const activePackage = validation.valid ? registry.activate(pkg.id) : registry.activate(defaultAnnPackage.id);
  return {
    package: activePackage,
    validation,
    runtime: createRuntimeDescriptor(activePackage)
  };
}

export function exportCharacterPackage(pkg: CharacterPackage): string {
  return JSON.stringify(pkg, null, 2);
}

export function importCharacterPackage(serialized: string): CharacterPackage {
  return JSON.parse(serialized) as CharacterPackage;
}

export function dominantEmotion(emotion: EmotionState): EmotionName {
  return (Object.entries(emotion) as Array<[EmotionName, number]>).reduce((best, current) =>
    current[1] > best[1] ? current : best
  )[0];
}

function clamp(value: number): number {
  return Math.min(100, Math.max(0, Math.round(value)));
}

export function decayEmotion(emotion: EmotionState, date = new Date()): EmotionState {
  const lateHour = date.getHours() >= 23 || date.getHours() < 5;
  return {
    neutral: clamp(emotion.neutral),
    excited: clamp(emotion.excited * 0.9),
    happy: clamp(emotion.happy * 0.95),
    proud: clamp(emotion.proud * 0.95),
    curious: clamp(emotion.curious * 0.97),
    shy: clamp(emotion.shy * 0.98),
    confused: clamp(emotion.confused * 0.94),
    focused: clamp(emotion.focused * 0.96),
    tired: clamp(lateHour ? emotion.tired + 10 : emotion.tired * 0.99),
    concerned: clamp(emotion.concerned * 0.9)
  };
}

export type EmotionEvent =
  | 'user_accepts_discovery'
  | 'user_rejects_discovery'
  | 'ignored_multiple_discoveries'
  | 'new_high_score_discovery'
  | 'task_success'
  | 'task_failure'
  | 'late_night'
  | 'expertise_topic_match';

export function applyEmotionEvent(emotion: EmotionState, event: EmotionEvent): EmotionState {
  const next = { ...emotion };
  const add = (name: EmotionName, amount: number) => {
    next[name] = clamp(next[name] + amount);
  };

  switch (event) {
    case 'user_accepts_discovery':
      add('happy', 12);
      add('proud', 10);
      add('shy', -4);
      break;
    case 'user_rejects_discovery':
      add('shy', 5);
      add('curious', -3);
      break;
    case 'ignored_multiple_discoveries':
      add('shy', 8);
      break;
    case 'new_high_score_discovery':
      add('curious', 15);
      add('excited', 8);
      break;
    case 'task_success':
      add('proud', 8);
      add('happy', 6);
      break;
    case 'task_failure':
      add('confused', 10);
      add('concerned', 8);
      break;
    case 'late_night':
      add('tired', 10);
      break;
    case 'expertise_topic_match':
      add('curious', 8);
      add('focused', 8);
      break;
  }

  return next;
}

export interface IntentContext {
  userCommand?: string;
  pendingTasks?: number;
  availableDiscoveries?: NormalizedDiscovery[];
  recentMemoryActivity?: boolean;
  reflectionDue?: boolean;
  userActive?: boolean;
  relationshipBond?: number;
  date?: Date;
}

export function selectIntent(state: CharacterRuntimeState, context: IntentContext): Intent {
  if (context.userCommand || (context.pendingTasks ?? 0) > 0) return 'helping_task';
  if ((context.availableDiscoveries?.length ?? 0) > 0) return 'sharing_discovery';
  if (context.recentMemoryActivity) return 'reviewing_memory';
  if (context.reflectionDue) return 'reflecting_journey';
  if (!context.userActive && dominantEmotion(state.emotion) === 'tired') return 'waiting';
  if (!context.userActive && state.emotion.curious > 50) return 'wandering';
  return 'organizing_backpack';
}

export function transitionState(current: CoreState, intent: Intent, emotion: EmotionName): CoreState {
  if (intent === 'helping_task') {
    if (current === 'thinking') return 'executing';
    if (current === 'executing') return 'returning';
    if (current === 'returning') return 'talking';
    if (current === 'talking') return 'idle';
    return 'thinking';
  }

  if (intent === 'sharing_discovery') {
    if (current === 'thinking') return 'discovering';
    if (current === 'discovering') return 'talking';
    if (current === 'talking') return 'idle';
    return 'thinking';
  }

  if (intent === 'reviewing_memory' || intent === 'reflecting_journey') return 'thinking';
  if (intent === 'organizing_backpack') return current === 'organizing_backpack' ? 'idle' : 'organizing_backpack';
  if (emotion === 'tired') return current === 'sleeping' ? 'idle' : 'sleeping';
  if (current === 'idle') return 'walking';
  if (current === 'walking') return 'observing';
  if (current === 'observing') return 'thinking';
  return 'idle';
}

export function animationFor(intent: Intent, state: CoreState, emotion: EmotionName, availableAnimations: string[]): string {
  const variants: string[] = [];

  if (intent === 'wandering' && emotion === 'tired') variants.push('walk_tired', 'sleep');
  if (intent === 'wandering' && emotion === 'excited') variants.push('walk_excited');
  if (intent === 'sharing_discovery' && emotion === 'shy') variants.push('discover_shy');
  if (intent === 'sharing_discovery' && emotion === 'excited') variants.push('discover_excited');
  if (state === 'talking' && emotion === 'happy') variants.push('talk_happy');
  if (state === 'talking' && emotion === 'confused') variants.push('talk_confused');
  if (state === 'executing' && emotion === 'focused') variants.push('task_start');
  if (state === 'returning' && emotion === 'proud') variants.push('task_success');
  if (state === 'returning' && emotion === 'confused') variants.push('task_fail');

  const baseByState: Record<CoreState, string> = {
    idle: 'idle',
    walking: 'walk',
    sleeping: 'sleep',
    observing: 'observe',
    thinking: 'think',
    discovering: 'discover',
    talking: 'talk',
    listening: 'think',
    executing: 'task_start',
    returning: 'return',
    organizing_backpack: 'organize_backpack'
  };

  variants.push(baseByState[state], 'idle');
  return variants.find((name) => availableAnimations.includes(name)) ?? 'idle';
}

export function advanceCharacter(state: CharacterRuntimeState, context: IntentContext): CharacterRuntimeState {
  const emotion = decayEmotion(state.emotion, context.date);
  const nextIntent = selectIntent({ ...state, emotion }, context);
  const nextEmotion = dominantEmotion(emotion);
  return {
    ...state,
    emotion,
    intent: nextIntent,
    coreState: transitionState(state.coreState, nextIntent, nextEmotion),
    updatedAt: nowIso()
  };
}

export interface CharacterExpressionContext {
  energy?: number;
  focusMode?: boolean;
  availableAnimations?: string[];
}

export function emotionForDecision(decision: Pick<CompanionDecision, 'action' | 'priority'>, context: CharacterExpressionContext = {}): AnnMood {
  if ((context.energy ?? 70) < 25) return 'tired';
  if (decision.action === 'perform_action') return 'focused';
  if (decision.action === 'speak' && decision.priority === 'high') return 'curious';
  if (decision.action === 'queue_for_later') return 'thinking';
  if (decision.action === 'remember_only') return 'focused';
  if (decision.action === 'ignore' || decision.action === 'stay_silent') return 'neutral';
  return 'happy';
}

export function behaviourForDecision(decision: Pick<CompanionDecision, 'action'>): BehaviourState {
  if (decision.action === 'speak') return 'present_discovery';
  if (decision.action === 'perform_action') return 'perform_task';
  if (decision.action === 'queue_for_later') return 'wait';
  if (decision.action === 'remember_only') return 'reflect';
  if (decision.action === 'ignore' || decision.action === 'stay_silent') return 'idle';
  return 'observe';
}

export function resolveCharacterState(
  decision: Pick<CompanionDecision, 'action' | 'priority'>,
  context: CharacterExpressionContext = {}
): CharacterState {
  const mood = emotionForDecision(decision, context);
  const behaviour = behaviourForDecision(decision);
  return {
    mood,
    intent:
      behaviour === 'present_discovery'
        ? 'present_discovery'
        : behaviour === 'perform_task'
          ? 'perform_task'
          : behaviour === 'reflect'
            ? 'reflect'
            : behaviour === 'wait'
              ? 'wait_response'
              : 'idle',
    energy: Math.max(0, Math.min(100, context.energy ?? 70)),
    currentAnimation: animationKeyForBehaviour(behaviour, mood)
  };
}

export function nextAnimationState(current: AnimationKey, requested?: AnimationKey): AnimationKey {
  if (requested && requested !== current) return requested;
  const transitions: Record<AnimationKey, AnimationKey> = {
    idle: 'curious',
    curious: 'thinking',
    thinking: 'discovery_present',
    discovery_present: 'return',
    task_start: 'typing',
    typing: 'task_success',
    task_success: 'return',
    task_failed: 'return',
    return: 'idle'
  };
  return transitions[current] ?? 'idle';
}

export function animationKeyForBehaviour(behaviour: BehaviourState, mood: AnnMood): AnimationKey {
  if (behaviour === 'present_discovery') return 'discovery_present';
  if (behaviour === 'perform_task') return 'task_start';
  if (behaviour === 'reflect' || mood === 'thinking') return 'thinking';
  if (behaviour === 'return_home') return 'return';
  if (mood === 'curious') return 'curious';
  return 'idle';
}

export function planAnimationRequest(input: {
  characterId?: string;
  behaviour: BehaviourState;
  mood: AnnMood;
  reason: string;
}): AnimationRequest {
  return {
    id: createId('animation'),
    characterId: input.characterId ?? DEFAULT_CHARACTER_ID,
    animationKey: animationKeyForBehaviour(input.behaviour, input.mood),
    interruptSafe: input.behaviour !== 'perform_task',
    reason: input.reason,
    createdAt: nowIso()
  };
}

export function planPerformanceScript(actionId: string, outcome: 'success' | 'failure' = 'success'): PerformanceScript {
  return {
    id: createId('performance'),
    actionId,
    steps: [
      { animationKey: 'task_start', label: 'start task performance', durationMs: 450 },
      { animationKey: 'typing', label: 'show focused work', durationMs: 700 },
      {
        animationKey: outcome === 'success' ? 'task_success' : 'task_failed',
        label: outcome === 'success' ? 'confirm result' : 'show recoverable failure',
        durationMs: 600
      },
      { animationKey: 'return', label: 'return home', durationMs: 450 }
    ],
    createdAt: nowIso()
  };
}

export { getDiscoveryFetchDelay, getDiscoveryFetchDelayRange, DISCOVERY_STARTUP_DELAY_MS } from './discoveryTiming';
