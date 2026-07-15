import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const majorVersion = Number(process.versions.node.split('.')[0]);
if (majorVersion !== 22) {
  throw new Error(`UI_QA_NODE_VERSION_UNSUPPORTED:${process.versions.node}`);
}

const runId = new Date().toISOString().replace(/[:.]/g, '-');
const outputDir = join('artifacts', 'ui-qa', runId);
const resultsDir = join(outputDir, 'results');
mkdirSync(resultsDir, { recursive: true });
const qaEnvironment = {
  ...process.env,
  OUR_COMPANION_UI_QA_RUN_ID: runId,
};
const commandChecks = {};
const passedTitles = new Set();
let failed = false;

function run(name, args, environment = qaEnvironment) {
  try {
    execFileSync('npm', args, { stdio: 'inherit', env: environment });
    commandChecks[name] = true;
  } catch {
    commandChecks[name] = false;
    failed = true;
  }
}

function collectPassedTitles(value) {
  if (!value || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    for (const item of value) collectPassedTitles(item);
    return;
  }
  if (Array.isArray(value.specs)) {
    for (const spec of value.specs) {
      const passed = spec.ok === true || spec.tests?.every((entry) =>
        entry.status === 'expected' && entry.results?.some((result) => result.status === 'passed'));
      if (passed && typeof spec.title === 'string') passedTitles.add(spec.title);
    }
  }
  for (const child of Object.values(value)) collectPassedTitles(child);
}

function runPlaywright(name, specs) {
  const jsonReport = join(resultsDir, `${name}.json`);
  run(name, ['exec', '--', 'playwright', 'test', ...specs, '--reporter=json'], {
    ...qaEnvironment,
    PLAYWRIGHT_JSON_OUTPUT_NAME: jsonReport,
  });
  if (existsSync(jsonReport)) collectPassedTitles(JSON.parse(readFileSync(jsonReport, 'utf8')));
}

run('typecheck', ['run', 'typecheck']);
run('architecture', ['run', 'arch:check']);
run('unitTests', ['test']);
run('quickActionsVisibilityUnit', ['exec', '--', 'vitest', 'run', 'apps/desktop/renderer/src/features/companion/quick-actions/quickActionVisibilityMachine.test.ts']);
run('build', ['run', 'build']);
runPlaywright('playwrightUi', ['tests/ui']);
runPlaywright('quickActionsSuite', ['tests/ui/quick-actions.spec.ts']);
runPlaywright('panelNavigationSuite', ['tests/ui/panel-navigation.spec.ts']);
runPlaywright('creationSuite', ['tests/ui/companion-creation.spec.ts']);
runPlaywright('feedbackSuite', ['tests/ui/feedback-transitions.spec.ts', 'tests/ui/journeys.spec.ts']);
runPlaywright('speechSuite', ['tests/ui/speech-transitions.spec.ts']);
runPlaywright('reducedMotionSuite', ['tests/ui/reduced-motion.spec.ts']);
runPlaywright('accessibilitySuite', ['tests/ui/accessibility.spec.ts']);

const titlePassed = (title) => passedTitles.has(title);
const panelLifecycle = titlePassed('Panel page exits before removal, then enters with focus and reset scroll');
const creationLifecycle = titlePassed('Creation step exits, enters, reverses direction, and preserves form data');
const quickSettingsTalk = titlePassed('Quick Actions opens Panel Settings directly and preserves Talk active state');
const accessibilityTitle = titlePassed('All required application surfaces have no critical or serious axe violations');
const checks = {
  ...commandChecks,
  panelSettingsNavigation: quickSettingsTalk,
  panelPageEnter: panelLifecycle,
  panelPageExit: panelLifecycle,
  panelRapidNavigation: titlePassed('Panel rapid navigation keeps the newest target without blank or stale pages'),
  creationStepEnter: creationLifecycle,
  creationStepExit: creationLifecycle,
  creationBackTransition: creationLifecycle,
  quickActionsHoverDelay: commandChecks.quickActionsVisibilityUnit === true,
  quickActionsGracePeriod: titlePassed('Quick Actions keep the hover group visible through its grace period'),
  quickActionsPinned: commandChecks.quickActionsVisibilityUnit === true,
  quickActionsHoverTalkPinned: titlePassed('Hover to Talk explicitly pins Quick Actions until the Composer closes'),
  quickActionsDragClose: titlePassed('Dragging the Companion closes pinned Quick Actions immediately'),
  quickActionsAwayHidden: titlePassed('Quick Actions are removed when the local Companion is away visiting'),
  quickActionsTalkActive: quickSettingsTalk,
  quickActionsListenActive: titlePassed('Listen stays visibly active when Quick Actions are reopened'),
  quickActionsMoreMenu: titlePassed('More closes independently on Escape and restores its trigger focus'),
  quickActionsBoundaryAware: titlePassed('Quick Action bubbles stay inside the work area at five Companion positions'),
  panelTabRuntimeValidation: titlePassed('Panel target tabs reject invalid runtime input and never blank the current page'),
  dialogTransition: titlePassed('Confirm dialog exits before removal and restores focus to its opener'),
  toastTransition: titlePassed('Toast enters, exits, and unmounts after creating a journey'),
  moreMenuTransition: quickSettingsTalk,
  composerTransition: titlePassed('Hover to Talk explicitly pins Quick Actions until the Composer closes'),
  speechBubbleTransition: titlePassed('Startup speech bubble enters, exits, and unmounts after its exit duration'),
  reducedMotionQuickActions: titlePassed('Quick Actions use opacity-only motion when reduced motion is requested'),
  reducedMotionPanel: titlePassed('Reduced Motion Panel lifecycle is opacity-only and keeps focus meaningful'),
  reducedMotionCreation: titlePassed('Reduced Motion Creation lifecycle is opacity-only and preserves focus'),
  reducedMotionFeedback: titlePassed('Reduced Motion feedback surfaces use opacity-only transitions'),
  reducedMotionCompanionOverlays: titlePassed('Reduced Motion Companion overlays suppress spatial and looping motion'),
};

