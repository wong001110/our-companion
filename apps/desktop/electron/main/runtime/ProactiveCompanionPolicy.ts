import type {
  CompanionLifeActivity,
  CompanionProactivePrompt,
  ProactiveCompanionMode,
  ProactiveCompanionSettings,
} from '@our-companion/shared';

const HOUR_MS = 60 * 60 * 1_000;

export const DEFAULT_PROACTIVE_COMPANION_SETTINGS: ProactiveCompanionSettings = {
  mode: 'balanced',
  unfinishedTopicFollowUps: true,
  goalCheckIns: true,
  journeyReflections: true,
  quietPresence: true,
};

export interface ProactiveCompanionPolicyInput {
  companionId: string;
  settings: ProactiveCompanionSettings;
  now: string;
  localHour: number;
  attentionMode: 'available' | 'focused' | 'do_not_disturb';
  conversationActive: boolean;
  companionDragging: boolean;
  companionAway: boolean;
  recentIgnoredInteractions: number;
  lastUserInteractionAt?: string;
  lastPromptAt?: string;
  promptCountToday: number;
  unfinishedTopic?: string;
  activeGoalCount: number;
  activeJourneyCount: number;
  language: 'en' | 'zh-CN';
}

export interface ProactiveCompanionOpportunity {
  prompt: CompanionProactivePrompt;
  lifeActivity: CompanionLifeActivity;
}

function modeBudget(mode: ProactiveCompanionMode): { dailyLimit: number; cooldownHours: number } {
  if (mode === 'off') return { dailyLimit: 0, cooldownHours: Number.POSITIVE_INFINITY };
  if (mode === 'quiet') return { dailyLimit: 1, cooldownHours: 12 };
  if (mode === 'active') return { dailyLimit: 3, cooldownHours: 3 };
  return { dailyLimit: 2, cooldownHours: 6 };
}

function hoursSince(value: string | undefined, nowMs: number): number {
  if (!value) return Number.POSITIVE_INFINITY;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? Math.max(0, (nowMs - parsed) / HOUR_MS) : Number.POSITIVE_INFINITY;
}

function promptMessage(type: CompanionProactivePrompt['type'], language: 'en' | 'zh-CN'): string {
  if (language === 'zh-CN') {
    if (type === 'unfinished_topic') return '我们之前还有一个想法没有说完。想继续的时候，我在。';
    if (type === 'goal_check_in') return '你正在推进的目标还在那里。要不要只走一个很小的下一步？';
    if (type === 'journey_reflection') return '我们当前的旅程还有一条线索没有收好。要一起看看下一步吗？';
    return '我在这里。不需要特地回复我。';
  }
  if (type === 'unfinished_topic') return 'There is still a thought we left unfinished. I am here when you want to pick it up.';
  if (type === 'goal_check_in') return 'That goal is still open. Want to take just one small next step?';
  if (type === 'journey_reflection') return 'There is still a thread open in our current journey. Want to look at the next step together?';
  return 'I am here. You do not need to reply.';
}

export function selectProactiveCompanionOpportunity(
  input: ProactiveCompanionPolicyInput,
): ProactiveCompanionOpportunity | undefined {
  const budget = modeBudget(input.settings.mode);
  if (budget.dailyLimit === 0 || input.promptCountToday >= budget.dailyLimit) return undefined;
  if (input.attentionMode !== 'available' || input.conversationActive || input.companionDragging || input.companionAway) return undefined;
  if (input.localHour >= 23 || input.localHour < 7) return undefined;
  if (input.recentIgnoredInteractions >= 3) return undefined;

  const nowMs = Date.parse(input.now);
  if (!Number.isFinite(nowMs)) return undefined;
  if (hoursSince(input.lastPromptAt, nowMs) < budget.cooldownHours) return undefined;
  const inactiveHours = hoursSince(input.lastUserInteractionAt, nowMs);
  if (!Number.isFinite(inactiveHours) || inactiveHours < 2) return undefined;

  let type: CompanionProactivePrompt['type'] | undefined;
  let lifeActivity: CompanionLifeActivity = 'thinking';
  if (input.settings.unfinishedTopicFollowUps && input.unfinishedTopic && inactiveHours >= 2) {
    type = 'unfinished_topic';
  } else if (input.settings.goalCheckIns && input.activeGoalCount > 0 && inactiveHours >= 4) {
    type = 'goal_check_in';
  } else if (input.settings.journeyReflections && input.activeJourneyCount > 0 && inactiveHours >= 6) {
    type = 'journey_reflection';
  } else if (input.settings.quietPresence && inactiveHours >= 8) {
    type = 'quiet_presence';
    lifeActivity = 'resting';
  }
  if (!type) return undefined;

  return {
    lifeActivity,
    prompt: {
      id: `proactive_${input.companionId}_${type}_${Math.floor(nowMs / 1_000)}`,
      companionId: input.companionId,
      type,
      message: promptMessage(type, input.language),
      createdAt: input.now,
    },
  };
}
