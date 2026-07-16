# UI-BETA-001 Evidence Index

## Final Matrix

English at 1180×760:

- `final/en/home-1180.png`
- `final/en/chat-1180.png`
- `final/en/discoveries-1180.png`
- `final/en/journeys-1180.png`
- `final/en/memories-1180.png`
- `final/en/social-1180.png`
- `final/en/settings-1180.png`

Simplified Chinese at 760×760 with Reduced Motion emulated:

- `final/zh-CN/home-760-reduced-motion.png`
- `final/zh-CN/chat-760-reduced-motion.png`
- `final/zh-CN/discoveries-760-reduced-motion.png`
- `final/zh-CN/journeys-760-reduced-motion.png`
- `final/zh-CN/memories-760-reduced-motion.png`
- `final/zh-CN/social-760-reduced-motion.png`
- `final/zh-CN/settings-760-reduced-motion.png`

The per-surface axe results are in `final/report.json`. Final total: 0 critical and 0 serious violations across all 14 captures.

## Operational Lifecycle Matrix

English at 1180×760, rendered through the smoke-runtime-only fixture IPC in the real Electron Panel:

- Online: `final/states/online-disabled.png`, `online-connecting.png`, `online-reconnecting.png`, `online-incompatible.png`
- Social: `final/states/social-populated.png`, `social-partial-error.png`, `social-requests.png`, `social-reconnecting-read-only.png`
- Publishing: `final/states/publishing-draft.png`, `publishing-uploading.png`, `publishing-verifying.png`, `publishing-failed.png`, `publishing-published.png`
- Visit: `final/states/visit-invitation.png`, `visit-preparing.png`, `visit-active.png`, `visit-terminal.png`
- Chat: `final/states/chat-loading.png`, `chat-send-failure.png`

The per-state axe results are in `final/states-report.json`. Final total: 0 critical and 0 serious violations across all 19 lifecycle captures. The scenario completed every product assertion before the known teardown timeout.

## Generated Assets

- Candidate comparison: `assets/generated-asset-contact-sheet.png` (final filenames, intended surfaces, selected candidates, and true normal/compact CSS-pixel previews on paper and dark backgrounds)
- Four source and alpha candidates for each generated role: `assets/candidates-source/` and `assets/candidates-alpha/`
- Selected candidates are outlined in lavender on the contact sheet.

## Electron Result Boundary

The matrix completed its screenshots, localization, Reduced Motion, and axe report before teardown. The Playwright scenario then failed only with the separately tracked `UI_ELECTRON_CLOSE_TIMEOUT`. No passing Electron aggregate is claimed. UI-QA-001 records the exact failure and the production-lifecycle stop condition.
