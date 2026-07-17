import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CompanionCommand } from '@our-companion/shared';
import type { PresentationCandidate } from '../PresentationCandidate';
import { DiscoveryQueueManager } from '../DiscoveryQueueManager';
import {
  DISCOVERY_PAYLOAD_TIMEOUT_MS,
  presentDiscoveryWhenAvailable,
  waitForDiscoveryCandidate,
} from '../useDiscoveryPresentation';
import { createCommandExecutor, type ActiveCommandExecution } from './commandLifecycle';
import {
  createDiscoveryCommandPresentationHandle,
  type DiscoveryCommandPresentationDeps,
} from './discoveryCommandPresentation';

function command(displayHint: 'show_soft_hint' | 'present_discovery', discoveryId = 'target'): CompanionCommand {
  return {
    id: `command-${displayHint}`,
    companionId: 'ann',
    discoveryId,
    issuedAt: new Date().toISOString(),
    decision: {
      id: `decision-${displayHint}`,
      action: 'share_discovery',
      timing: displayHint === 'show_soft_hint' ? 'next_idle' : 'now',
      priority: 'normal',
      reason: 'test',
      displayHint,
      createdAt: new Date().toISOString(),
    },
  };
}

function candidate(id: string): PresentationCandidate {
  return {
    id,
    title: `Discovery ${id}`,
    oneLineHook: `Hook ${id}`,
    whyYouMightCare: `Why ${id}`,
    shareMessage: '',
  };
}

function createHarness(item: CompanionCommand) {
  const queue = new DiscoveryQueueManager();
  const state: { softHintVisible: boolean; softHintDiscoveryId?: string } = { softHintVisible: false };
  const frames: Array<() => void> = [];
  const completions = new Map<string, () => void>();
  const showInstant = vi.fn();
  const showTypewriter = vi.fn(() => true);
  const recordSpeech = vi.fn();
  const recordDiscoveryPresented = vi.fn();
  const deps: DiscoveryCommandPresentationDeps = {
    command: item,
    popup: null,
    softHintVisible: false,
    companionName: 'Ann',
    waitForCandidate: (discoveryId, onAvailable, onTimeout) =>
      waitForDiscoveryCandidate(queue, discoveryId, onAvailable, onTimeout),
    presentWhenAvailable: (discoveryId, onPresented) =>
      presentDiscoveryWhenAvailable(queue, discoveryId, onPresented),
    setSoftHintVisible: (visible) => { state.softHintVisible = visible; },
    setSoftHintDiscoveryId: (discoveryId) => { state.softHintDiscoveryId = discoveryId; },
    showInstant,
    showTypewriter,
    recordSpeech,
    recordDiscoveryPresented,
    scheduleFrame: (callback) => { frames.push(callback); },
    registerCommandCompletion: (commandId, complete) => { completions.set(commandId, complete); },
    clearCommandCompletion: (commandId) => { completions.delete(commandId); },
  };
  return {
    queue,
    state,
    deps,
    showInstant,
    showTypewriter,
    recordSpeech,
    recordDiscoveryPresented,
    flushFrames: () => {
      for (const frame of frames.splice(0)) frame();
    },
  };
}

function runCommand(item: CompanionCommand, harness: ReturnType<typeof createHarness>) {
  const acknowledgements: Array<{ status: string; reason?: string }> = [];
  const activeExecution = { current: null as ActiveCommandExecution | null };
  const run = createCommandExecutor({
    companionId: 'ann',
    acknowledge: (_command, status, reason) => { acknowledgements.push({ status, reason }); },
    execute: () => createDiscoveryCommandPresentationHandle(harness.deps),
    handledCommandIds: new Set(),
    activeExecution,
  });
  return { pending: run(item), acknowledgements, activeExecution };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('Discovery command payload wait lifecycle', () => {
  it('does not acknowledge a Soft Hint as started before its matching payload mounts', async () => {
    vi.useFakeTimers();
    const item = command('show_soft_hint');
    const harness = createHarness(item);
    const execution = runCommand(item, harness);

    expect(execution.acknowledgements).toEqual([{ status: 'received', reason: undefined }]);
    expect(harness.state.softHintVisible).toBe(false);

    harness.queue.enqueue(candidate('target'));
    await Promise.resolve();
    expect(harness.state.softHintVisible).toBe(true);
    expect(execution.acknowledgements).toEqual([{ status: 'received', reason: undefined }]);

    harness.flushFrames();
    await execution.pending;
    expect(execution.acknowledgements.map(({ status }) => status)).toEqual(['received', 'started', 'completed']);
  });

  it('cancellation before payload prevents a late Soft Hint', async () => {
    vi.useFakeTimers();
    const item = command('show_soft_hint');
    const harness = createHarness(item);
    const execution = runCommand(item, harness);

    execution.activeExecution.current!.cancel('window_shutdown');
    await execution.pending;
    harness.queue.enqueue(candidate('target'));
    harness.flushFrames();

    expect(execution.acknowledgements.map(({ status }) => status)).toEqual(['received', 'cancelled']);
    expect(harness.state).toEqual({ softHintVisible: false, softHintDiscoveryId: undefined });
    expect(harness.showInstant).not.toHaveBeenCalled();
  });

  it.each(['show_soft_hint', 'present_discovery'] as const)(
    'payload timeout releases the active %s command and ignores a late payload',
    async (displayHint) => {
      vi.useFakeTimers();
      const item = command(displayHint);
      const harness = createHarness(item);
      const execution = runCommand(item, harness);

      await vi.advanceTimersByTimeAsync(DISCOVERY_PAYLOAD_TIMEOUT_MS);
      await execution.pending;
      harness.queue.enqueue(candidate('target'));
      harness.flushFrames();

      expect(execution.activeExecution.current).toBeNull();
      expect(execution.acknowledgements).toEqual([
        { status: 'received', reason: undefined },
        { status: 'failed', reason: 'discovery_payload_timeout' },
      ]);
      expect(harness.state.softHintVisible).toBe(false);
      expect(harness.queue.getCurrent()).toBeUndefined();
    }
  );

  it('an unrelated queued Candidate does not activate the wrong Soft Hint', async () => {
    vi.useFakeTimers();
    const item = command('show_soft_hint');
    const harness = createHarness(item);
    const execution = runCommand(item, harness);

    harness.queue.enqueue(candidate('unrelated'));
    harness.flushFrames();

    expect(harness.state.softHintVisible).toBe(false);
    expect(harness.showInstant).not.toHaveBeenCalled();
    expect(execution.acknowledgements.map(({ status }) => status)).toEqual(['received']);
    execution.activeExecution.current!.cancel('test_cleanup');
    await execution.pending;
  });

  it('the matching Candidate activates the Soft Hint and Show me opens its Card', async () => {
    vi.useFakeTimers();
    const item = command('show_soft_hint');
    const harness = createHarness(item);
    const execution = runCommand(item, harness);

    harness.queue.enqueue(candidate('unrelated'));
    harness.queue.enqueue(candidate('target'));
    harness.flushFrames();
    await execution.pending;

    expect(harness.state).toEqual({ softHintVisible: true, softHintDiscoveryId: 'target' });
    let presented: PresentationCandidate | undefined;
    presentDiscoveryWhenAvailable(harness.queue, harness.state.softHintDiscoveryId, (value) => {
      presented = value;
      harness.state.softHintVisible = false;
    });

    expect(presented?.id).toBe('target');
    expect(harness.queue.getCurrent()?.candidate.id).toBe('target');
    expect(harness.state.softHintVisible).toBe(false);
  });
});
