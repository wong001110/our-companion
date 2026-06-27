import type { DatabaseService } from '@our-companion/database';
import type { EventBus } from '@our-companion/event-bus';

export interface AppContext {
  db: DatabaseService;
  eventBus: EventBus;
}
