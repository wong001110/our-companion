import { describe, expect, it, vi } from 'vitest';
import {
  defaultPermissions,
  directPerformance,
  planAction,
  planActionFromRules,
  resolvePermissions,
  runActionPlan,
} from './index';
import type { ActionOrchestratorDeps } from './index';
import type { ActionPermissionState } from '@our-companion/shared';
import { listEnabledActionCapabilities } from '@our-companion/shared';

// ─── Rule-based planner ───────────────────────────────────────────────────

describe('planActionFromRules', () => {
  it('parses open url command', () => {
    const plan = planActionFromRules('open url https://example.com');
    expect(plan).toBeDefined();
    expect(plan?.steps[0].toolName).toBe('open_url');
    expect(plan?.steps[0].args.url).toBe('https://example.com');
    expect(plan?.status).toBe('draft');
  });

  it('parses bare https url shorthand', () => {
    const plan = planActionFromRules('open https://example.com');
    expect(plan?.steps[0].toolName).toBe('open_url');
  });

  it.each([
    ['open youtube.com', 'https://youtube.com'],
    ['open www.youtube.com', 'https://www.youtube.com'],
    ['go to docs.example.co.uk/path', 'https://docs.example.co.uk/path'],
    ['打开 youtube.com', 'https://youtube.com'],
    ['打开 https://youtube.com', 'https://youtube.com'],
  ])('normalizes safe URL command %s', (command, expected) => {
    const plan = planActionFromRules(command);
    expect(plan?.steps[0]).toMatchObject({ toolName: 'open_url', args: { url: expected } });
    expect(plan?.steps[0].requiredScopes).toEqual(['browser']);
  });

  it.each([
    'open javascript:alert(1)',
    'open file:///tmp/private',
    'open data:text/plain,hello',
    'open localhost:3000',
    'open 192.168.1.2',
    'open hello world',
  ])('rejects unsafe or non-domain URL command %s', (command) => {
    expect(planActionFromRules(command)).toBeUndefined();
  });

  it('parses open app command', () => {
    const plan = planActionFromRules('open app chrome');
    expect(plan?.steps[0].toolName).toBe('open_app');
    expect(plan?.steps[0].args.appName).toBe('chrome');
  });

  it('parses search web for command', () => {
    const plan = planActionFromRules('search web for PixiJS tutorials');
    expect(plan?.steps[0].toolName).toBe('search_web');
    expect(plan?.steps[0].args.query).toBe('PixiJS tutorials');
  });

  it('parses search <target> for <query>', () => {
    const plan = planActionFromRules('search youtube for lo-fi music');
    expect(plan?.steps[0].toolName).toBe('search_web');
    expect(plan?.steps[0].args.target).toBe('youtube');
    expect(plan?.steps[0].args.query).toBe('lo-fi music');
  });

  it('parses composite open app and search', () => {
    const plan = planActionFromRules('open chrome and search youtube');
    expect(plan).toBeDefined();
    expect(plan?.steps).toHaveLength(2);
    expect(plan?.steps[0].toolName).toBe('open_app');
    expect(plan?.steps[1].toolName).toBe('search_web');
  });

  it('returns undefined for unmatched text', () => {
    expect(planActionFromRules('tell me a joke')).toBeUndefined();
    expect(planActionFromRules('')).toBeUndefined();
  });

  it('assigns browser scope to open_url steps', () => {
    const plan = planActionFromRules('open url https://example.com');
    expect(plan?.steps[0].requiredScopes).toContain('browser');
  });

  it('assigns automation scope to open_app steps', () => {
    const plan = planActionFromRules('open app chrome');
    expect(plan?.steps[0].requiredScopes).toContain('automation');
  });
});

