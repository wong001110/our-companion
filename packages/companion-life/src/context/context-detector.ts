import { nowIso } from '@our-companion/shared';
import type {
  ContextCategory,
  ContextState,
  ContextSignal,
  ContextDetectorInput,
} from './types';
import { CONTEXT_PRIORITY, CONTEXT_STABILIZATION_MS, CONTEXT_EXPIRY_MS } from './types';

const MEETING_KEYWORDS = ['zoom', 'teams', 'meet', 'webex', 'discord', 'skype', 'facetime'];
const WORK_KEYWORDS = ['code', 'vscode', 'vim', 'neovim', 'intellij', 'webstorm', 'sublime', 'xcode', 'cursor'];
const LEARNING_KEYWORDS = ['docs', 'documentation', 'mdn', 'stackoverflow', 'youtube', 'coursera', 'udemy', 'notion'];
const RELAX_KEYWORDS = ['spotify', 'netflix', 'youtube', 'reddit', 'twitter', 'instagram', 'tiktok'];
const GAME_KEYWORDS = ['steam', 'epic', 'origin', 'battle.net', 'roblox'];

function detectCategoryFromWindow(windowTitle: string): ContextCategory {
  const lower = windowTitle.toLowerCase();
  if (MEETING_KEYWORDS.some((k) => lower.includes(k))) return 'meeting';
  if (WORK_KEYWORDS.some((k) => lower.includes(k))) return 'working';
  if (LEARNING_KEYWORDS.some((k) => lower.includes(k))) return 'learning';
  if (GAME_KEYWORDS.some((k) => lower.includes(k))) return 'gaming';
  if (RELAX_KEYWORDS.some((k) => lower.includes(k))) return 'relaxing';
  return 'unknown';
}

function isNightTime(localTime: string): boolean {
  const hour = Number(localTime.slice(11, 13) || localTime.slice(0, 2));
  return Number.isFinite(hour) && (hour >= 23 || hour < 6);
}

function buildSignal(source: string, type: string, value: string, confidence: number): ContextSignal {
  return { source, type, value, confidence, timestamp: nowIso() };
}

export function detectContext(input: ContextDetectorInput, current?: ContextState): ContextState {
  const signals: ContextSignal[] = [];
  const now = nowIso();
  const localTime = input.localTime ?? now;

  if (isNightTime(localTime)) {
    signals.push(buildSignal('time', 'night_schedule', localTime, 0.9));
  }

  if (input.screenSharing || input.fullscreenApp) {
    signals.push(buildSignal('system', 'fullscreen_or_sharing', 'detected', 0.95));
  }

  if (input.calendarEvent) {
    signals.push(buildSignal('calendar', 'event_active', 'true', 0.9));
  }

  if (input.activeWindow) {
    const category = detectCategoryFromWindow(input.activeWindow);
    signals.push(buildSignal('window', 'active_window', input.activeWindow, 0.7));
    if (category !== 'unknown') {
      signals.push(buildSignal('window', 'category_inferred', category, 0.65));
    }
  }

  if (input.keyboardActive === false && input.lastInputAt) {
    const idleMs = Date.now() - new Date(input.lastInputAt).getTime();
    if (idleMs > 300_000) {
      signals.push(buildSignal('input', 'idle_long', `${idleMs}ms`, 0.8));
    }
  }

  let bestCategory: ContextCategory = 'unknown';
  let bestConfidence = 0;

  for (const signal of signals) {
    if (signal.type === 'category_inferred') {
      const cat = signal.value as ContextCategory;
      if (signal.confidence > bestConfidence) {
        bestCategory = cat;
        bestConfidence = signal.confidence;
      }
    }
  }

  if (bestCategory === 'unknown') {
    if (signals.some((s) => s.type === 'night_schedule')) {
      bestCategory = 'sleeping';
      bestConfidence = 0.8;
    } else if (signals.some((s) => s.type === 'idle_long')) {
      bestCategory = 'away';
      bestConfidence = 0.7;
    } else if (signals.some((s) => s.type === 'fullscreen_or_sharing')) {
      bestCategory = 'meeting';
      bestConfidence = 0.85;
    } else if (signals.some((s) => s.type === 'event_active')) {
      bestCategory = 'meeting';
      bestConfidence = 0.85;
    }
  }

  if (current && bestCategory === current.category) {
    const elapsed = new Date(now).getTime() - new Date(current.lastUpdated).getTime();
    if (elapsed < CONTEXT_STABILIZATION_MS) {
      return {
        ...current,
        lastUpdated: now,
        confidence: Math.min(1, current.confidence + 0.05),
        signals: [...current.signals, ...signals].slice(-20),
      };
    }
    return {
      ...current,
      lastUpdated: now,
      confidence: Math.min(1, current.confidence + 0.02),
      signals: [...current.signals, ...signals].slice(-20),
    };
  }

  if (current && CONTEXT_PRIORITY[bestCategory] < CONTEXT_PRIORITY[current.category]) {
    const elapsed = new Date(now).getTime() - new Date(current.lastUpdated).getTime();
    if (elapsed < CONTEXT_STABILIZATION_MS && current.confidence > 0.5) {
      return {
        ...current,
        lastUpdated: now,
        signals: [...current.signals, ...signals].slice(-20),
      };
    }
  }

  return {
    category: bestCategory,
    confidence: bestConfidence,
    startedAt: current?.category === bestCategory ? current.startedAt : now,
    lastUpdated: now,
    expiresAt: new Date(new Date(now).getTime() + CONTEXT_EXPIRY_MS).toISOString(),
    signals: signals.slice(-20),
  };
}

export function isContextExpired(context: ContextState): boolean {
  if (!context.expiresAt) return false;
  return new Date(context.expiresAt).getTime() < Date.now();
}
