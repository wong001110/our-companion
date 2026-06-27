import { nowIso } from '@our-companion/shared';
import type { OverlayConfig, OverlaySnapshot, OverlaySection } from './types';

export interface DebugOverlayDeps {
  getRuntimeState(): Record<string, unknown>;
  getContextState(): Record<string, unknown>;
  getBehaviorState(): Record<string, unknown>;
  getAttentionState(): Record<string, unknown>;
  getInitiativeState(): Record<string, unknown>;
  getPresenceState(): Record<string, unknown>;
  getConversationState(): Record<string, unknown>;
  getDiscoveryState(): Record<string, unknown>;
  getJourneyState(): Record<string, unknown>;
  getRelationshipState(): Record<string, unknown>;
  getNotebookState(): Record<string, unknown>;
  getMemoryState(): Record<string, unknown>;
  getNotificationState(): Record<string, unknown>;
}

export class DebugOverlay {
  private config: OverlayConfig = {
    visible: false,
    sections: ['runtime', 'context', 'behavior', 'attention', 'initiative', 'presence', 'conversation', 'discovery', 'journey', 'relationship', 'notebook', 'memory', 'notification'],
    docked: true,
    compact: false,
  };
  private readonly deps: DebugOverlayDeps;
  private pinnedValues: Map<string, unknown> = new Map();

  constructor(deps: DebugOverlayDeps) {
    this.deps = deps;
  }

  getConfig(): OverlayConfig {
    return { ...this.config, sections: [...this.config.sections] };
  }

  setVisible(visible: boolean): void {
    this.config = { ...this.config, visible };
  }

  toggle(): void {
    this.config = { ...this.config, visible: !this.config.visible };
  }

  setDocked(docked: boolean): void {
    this.config = { ...this.config, docked };
  }

  setCompact(compact: boolean): void {
    this.config = { ...this.config, compact };
  }

  toggleSection(section: OverlaySection): void {
    const sections = this.config.sections.includes(section)
      ? this.config.sections.filter((s) => s !== section)
      : [...this.config.sections, section];
    this.config = { ...this.config, sections };
  }

  getSnapshot(): OverlaySnapshot {
    return {
      runtime: this.deps.getRuntimeState(),
      context: this.deps.getContextState(),
      behavior: this.deps.getBehaviorState(),
      attention: this.deps.getAttentionState(),
      initiative: this.deps.getInitiativeState(),
      presence: this.deps.getPresenceState(),
      conversation: this.deps.getConversationState(),
      discovery: this.deps.getDiscoveryState(),
      journey: this.deps.getJourneyState(),
      relationship: this.deps.getRelationshipState(),
      notebook: this.deps.getNotebookState(),
      memory: this.deps.getMemoryState(),
      notification: this.deps.getNotificationState(),
      timestamp: nowIso(),
    };
  }

  getSectionData(section: OverlaySection): Record<string, unknown> {
    const snapshot = this.getSnapshot();
    return snapshot[section] ?? {};
  }

  pinValue(key: string, value: unknown): void {
    this.pinnedValues.set(key, value);
  }

  unpinValue(key: string): void {
    this.pinnedValues.delete(key);
  }

  getPinnedValues(): Record<string, unknown> {
    return Object.fromEntries(this.pinnedValues);
  }
}
