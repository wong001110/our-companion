import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const runId = new Date().toISOString().replace(/[:.]/g, '-');
const outputDir = join('artifacts', 'ui-qa', runId);
mkdirSync(outputDir, { recursive: true });
const checks = {};
const screenshotsReviewed = process.env.OUR_COMPANION_UI_QA_SCREENSHOTS_REVIEWED === '1';
const steps = [
  ['typecheck', ['run', 'typecheck']],
  ['architecture', ['run', 'arch:check']],
  ['unitTests', ['test']],
  ['build', ['run', 'build']],
  ['playwrightUi', ['exec', 'playwright', 'test', 'tests/ui']],
  ['accessibility', ['exec', 'playwright', 'test', 'tests/ui/accessibility.spec.ts']],
];
let failed = false;
for (const [name, args] of steps) {
  try {
    execFileSync('npm', args, { stdio: 'inherit' });
    checks[name] = true;
  } catch {
    checks[name] = false;
    failed = true;
  }
}
const report = {
  result: failed ? 'failed' : 'passed',
  clientCommit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  checks: {
    ...checks,
    panelSettingsNavigation: false,
    quickActionsHoverDelay: false,
    quickActionsGracePeriod: false,
    quickActionsPinned: false,
    quickActionsDragClose: false,
    quickActionsAwayHidden: false,
    quickActionsTalkActive: false,
    quickActionsListenActive: false,
    quickActionsMoreMenu: false,
    quickActionsBoundaryAware: false,
    panelPageTransition: false,
    creationStepTransition: false,
    dialogTransition: false,
    toastTransition: false,
    moreMenuTransition: false,
    composerTransition: false,
    speechBubbleTransition: false,
    reducedMotion: false,
    axeCriticalZero: checks.accessibility === true,
    axeSeriousZero: checks.accessibility === true,
    screenshotsReviewed,
  },
  remainingIssues: failed
    ? ['One or more required QA commands failed; see console output.']
    : ['The UI suite passed, but the named transition and Quick Action scenarios still need dedicated assertions. Set OUR_COMPANION_UI_QA_SCREENSHOTS_REVIEWED=1 only after manual artifact inspection.'],
};
writeFileSync(join(outputDir, 'qa-report.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log(`UI QA report: ${join(outputDir, 'qa-report.json')}`);
if (failed) process.exitCode = 1;
