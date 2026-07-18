import { useEffect, useRef, useState } from 'react';
import type { ExplorationLoopEvent } from '@our-companion/shared';
import {
  createExpeditionState,
  createExplorationVisualController,
  expeditionPhaseToAnimation,
  expeditionReportMessage,
  type ExpeditionOutcome,
} from './ExpeditionState';

function outcomeFromEvent(event: ExplorationLoopEvent): ExpeditionOutcome {
  const message = `${event.message ?? ''} ${JSON.stringify(event.metadata ?? {})}`.toLowerCase();
  if (message.includes('no discovery provider') || message.includes('no_compatible_capability')) return 'no_provider';
  if (message.includes('failed') || message.includes('error')) return 'failure';
  if (message.includes('no valid') || message.includes('not find enough') || message.includes('no curiosity')) return 'empty';
  return event.state === 'sharing' ? 'success' : 'empty';
}

export function useExplorationVisualLifecycle(
  companionId: string,
  showInstant: (message: string) => void,
) {
  const [state, setState] = useState(createExpeditionState);
  const controllerRef = useRef<ReturnType<typeof createExplorationVisualController> | undefined>(undefined);
  const showInstantRef = useRef(showInstant);
  showInstantRef.current = showInstant;

  useEffect(() => {
    const controller = createExplorationVisualController({
      onChange: (next) => {
        setState(next);
        localStorage.setItem('companion:exploration-visual', JSON.stringify({
          cycleId: next.cycleId,
          visualPhase: next.phase,
          startedAt: next.startedAtMs ? new Date(next.startedAtMs).toISOString() : undefined,
          minimumVisualCompletionTime: next.startedAtMs ? new Date(next.startedAtMs + 10_000).toISOString() : undefined,
          resultState: next.outcome,
        }));
        if (next.phase === 'reporting' && next.outcome) {
          showInstantRef.current(expeditionReportMessage(next.outcome));
        }
      },
    });
    controllerRef.current = controller;
    const unsubscribe = window.ourCompanion.autonomy.onExplorationEvent((event) => {
      if (event.companionId !== companionId) return;
      if (event.state === 'curious' || event.state === 'planning') controller.start(event.cycleId);
      if (event.state === 'sharing' || event.state === 'reflecting') {
        controller.complete(event.cycleId, outcomeFromEvent(event));
      }
    });
    return () => {
      unsubscribe();
      controller.dispose();
      controllerRef.current = undefined;
    };
  }, [companionId]);

  return {
    ...state,
    animation: expeditionPhaseToAnimation(state.phase),
    visible: state.phase !== 'away',
    busy: state.phase !== 'idle',
  };
}
