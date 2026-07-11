# Our Companion — Command Execution Reliability Repair

## 1. Task Purpose

This task repairs the command execution path introduced after commit:

```text
f4659142f25c1a11f72c23525de411ed2362ea37
```

The current architecture direction is correct:

```text
Main Process
→ authoritative CompanionCommand
→ Renderer executes
→ Renderer reports lifecycle
```

Do not redesign this architecture.

The purpose of this task is to make the current command flow idempotent, cancellable, timeout-safe, and truthful.

---

# 2. Strict Scope

## Preserve

Keep:

- one present Companion at a time
- one main-process `CompanionRuntime`
- one authoritative `CompanionCommand`
- renderer as execution/presentation layer
- current `received / started / completed / cancelled / failed` lifecycle
- current Discovery presentation flow
- current command IPC channel
- current runtime coordinator structure

## Do Not

Do not:

- create a new runtime version
- create a new command system beside the current one
- add a new engine package
- redesign Discovery
- redesign Memory
- redesign Daily Life
- change relationship logic
- add multi-Companion scene support
- add unrelated UI features
- reintroduce renderer behavior decisions
- restore `CompanionBehaviorController`
- restore `applyBehaviorHint`
- add a periodic decision timer
- expand beyond the files required for command reliability

Stop after this task.

---

# 3. Required Pre-Implementation Audit

Before modifying code, update:

```text
tasks/direction-correction/repair-execution-log.md
```

Add:

```text
## Command Execution Reliability Pass
```

Record:

```text
Issue
Current flow
Failure mode
Files involved
Old behavior removed
New behavior
Tests added
Verification result
```

Inspect at minimum:

```text
apps/desktop/renderer/src/companion/behavior/useCompanionBehavior.ts
apps/desktop/renderer/src/companion/behavior/commandLifecycle.ts
apps/desktop/renderer/src/ui/App.tsx
apps/desktop/electron/main/services.ts
apps/desktop/electron/main/runtime/CompanionRuntime.ts
apps/desktop/electron/preload/index.ts
packages/shared/src/index.ts
```

---

# 4. Issue 1 — Command Executor Is Recreated Across Renders

## Current Risk

`useCompanionBehavior` creates the executor through:

```ts
createCommandExecutor(...)
```

inside a callback that depends on `onCommand`.

`App.tsx` passes an inline function:

```tsx
onCommand={(command) => handleCompanionCommand(command)}
```

This creates a new function on every render.

The executor may therefore be recreated after:

```text
setActiveCommand
state update
speech update
Discovery update
```

The executor currently stores handled command IDs inside a closure-local `Set`.

When the executor is recreated, that Set is lost.

## Failure Scenario

```text
command event received
→ command starts
→ renderer state changes
→ component re-renders
→ executor recreated
→ handled IDs reset
→ getActiveCommand returns same command
→ same command executes again
```

## Required Fix

### Stabilize Command Handler

In `App.tsx`, define the command handler using `useCallback`.

Do not pass an inline wrapper.

```ts
const handleCompanionCommand = useCallback(
  async (command: CompanionCommand): Promise<void> => {
    // existing execution logic
  },
  [required stable dependencies]
);
```

Then pass:

```ts
useCompanionBehavior({
  companionId: companion.id,
  onCommand: handleCompanionCommand,
});
```

### Persist Idempotency State

Do not keep handled IDs only inside a recreated closure.

Use:

```ts
const handledCommandIdsRef = useRef<Set<string>>(new Set());
const activeExecutionRef = useRef<ActiveCommandExecution | null>(null);
```

Pass stable stores into the executor or move execution ownership into the hook.

## Acceptance Criteria

- Re-rendering does not reset handled command IDs.
- The same command ID executes at most once.
- Event delivery plus `getActiveCommand()` recovery does not duplicate execution.
- Re-subscribing the IPC listener does not duplicate execution.
- Tests simulate executor recreation and repeated command delivery.

---

# 5. Issue 2 — Event Delivery and `getActiveCommand()` Can Race

## Current Risk

The renderer currently:

1. subscribes to `onCommand`
2. calls `getActiveCommand()`

The same command may arrive through both paths.

## Required Behavior

Both sources must feed the same stable idempotent executor.

```text
IPC event
        ┐
        ├→ stable executeCommand(command)
recovery fetch
        ┘
```

## Requirements

- Do not create separate event and recovery execution logic.
- Do not use separate duplicate stores.
- The first source may execute.
- The second source must be ignored safely.
- Duplicate delivery must not emit duplicate lifecycle acknowledgements.
- Main Process should also ignore duplicate lifecycle transitions where practical.

## Tests

Add tests for:

```text
event first → recovery second
recovery first → event second
event twice
recovery twice
re-subscription after render
```

Expected:

```text
one execution
one received
one started
one terminal acknowledgement
```

---

