import { describe, expect, it } from 'vitest';
import { FakeAiProvider } from './fake-ai-provider';
import { FakeClock } from './fake-clock';
import { FakeDiscoveryProvider } from './fake-discovery-provider';
import { FakeRandomSource } from './fake-random-source';
import { FakeRendererGateway } from './fake-renderer-gateway';
import { FakeToolAdapters } from './fake-tool-adapters';

describe('Validation Kit deterministic fakes', () => {
  it('advances scheduled work without real waiting', () => {
    const clock = new FakeClock('2026-07-17T00:00:00.000Z');
    let ticks = 0;
    clock.setTimeout(() => { ticks += 1; }, 90_000);

    clock.advanceBy(89_000);
    expect(ticks).toBe(0);
    clock.advanceBy(1_000);
    expect(ticks).toBe(1);
    expect(clock.nowIso()).toBe('2026-07-17T00:01:30.000Z');
  });

  it('replays a deterministic random sequence', () => {
    const random = new FakeRandomSource([0.1, 0.9]);
    expect([random.next(), random.next(), random.next()]).toEqual([0.1, 0.9, 0.1]);
    random.reset();
    expect(random.next()).toBe(0.1);
  });

  it('supports deterministic provider results and failures', async () => {
    const provider = new FakeDiscoveryProvider();
    provider.enqueue([{ id: 'discovery-1', title: 'Fixture' }]);
    provider.enqueueError('rate limited');

    await expect(provider.search({ query: 'fixture' })).resolves.toEqual([
      { id: 'discovery-1', title: 'Fixture' },
    ]);
    await expect(provider.search({ query: 'fixture' })).rejects.toThrow('rate limited');
    expect(provider.mode).toBe('fixture');
    expect(provider.calls).toHaveLength(2);
  });

  it('records fake AI, tool, and renderer interactions', async () => {
    const clock = new FakeClock('2026-07-17T00:00:00.000Z');
    const ai = new FakeAiProvider([{ answer: 'deterministic' }]);
    const tools = new FakeToolAdapters();
    const renderer = new FakeRendererGateway(clock);
    tools.enqueueResult('open_url', { opened: true });
    renderer.enqueueAcknowledgement('cancelled', 'user_interrupted');

    await expect(ai.complete({ operation: 'summarize' })).resolves.toEqual({
      answer: 'deterministic',
    });
    await expect(tools.openUrl('https://example.com')).resolves.toEqual({ opened: true });
    await expect(renderer.dispatch({
      id: 'command-1',
      companionId: 'companion-1',
      kind: 'present_discovery',
    })).resolves.toEqual({
      commandId: 'command-1',
      status: 'cancelled',
      reportedAt: '2026-07-17T00:00:00.000Z',
      reason: 'user_interrupted',
    });

    expect(ai.calls).toEqual([{ operation: 'summarize' }]);
    expect(tools.calls).toEqual([{
      toolName: 'open_url',
      args: { url: 'https://example.com' },
    }]);
    expect(renderer.commands).toHaveLength(1);
  });
});
