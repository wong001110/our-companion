import { nowIso } from '@our-companion/shared';
import type { BehaviorCategory, BehaviorCooldown } from './types';
import { DEFAULT_COOLDOWN_MS } from './types';

export class CooldownManager {
  private cooldowns: Map<BehaviorCategory, BehaviorCooldown> = new Map();

  isOnCooldown(category: BehaviorCategory): boolean {
    const cooldown = this.cooldowns.get(category);
    if (!cooldown) return false;
    return new Date(cooldown.expiresAt).getTime() > Date.now();
  }

  getRemainingMs(category: BehaviorCategory): number {
    const cooldown = this.cooldowns.get(category);
    if (!cooldown) return 0;
    const remaining = new Date(cooldown.expiresAt).getTime() - Date.now();
    return Math.max(0, remaining);
  }

  setCooldown(category: BehaviorCategory, durationMs?: number): void {
    const duration = durationMs ?? DEFAULT_COOLDOWN_MS[category];
    if (duration <= 0) return;
    this.cooldowns.set(category, {
      category,
      expiresAt: new Date(Date.now() + duration).toISOString(),
    });
  }

  clearCooldown(category: BehaviorCategory): void {
    this.cooldowns.delete(category);
  }

  clearAll(): void {
    this.cooldowns.clear();
  }

  getAll(): BehaviorCooldown[] {
    const now = Date.now();
    return Array.from(this.cooldowns.values()).filter(
      (c) => new Date(c.expiresAt).getTime() > now
    );
  }
}
