import type { ActionPlan, ActionRunResult, AiDebugEntry, CharacterRuntimeState, CompanionReplyLanguage, DebugDataResetTarget, Discovery, PermissionScope, ToolExecutionResult, ToolPreview, UiLang, UpdateAiSettingsInput, UpdateSpeechSettingsInput } from '@our-companion/shared';
import { t, type Lang } from '../i18n';
import type { AnimationName } from './CompanionCanvas';
import type { CompanionAnimationName } from '../companion/runtime/animationRegistry';

export type Tab = 'home' | 'discovery' | 'journey' | 'memory' | 'chat' | 'ask' | 'settings';
export type DevAnimation = 'live' | AnimationName;

export const devAnimations: DevAnimation[] = [
  'live',
  'Idle_Neutral',
  'Idle_Breathe',
  'Idle_Sleepy',
  'Idle_Sleeping',
  'Walk_Left',
  'Walk_Right',
  'Think',
  'Work_Focus',
  'Expedition_Present',
  'Talk_Neutral',
  'Talk_Happy',
  'Expedition_Prepare',
  'Expedition_Leave',
  'Expedition_Return',
];

export function formatJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export function formatDuration(durationMs?: number): string {
  if (durationMs === undefined) return '0.0s';
  return `${(durationMs / 1000).toFixed(1)}s`;
}

export function formatDiscoveryTime(discovery: Discovery): string {
  return formatRelativeDate(discovery.publishedAt ?? discovery.sharedAt ?? discovery.createdAt);
}

export function formatRelativeDate(value?: string): string {
  if (!value) return 'Just now';
  const time = new Date(value).getTime();
  if (Number.isNaN(time)) return 'Just now';
  const diffMs = Date.now() - time;
  const minutes = Math.max(0, Math.round(diffMs / 60000));
  if (minutes < 60) return minutes <= 1 ? 'Just now' : `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export function formatShortDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export function formatAskResult(result: ToolExecutionResult | ToolPreview | { message: string } | ActionRunResult): string {
  if ('message' in result) return result.message;
  if ('planId' in result) {
    if (result.status === 'completed') return `Done — completed ${result.performedSteps} step(s).`;
    if (result.status === 'blocked') return `I can't do that: ${result.reason}`;
    if (result.status === 'failed') return `Something went wrong: ${result.errorMessage}`;
    if (result.status === 'await_permission') return `Permission needed for: ${result.requiredScopes.join(', ')}`;
  }
  if ('errorMessage' in result && result.errorMessage) return result.errorMessage;
  if ('userFacingSummary' in result) return result.userFacingSummary;
  return 'Done.';
}

export function readable(value: string): string {
  return value.replaceAll('_', ' ');
}

export function capitalize(value: string): string {
  return value.slice(0, 1).toUpperCase() + value.slice(1);
}

export function randomBetween(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function easeInOut(progress: number): number {
  return progress < 0.5 ? 2 * progress * progress : 1 - Math.pow(-2 * progress + 2, 2) / 2;
}

export function companionStatusMessage(state?: CharacterRuntimeState): string {
  if (!state) return 'Companion is settling in and opening a fresh page.';
  if (state.intent === 'sharing_discovery' || state.coreState === 'discovering') return 'Companion found something curious and tucked it into the notebook.';
  if (state.intent === 'reviewing_memory') return 'Companion is reading your notes and thinking about what matters.';
  if (state.intent === 'reflecting_journey') return 'Companion is connecting the dots across your current journey.';
  if (state.intent === 'helping_task') return 'Companion is focused beside you and helping with the next step.';
  if (state.intent === 'wandering') return 'Companion is stretching its legs, then coming back to the page.';
  return 'Companion is quietly here, keeping an eye on new ideas.';
}

export function companionMoodLabel(state?: CharacterRuntimeState): string {
  const emotion = state?.emotion;
  if (!emotion) return 'Curious & Excited';
  const entries = Object.entries(emotion).sort((a, b) => b[1] - a[1]);
  const [first, second] = entries;
  return `${capitalize(first?.[0] ?? 'curious')} & ${capitalize(second?.[0] ?? 'excited')}`;
}

export function tabLabel(tab: Tab, lang: Lang): string {
  const map: Record<Tab, string> = {
    home: t(lang, 'tab_home'),
    discovery: t(lang, 'tab_discovery'),
    journey: t(lang, 'tab_journey'),
    memory: t(lang, 'tab_memory'),
    chat: t(lang, 'tab_chat'),
    ask: t(lang, 'tab_ask'),
    settings: t(lang, 'tab_settings')
  };
  return map[tab];
}

export function debugPreview(entry: AiDebugEntry): string {
  const text = entry.error || entry.content || `${entry.requestMessages.length} prompt messages`;
  return text.length > 72 ? `${text.slice(0, 72)}…` : text;
}

export function createDevAnimationState(animation: AnimationName): CharacterRuntimeState {
  const stateByAnimation: Record<AnimationName, Pick<CharacterRuntimeState, 'coreState' | 'intent'>> = {
    Idle_Neutral: { coreState: 'idle', intent: 'waiting' },
    Idle_Breathe: { coreState: 'idle', intent: 'waiting' },
    Idle_Sleepy: { coreState: 'idle', intent: 'waiting' },
    Idle_Sleeping: { coreState: 'idle', intent: 'waiting' },
    Walk_Left: { coreState: 'walking', intent: 'wandering' },
    Walk_Right: { coreState: 'walking', intent: 'wandering' },
    Think: { coreState: 'thinking', intent: 'reviewing_memory' },
    Work_Focus: { coreState: 'executing', intent: 'helping_task' },
    Expedition_Present: { coreState: 'discovering', intent: 'sharing_discovery' },
    Talk_Neutral: { coreState: 'talking', intent: 'sharing_discovery' },
    Talk_Happy: { coreState: 'talking', intent: 'sharing_discovery' },
    Expedition_Prepare: { coreState: 'executing', intent: 'helping_task' },
    Expedition_Leave: { coreState: 'executing', intent: 'helping_task' },
    Expedition_Return: { coreState: 'returning', intent: 'wandering' },
    Listening: { coreState: 'listening', intent: 'asking_permission' },
  };

  return {
    characterId: 'companion-dev-preview',
    ...stateByAnimation[animation],
    emotion: {
      neutral: 0.4,
      curious: animation === 'Expedition_Present' ? 0.8 : 0.3,
      happy: 0.35,
      excited: animation === 'Walk_Right' || animation === 'Expedition_Present' ? 0.65 : 0.2,
      shy: 0,
      confused: 0,
      focused: animation === 'Think' ? 0.85 : 0.3,
      tired: 0,
      proud: 0,
      concerned: 0
    },
    updatedAt: new Date().toISOString()
  };
}

export function parseLocalCommand(input: string) {
  const trimmed = input.trim();
  const lower = trimmed.toLowerCase();
  if (lower.startsWith('open url ')) {
    return { toolName: 'open_url' as const, args: { url: trimmed.slice('open url '.length).trim() } };
  }
  if (lower.startsWith('open app ')) {
    return { toolName: 'open_app' as const, args: { appName: trimmed.slice('open app '.length).trim() } };
  }
  if (lower.startsWith('search web for ')) {
    return { toolName: 'search_web' as const, args: { query: trimmed.slice('search web for '.length).trim(), target: 'google' } };
  }
  return undefined;
}
