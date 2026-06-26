import { describe, expect, it, vi } from 'vitest';
import { defaultPermissions, directPerformance, planAction, planActionFromRules, resolvePermissions, runActionPlan, } from './index';
// ─── Rule-based planner ───────────────────────────────────────────────────
describe('planActionFromRules', () => {
    it('parses open url command', () => {
        const plan = planActionFromRules('open url https://example.com');
        expect(plan).toBeDefined();
        expect(plan?.steps[0].toolName).toBe('open_url');
        expect(plan?.steps[0].args.url).toBe('https://example.com');
        expect(plan?.source).toBe('rule');
    });
    it('parses bare https url shorthand', () => {
        const plan = planActionFromRules('open https://example.com');
        expect(plan?.steps[0].toolName).toBe('open_url');
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
        expect(plan?.source).toBe('llm');
    });
    it('returns undefined when no rules match and no llm provided', async () => {
        const plan = await planAction('tell me a joke');
        expect(plan).toBeUndefined();
    });
});
// ─── Permission manager ───────────────────────────────────────────────────
describe('resolvePermissions', () => {
    it('returns ok when all required scopes are granted', () => {
        const perms = { ...defaultPermissions(), browser: 'granted' };
        const plan = planActionFromRules('open url https://example.com');
        expect(resolvePermissions(plan, perms)).toBe('ok');
    });
    it('returns denied when a required scope is denied', () => {
        const perms = { ...defaultPermissions(), browser: 'denied' };
        const plan = planActionFromRules('open url https://example.com');
        expect(resolvePermissions(plan, perms)).toBe('denied');
    });
    it('returns list of scopes needing confirmation when ask', () => {
        const perms = defaultPermissions();
        const plan = planActionFromRules('open url https://example.com');
        const result = resolvePermissions(plan, perms);
        expect(Array.isArray(result)).toBe(true);
        expect(result).toContain('browser');
    });
    it('returns ok for empty steps', () => {
        const perms = defaultPermissions();
        const plan = { id: 'p1', summary: 'noop', steps: [], source: 'rule', createdAt: '' };
        expect(resolvePermissions(plan, perms)).toBe('ok');
    });
});
// ─── Action orchestrator ──────────────────────────────────────────────────
function makeDeps(overrides = {}) {
    return {
        executeStep: vi.fn().mockResolvedValue({ status: 'executed' }),
        emitEvent: vi.fn(),
        getPermissions: vi.fn().mockReturnValue({ browser: 'granted', automation: 'granted', files: 'ask', clipboard: 'ask', calendar: 'ask' }),
        directPerformance: vi.fn().mockReturnValue({ id: 'perf_1', actionId: 'a', steps: [], createdAt: '' }),
        broadcastPerformance: vi.fn(),
        ...overrides,
    };
}
describe('runActionPlan', () => {
    it('returns completed when all steps succeed', async () => {
        const plan = planActionFromRules('open url https://example.com');
        const deps = makeDeps();
        const result = await runActionPlan(plan, deps);
        expect(result.status).toBe('completed');
    });
    it('emits ActionPlanned, PermissionGranted, CommandStarted, CommandCompleted, PerformanceStarted, PerformanceCompleted', async () => {
        const plan = planActionFromRules('open url https://example.com');
        const deps = makeDeps();
        await runActionPlan(plan, deps);
        const types = deps.emitEvent.mock.calls.map((c) => c[0]);
        expect(types).toContain('ActionPlanned');
        expect(types).toContain('PermissionGranted');
        expect(types).toContain('CommandStarted');
        expect(types).toContain('CommandCompleted');
        expect(types).toContain('PerformanceStarted');
        expect(types).toContain('PerformanceCompleted');
    });
    it('returns await_permission when scope is ask', async () => {
        const plan = planActionFromRules('open url https://example.com');
        const deps = makeDeps({
            getPermissions: vi.fn().mockReturnValue(defaultPermissions()),
        });
        const result = await runActionPlan(plan, deps);
        expect(result.status).toBe('await_permission');
    });
    it('returns blocked when scope is denied', async () => {
        const plan = planActionFromRules('open url https://example.com');
        const deps = makeDeps({
            getPermissions: vi.fn().mockReturnValue({ ...defaultPermissions(), browser: 'denied' }),
        });
        const result = await runActionPlan(plan, deps);
        expect(result.status).toBe('blocked');
    });
    it('returns failed and emits ActionFailed when a step fails after retry', async () => {
        const plan = planActionFromRules('open url https://example.com');
        const deps = makeDeps({
            executeStep: vi.fn().mockResolvedValue({ status: 'failed', errorMessage: 'network error' }),
        });
        const result = await runActionPlan(plan, deps);
        expect(result.status).toBe('failed');
        const types = deps.emitEvent.mock.calls.map((c) => c[0]);
        expect(types).toContain('ActionFailed');
    });
});
// ─── Performance director ─────────────────────────────────────────────────
describe('directPerformance', () => {
    it('returns a PerformanceScript with steps for success', () => {
        const script = directPerformance('action_1', 'success');
        expect(script.actionId).toBe('action_1');
        expect(script.steps.length).toBeGreaterThan(0);
        const keys = script.steps.map((s) => s.animationKey);
        expect(keys).toContain('task_success');
    });
    it('returns a PerformanceScript with steps for failure', () => {
        const script = directPerformance('action_2', 'failure');
        const keys = script.steps.map((s) => s.animationKey);
        expect(keys).toContain('task_failed');
    });
});
