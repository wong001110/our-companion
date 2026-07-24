import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const write = (file, content) => {
  const target = path.join(root, file);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content);
};
const replaceOnce = (content, before, after, label) => {
  const count = content.split(before).length - 1;
  if (count !== 1) throw new Error(`${label}: expected one match, found ${count}`);
  return content.replace(before, after);
};

const gateSource = `import { AppShuttingDownError } from './OperationTracker';

export interface IpcOperationDrainResult {
  drained: boolean;
  active: number;
}

/**
 * Main-process admission and drain gate for every renderer IPC route.
 * It closes the gap between route-level service methods and the internal
 * OperationTracker without forcing every short synchronous mutation to own a
 * second token.
 */
export class IpcOperationGate {
  private accepting = true;
  private readonly active = new Set<Promise<unknown>>();
  private drainWaiters: Array<() => void> = [];

  isAccepting(): boolean { return this.accepting; }
  activeCount(): number { return this.active.size; }
  stopAccepting(): void { this.accepting = false; }

  run<T>(operation: () => T | Promise<T>): Promise<T> {
    if (!this.accepting) return Promise.reject(new AppShuttingDownError());
    let tracked!: Promise<T>;
    tracked = Promise.resolve().then(operation).finally(() => {
      this.active.delete(tracked);
      if (this.active.size === 0) this.drainWaiters.splice(0).forEach((resolve) => resolve());
    });
    this.active.add(tracked);
    return tracked;
  }

  async drain(timeoutMs: number): Promise<IpcOperationDrainResult> {
    if (this.active.size === 0) return { drained: true, active: 0 };
    const drained = await Promise.race([
      new Promise<boolean>((resolve) => this.drainWaiters.push(() => resolve(true))),
      new Promise<boolean>((resolve) => setTimeout(() => resolve(false), Math.max(0, timeoutMs))),
    ]);
    return { drained, active: this.active.size };
  }
}
`;

const gateTest = `import { describe, expect, it } from 'vitest';
import { AppShuttingDownError } from './OperationTracker';
import { IpcOperationGate } from './IpcOperationGate';

describe('IpcOperationGate', () => {
  it('rejects new renderer work after admission closes', async () => {
    const gate = new IpcOperationGate();
    gate.stopAccepting();
    await expect(gate.run(() => 'late')).rejects.toBeInstanceOf(AppShuttingDownError);
  });

  it('drains work that began before shutdown', async () => {
    const gate = new IpcOperationGate();
    let release!: () => void;
    const work = gate.run(() => new Promise<void>((resolve) => { release = resolve; }));
    gate.stopAccepting();
    const draining = gate.drain(100);
    release();
    await work;
    await expect(draining).resolves.toEqual({ drained: true, active: 0 });
  });

  it('reports a bounded timeout without losing the active count', async () => {
    const gate = new IpcOperationGate();
    let release!: () => void;
    const work = gate.run(() => new Promise<void>((resolve) => { release = resolve; }));
    gate.stopAccepting();
    await expect(gate.drain(1)).resolves.toEqual({ drained: false, active: 1 });
    release();
    await work;
  });
});
`;

const policySource = `export interface DatabaseCloseDecisionInput {
  allowDatabaseClose: boolean;
  operationsDrained: boolean;
  activeOperationCount: number;
}

/** SQLite may close only after both external IPC work and internal operations
 * have lost every path to a late commit. Process exit is the safe fallback for
 * an uncancellable operation that outlives the bounded shutdown window. */
export function shouldCloseDatabaseAfterDrain(input: DatabaseCloseDecisionInput): boolean {
  return input.allowDatabaseClose && input.operationsDrained && input.activeOperationCount === 0;
}
`;

const policyTest = `import { describe, expect, it } from 'vitest';
import { shouldCloseDatabaseAfterDrain } from './ShutdownDrainPolicy';

describe('shouldCloseDatabaseAfterDrain', () => {
  it('closes only when IPC admission allowed closure and internal work drained', () => {
    expect(shouldCloseDatabaseAfterDrain({ allowDatabaseClose: true, operationsDrained: true, activeOperationCount: 0 })).toBe(true);
    expect(shouldCloseDatabaseAfterDrain({ allowDatabaseClose: false, operationsDrained: true, activeOperationCount: 0 })).toBe(false);
    expect(shouldCloseDatabaseAfterDrain({ allowDatabaseClose: true, operationsDrained: false, activeOperationCount: 1 })).toBe(false);
    expect(shouldCloseDatabaseAfterDrain({ allowDatabaseClose: true, operationsDrained: true, activeOperationCount: 1 })).toBe(false);
  });
});
`;

