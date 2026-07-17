import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { checkArchitectureBoundaries } from './check-architecture-boundaries.mjs';

function fixture(files) {
  const root = mkdtempSync(join(tmpdir(), 'our-companion-architecture-'));
  for (const [path, content] of Object.entries(files)) {
    const file = join(root, path);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, content);
  }
  return root;
}

function rulesFor(files) {
  return checkArchitectureBoundaries(fixture(files)).violations.map(
    ({ rule }) => rule,
  );
}

test('allows Character persistence only in the database and CompanionRuntime', () => {
  const violations = rulesFor({
    'packages/database/src/index.ts':
      'export class Db { saveCharacterState() { return true; } }',
    'apps/desktop/electron/main/runtime/CompanionRuntime.ts':
      'export const commit = (db: any) => db.saveCharacterState({});',
    'apps/desktop/electron/main/services.test.ts':
      'db.saveCharacterState({});',
  });

  assert.deepEqual(violations, []);
});

test('catches static and dynamic character-engine imports in the orchestrator', () => {
  const violations = rulesFor({
    'apps/desktop/electron/main/discoveryShareOrchestrator.ts': `
      import { advanceCharacter } from '@our-companion/character-engine';
      export async function load() {
        return import('@our-companion/character-engine/runtime');
      }
    `,
  });

  assert.equal(
    violations.filter((rule) =>
      rule.includes('must not import character-engine')).length,
    2,
  );
});

test('catches Character state writes outside CompanionRuntime', () => {
  const violations = rulesFor({
    'apps/desktop/electron/main/services.ts':
      'export const write = (db: any) => db.saveCharacterState({});',
    'apps/desktop/electron/main/index.ts':
      'services.database.saveCharacterState(nextState);',
  });

  assert.equal(
    violations.filter((rule) =>
      rule.includes('only production Character state writer')).length,
    2,
  );
});

test('catches Electron imports from engines and engine imports from database', () => {
  const violations = rulesFor({
    'packages/decision-engine/src/index.ts': `
      import { ipcMain } from 'electron';
      export const lazy = () => import('electron/main');
    `,
    'packages/database/src/index.ts': `
      import { decide } from '@our-companion/decision-engine';
      const runtime = require('@our-companion/character-engine/runtime');
    `,
  });

  assert.equal(
    violations.filter((rule) =>
      rule.includes('must not import Electron')).length,
    2,
  );
  assert.equal(
    violations.filter((rule) =>
      rule.includes('database must not import engine')).length,
    2,
  );
});

test('catches renderer imports, mutation calls, and direct domain assignments', () => {
  const violations = rulesFor({
    'apps/desktop/renderer/src/BadView.tsx': `
      import { applyEmotionEvent } from '@our-companion/character-engine';
      import { Database } from '@our-companion/database';
      applyEmotionEvent(characterState.emotion, 'idle');
      characterState.emotion = 'happy';
      Object.assign(companionState, { behavior: 'talking' });
    `,
  });

  assert.equal(
    violations.filter((rule) =>
      rule.includes('renderer must not import')).length,
    2,
  );
  assert.equal(
    violations.filter((rule) =>
      rule.includes('renderer must not call')).length,
    1,
  );
  assert.equal(
    violations.filter((rule) =>
      rule.includes('renderer must not assign')).length,
    1,
  );
  assert.equal(
    violations.filter((rule) =>
      rule.includes('must not mutate Character domain state objects')).length,
    1,
  );
});

test('ignores import examples in comments and strings', () => {
  const violations = rulesFor({
    'apps/desktop/electron/main/discoveryShareOrchestrator.ts': `
      // await import('@our-companion/character-engine')
      export const example =
        "import value from '@our-companion/character-engine'";
    `,
  });

  assert.deepEqual(violations, []);
});