# 6. Issue 3 — Command Execution Needs Timeout

## Current Risk

`present_discovery` may return a Promise that resolves only when typewriter completion fires.

If completion never occurs, the command remains active indefinitely.

Possible causes:

- speech callback failure
- renderer error
- Companion switch
- component unmount
- popup removed unexpectedly
- new command replaces the previous completion callback
- window shutdown
- animation or typewriter interruption

## Required Fix

Add command execution timeout.

Suggested model:

```ts
interface CommandExecutionOptions {
  timeoutMs: number;
}
```

Use one documented default between 30 and 60 seconds.

Required behavior:

```text
command starts
→ execution Promise races timeout
→ if timeout wins:
   failed or cancelled
   active state cleared
   pending resolver cleared
```

Recommended terminal status:

```text
failed
reason: command_timeout
failedStep: presentation
```

Use `cancelled` only for deliberate external cancellation.

## Requirements

- Timeout is cleared after normal completion.
- Timeout is cleared after cancellation.
- Timeout is cleared after failure.
- Late completion callbacks after timeout do nothing.
- No Promise remains unresolved after timeout.

## Tests

- command completes before timeout
- command exceeds timeout
- late resolve after timeout
- timeout cleanup
- no duplicate terminal acknowledgement

---

# 7. Issue 4 — Add Explicit Cancellation

## Required Cancellation Sources

Cancel active execution when:

- Companion changes
- component unmounts
- window begins shutdown
- command expires
- a conflicting command replaces the current one
- user explicitly dismisses/cancels the active command where supported

## Required Model

```ts
interface ActiveCommandExecution {
  commandId: string;
  companionId: string;
  startedAt: string;
  cancel: (reason: string) => void;
}
```

A cancellation must:

1. stop pending timeout
2. stop waiting for presentation completion
3. clear active command state
4. ignore late callbacks
5. report `cancelled`
6. include a reason

Suggested reasons:

```text
companion_switched
renderer_unmounted
window_shutdown
command_expired
replaced_by_new_command
user_cancelled
```

## Acceptance Criteria

- Unmount does not leave a command active.
- Switching Companion cancels the previous Companion’s command.
- Late typewriter completion after cancellation does nothing.
- Cancellation emits exactly one terminal acknowledgement.

---

# 8. Issue 5 — Prevent Active Command Overwrite

## Current Risk

The renderer currently uses one:

```ts
commandCompletionRef
```

A second command may overwrite the resolver for the first command.

## Required Behavior

At most one command may be active for the single present Companion.

For the current scope, use this policy:

```text
active command exists
→ reject new command as busy
```

Do not silently overwrite.

Suggested reason:

```text
renderer_busy
```

## Requirements

- Do not overwrite `commandCompletionRef`.
- Active execution must include command ID.
- Completion must resolve only the matching command.
- A completion callback for another command must be ignored.

## Tests

- second command while first is active
- duplicate same ID
- different ID conflict
- old completion after conflict

---

# 9. Issue 6 — Define Truthful `started`

## Current Behavior

The lifecycle currently calls:

```text
received
→ execute(command)
→ started
```

This is only truthful if `execute(command)` has synchronously started the first visible action.

## Required Contract

Preferred execution API:

```ts
interface CommandExecutionHandle {
  started: Promise<void>;
  completed: Promise<void>;
  cancel: (reason: string) => void;
}
```

Alternative acceptable API:

```ts
execute(command, lifecycle)
```

where:

```ts
lifecycle.markStarted()
lifecycle.markCompleted()
```

## Required Semantics

### `received`

Command validated and accepted by renderer.

### `started`

The first required visible action has actually begun.

Examples:

- speech bubble opened
- Discovery card rendered
- animation started
- tool action dispatched

### `completed`

All required command steps are finished according to the command contract.

### `failed`

Execution could not finish.

### `cancelled`

Execution was deliberately stopped.

## Acceptance Criteria

- `started` is not emitted automatically before visible execution.
- Handler controls the start point.
- A handler that fails before visible action reports `failed`, not `started`.
- Each command has one terminal state.

---

# 10. Issue 7 — Define Completion Semantics for Every Display Hint

Current command handling includes at least:

```text
show_soft_hint
present_discovery
```

Their completion semantics must be explicit and consistent.

## `show_soft_hint`

Preferred:

```text
completed when the soft hint finishes or is dismissed
```

Minimum acceptable:

```text
completed when the bubble has been successfully rendered
```

Document the chosen meaning.

Do not complete before rendering occurs.

## `present_discovery`

Completed when:

- Discovery card was shown
- share message/typewriter completed
- no required presentation step remains

If the user dismisses early, use one documented policy:

```text
cancelled: user_dismissed
```

or:

```text
completed: dismissed_after_presentation
```

## Unknown Display Hint

Unsupported hints must report:

```text
failed
reason: unsupported_command
```

