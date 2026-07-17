import type { CompanionCommand } from '@our-companion/shared';
import type { PresentationCandidate } from '../PresentationCandidate';
import type { CommandExecutionHandle } from './commandLifecycle';

type LocalExecutionPhase = 'waiting_to_start' | 'started' | 'completed' | 'cancelled' | 'failed';

export interface DiscoveryCommandPresentationDeps {
  command: CompanionCommand;
  popup: PresentationCandidate | null;
  softHintVisible: boolean;
  companionName: string;
  waitForCandidate: (
    discoveryId: string,
    onAvailable: (candidate: PresentationCandidate) => void,
    onTimeout?: () => void
  ) => () => void;
  presentWhenAvailable: (
    discoveryId: string | undefined,
    onPresented: (candidate: PresentationCandidate) => void
  ) => () => void;
  setSoftHintVisible: (visible: boolean) => void;
  setSoftHintDiscoveryId: (discoveryId: string | undefined) => void;
  showInstant: (message: string) => void;
  showTypewriter: (message: string) => boolean;
  recordSpeech: () => void;
  recordDiscoveryPresented: () => void;
  scheduleFrame: (callback: () => void) => void;
  registerCommandCompletion: (commandId: string, complete: () => void) => void;
  clearCommandCompletion: (commandId: string) => void;
}

export function createDiscoveryCommandPresentationHandle(
  deps: DiscoveryCommandPresentationDeps
): CommandExecutionHandle {
  const { command } = deps;
  let resolveStarted!: () => void;
  let rejectStarted!: (reason: Error) => void;
  let resolveCompleted!: () => void;
  let rejectCompleted!: (reason: Error) => void;
  const started = new Promise<void>((resolve, reject) => { resolveStarted = resolve; rejectStarted = reject; });
  const completed = new Promise<void>((resolve, reject) => { resolveCompleted = resolve; rejectCompleted = reject; });
  let phase: LocalExecutionPhase = 'waiting_to_start';
  let stopCandidateWait: () => void = () => undefined;
  let stopPresentationWait: () => void = () => undefined;

  const clearPendingPresentation = () => {
    stopCandidateWait();
    stopPresentationWait();
    deps.clearCommandCompletion(command.id);
    deps.setSoftHintVisible(false);
    deps.setSoftHintDiscoveryId(undefined);
  };
  const fail = (reason: string) => {
    if (phase === 'completed' || phase === 'cancelled' || phase === 'failed') return;
    const wasWaitingToStart = phase === 'waiting_to_start';
    phase = 'failed';
    clearPendingPresentation();
    if (wasWaitingToStart) {
      rejectStarted(new Error(reason));
      resolveCompleted();
    } else {
      rejectCompleted(new Error(reason));
    }
  };
  const completePresentation = () => {
    if (phase !== 'started') return;
    phase = 'completed';
    deps.clearCommandCompletion(command.id);
    resolveCompleted();
  };
  const beginVisiblePresentation = (completeImmediately: boolean) => {
    deps.scheduleFrame(() => {
      if (phase !== 'waiting_to_start') return;
      phase = 'started';
      resolveStarted();
      if (completeImmediately) completePresentation();
    });
  };
  const cancel = (reason: string) => {
    if (phase === 'completed' || phase === 'cancelled' || phase === 'failed') return;
    const wasWaitingToStart = phase === 'waiting_to_start';
    phase = 'cancelled';
    clearPendingPresentation();
    if (wasWaitingToStart) {
      rejectStarted(new Error(reason));
      resolveCompleted();
    } else {
      rejectCompleted(new Error(reason));
    }
  };
  const onPayloadTimeout = () => fail('discovery_payload_timeout');
  const displayHint = command.decision.displayHint;
  const discoveryId = command.discoveryId;

  if ((displayHint === 'show_soft_hint' || displayHint === 'present_discovery') && !discoveryId) {
    fail('missing_discovery_id');
  } else if (displayHint === 'show_soft_hint' && discoveryId && !deps.popup && !deps.softHintVisible) {
    stopCandidateWait = deps.waitForCandidate(discoveryId, () => {
      if (phase !== 'waiting_to_start') return;
      deps.setSoftHintDiscoveryId(discoveryId);
      deps.setSoftHintVisible(true);
      deps.recordSpeech();
      deps.showInstant(`${deps.companionName} found something interesting. Want to see it?`);
      beginVisiblePresentation(true);
    }, onPayloadTimeout);
  } else if (displayHint === 'present_discovery' && discoveryId) {
    stopCandidateWait = deps.waitForCandidate(discoveryId, () => {
      if (phase !== 'waiting_to_start') return;
      stopPresentationWait = deps.presentWhenAvailable(discoveryId, (candidate) => {
        if (phase !== 'waiting_to_start') return;
        const completedImmediately = deps.showTypewriter(candidate.shareMessage);
        deps.recordDiscoveryPresented();
        beginVisiblePresentation(completedImmediately);
        if (!completedImmediately) {
          deps.registerCommandCompletion(command.id, completePresentation);
        }
      });
    }, onPayloadTimeout);
  } else {
    fail('unsupported_command');
  }

  return { started, completed, cancel };
}
