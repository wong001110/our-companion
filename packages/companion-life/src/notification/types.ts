export type NotificationCategory =
  | 'discovery'
  | 'journey'
  | 'reflection'
  | 'reminder'
  | 'relationship'
  | 'system';

export type NotificationPriority =
  | 'critical'
  | 'high'
  | 'normal'
  | 'low';

export type NotificationChannel =
  | 'outside_panel'
  | 'overlay_bubble'
  | 'notebook'
  | 'timeline'
  | 'card_queue';

export interface NotificationRequest {
  id: string;
  category: NotificationCategory;
  priority: NotificationPriority;
  channel: NotificationChannel;
  title: string;
  message: string;
  cardId?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

export interface QueuedNotification {
  request: NotificationRequest;
  queuedAt: string;
  attempts: number;
}

export const NOTIFICATION_PRIORITY_ORDER: Record<NotificationPriority, number> = {
  critical: 100,
  high: 80,
  normal: 50,
  low: 20,
};

export const NOTIFICATION_COOLDOWN_MS: Record<NotificationCategory, number> = {
  discovery: 4 * 60 * 60 * 1000,
  journey: 12 * 60 * 60 * 1000,
  reflection: 24 * 60 * 60 * 1000,
  reminder: 2 * 60 * 60 * 1000,
  relationship: 24 * 60 * 60 * 1000,
  system: 60 * 60 * 1000,
};