write('apps/desktop/electron/main/application/IpcOperationGate.ts', gateSource);
write('apps/desktop/electron/main/application/IpcOperationGate.test.ts', gateTest);
write('apps/desktop/electron/main/application/ShutdownDrainPolicy.ts', policySource);
write('apps/desktop/electron/main/application/ShutdownDrainPolicy.test.ts', policyTest);

let index = read('apps/desktop/electron/main/index.ts');
index = replaceOnce(
  index,
  "import { AppServices } from './services';\nimport { DiscoveryScheduler } from './discoveryScheduler';",
  "import { AppServices } from './services';\nimport { IpcOperationGate } from './application/IpcOperationGate';\nimport { DiscoveryScheduler } from './discoveryScheduler';",
  'index import',
);
index = replaceOnce(
  index,
  "let services: AppServices;\nlet onboardingCompletion: OnboardingCompletionCoordinator;",
  "let services: AppServices;\nconst ipcOperationGate = new IpcOperationGate();\nlet onboardingCompletion: OnboardingCompletionCoordinator;",
  'index gate declaration',
);
index = replaceOnce(
  index,
  `  for (const [channel, handler] of Object.entries(routes)) {
    ipcMain.handle(channel, async (_event, input) => {
      const uiBetaFixtureResult = resolveUiBetaSmokeRoute(channel, input);
      if (uiBetaFixtureResult.handled) return uiBetaFixtureResult.result;
      const onboardingAllowed = channel.startsWith('companionNew:') || channel === 'ai:getSettings' ||
        channel === 'ai:updateSettings' || channel.startsWith('user:') || channel.startsWith('network:') || channel.startsWith('workspace:');
      if (!onboardingAllowed && !services.hasActiveCompanion()) {
        throw new Error('NO_ACTIVE_COMPANION: No active Companion. Complete Companion creation first.');
      }
      const result = await (handler as (input: unknown) => Promise<unknown>)(input);
      if (channel === 'companionNew:create') {
        scheduleOnboardingCompletion(result as { id: string; isPrimary?: boolean });
      }
      return result;
    });
  }`,
  `  for (const [channel, handler] of Object.entries(routes)) {
    ipcMain.handle(channel, async (_event, input) => ipcOperationGate.run(async () => {
      const uiBetaFixtureResult = resolveUiBetaSmokeRoute(channel, input);
      if (uiBetaFixtureResult.handled) return uiBetaFixtureResult.result;
      const onboardingAllowed = channel.startsWith('companionNew:') || channel === 'ai:getSettings' ||
        channel === 'ai:updateSettings' || channel.startsWith('user:') || channel.startsWith('network:') || channel.startsWith('workspace:');
      if (!onboardingAllowed && !services.hasActiveCompanion()) {
        throw new Error('NO_ACTIVE_COMPANION: No active Companion. Complete Companion creation first.');
      }
      const result = await (handler as (input: unknown) => Promise<unknown>)(input);
      if (channel === 'companionNew:create') {
        scheduleOnboardingCompletion(result as { id: string; isPrimary?: boolean });
      }
      return result;
    }));
  }`,
  'IPC route gate',
);
index = replaceOnce(
  index,
  `  cleanupPromise = (async () => {
    isQuitting = true;
    unregisterCompanionHotkey();
    stopDiscoveryAutomation();
    for (const win of [companionWindow, panelWindow, creationWindow]) {
      if (win && !win.isDestroyed()) {
        win.destroy();
      }
    }
    try { services?.network.dispose(); } catch { /* ignore */ }
    try { await services?.dispose(); } catch { /* bounded shutdown must continue */ }
  })();`,
  `  cleanupPromise = (async () => {
    isQuitting = true;
    ipcOperationGate.stopAccepting();
    unregisterCompanionHotkey();
    stopDiscoveryAutomation();
    const ipcDrain = await ipcOperationGate.drain(8_000);
    if (!ipcDrain.drained) {
      console.error('[our-companion] IPC operations exceeded the shutdown drain window; SQLite close will be deferred to process exit.', ipcDrain);
    }
    for (const win of [companionWindow, panelWindow, creationWindow]) {
      if (win && !win.isDestroyed()) {
        win.destroy();
      }
    }
    try { await services?.dispose({ allowDatabaseClose: ipcDrain.drained }); } catch { /* bounded shutdown must continue */ }
  })();`,
  'graceful cleanup',
);
write('apps/desktop/electron/main/index.ts', index);