const canonicalScreenshots = [
  'accessibility/panel-home.png', 'accessibility/panel-social.png', 'accessibility/panel-settings.png',
  'accessibility/creation.png', 'accessibility/quick-actions.png', 'accessibility/dialog.png',
  'quick-actions/center.png', 'quick-actions/top-left.png', 'quick-actions/top-right.png',
  'quick-actions/bottom-left.png', 'quick-actions/bottom-right.png', 'quick-actions/talk-active.png',
  'quick-actions/listen-active.png', 'quick-actions/more-menu.png',
  'panel/home.png', 'panel/social.png', 'panel/settings.png', 'panel/narrow.png',
  'creation/step-1.png', 'creation/step-2.png', 'creation/step-3.png', 'creation/assets.png',
  'feedback/dialog.png', 'feedback/toast.png', 'feedback/speech-bubble.png',
  'reduced-motion/quick-actions.png', 'reduced-motion/panel.png', 'reduced-motion/creation.png', 'reduced-motion/feedback.png',
];
const missingScreenshots = canonicalScreenshots.filter((file) => !existsSync(join(outputDir, file)));
const reviewAuthorized = process.env.OUR_COMPANION_UI_QA_SCREENSHOTS_REVIEWED === '1';
const screenshotReview = {
  result: reviewAuthorized && missingScreenshots.length === 0 ? 'passed' : 'pending',
  reviewedAt: new Date().toISOString(),
  files: canonicalScreenshots.map((file) => ({
    path: file,
    result: existsSync(join(outputDir, file)) && reviewAuthorized ? 'passed' : 'pending',
    issues: existsSync(join(outputDir, file)) ? [] : ['Screenshot was not generated.'],
  })),
  checks: {
    noClippedText: reviewAuthorized && missingScreenshots.length === 0,
    noBubbleOverlap: reviewAuthorized && missingScreenshots.length === 0,
    noOffscreenControls: reviewAuthorized && missingScreenshots.length === 0,
    noMojibake: reviewAuthorized && missingScreenshots.length === 0,
    noDoubleRenderedPages: reviewAuthorized && missingScreenshots.length === 0,
    focusIndicatorsVisible: reviewAuthorized && missingScreenshots.length === 0,
    reducedMotionHasNoSpatialMovement: reviewAuthorized && missingScreenshots.length === 0,
  },
  remainingIssues: [
    ...missingScreenshots.map((file) => `Missing canonical screenshot: ${file}`),
    ...(reviewAuthorized ? [] : ['Screenshot review was not authorized for this run.']),
  ],
};
writeFileSync(join(outputDir, 'screenshot-review.json'), `${JSON.stringify(screenshotReview, null, 2)}\n`);

const accessibilityPath = join(outputDir, 'accessibility', 'report.json');
let accessibilityReport;
if (existsSync(accessibilityPath)) accessibilityReport = JSON.parse(readFileSync(accessibilityPath, 'utf8'));
checks.axeCriticalZero = accessibilityTitle && accessibilityReport?.totals?.critical === 0;
checks.axeSeriousZero = accessibilityTitle && accessibilityReport?.totals?.serious === 0;
checks.screenshotsReviewed = screenshotReview.result === 'passed'
  && screenshotReview.files.every((file) => file.result === 'passed')
  && screenshotReview.remainingIssues.length === 0;

const allChecksPassed = Object.values(checks).every(Boolean);
const electronVersion = JSON.parse(readFileSync(join('node_modules', 'electron', 'package.json'), 'utf8')).version;
const report = {
  result: !failed && allChecksPassed ? 'passed' : 'failed',
  clientCommit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  runtime: {
    node: process.versions.node,
    electron: electronVersion,
    platform: process.platform,
    architecture: process.arch,
  },
  artifacts: {
    runId,
    root: join('artifacts', 'ui-qa', runId),
    screenshotReview: existsSync(join(outputDir, 'screenshot-review.json')),
    accessibilityReport: existsSync(accessibilityPath),
  },
  checks,
  reducedMotion: {
    quickActions: checks.reducedMotionQuickActions,
    panel: checks.reducedMotionPanel,
    creation: checks.reducedMotionCreation,
    feedback: checks.reducedMotionFeedback,
    companionOverlays: checks.reducedMotionCompanionOverlays,
  },
  remainingIssues: [
    ...(failed ? ['One or more required QA commands failed; see command output and JSON results.'] : []),
    ...Object.entries(checks).filter(([, passed]) => !passed).map(([name]) => `QA check failed: ${name}`),
    ...screenshotReview.remainingIssues,
  ],
};
writeFileSync(join(outputDir, 'qa-report.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log(`UI QA report: ${join(outputDir, 'qa-report.json')}`);
if (report.result !== 'passed') process.exitCode = 1;
