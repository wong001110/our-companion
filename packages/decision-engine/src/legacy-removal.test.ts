import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('legacy flow removal — negative tests', () => {
  it('services.ts does not call decideCompanionAction (V1 production path removed)', () => {
    const source = readFileSync(
      resolve(__dirname, '../../../apps/desktop/electron/main/services.ts'),
      'utf8'
    );
    expect(source).not.toContain('decideCompanionAction');
    expect(source).not.toContain('emitDecisionEventsForDiscovery');
    expect(source).not.toContain('discoveryAnnounceBroadcaster');
  });

  it('index.ts does not register direct character/discovery IPC broadcasters', () => {
    const source = readFileSync(
      resolve(__dirname, '../../../apps/desktop/electron/main/index.ts'),
      'utf8'
    );
    expect(source).not.toContain('characterState:');
    expect(source).not.toContain('discoveryAnnounce:');
  });

  it('CompanionBehaviorController does not contain initiative-based local decisions', () => {
    const source = readFileSync(
      resolve(__dirname, '../../../apps/desktop/renderer/src/companion/behavior/CompanionBehaviorController.ts'),
      'utf8'
    );
    expect(source).not.toContain('adjustedInitiative');
    expect(source).not.toContain('SOFT_HINT_GAP');
    expect(source).toContain('applyBehaviorHint');
  });
});
