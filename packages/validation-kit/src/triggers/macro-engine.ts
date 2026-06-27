import { createId, nowIso } from '@our-companion/shared';
import type { Macro, EventChain, TriggerConfig } from './types';

export class MacroEngine {
  private macros: Map<string, Macro> = new Map();

  constructor() {
    this.registerBuiltInMacros();
  }

  list(): Macro[] {
    return Array.from(this.macros.values());
  }

  getById(id: string): Macro | undefined {
    return this.macros.get(id);
  }

  register(macro: Omit<Macro, 'id' | 'createdAt'>): Macro {
    const full: Macro = {
      ...macro,
      id: createId('macro'),
      createdAt: nowIso(),
    };
    this.macros.set(full.id, full);
    return full;
  }

  unregister(id: string): boolean {
    return this.macros.delete(id);
  }

  getChain(id: string): EventChain | undefined {
    return this.macros.get(id)?.chain;
  }

  private registerBuiltInMacros(): void {
    this.register({
      name: 'Morning Routine',
      description: 'Wake → Generate Reflection → Check Discovery → Start Discovery → Return Idle',
      category: 'experience',
      chain: {
        id: 'morning-routine',
        name: 'Morning Routine',
        description: 'Simulate a morning wake cycle',
        steps: [
          { category: 'runtime', eventType: 'ApplicationBoot' },
          { category: 'runtime', eventType: 'Wake' },
          { category: 'notebook', eventType: 'GenerateReflection', params: { type: 'daily' } },
          { category: 'discovery', eventType: 'CheckDiscovery' },
          { category: 'discovery', eventType: 'StartDiscovery' },
          { category: 'runtime', eventType: 'ReturnIdle' },
        ],
      },
    });

    this.register({
      name: 'End Of Day',
      description: 'Reflection → Notebook Update → Sleep',
      category: 'experience',
      chain: {
        id: 'end-of-day',
        name: 'End Of Day',
        description: 'Simulate end-of-day wind down',
        steps: [
          { category: 'notebook', eventType: 'GenerateReflection', params: { type: 'daily' } },
          { category: 'notebook', eventType: 'UpdateNotebook' },
          { category: 'runtime', eventType: 'Sleep' },
        ],
      },
    });

    this.register({
      name: 'Return After Vacation',
      description: 'Wake → Greeting → Check Pending → Discovery → Idle',
      category: 'experience',
      chain: {
        id: 'return-vacation',
        name: 'Return After Vacation',
        description: 'Simulate returning after a long absence',
        steps: [
          { category: 'runtime', eventType: 'ApplicationBoot' },
          { category: 'runtime', eventType: 'Wake' },
          { category: 'relationship', eventType: 'Greeting', params: { type: 'welcome_back' } },
          { category: 'discovery', eventType: 'CheckPendingDiscovery' },
          { category: 'discovery', eventType: 'StartDiscovery' },
          { category: 'runtime', eventType: 'ReturnIdle' },
        ],
      },
    });

    this.register({
      name: 'Discovery Finished',
      description: 'Discovery Completed → Reflection → Card → Notification → Idle',
      category: 'experience',
      chain: {
        id: 'discovery-finished',
        name: 'Discovery Finished',
        description: 'Simulate discovery completion flow',
        steps: [
          { category: 'discovery', eventType: 'DiscoveryCompleted' },
          { category: 'notebook', eventType: 'GenerateReflection', params: { type: 'discovery' } },
          { category: 'notebook', eventType: 'CreateCard', params: { category: 'discovery' } },
          { category: 'notification', eventType: 'QueueNotification', params: { category: 'discovery' } },
          { category: 'runtime', eventType: 'ReturnIdle' },
        ],
      },
    });

    this.register({
      name: 'Journey Milestone',
      description: 'Milestone Reached → Reflection → Card → Celebration',
      category: 'experience',
      chain: {
        id: 'journey-milestone',
        name: 'Journey Milestone',
        description: 'Simulate reaching a journey milestone',
        steps: [
          { category: 'journey', eventType: 'MilestoneReached' },
          { category: 'notebook', eventType: 'GenerateReflection', params: { type: 'journey' } },
          { category: 'notebook', eventType: 'CreateCard', params: { category: 'journey' } },
          { category: 'notification', eventType: 'QueueNotification', params: { category: 'journey' } },
        ],
      },
    });

    this.register({
      name: 'Weekly Review',
      description: 'Generate Weekly Summary → Journey Update → Notebook Refresh',
      category: 'experience',
      chain: {
        id: 'weekly-review',
        name: 'Weekly Review',
        description: 'Simulate weekly review cycle',
        steps: [
          { category: 'notebook', eventType: 'GenerateReflection', params: { type: 'weekly' } },
          { category: 'journey', eventType: 'UpdateJourney' },
          { category: 'notebook', eventType: 'RefreshNotebook' },
        ],
      },
    });
  }
}
