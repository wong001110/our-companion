import { nowIso } from '@our-companion/shared';
import type { InitiativeCategory, InitiativeCooldown } from './types';
import { INITIATIVE_COOLDOWN_MS } from './types';

export class InitiativeCooldownManager {
  private cooldowns: Map<InitiativeCategory, InitiativeCooldown> = new Map();

  isOnCooldown(category: InitiativeCategory): boolean {
    const cooldown = this.cooldowns.get(category);
    if (!cooldown) return false;
    return new Date(cooldown.expiresAt).getTime() > Date.now();
  }

  getRemainingMs(category: InitiativeCategory): number {
    const cooldown = this.cooldowns.get(category);
    if (!cooldown) return 0;
    return Math.max(0, new Date(cooldown.expiresAt).getTime() - Date.now());
  }

  recordExecution(category: InitiativeCategory): void {
    const now = nowIso();
    const duration = INITIATIVE_COOLDOWN_MS[category];
    this.cooldowns.set(category, {
      category,
      lastExecutedAt: now,
      expiresAt: new Date(Date.now() + duration).toISOString(),
    });
  }

  clearCooldown(category: InitiativeCategory): void {
    this.cooldowns.delete(category);
  }

  clearAll(): void {
    this.cooldowns.clear();
  }
}
