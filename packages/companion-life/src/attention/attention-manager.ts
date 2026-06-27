import { createId, nowIso } from '@our-companion/shared';
import type {
  AttentionTarget,
  AttentionTargetType,
  AttentionLevel,
  AttentionManagerState,
} from './types';
import { ATTENTION_PRIORITY } from './types';

export class AttentionManager {
  private state: AttentionManagerState = {
    secondaries: [],
    passives: [],
  };

  getState(): AttentionManagerState {
    return {
      ...this.state,
      primary: this.state.primary ? { ...this.state.primary } : undefined,
      secondaries: this.state.secondaries.map((t) => ({ ...t })),
      passives: this.state.passives.map((t) => ({ ...t })),
    };
  }

  getPrimary(): AttentionTarget | undefined {
    return this.state.primary ? { ...this.state.primary } : undefined;
  }

  requestFocus(type: AttentionTargetType, metadata?: Record<string, unknown>): AttentionTarget {
    const now = nowIso();
    const target: AttentionTarget = {
      id: createId('attn'),
      type,
      level: 'primary',
      priority: ATTENTION_PRIORITY[type],
      startedAt: now,
      lastUpdatedAt: now,
      metadata,
    };

    if (this.state.primary) {
      if (this.state.primary.priority < target.priority) {
        const demoted = { ...this.state.primary, level: 'secondary' as AttentionLevel };
        this.state = {
          ...this.state,
          primary: target,
          secondaries: [demoted, ...this.state.secondaries].slice(0, 5),
        };
      } else {
        target.level = 'secondary';
        this.state = {
          ...this.state,
          secondaries: [target, ...this.state.secondaries].slice(0, 5),
        };
      }
    } else {
      this.state = {
        ...this.state,
        primary: target,
      };
    }

    return target;
  }

  releaseFocus(targetId: string): void {
    if (this.state.primary?.id === targetId) {
      this.state.primary = this.state.secondaries.shift();
      if (this.state.primary) {
        this.state.primary = { ...this.state.primary, level: 'primary' };
      }
    } else {
      this.state.secondaries = this.state.secondaries.filter((t) => t.id !== targetId);
      this.state.passives = this.state.passives.filter((t) => t.id !== targetId);
    }
  }

  hasActiveConversation(): boolean {
    return this.state.primary?.type === 'conversation';
  }

  isUserFocused(): boolean {
    return this.state.primary?.type === 'user';
  }

  canAcceptNewFocus(requestedType: AttentionTargetType): boolean {
    if (!this.state.primary) return true;
    return ATTENTION_PRIORITY[requestedType] > this.state.primary.priority;
  }

  toPassive(targetId: string): void {
    const target =
      this.state.primary?.id === targetId
        ? this.state.primary
        : this.state.secondaries.find((t) => t.id === targetId);
    if (!target) return;

    this.releaseFocus(targetId);
    this.state.passives.push({ ...target, level: 'passive' });
  }

  getAll(): AttentionTarget[] {
    const all: AttentionTarget[] = [];
    if (this.state.primary) all.push(this.state.primary);
    all.push(...this.state.secondaries);
    all.push(...this.state.passives);
    return all;
  }
}
