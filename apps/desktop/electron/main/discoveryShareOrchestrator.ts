import type { BrowserWindow } from 'electron';
import { advanceCharacter, applyEmotionEvent } from '@our-companion/character-engine';
import type { CharacterRuntimeState, Discovery, DiscoveryReason, NormalizedDiscovery } from '@our-companion/shared';
import { nowIso } from '@our-companion/shared';

export interface DiscoveryAnnouncePayload {
  discoveryId: string;
  title: string;
  message: string;
}

export interface DiscoveryShareOrchestratorDeps {
  getState: () => CharacterRuntimeState;
  saveState: (state: CharacterRuntimeState) => CharacterRuntimeState;
  generateReason: (discovery: NormalizedDiscovery) => Promise<DiscoveryReason>;
  markAnnounced: (id: string) => void;
  canAnnounce: () => boolean;
  shouldInterruptShare: () => boolean;
  getCompanionWindow: () => BrowserWindow | undefined;
}

const STEP_DELAY_MS = 1200;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class DiscoveryShareOrchestrator {
  private readonly queue: Discovery[] = [];
  private processing = false;
  private stopped = false;

  constructor(private readonly deps: DiscoveryShareOrchestratorDeps) {}

  enqueue(discoveries: Discovery[]): void {
    for (const discovery of discoveries) {
      if (!this.queue.some((item) => item.id === discovery.id)) {
        this.queue.push(discovery);
      }
    }
    void this.processQueue();
  }

  stop(): void {
    this.stopped = true;
    this.queue.length = 0;
  }

  private broadcastState(state: CharacterRuntimeState): void {
    this.deps.getCompanionWindow()?.webContents.send('character:stateChanged', state);
  }

  private broadcastAnnounce(payload: DiscoveryAnnouncePayload): void {
    this.deps.getCompanionWindow()?.webContents.send('discovery:announce', payload);
  }

  private async processQueue(): Promise<void> {
    if (this.processing || this.stopped) return;
    this.processing = true;

    try {
      while (!this.stopped && this.queue.length > 0) {
        if (!this.deps.canAnnounce()) {
          await delay(STEP_DELAY_MS);
          continue;
        }

        const discovery = this.queue.shift();
        if (!discovery) break;

        await this.announceDiscovery(discovery);
      }
    } finally {
      this.processing = false;
      if (!this.stopped && this.queue.length > 0) {
        void this.processQueue();
      }
    }
  }

  private async announceDiscovery(discovery: Discovery): Promise<void> {
    while (!this.deps.canAnnounce() && !this.stopped) {
      await delay(STEP_DELAY_MS);
    }
    if (!this.deps.canAnnounce()) {
      this.queue.unshift(discovery);
      return;
    }

    const context = { availableDiscoveries: [discovery as NormalizedDiscovery], userActive: false };
    let state = this.deps.getState();

    for (let step = 0; step < 4; step += 1) {
      if (this.stopped) {
        this.queue.unshift(discovery);
        return;
      }
      if (step > 0 && this.deps.shouldInterruptShare()) {
        this.queue.unshift(discovery);
        return;
      }

      state = advanceCharacter(state, context);
      if (step === 0) {
        state = {
          ...state,
          emotion: applyEmotionEvent(state.emotion, 'new_high_score_discovery')
        };
      }

      state = this.deps.saveState(state);
      this.broadcastState(state);

      if (state.coreState === 'talking') {
        const reason = await this.deps.generateReason(discovery);
        this.broadcastAnnounce({
          discoveryId: discovery.id,
          title: discovery.title,
          message: reason.short_message
        });
      }

      if (step < 3) {
        await delay(STEP_DELAY_MS);
      }
    }

    const settled: CharacterRuntimeState = {
      ...state,
      intent: 'waiting',
      coreState: 'idle',
      updatedAt: nowIso()
    };
    const saved = this.deps.saveState(settled);
    this.broadcastState(saved);
    this.deps.markAnnounced(discovery.id);
  }
}
