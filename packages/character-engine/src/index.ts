import type {
  AnimationRequest,
  CompanionAnimationName,
  CompanionMood,
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
  ValidationResult
} from '@our-companion/shared';
import { clampScore, createId, nowIso } from '@our-companion/shared';

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
  'Idle_Neutral',
  'Walk_Right',
  'Think',
  'Talk_Neutral',
  'Expedition_Prepare',
  'Expedition_Return',
  'Expedition_Present',
  'Work_Focus',
  'Music_Idle',
  'Listening',
  'Idle_Sleepy'
];

export function createInitialCharacterState(characterId: string): CharacterRuntimeState {
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
    issues.push({ severity: 'warning', code: 'missing_assets', message: 'No character assets defined. Assets should be uploaded by the user.' });
  }
  if (!pkg.animationManifest.mappings.Idle_Neutral) {
    issues.push({ severity: 'error', code: 'missing_idle', message: 'The Idle_Neutral animation mapping is required.' });
  }
  for (const animation of requiredCreatorAnimations) {
    if (!pkg.animationManifest.mappings[animation]) {
      issues.push({ severity: animation === 'Idle_Neutral' ? 'error' : 'warning', code: 'missing_animation', message: `Missing animation mapping: ${animation}.` });
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
  private activePackageId: string | undefined;

  constructor(initialPackages: CharacterPackage[] = []) {
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
    const pkg = this.packages.get(id);
    if (!pkg) throw new Error(`Character package not found: ${id}`);
    this.activePackageId = pkg.id;
    return pkg;
  }

  active(): CharacterPackage {
    if (!this.activePackageId) throw new Error('No active Character package.');
    return this.activate(this.activePackageId);
  }
}

export function createRuntimeDescriptor(pkg: CharacterPackage): CharacterRuntimeDescriptor {
  const validation = validateCharacterPackage(pkg);
  if (!validation.valid) throw new Error('Invalid Character package.');
  return {
    packageId: pkg.id,
    characterId: pkg.id,
    displayName: pkg.name,
    defaultAnimation: pkg.animationManifest.mappings.Idle_Neutral,
    animations: pkg.animationManifest.mappings,
    personalityPreset: pkg.personalityPreset
  };
}

export function loadCharacterPackage(
  pkg: CharacterPackage,
  registry = new CharacterPackageRegistry()
): { package: CharacterPackage; validation: ValidationResult; runtime: CharacterRuntimeDescriptor } {
  const validation = registry.register(pkg);
  if (!validation.valid) throw new Error('Invalid Character package.');
  const activePackage = registry.activate(pkg.id);
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

export function decayEmotion(emotion: EmotionState, date = new Date()): EmotionState {
  const lateHour = date.getHours() >= 23 || date.getHours() < 5;
  return {
    neutral: clampScore(emotion.neutral),
    excited: clampScore(emotion.excited * 0.9),
    happy: clampScore(emotion.happy * 0.95),
    proud: clampScore(emotion.proud * 0.95),
    curious: clampScore(emotion.curious * 0.97),
    shy: clampScore(emotion.shy * 0.98),
    confused: clampScore(emotion.confused * 0.94),
    focused: clampScore(emotion.focused * 0.96),
    tired: clampScore(lateHour ? emotion.tired + 10 : emotion.tired * 0.99),
    concerned: clampScore(emotion.concerned * 0.9)
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
    next[name] = clampScore(next[name] + amount);
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

  if (intent === 'wandering' && emotion === 'tired') variants.push('Walk_Right', 'Idle_Sleepy');
  if (intent === 'wandering' && emotion === 'excited') variants.push('Walk_Right');
  if (intent === 'sharing_discovery' && emotion === 'shy') variants.push('Expedition_Present');
  if (intent === 'sharing_discovery' && emotion === 'excited') variants.push('Expedition_Present');
  if (state === 'talking' && emotion === 'happy') variants.push('Talk_Neutral');
  if (state === 'talking' && emotion === 'confused') variants.push('Talk_Neutral');
  if (state === 'executing' && emotion === 'focused') variants.push('Expedition_Prepare');
  if (state === 'returning' && emotion === 'proud') variants.push('Expedition_Return');
  if (state === 'returning' && emotion === 'confused') variants.push('Expedition_Return');

  const baseByState: Record<CoreState, string> = {
    idle: 'Idle_Neutral',
    walking: 'Walk_Right',
    sleeping: 'Idle_Sleepy',
    observing: 'Idle_Neutral',
    thinking: 'Think',
    discovering: 'Expedition_Present',
    talking: 'Talk_Neutral',
    listening: 'Listening',
    executing: 'Expedition_Prepare',
    returning: 'Expedition_Return',
    organizing_backpack: 'Work_Focus'
  };

  variants.push(baseByState[state], 'Idle_Neutral');
  return variants.find((name) => availableAnimations.includes(name)) ?? 'Idle_Neutral';
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

export function emotionForDecision(decision: Pick<CompanionDecision, 'action' | 'priority'>, context: CharacterExpressionContext = {}): CompanionMood {
  if ((context.energy ?? 70) < 25) return 'tired';
  if (decision.action === 'execute_approved_action' || decision.action === 'suggest_action') return 'focused';
  if ((decision.action === 'respond' || decision.action === 'share_discovery') && decision.priority === 'high') return 'curious';
  if (decision.action === 'idle_activity') return 'thinking';
  if (decision.action === 'stay_silent') return 'neutral';
  return 'happy';
}

export function behaviourForDecision(decision: Pick<CompanionDecision, 'action'>): BehaviourState {
  if (decision.action === 'share_discovery' || decision.action === 'respond') return 'present_discovery';
  if (decision.action === 'execute_approved_action' || decision.action === 'suggest_action') return 'perform_task';
  if (decision.action === 'idle_activity') return 'reflect';
  if (decision.action === 'stay_silent') return 'idle';
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

export function nextAnimationState(current: CompanionAnimationName, requested?: CompanionAnimationName): CompanionAnimationName {
  if (requested && requested !== current) return requested;
  const transitions: Partial<Record<CompanionAnimationName, CompanionAnimationName>> = {
    Idle_Neutral: 'Think',
    Think: 'Expedition_Present',
    Expedition_Present: 'Expedition_Return',
    Expedition_Prepare: 'Work_Focus',
    Work_Focus: 'Expedition_Return',
    Expedition_Return: 'Idle_Neutral'
  };
  return transitions[current] ?? 'Idle_Neutral';
}

export function animationKeyForBehaviour(behaviour: BehaviourState, mood: CompanionMood): CompanionAnimationName {
  if (behaviour === 'present_discovery') return 'Expedition_Present';
  if (behaviour === 'perform_task') return 'Expedition_Prepare';
  if (behaviour === 'reflect' || mood === 'thinking') return 'Think';
  if (behaviour === 'return_home') return 'Expedition_Return';
  if (mood === 'curious') return 'Think';
  return 'Idle_Neutral';
}

export function planAnimationRequest(input: {
  characterId?: string;
  behaviour: BehaviourState;
  mood: CompanionMood;
  reason: string;
}): AnimationRequest {
  return {
    id: createId('animation'),
    characterId: input.characterId ?? (() => { throw new Error('Companion identity is required.'); })(),
    animationKey: animationKeyForBehaviour(input.behaviour, input.mood),
    interruptSafe: input.behaviour !== 'perform_task',
    reason: input.reason,
    createdAt: nowIso()
  };
}

export interface AnimationPerformanceStep {
  animationKey: CompanionAnimationName;
  label: string;
  durationMs: number;
}

export interface AnimationPerformancePlan {
  id: string;
  actionId: string;
  steps: AnimationPerformanceStep[];
  createdAt: string;
}

export function planPerformanceScript(
  actionId: string,
  outcome: 'success' | 'failure' = 'success'
): AnimationPerformancePlan {
  return {
    id: createId('performance'),
    actionId,
    steps: [
      { animationKey: 'Expedition_Prepare', label: 'start task performance', durationMs: 450 },
      { animationKey: 'Work_Focus', label: 'show focused work', durationMs: 700 },
      {
        animationKey: outcome === 'success' ? 'Expedition_Return' : 'Expedition_Return',
        label: outcome === 'success' ? 'confirm result' : 'show recoverable failure',
        durationMs: 600
      },
      { animationKey: 'Expedition_Return', label: 'return home', durationMs: 450 }
    ],
    createdAt: nowIso()
  };
}
