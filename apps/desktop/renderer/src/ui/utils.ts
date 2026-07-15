import type { ActionResult, AiDebugEntry, CharacterRuntimeState, CompanionReplyLanguage, DebugDataResetTarget, Discovery, PanelTab, PermissionScope, ToolExecutionResult, ToolPreview, UiLang, UpdateAiSettingsInput, UpdateSpeechSettingsInput } from '@our-companion/shared';
import { t, type Lang } from '../i18n';
import type { AnimationName } from './CompanionCanvas';
import type { CompanionAnimationName } from '../companion/runtime/animationRegistry';

export type Tab = PanelTab;
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

export function formatDiscoveryTime(discovery: Discovery, lang: Lang = 'en'): string {
  return formatRelativeDate(discovery.publishedAt ?? discovery.sharedAt ?? discovery.createdAt, lang);
}

export function formatRelativeDate(value?: string, lang: Lang = 'en'): string {
  if (!value) return t(lang, 'relative_just_now');
  const time = new Date(value).getTime();
  if (Number.isNaN(time)) return t(lang, 'relative_just_now');
  const diffMs = Date.now() - time;
  const minutes = Math.max(0, Math.round(diffMs / 60000));
  if (minutes < 60) return minutes <= 1 ? t(lang, 'relative_just_now') : t(lang, 'relative_minutes_ago', { count: minutes });
  const hours = Math.round(minutes / 60);
  if (hours < 24) return t(lang, 'relative_hours_ago', { count: hours });
  return t(lang, 'relative_days_ago', { count: Math.round(hours / 24) });
}

export function formatShortDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export function formatAskResult(result: ToolExecutionResult | ToolPreview | { message: string } | ActionResult): string {
  if ('message' in result) return result.message;
  if ('planId' in result && 'outputs' in result) {
    const r = result as ActionResult;
    if (r.status === 'success') return `Done — action completed successfully.`;
    if (r.status === 'failure') return `Something went wrong: ${r.errors?.join(', ') ?? 'unknown error'}`;
    if (r.status === 'partial') return `Partially completed.`;
    if (r.status === 'cancelled') return `Action cancelled: ${r.errors?.join(', ') ?? 'unknown reason'}`;
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

export function companionStatusMessage(state?: CharacterRuntimeState, lang: Lang = 'en'): string {
  if (!state) return t(lang, 'home_status_settling');
  if (state.intent === 'sharing_discovery' || state.coreState === 'discovering') return t(lang, 'home_status_discovery');
  if (state.intent === 'reviewing_memory') return t(lang, 'home_status_memory');
  if (state.intent === 'reflecting_journey') return t(lang, 'home_status_journey');
  if (state.intent === 'helping_task') return t(lang, 'home_status_helping');
  if (state.intent === 'wandering') return t(lang, 'home_status_wandering');
  return t(lang, 'home_status_waiting');
}

export function companionMoodLabel(state?: CharacterRuntimeState, lang: Lang = 'en'): string {
  const emotion = state?.emotion;
  if (!emotion) return t(lang, 'home_mood_curious_excited');
  const entries = Object.entries(emotion).sort((a, b) => b[1] - a[1]);
  const [first, second] = entries;
  return `${t(lang, `home_emotion_${first?.[0] ?? 'curious'}` as keyof typeof import('../i18n/en').en)} & ${t(lang, `home_emotion_${second?.[0] ?? 'excited'}` as keyof typeof import('../i18n/en').en)}`;
}

export function tabLabel(tab: Tab, lang: Lang): string {
  const map: Record<Tab, string> = {
    home: t(lang, 'tab_home'),
    discovery: t(lang, 'tab_discovery'),
    journey: t(lang, 'tab_journey'),
    memory: t(lang, 'tab_memory'),
    chat: t(lang, 'tab_chat'),
    social: t(lang, 'tab_social'),
    settings: t(lang, 'tab_settings')
  };
  return map[tab];
}

export function debugPreview(entry: AiDebugEntry): string {
  const text = entry.error || entry.content || `${entry.requestMessages.length} prompt messages`;
  return text.length > 72 ? `${text.slice(0, 72)}…` : text;
}

export function createDevAnimationState(animation: AnimationName): CharacterRuntimeState {
  const stateByAnimation: Partial<Record<AnimationName, Pick<CharacterRuntimeState, 'coreState' | 'intent'>>> = {
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
    ...(stateByAnimation[animation] ?? { coreState: 'idle', intent: 'waiting' }),
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