describe('planAction', () => {
  it('returns rule plan without calling llm', async () => {
    const llm = { completeJson: vi.fn(), validateActionPlan: vi.fn() };
    const plan = await planAction('open url https://example.com', llm);
    expect(plan).toBeDefined();
    expect(llm.completeJson).not.toHaveBeenCalled();
  });

  it('falls back to llm when rules do not match', async () => {
    const llmPlan = { summary: 'Open example', steps: [{ tool_name: 'open_url', args: { url: 'https://example.com' } }] };
    const llm = {
      completeJson: vi.fn().mockResolvedValue(JSON.stringify(llmPlan)),
      validateActionPlan: vi.fn().mockReturnValue(llmPlan),
    };
    const plan = await planAction('please navigate to example.com', llm);
    expect(llm.completeJson).toHaveBeenCalledOnce();
    expect(plan?.status).toBe('draft');
    const systemPrompt = llm.completeJson.mock.calls[0][0][0].content;
    for (const capability of listEnabledActionCapabilities()) {
      expect(systemPrompt).toContain(`Tool: ${capability.toolName}`);
      expect(systemPrompt).toContain(`Required scopes: ${capability.requiredScopes.join(', ')}`);
    }
  });

  it('restores the canonical permission scope when the llm returns an empty list', async () => {
    const llmPlan = {
      summary: 'Open example',
      steps: [{ tool_name: 'open_url', args: { url: 'https://example.com' }, required_scopes: [] }],
    };
    const llm = {
      completeJson: vi.fn().mockResolvedValue(JSON.stringify(llmPlan)),
      validateActionPlan: vi.fn().mockReturnValue(llmPlan),
    };

    const plan = await planAction('please navigate to example.com', llm);

    expect(plan?.steps[0].requiredScopes).toEqual(['browser']);
    expect(resolvePermissions(plan!, defaultPermissions())).toEqual(['browser']);
  });

  it('rejects an unknown tool returned by the llm', async () => {
    const llmPlan = {
      summary: 'Run an unsupported command',
      steps: [{ tool_name: 'run_shell', args: {}, required_scopes: [] }],
    };
    const llm = {
      completeJson: vi.fn().mockResolvedValue(JSON.stringify(llmPlan)),
      validateActionPlan: vi.fn().mockReturnValue(llmPlan),
    };

    expect(await planAction('run a shell command', llm)).toBeUndefined();
  });

  it('returns undefined when no rules match and no llm provided', async () => {
    const plan = await planAction('tell me a joke');
    expect(plan).toBeUndefined();
  });
});

// ─── Permission manager ───────────────────────────────────────────────────

describe('resolvePermissions', () => {
  it('returns ok when all required scopes are granted', () => {
    const perms: ActionPermissionState = { ...defaultPermissions(), browser: 'granted' };
    const plan = planActionFromRules('open url https://example.com')!;
    expect(resolvePermissions(plan, perms)).toBe('ok');
  });

  it('returns denied when a required scope is denied', () => {
    const perms: ActionPermissionState = { ...defaultPermissions(), browser: 'denied' };
    const plan = planActionFromRules('open url https://example.com')!;
    expect(resolvePermissions(plan, perms)).toBe('denied');
  });

  it('returns list of scopes needing confirmation when ask', () => {
    const perms: ActionPermissionState = defaultPermissions();
    const plan = planActionFromRules('open url https://example.com')!;
    const result = resolvePermissions(plan, perms);
    expect(Array.isArray(result)).toBe(true);
    expect(result).toContain('browser');
  });

  it('returns ok for empty steps', () => {
    const perms: ActionPermissionState = defaultPermissions();
    const plan = { id: 'p1', intentId: 'i1', steps: [], requiredPermissions: [], riskLevel: 'low' as const, confirmationRequired: false, status: 'draft' as const };
    expect(resolvePermissions(plan, perms)).toBe('ok');
  });

  it('does not trust an empty requiredScopes list for a known tool', () => {
    const plan = planActionFromRules('open url https://example.com')!;
    plan.steps[0].requiredScopes = [];

    expect(resolvePermissions(plan, defaultPermissions())).toEqual(['browser']);
  });

  it('denies unknown tools even when they declare no scopes', () => {
    const plan = planActionFromRules('open url https://example.com')!;
    plan.steps[0].toolName = 'run_shell';
    plan.steps[0].requiredScopes = [];

    expect(resolvePermissions(plan, {
      ...defaultPermissions(),
      browser: 'granted',
      automation: 'granted',
    })).toBe('denied');
  });
});

// ─── Action orchestrator ──────────────────────────────────────────────────

function makeDeps(overrides: Partial<ActionOrchestratorDeps> = {}): ActionOrchestratorDeps {
  return {
    executeStep: vi.fn().mockResolvedValue({ status: 'executed' }),
    emitEvent: vi.fn(),
    getPermissions: vi.fn().mockReturnValue({ browser: 'granted', automation: 'granted', files: 'ask', clipboard: 'ask', calendar: 'ask' }),
    directPerformance: vi.fn().mockReturnValue({ id: 'perf_1', name: 'action', behaviourType: 'perform_action', animationSequence: [], interruptible: true }),
    broadcastPerformance: vi.fn(),
    ...overrides,
  };
}

