export interface QuickActionVisibilityState {
  visible: boolean;
  pinned: boolean;
}

export interface QuickActionTimerApi {
  setTimeout(callback: () => void, delayMs: number): ReturnType<typeof setTimeout>;
  clearTimeout(handle: ReturnType<typeof setTimeout>): void;
}

/** Timer-driven behavior shared by the React hook and deterministic unit tests. */
export class QuickActionVisibilityMachine {
  private state: QuickActionVisibilityState = { visible: false, pinned: false };
  private showTimer: ReturnType<typeof setTimeout> | undefined;
  private hideTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(
    private readonly onChange: (state: QuickActionVisibilityState) => void,
    private readonly options: { showDelayMs: number; hideGraceMs: number },
    private readonly timers: QuickActionTimerApi = globalThis,
  ) {}

  enterGroup(): void {
    this.clearHideTimer();
    if (this.state.visible || this.showTimer !== undefined) return;
    this.showTimer = this.timers.setTimeout(() => {
      this.showTimer = undefined;
      this.setState({ ...this.state, visible: true });
    }, this.options.showDelayMs);
  }

  leaveGroup(): void {
    this.clearShowTimer();
    if (this.state.pinned || !this.state.visible) return;
    this.clearHideTimer();
    this.hideTimer = this.timers.setTimeout(() => {
      this.hideTimer = undefined;
      this.setState({ ...this.state, visible: false });
    }, this.options.hideGraceMs);
  }

  togglePinned(): void {
    this.clearTimers();
    this.setState(this.state.pinned ? { visible: false, pinned: false } : { visible: true, pinned: true });
  }

  close(): void {
    this.clearTimers();
    this.setState({ visible: false, pinned: false });
  }

  destroy(): void {
    this.clearTimers();
  }

  private setState(next: QuickActionVisibilityState): void {
    this.state = next;
    this.onChange(next);
  }

  private clearShowTimer(): void {
    if (this.showTimer !== undefined) this.timers.clearTimeout(this.showTimer);
    this.showTimer = undefined;
  }

  private clearHideTimer(): void {
    if (this.hideTimer !== undefined) this.timers.clearTimeout(this.hideTimer);
    this.hideTimer = undefined;
  }

  private clearTimers(): void {
    this.clearShowTimer();
    this.clearHideTimer();
  }
}