let services = read('apps/desktop/electron/main/services.ts');
services = replaceOnce(
  services,
  "import { OperationTracker, type ApplicationLifecycleState, type OperationKind, type OperationToken } from './application/OperationTracker';\nimport { VectorMaintenanceCoordinator } from './memory/vectorMaintenanceCoordinator';",
  "import { OperationTracker, type ApplicationLifecycleState, type OperationKind, type OperationToken } from './application/OperationTracker';\nimport { shouldCloseDatabaseAfterDrain } from './application/ShutdownDrainPolicy';\nimport { VectorMaintenanceCoordinator } from './memory/vectorMaintenanceCoordinator';",
  'services shutdown policy import',
);
services = replaceOnce(
  services,
  `  async dispose(): Promise<void> {
    this.disposePromise ??= (async () => {
      this.operationTracker.beginQuiescing();
      this.companionRuntime.stopLifeScheduler();
      this.cleanupFlushTimer();
      this.vectorMaintenance.stopAccepting();
      this.network.stopAccepting();
      const timeoutMs = 8_000;
      this.vectorIndex.beginShutdown();
      const settled = await Promise.race([
        Promise.all([
          this.embeddingJobRunner.stop(),
          this.vectorIndex.stopAndWait(timeoutMs),
          this.operationTracker.drain(timeoutMs),
        ]).then(([_, vector]) => vector.settled),
        new Promise<boolean>((resolve) => setTimeout(() => resolve(false), timeoutMs)),
      ]);
      if (!settled) { this.embeddingJobRunner.preventFurtherWrites(); this.vectorIndex.detach(); }
      this.operationTracker.abortRemaining();
      this.operationTracker.beginDisposing();
      this.network.dispose(); this.visits.stopAll(); this.visualVisits.stopAll('app_shutdown');
      await this.localEmbeddings.dispose();
      this.db.close();
      this.operationTracker.markDisposed();
    })();
    return this.disposePromise;
  }`,
  `  async dispose(options: { allowDatabaseClose?: boolean } = {}): Promise<void> {
    this.disposePromise ??= (async () => {
      this.operationTracker.beginQuiescing();
      this.companionRuntime.stopLifeScheduler();
      this.cleanupFlushTimer();
      this.vectorMaintenance.stopAccepting();
      this.network.stopAccepting();
      const timeoutMs = 8_000;
      this.vectorIndex.beginShutdown();
      const drainState = await Promise.race([
        Promise.all([
          this.embeddingJobRunner.stop(),
          this.vectorIndex.stopAndWait(timeoutMs),
          this.operationTracker.drain(timeoutMs),
        ]).then(([, vector, operations]) => ({ timedOut: false, vectorSettled: vector.settled, operationsDrained: operations.drained })),
        new Promise<{ timedOut: true; vectorSettled: false; operationsDrained: false }>((resolve) =>
          setTimeout(() => resolve({ timedOut: true, vectorSettled: false, operationsDrained: false }), timeoutMs)),
      ]);
      if (drainState.timedOut || !drainState.vectorSettled || !drainState.operationsDrained) {
        this.embeddingJobRunner.preventFurtherWrites();
        this.vectorIndex.detach();
      }
      this.operationTracker.abortRemaining();
      const finalDrain = drainState.operationsDrained
        ? { drained: true, active: 0 }
        : await this.operationTracker.drain(250);
      this.operationTracker.beginDisposing();
      this.network.dispose(); this.visits.stopAll(); this.visualVisits.stopAll('app_shutdown');
      await this.localEmbeddings.dispose();
      const closeDatabase = shouldCloseDatabaseAfterDrain({
        allowDatabaseClose: options.allowDatabaseClose !== false,
        operationsDrained: finalDrain.drained,
        activeOperationCount: this.operationTracker.activeCount(),
      });
      if (closeDatabase) this.db.close();
      else console.error('[our-companion] SQLite close deferred to process exit because shutdown work remains active.');
      this.operationTracker.markDisposed();
    })();
    return this.disposePromise;
  }`,
  'services dispose',
);
write('apps/desktop/electron/main/services.ts', services);

