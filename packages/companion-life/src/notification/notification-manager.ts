import { createId, nowIso } from '@our-companion/shared';
import type {
  NotificationRequest,
  NotificationCategory,
  NotificationPriority,
  NotificationChannel,
  QueuedNotification,
} from './types';
import { NOTIFICATION_PRIORITY_ORDER, NOTIFICATION_COOLDOWN_MS } from './types';

export class NotificationManager {
  private queue: QueuedNotification[] = [];
  private cooldowns: Map<NotificationCategory, string> = new Map();
  private quietMode = false;
  private maxQueueSize = 10;

  isQuietMode(): boolean {
    return this.quietMode;
  }

  setQuietMode(quiet: boolean): void {
    this.quietMode = quiet;
  }

  getQueue(): QueuedNotification[] {
    return this.queue.map((q) => ({ ...q }));
  }

  getQueueSize(): number {
    return this.queue.length;
  }

  isOnCooldown(category: NotificationCategory): boolean {
    const lastAt = this.cooldowns.get(category);
    if (!lastAt) return false;
    const elapsed = Date.now() - new Date(lastAt).getTime();
    return elapsed < NOTIFICATION_COOLDOWN_MS[category];
  }

  enqueue(
    category: NotificationCategory,
    priority: NotificationPriority,
    channel: NotificationChannel,
    title: string,
    message: string,
    options?: {
      cardId?: string;
      metadata?: Record<string, unknown>;
    }
  ): NotificationRequest | undefined {
    if (this.quietMode && priority !== 'critical') {
      return undefined;
    }

    if (this.isOnCooldown(category) && priority !== 'critical') {
      return undefined;
    }

    if (this.queue.length >= this.maxQueueSize) {
      const lowestPriority = this.queue.reduce((min, item) =>
        NOTIFICATION_PRIORITY_ORDER[item.request.priority] < NOTIFICATION_PRIORITY_ORDER[min.request.priority]
          ? item
          : min
      );
      if (NOTIFICATION_PRIORITY_ORDER[priority] <= NOTIFICATION_PRIORITY_ORDER[lowestPriority.request.priority]) {
        return undefined;
      }
      this.queue = this.queue.filter((q) => q !== lowestPriority);
    }

    const request: NotificationRequest = {
      id: createId('notif'),
      category,
      priority,
      channel,
      title,
      message,
      cardId: options?.cardId,
      metadata: options?.metadata,
      createdAt: nowIso(),
    };

    this.queue.push({
      request,
      queuedAt: nowIso(),
      attempts: 0,
    });

    this.queue.sort(
      (a, b) =>
        NOTIFICATION_PRIORITY_ORDER[b.request.priority] -
        NOTIFICATION_PRIORITY_ORDER[a.request.priority]
    );

    return request;
  }

  dequeue(): NotificationRequest | undefined {
    if (this.queue.length === 0) return undefined;
    const item = this.queue.shift()!;
    this.cooldowns.set(item.request.category, nowIso());
    return item.request;
  }

  peek(): NotificationRequest | undefined {
    return this.queue.length > 0 ? this.queue[0].request : undefined;
  }

  dismiss(notificationId: string): boolean {
    const index = this.queue.findIndex((q) => q.request.id === notificationId);
    if (index >= 0) {
      this.queue.splice(index, 1);
      return true;
    }
    return false;
  }

  mergeSimilar(): void {
    const merged: QueuedNotification[] = [];
    const seen = new Map<string, QueuedNotification>();

    for (const item of this.queue) {
      const key = `${item.request.category}:${item.request.title}`;
      const existing = seen.get(key);
      if (existing) {
        existing.request = {
          ...existing.request,
          message: `${existing.request.message}\n${item.request.message}`,
        };
      } else {
        seen.set(key, item);
        merged.push(item);
      }
    }

    this.queue = merged;
  }

  clear(): void {
    this.queue = [];
  }

  getCooldownRemaining(category: NotificationCategory): number {
    const lastAt = this.cooldowns.get(category);
    if (!lastAt) return 0;
    const elapsed = Date.now() - new Date(lastAt).getTime();
    return Math.max(0, NOTIFICATION_COOLDOWN_MS[category] - elapsed);
  }
}
