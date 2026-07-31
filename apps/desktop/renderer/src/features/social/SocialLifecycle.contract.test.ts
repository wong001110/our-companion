import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const page = readFileSync(new URL('../../pages/SocialPage.tsx', import.meta.url), 'utf8');
const rows = readFileSync(new URL('./SocialRows.tsx', import.meta.url), 'utf8');
const model = readFileSync(new URL('./useSocialViewModel.ts', import.meta.url), 'utf8');
const conversation = readFileSync(new URL('./SocialVisitConversation.tsx', import.meta.url), 'utf8');

describe('Social lifecycle UI contract', () => {
  it('uses independently loaded domain snapshots instead of global empty claims', () => {
    expect(model).toContain('loadedDomains');
    expect(model).toContain('incomingVisitInvitations');
    expect(model).toContain('outgoingVisitInvitations');
    expect(page).toContain('loadedDomains.incomingRequests');
    expect(page).toContain('loadedDomains.outgoingVisitInvitations');
  });

  it('guards local results and mutations by server-and-account scope', () => {
    expect(model).toContain("`${status.serverUrl}\\u0000${status.account.id}`");
    expect(page).toContain('isScopeCurrent(operationScope)');
    expect(page).toContain('setPendingDestructiveAction(undefined)');
  });

  it('renders structured rows with machine-readable times and no terminal invitation actions', () => {
    expect(rows).toContain('<OperationalRow');
    expect(rows).toContain('<time dateTime={request.createdAt}>');
    expect(rows).toContain('<time dateTime={invitation.expiresAt}>');
    expect(rows).toContain("invitation.status === 'pending'");
    expect(rows).toContain('social_visit_visual_only');
  });

  it('keeps confirmation busy state tied to a submitted mutation only', () => {
    expect(page).toContain('busy={actionBusy}');
    expect(page).not.toContain('busy={busyAction} danger');
  });

  it('renders the centralized mutation phase and visible disabled reason', () => {
    expect(page).toContain('SOCIAL_MUTATION_PRESENTATION[mutationPhase]');
    expect(page).toContain('disabledReason={mutationReason}');
    expect(page).toContain('<LoadingState label={mutationReason} />');
  });

  it('maps Visit admission machine codes to translated UI messages', () => {
    expect(page).toContain('visitAdmissionMessage');
    expect(page).toContain('VISIT_HOST_CAPACITY_REACHED');
    expect(page).toContain('VISIT_HOST_COMPANION_SWITCH_BLOCKED');
    expect(page).not.toContain("disabledReason={mutationReason ?? (hostAtCapacity ? 'VISIT_HOST_CAPACITY_REACHED'");
  });
  it('does not permanently consume an automatic turn when a refresh cancels its delay', () => {
    const timerIndex = conversation.indexOf('const timer = window.setTimeout(() => {');
    const requestIndex = conversation.indexOf('requestedTurnKey.current = turnKey;', timerIndex);
    expect(timerIndex).toBeGreaterThan(-1);
    expect(requestIndex).toBeGreaterThan(timerIndex);
    expect(conversation).toContain('void respond(turnKey);');
    expect(conversation).toContain('}, 2800);');
  });

  it('allows terminal Visit cards to be dismissed only from the current client scope', () => {
    expect(page).toContain('dismissedTerminalVisitIds');
    expect(page).toContain('readDismissedTerminalVisitIds(scopeKey)');
    expect(page).toContain('writeDismissedTerminalVisitIds(scopeKey, next)');
    expect(page).toContain('data-testid="clear-terminal-visit"');
    expect(page).toContain('Network Portal Social Journal is preserved.');
  });

});
