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

  it('renderer behavior hook has no secondary decision timer or behavior-hint flow', () => {
    const source = readFileSync(
      resolve(__dirname, '../../../apps/desktop/renderer/src/companion/behavior/useCompanionBehavior.ts'),
      'utf8'
    );
    expect(source).not.toContain('setInterval');
    expect(source).not.toContain('applyBehaviorHint');
    expect(source).not.toContain('displayHint');
    expect(source).toContain('onCommand');
    expect(source).toContain("'received'");
    expect(source).toContain("'completed'");
  });
});
