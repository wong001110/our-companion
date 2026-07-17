import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as ts from 'typescript';

const DEFAULT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ORCHESTRATOR =
  'apps/desktop/electron/main/discoveryShareOrchestrator.ts';
const CHARACTER_STATE_WRITERS = new Set([
  'packages/database/src/index.ts',
  'apps/desktop/electron/main/runtime/CompanionRuntime.ts',
]);
const DOMAIN_MUTATION_CALLS = new Set([
  'advanceCharacter',
  'applyEmotionEvent',
  'evolveCharacterState',
  'saveCharacterState',
  'transitionCharacterState',
]);
const DOMAIN_STATE_FIELDS = new Set([
  'activeAction',
  'behavior',
  'currentSpeech',
  'emotion',
  'position',
]);

function normalizePath(path) {
  return path.replaceAll('\\', '/');
}

function isProductionTypeScript(path) {
  const normalized = normalizePath(path);
  return (
    /\.(?:[cm]?ts|tsx)$/.test(normalized) &&
    !/\.d\.[cm]?ts$/.test(normalized) &&
    !/(?:^|\/)(?:dist|build|node_modules)(?:\/|$)/.test(normalized) &&
    !/(?:^|\/)__tests__(?:\/|$)/.test(normalized) &&
    !/\.(?:test|spec)\.[cm]?tsx?$/.test(normalized)
  );
}

function collectProductionFiles(root, targets) {
  const results = [];

  function collect(target) {
    if (!existsSync(target)) return;
    const stat = statSync(target);
    if (stat.isDirectory()) {
      for (const entry of readdirSync(target)) collect(join(target, entry));
      return;
    }
    if (isProductionTypeScript(target)) results.push(target);
  }

  for (const target of targets) collect(join(root, target));
  return results;
}

function moduleReference(node) {
  if (
    (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
    node.moduleSpecifier &&
    ts.isStringLiteralLike(node.moduleSpecifier)
  ) {
    return node.moduleSpecifier.text;
  }

  if (
    ts.isImportEqualsDeclaration(node) &&
    ts.isExternalModuleReference(node.moduleReference) &&
    node.moduleReference.expression &&
    ts.isStringLiteralLike(node.moduleReference.expression)
  ) {
    return node.moduleReference.expression.text;
  }

  if (
    ts.isCallExpression(node) &&
    node.arguments.length > 0 &&
    ts.isStringLiteralLike(node.arguments[0])
  ) {
    if (node.expression.kind === ts.SyntaxKind.ImportKeyword) {
      return node.arguments[0].text;
    }
    if (ts.isIdentifier(node.expression) && node.expression.text === 'require') {
      return node.arguments[0].text;
    }
  }

  return undefined;
}

function calledName(node) {
  if (!ts.isCallExpression(node)) return undefined;
  if (ts.isIdentifier(node.expression)) return node.expression.text;
  if (ts.isPropertyAccessExpression(node.expression)) {
    return node.expression.name.text;
  }
  return undefined;
}

function assignmentTarget(node) {
  if (!ts.isBinaryExpression(node)) return undefined;
  if (
    node.operatorToken.kind < ts.SyntaxKind.FirstAssignment ||
    node.operatorToken.kind > ts.SyntaxKind.LastAssignment
  ) {
    return undefined;
  }
  return node.left;
}

function isRendererDomainStateAssignment(node, sourceFile) {
  const target = assignmentTarget(node);
  if (!target || !ts.isPropertyAccessExpression(target)) return false;
  if (!DOMAIN_STATE_FIELDS.has(target.name.text)) return false;
  const owner = target.expression.getText(sourceFile);
  return /(?:character|companion|domain)State/i.test(owner);
}

function isRendererDomainStateMutationCall(node, sourceFile) {
  if (!ts.isCallExpression(node) || node.arguments.length === 0) return false;
  if (!ts.isPropertyAccessExpression(node.expression)) return false;
  const owner = node.expression.expression.getText(sourceFile);
  const method = node.expression.name.text;
  if (
    !(
      (owner === 'Object' && method === 'assign') ||
      (owner === 'Reflect' && method === 'set')
    )
  ) {
    return false;
  }
  return /(?:character|companion|domain)State/i.test(
    node.arguments[0].getText(sourceFile),
  );
}

function lineOf(sourceFile, node) {
  return sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
}

function evidenceOf(sourceFile, node) {
  return node
    .getText(sourceFile)
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 180);
}

function addViolation(violations, sourceFile, rel, node, rule) {
  violations.push({
    rule,
    file: rel,
    line: lineOf(sourceFile, node),
    evidence: evidenceOf(sourceFile, node),
  });
}