They must not silently complete.

## Tests

Add one lifecycle test for each supported display hint.

---

# 11. Issue 8 — Main Process Command State Must Be Consistent

## Requirements

Main Process should track:

```ts
interface ActiveCommandRecord {
  command: CompanionCommand;
  latestStatus: CommandAckStatus;
  updatedAt: string;
  terminal: boolean;
}
```

When acknowledgements arrive:

- ignore duplicate identical status where safe
- reject invalid backward transitions
- ignore updates after terminal state
- ensure command ID and Companion ID match
- clear active command after terminal state

Valid transitions:

```text
received → started → completed
received → failed
received → cancelled
received → started → failed
received → started → cancelled
```

Invalid transitions:

```text
completed → started
failed → completed
cancelled → started
```

## Recovery

`getActiveCommand()` should return a command only when:

- it is non-terminal
- it has not expired
- it matches the active Companion
- recovery execution is still appropriate

Do not return completed, failed, or cancelled commands.

## Tests

- valid transitions
- invalid backward transitions
- duplicate status
- terminal status protection
- wrong Companion ID
- expired command recovery

---

# 12. Issue 9 — Clean Renderer State Ownership

The old high-level behavior brain is removed, but renderer still stores fields such as:

```text
mode
mood
energy
initiativeLevel
focus
debugOverride
```

Review every field.

## Renderer May Own

- card open/closed
- speech bubble display
- current animation playback
- drag UI state
- position
- hover state
- current command rendering progress

## Renderer Must Not Own as Behavioral Truth

- initiative policy
- relationship-derived mood
- attention mode
- energy used for decisions
- focus policy
- interruption permission

For each retained field, document whether it is:

```text
display-only
debug-only
deprecated
runtime-owned mirror
```

Remove unused setters and persisted fields where they no longer serve a valid UI purpose.

Do not perform a broad UI rewrite.

---

# 13. Recommended File Scope

Prefer changes only in:

```text
apps/desktop/renderer/src/companion/behavior/useCompanionBehavior.ts
apps/desktop/renderer/src/companion/behavior/commandLifecycle.ts
apps/desktop/renderer/src/companion/behavior/commandLifecycle.test.ts
apps/desktop/renderer/src/ui/App.tsx
apps/desktop/electron/main/services.ts
apps/desktop/electron/preload/index.ts
packages/shared/src/index.ts
tasks/direction-correction/repair-execution-log.md
```

Additional files require a written reason in the execution log.

---

# 14. Required Tests

Add tests covering:

## Idempotency

- same command event twice
- event plus recovery
- recovery plus event
- executor recreated
- component re-render
- listener re-subscription

## Lifecycle

- received
- started
- completed
- failed
- cancelled
- one terminal status only

## Timeout

- normal completion
- timeout
- late completion after timeout
- timeout cleanup

## Cancellation

- unmount
- Companion switch
- command expiry
- conflicting command
- user dismiss

## Active Command Conflict

- second command rejected
- same ID ignored
- previous resolver not overwritten

## Main Process State

- valid acknowledgement transitions
- invalid transitions ignored/rejected
- terminal command not returned by recovery
- wrong Companion acknowledgement rejected

## Legacy Removal

Prove production code no longer contains:

```text
applyBehaviorHint
CompanionBehaviorController
decisionTimerRef
companion:behaviorHint
periodic behavior evaluation
```

---

# 15. Verification Commands

Run:

```bash
npm run typecheck
npm run test
npm run arch:check
npm run build
```

Also search for:

```text
createCommandExecutor(
handledCommandIds
getActiveCommand
commandCompletionRef
status: 'started'
applyBehaviorHint
CompanionBehaviorController
decisionTimerRef
companion:behaviorHint
setInterval
```

Every remaining match must be reviewed.

Do not remove unrelated intervals such as debug refresh without cause.

---

# 16. Acceptance Criteria

This task is complete only when:

- command handlers are stable across renders
- idempotency state survives re-renders
- event and recovery paths cannot duplicate execution
- active commands have timeout protection
- active commands can be cancelled
- Companion switch and unmount cancel safely
- a second command cannot silently overwrite the first
- `started` reflects actual visible execution
- every supported command has explicit completion semantics
- unsupported commands fail explicitly
- Main Process rejects invalid lifecycle transitions
- terminal commands are not returned by recovery
- renderer no longer owns unused behavioral truth
- all required tests pass
- no legacy renderer behavior decision flow returns

---

# 17. Final Instruction to Codex

Do not expand the architecture.

Do not implement unrelated phases.

Do not change product scope.

Repair the reliability of the existing authoritative command path only.

The expected result is:

```text
one command
→ one execution
→ truthful lifecycle
→ deterministic completion, failure, or cancellation
```

There must be no duplicate execution, silent overwrite, permanent pending command, or false acknowledgement.