describe('runActionPlan', () => {
  it('returns completed when all steps succeed', async () => {
    const plan = planActionFromRules('open url https://example.com')!;
    const deps = makeDeps();
    const result = await runActionPlan(plan, deps);
    expect(result.status).toBe('success');
  });

  it('emits ActionPlanned, PermissionGranted, CommandStarted, CommandCompleted, PerformanceStarted, PerformanceCompleted', async () => {
    const plan = planActionFromRules('open url https://example.com')!;
    const deps = makeDeps();
    await runActionPlan(plan, deps);
    const types = (deps.emitEvent as ReturnType<typeof vi.fn>).mock.calls.map((c: unknown[]) => c[0]);
    expect(types).toContain('ActionPlanned');
    expect(types).toContain('PermissionGranted');
    expect(types).toContain('CommandStarted');
    expect(types).toContain('CommandCompleted');
    expect(types).toContain('PerformanceStarted');
    expect(types).toContain('PerformanceCompleted');
  });

  it('returns cancelled when scope is ask', async () => {
    const plan = planActionFromRules('open url https://example.com')!;
    const deps = makeDeps({
      getPermissions: vi.fn().mockReturnValue(defaultPermissions()),
    });
    const result = await runActionPlan(plan, deps);
    expect(result.status).toBe('cancelled');
    expect(result.errors).toBeDefined();
    expect(result.errors!.length).toBeGreaterThan(0);
    expect(deps.executeStep).not.toHaveBeenCalled();
  });

  it('returns cancelled when scope is denied', async () => {
    const plan = planActionFromRules('open url https://example.com')!;
    const deps = makeDeps({
      getPermissions: vi.fn().mockReturnValue({ ...defaultPermissions(), browser: 'denied' }),
    });
    const result = await runActionPlan(plan, deps);
    expect(result.status).toBe('cancelled');
    expect(result.errors).toContain('Permission denied for this action.');
    expect(deps.executeStep).not.toHaveBeenCalled();
  });

  it('does not retry a failure that was not explicitly marked recoverable', async () => {
    const plan = planActionFromRules('open url https://example.com')!;
    const deps = makeDeps({
      executeStep: vi.fn().mockResolvedValue({ status: 'failed', errorMessage: 'network error' }),
    });
    const result = await runActionPlan(plan, deps);
    expect(result.status).toBe('failure');
    expect(deps.executeStep).toHaveBeenCalledOnce();
    const types = (deps.emitEvent as ReturnType<typeof vi.fn>).mock.calls.map((c: unknown[]) => c[0]);
    expect(types).toContain('ActionFailed');
  });

  it('retries once when a failure is explicitly marked recoverable', async () => {
    const plan = planActionFromRules('open url https://example.com')!;
    const executeStep = vi.fn()
      .mockResolvedValueOnce({ status: 'failed', errorMessage: 'temporary outage', recoverable: true })
      .mockResolvedValueOnce({ status: 'executed' });
    const deps = makeDeps({ executeStep });

    const result = await runActionPlan(plan, deps);

    expect(result.status).toBe('success');
    expect(executeStep).toHaveBeenCalledTimes(2);
  });

  it('reports the retry outcome when a recoverable failure remains unsuccessful', async () => {
    const plan = planActionFromRules('open url https://example.com')!;
    const executeStep = vi.fn()
      .mockResolvedValueOnce({ status: 'failed', errorMessage: 'temporary outage', recoverable: true })
      .mockResolvedValueOnce({ status: 'failed', errorMessage: 'permanent failure' });
    const deps = makeDeps({ executeStep });

    const result = await runActionPlan(plan, deps);

    expect(result.status).toBe('failure');
    expect(result.errors).toEqual(['permanent failure']);
    expect(executeStep).toHaveBeenCalledTimes(2);
  });

  it('denies an unknown tool before reaching the execution adapter', async () => {
    const plan = planActionFromRules('open url https://example.com')!;
    plan.steps[0].toolName = 'run_shell';
    plan.steps[0].requiredScopes = [];
    const deps = makeDeps();

    const result = await runActionPlan(plan, deps);

    expect(result.status).toBe('cancelled');
    expect(deps.executeStep).not.toHaveBeenCalled();
  });
});

// ─── Performance director ─────────────────────────────────────────────────

describe('directPerformance', () => {
  it('returns a performance script with animationSequence for success', () => {
    const script = directPerformance('action_1', 'success');
    expect(script.name).toBe('action_1');
    expect(script.animationSequence.length).toBeGreaterThan(0);
    const keys = script.animationSequence.map((s) => s.payload && typeof s.payload === 'object' && 'animationKey' in s.payload
      ? (s.payload as { animationKey: string }).animationKey
      : s.id);
    expect(keys).toContain('Expedition_Return');
  });

  it('returns a performance script with animationSequence for failure', () => {
    const script = directPerformance('action_2', 'failure');
    const keys = script.animationSequence.map((s) => s.payload && typeof s.payload === 'object' && 'animationKey' in s.payload
      ? (s.payload as { animationKey: string }).animationKey
      : s.id);
    expect(keys).toContain('Expedition_Return');
  });
});
