# Volume 05 Implementation Summary

## Added Models

- `ActionStep`
- `ActionPlan`
- `PermissionScope`
- `PermissionDecision`
- `ActionPermissionState`
- `ActionExecutionState`
- `ActionRunResult`

## Action Engine

- Rule-based planner converting command text to single or multi-step `ActionPlan`.
- LLM-assisted planner fallback using ai-engine `actionPlanSchema` when no rule matches.
- Permission manager resolving stored `ActionPermissionState` per plan scope with `granted`, `denied`, and `ask` outcomes.
- Action orchestrator implementing the RFC state machine: `idle → planning → await_permission → executing → performing → completed` with failure/recovery path.
- Performance director building a `PerformanceScript` from execution outcome — never executes OS commands.

## Tool Engine

- Added `createToolExecutor` wrapping `previewTool` / `executeTool` behind the shared `CommandExecutor` interface.
- Added `executeActionStep` mapping `ActionStep` to `ToolExecuteInput` for use by the orchestrator.
- Extracted Electron platform helpers into `apps/desktop/electron/main/platform/electronCommandAdapter.ts`.

## Permission Persistence

- `getActionPermissions` / `setActionPermissions` on `AppDatabase` backed by `app_settings` key `action.permissions`.

## Event Bridge

Action flow now emits:

- `ActionRequested`
- `ActionPlanned`
- `PermissionGranted`
- `CommandStarted`
- `CommandCompleted`
- `PerformanceStarted`
- `PerformanceCompleted`
- `ActionFailed`

`CommandExecuted` retained as alias during transition; existing discovery "Open URL" buttons and `tool:preview` / `tool:execute` IPC unchanged.

## UI

- Ask panel upgraded to `action.plan` → `action.executePlan` with permission confirmation flow.
- `ActionPermissionsCard` added to Settings Privacy section; toggles browser, automation, files, clipboard, calendar scopes.
- Companion shell subscribes to `action.onPerformance` and plays `PerformanceScript` steps sequentially.

## Boundary

Action engine does not own UI. Tool engine does not own animation. Platform adapters live in desktop `platform/`, not in brain packages. No command execution inside animation playback.

## Deferred

- File, clipboard, and calendar executor implementations (scopes exist; always `ask` in v1).
- Linux-specific adapter.
- `visit_companion` cross-companion action (reserved in Volume 01 foundation).
