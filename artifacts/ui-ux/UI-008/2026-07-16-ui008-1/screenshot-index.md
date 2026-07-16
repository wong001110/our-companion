# UI-008 Screenshot Index

- Task: UI-008 — Replace Inline Chat History Confirmation with a Destructive Dialog
- Starting commit: `5703f1f85edf8d9b1cbfdc990f4414e3fd3defa6`
- Shared prerequisite commit: `fa62f08f37a855a70792999b3769194eb541a710`
- Implementation commit: the UI-008 implementation commit containing this index; exact SHA is recorded in the review request.
- Runtime: Windows, Node 22.23.1, Electron 37.10.3, deterministic smoke fixture, no live AI or Network.
- Focused Electron result: 4 passed, 0 failed, 0 skipped.
- Focus: Cancel received initial focus; Tab/Shift+Tab stayed inside the dialog; Cancel and Escape restored focus to Clear history.
- Accessibility: axe reported zero critical or serious violations for the open Chat dialog.
- Reduced Motion: open, initial focus, Escape, restoration, and retained messages passed.
- Windows cleanup: product assertions and screenshots completed; each Electron process required explicit termination afterward because the known test-profile shutdown issue prevented natural runner exit. Playwright completed the serial focused spec successfully after that cleanup.

## `en-chat-clear-dialog-1180.png`

- Language: English.
- Viewport: 1180 × 820.
- Fixture: one deterministic user message and one deterministic Companion message.
- Expected: shared destructive dialog, device-wide permanent-deletion copy, Cancel and Yes, clear actions, no inline confirmation.
- Observed: expected state present; Cancel focus ring visible; composer and populated Chat remain visible behind the modal.
- Visual review: PASS — complete copy, conventional destructive hierarchy, no clipping.

## `zh-CN-chat-clear-dialog-760.png`

- Language: Simplified Chinese.
- Viewport: 760 × 720.
- Fixture: the same two deterministic messages.
- Expected: fully localized dialog and actions, wrapped description, no horizontal overflow or viewport clipping.
- Observed: expected state present; document width stayed within the viewport and dialog bounds remained inside 760 × 720.
- Visual review: PASS — glyphs, wrapping, focus treatment, and actions are complete and unclipped.

## `en-chat-cleared-empty-1180.png`

- Language: English.
- Viewport: 1180 × 820.
- Fixture: deterministic messages cleared through the existing unscoped `companion.clearHistory()` IPC.
- Expected: dialog closed, existing empty state, usable composer, unchanged Panel filter and search state.
- Observed: expected state present; Panel filter and `quiet` search query remain selected while stored messages are absent.
- Visual review: PASS — empty state and operational controls remain clear.

## `reduced-motion-chat-clear-focus.png`

- Language: English.
- Viewport: default Panel test viewport.
- Fixture: populated deterministic Chat under `prefers-reduced-motion: reduce`.
- Expected: opacity-only shared lifecycle with initial focus, Escape close, opener restoration, and preserved messages.
- Observed: all focused Reduced Motion assertions passed.
- Visual review: supplementary capture; no UI-008-specific motion or CSS was introduced.
