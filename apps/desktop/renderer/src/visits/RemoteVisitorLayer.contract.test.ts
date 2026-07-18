import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const layer = readFileSync(new URL('./RemoteVisitorLayer.tsx', import.meta.url), 'utf8');

describe('RemoteVisitorLayer departure contract', () => {
  it('keeps a visitor component mounted across active to departing state', () => {
    expect(layer).toContain('key={visitor.sessionId}');
    expect(layer).not.toContain('key={departing ? `departing:${visitor.sessionId}`');
  });
});
