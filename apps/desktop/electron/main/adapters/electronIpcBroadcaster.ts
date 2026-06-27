import type { BrowserWindow } from 'electron';
import type { EventBus } from '@our-companion/event-bus';
import { DOMAIN_EVENT_TYPES } from '@our-companion/shared';

export interface ElectronIpcBroadcasterDeps {
  eventBus: EventBus;
  getCompanionWindow: () => BrowserWindow | undefined;
  getPanelWindow: () => BrowserWindow | undefined;
}

export class ElectronIpcBroadcaster {
  constructor(private readonly deps: ElectronIpcBroadcasterDeps) {}

  start(): void {
    const { eventBus, getCompanionWindow, getPanelWindow } = this.deps;

    eventBus.subscribe(DOMAIN_EVENT_TYPES.CharacterStateChanged, (event) => {
      const payload = event.payload as { characterId: string; coreState: string; intent: string } | undefined;
      getCompanionWindow()?.webContents.send('character:stateChanged', payload);
      getPanelWindow()?.webContents.send('character:stateChanged', payload);
    });

    eventBus.subscribe(DOMAIN_EVENT_TYPES.AnnMessageQueued, (event) => {
      const payload = event.payload as Record<string, unknown> | undefined;
      getCompanionWindow()?.webContents.send('discovery:announce', payload);
      getPanelWindow()?.webContents.send('discovery:announce', payload);
    });

    eventBus.subscribe(DOMAIN_EVENT_TYPES.FoundationEventLogged, (event) => {
      const payload = event.payload as Record<string, unknown> | undefined;
      getCompanionWindow()?.webContents.send('debug:foundationEvent', payload);
      getPanelWindow()?.webContents.send('debug:foundationEvent', payload);
    });

    eventBus.subscribe(DOMAIN_EVENT_TYPES.PerformanceStarted, (event) => {
      const payload = event.payload as Record<string, unknown> | undefined;
      getCompanionWindow()?.webContents.send('action:performanceStarted', payload);
      getPanelWindow()?.webContents.send('action:performanceStarted', payload);
    });
  }
}