let closure = read('docs/phase0-closure.md');
if (!closure.includes('Renderer IPC admission is closed before shutdown drain begins.')) {
  closure += `\n\nRenderer IPC admission is closed before shutdown drain begins. Every registered service route is counted until completion. SQLite closes only when renderer IPC work and the internal runtime tracker have both drained; if an uncancellable task exceeds the bounded window, explicit SQLite close is deferred to process exit rather than risking a write-after-close.\n`;
}
write('docs/phase0-closure.md', closure);

const checklist = `# Phase 0 manual verification checklist

Run this checklist on a packaged desktop build after automated validation passes.

## Startup and ordinary use

- [ ] Launch the app with an existing Companion and confirm the Companion and panel windows appear normally.
- [ ] Send an English text message and confirm one normal reply is stored in History.
- [ ] Switch reply language to Simplified Chinese and confirm canonical Memory framing is Chinese while quoted evidence remains unchanged.
- [ ] Restart the app and confirm existing conversation and Memory data remain available.

## Grounding and privacy

- [ ] Enter a stable preference, then ask the Companion to recall it; confirm the displayed fact matches the original evidence.
- [ ] Enter a phone number, email, bank account, Malaysian address, or API key in a “remember” request; confirm no durable Memory appears.
- [ ] Open developer diagnostics and confirm the raw sensitive value does not appear in inspection or upload payloads.
- [ ] Confirm a saved do-not-mention boundary is acknowledged without displaying the prohibited target.

## Actions and permissions

- [ ] Request an Action requiring permission, choose **Allow once**, and confirm it executes once without changing the persistent permission.
- [ ] Repeat and choose **Always allow**; confirm later requests execute without another prompt.
- [ ] Cancel a pending Action and confirm no Action executes and no attached Memory candidate is stored.
- [ ] Force or simulate an Action adapter failure and confirm no attached Memory candidate is stored.

## Network and Visit lifecycle

- [ ] Enable online mode, connect successfully, then disable it; confirm reconnect attempts stop.
- [ ] Start and end a Visit flow and confirm no heartbeat or visual Visit state remains after shutdown.

## Vector recovery

- [ ] With the local E5 model installed, rebuild Memory vectors and confirm search remains unavailable only during maintenance.
- [ ] Interrupt the app during a rebuild, relaunch, and confirm SQLite Memory is intact and vector recovery can be retried.
- [ ] Temporarily remove or rename the E5 cache and confirm lexical/structured Memory retrieval still works without a crash.

## Shutdown and late-write protection

- [ ] Start a slow research, speech, or Action request and immediately quit the app; confirm shutdown completes without a SQLite-closed exception.
- [ ] During shutdown, attempt another renderer action; confirm it is rejected with an app-shutting-down error.
- [ ] Relaunch after the interrupted operation and confirm no duplicate message, Memory, Action, or discovery record was persisted.
- [ ] Quit twice in quick succession and confirm there is no crash or duplicate cleanup error.

## Automated evidence

- [ ] GitHub Actions **Phase 0 validation** is green on the final commit.
- [ ] \\`npm run typecheck\\` passes locally.
- [ ] \\`npm test\\` passes locally.
- [ ] \\`npm run arch:check\\` passes locally.
- [ ] \\`npm run build\\` passes locally.
`;
write('docs/phase0-manual-checklist.md', checklist);

// Remove the one-shot bootstrap files from the final repository state.
for (const file of ['scripts/phase0-finalize.mjs', '.github/workflows/phase0-finalize.yml']) {
  const target = path.join(root, file);
  if (fs.existsSync(target)) fs.rmSync(target, { force: true });
}

console.log('Phase 0 final patches applied.');