/**
 * Check production TypeScript architecture boundaries.
 *
 * @param {string} root workspace root
 * @returns {{ violations: Array<{rule: string, file: string, line: number, evidence: string}> }}
 */
export function checkArchitectureBoundaries(root = DEFAULT_ROOT) {
  const resolvedRoot = resolve(root);
  const files = collectProductionFiles(resolvedRoot, ['apps', 'packages']);
  const violations = [];

  for (const file of files) {
    const rel = normalizePath(relative(resolvedRoot, file));
    const source = readFileSync(file, 'utf8');
    const sourceFile = ts.createSourceFile(
      file,
      source,
      ts.ScriptTarget.Latest,
      true,
      file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
    );
    const isOrchestrator = rel === ORCHESTRATOR;
    const isEnginePackage = /^packages\/[^/]+-engine\//.test(rel);
    const isDiscoveryEngine = /^packages\/discovery-engine\//.test(rel);
    const isDatabase = rel.startsWith('packages/database/');
    const isShared = rel.startsWith('packages/shared/');
    const isRenderer = rel.startsWith('apps/desktop/renderer/');

    function visit(node) {
      const moduleName = moduleReference(node);

      if (
        isOrchestrator &&
        moduleName &&
        /^@our-companion\/character-engine(?:\/|$)/.test(moduleName)
      ) {
        addViolation(
          violations,
          sourceFile,
          rel,
          node,
          'discoveryShareOrchestrator must not import character-engine',
        );
      }

      if (
        isEnginePackage &&
        moduleName &&
        /^electron(?:\/|$)/.test(moduleName)
      ) {
        addViolation(
          violations,
          sourceFile,
          rel,
          node,
          'engine packages must not import Electron',
        );
      }

      if (
        isDiscoveryEngine &&
        moduleName &&
        (/^node:/.test(moduleName) || /^electron(?:\/|$)/.test(moduleName))
      ) {
        addViolation(
          violations,
          sourceFile,
          rel,
          node,
          'discovery-engine research domain must not import runtime or transport modules',
        );
      }

      if (
        isDatabase &&
        moduleName &&
        /^@our-companion\/[^/]+-engine(?:\/|$)/.test(moduleName)
      ) {
        addViolation(
          violations,
          sourceFile,
          rel,
          node,
          'database must not import engine packages',
        );
      }

      if (
        isShared &&
        moduleName &&
        /^@our-companion\/(?!shared(?:\/|$))/.test(moduleName)
      ) {
        addViolation(
          violations,
          sourceFile,
          rel,
          node,
          'shared must not import engines or app packages',
        );
      }

      if (
        isRenderer &&
        moduleName &&
        (
          /^@our-companion\/database(?:\/|$)/.test(moduleName) ||
          /^@our-companion\/[^/]+-engine(?:\/|$)/.test(moduleName)
        )
      ) {
        addViolation(
          violations,
          sourceFile,
          rel,
          node,
          'renderer must not import database or engine packages',
        );
      }

      const callName = calledName(node);
      if (
        callName === 'saveCharacterState' &&
        !CHARACTER_STATE_WRITERS.has(rel)
      ) {
        addViolation(
          violations,
          sourceFile,
          rel,
          node,
          'CompanionRuntime is the only production Character state writer',
        );
      }

      if (
        isRenderer &&
        callName &&
        DOMAIN_MUTATION_CALLS.has(callName)
      ) {
        addViolation(
          violations,
          sourceFile,
          rel,
          node,
          'renderer must not call domain state mutation functions',
        );
      }

      if (isRenderer && isRendererDomainStateAssignment(node, sourceFile)) {
        addViolation(
          violations,
          sourceFile,
          rel,
          node,
          'renderer must not assign Character domain state',
        );
      }

      if (isRenderer && isRendererDomainStateMutationCall(node, sourceFile)) {
        addViolation(
          violations,
          sourceFile,
          rel,
          node,
          'renderer must not mutate Character domain state objects',
        );
      }

      ts.forEachChild(node, visit);
    }

    visit(sourceFile);
  }

  return { violations };
}

export function formatArchitectureViolations(violations) {
  return violations
    .map(
      ({ rule, file, line, evidence }) =>
        `VIOLATION [${rule}]: ${file}:${line}\n  ${evidence}`,
    )
    .join('\n');
}

function runCli() {
  const requestedRoot = process.argv[2]
    ? resolve(process.argv[2])
    : DEFAULT_ROOT;
  const { violations } = checkArchitectureBoundaries(requestedRoot);

  if (violations.length > 0) {
    console.error(formatArchitectureViolations(violations));
    console.error(`\n${violations.length} architecture violation(s) found.`);
    process.exitCode = 1;
    return;
  }

  console.log('Architecture boundaries OK.');
}

const isMain =
  process.argv[1] &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
if (isMain) runCli();
