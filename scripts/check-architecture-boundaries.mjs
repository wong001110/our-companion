import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = join(import.meta.dirname, '..');

const RULES = [
  {
    name: 'database must not import *-engine',
    pattern: /from ['"]@our-companion\/(?!shared|database|event-bus)/,
    paths: ['packages/database/src'],
  },
  {
    name: 'shared must not import engines or app packages',
    pattern: /from ['"]@our-companion\/(?!shared)/,
    paths: ['packages/shared/src'],
  },
  {
    name: 'engine packages must not import electron',
    pattern: /from ['"]electron['"]/,
    paths: ['packages'],
  },
  {
    name: 'discoveryShareOrchestrator must not import electron',
    pattern: /from ['"]electron['"]/,
    paths: ['apps/desktop/electron/main/discoveryShareOrchestrator.ts'],
  },
  {
    name: 'discoveryShareOrchestrator must not import character-engine (static)',
    pattern: /from ['"]@our-companion\/character-engine['"]/,
    paths: ['apps/desktop/electron/main/discoveryShareOrchestrator.ts'],
  },
  {
    name: 'discoveryScheduler must not import character-engine',
    pattern: /from ['"]@our-companion\/character-engine['"]/,
    paths: ['apps/desktop/electron/main/discoveryScheduler.ts'],
  }
];

function collectFiles(dir) {
  const results = [];
  try {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      const stat = statSync(full);
      if (stat.isDirectory()) {
        results.push(...collectFiles(full));
      } else if (full.endsWith('.ts') && !full.endsWith('.d.ts') && !full.includes('.test.')) {
        results.push(full);
      }
    }
  } catch { /* dir doesn't exist */ }
  return results;
}

let violations = 0;

for (const rule of RULES) {
  for (const target of rule.paths) {
    const resolved = join(ROOT, target);
    const stat = statSync(resolved, { throwIfNoEntry: false });
    const files = stat?.isDirectory() ? collectFiles(resolved) : [resolved];
    for (const file of files) {
      const content = readFileSync(file, 'utf-8');
      for (const [i, line] of content.split('\n').entries()) {
        if (rule.pattern.test(line)) {
          const rel = relative(ROOT, file).replace(/\\/g, '/');
          console.error(`VIOLATION [${rule.name}]: ${rel}:${i + 1}`);
          console.error(`  ${line.trim()}`);
          violations++;
        }
      }
    }
  }
}

if (violations > 0) {
  console.error(`\n${violations} architecture violation(s) found.`);
  process.exit(1);
} else {
  console.log('Architecture boundaries OK.');
}
