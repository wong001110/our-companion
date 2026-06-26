# Action Performance Foundation

Our Companion should be able to perform actions in a way that feels embodied.

Example user request:

```txt
Open Chrome and search YouTube.
```

The real action should be executed by command.
The visible animation should be performed by Ann.

## Separation

```txt
Action = real task
Performance = Ann's acted-out behavior
Animation = visual frames
```

## Correct Flow

```txt
User Request
  ↓
Action Planner
  ↓
Permission Check
  ↓
Command Executor
  ↓
Performance Director
  ↓
Character Engine
  ↓
Animation Renderer
```

## Example

Command:

```ts
openUrl('https://www.youtube.com')
```

Performance:

```txt
run_to_chrome
tap
thinking
run_to_address_bar
tap
typing
confirm
return_idle
```

## Rule

Never rely on fake UI clicking to perform the real task.

Animation may show clicking.
Command executor performs the actual work.

## Future Compatibility

Companion visiting another Companion is also an action:

```txt
Action: visit_companion
Performance: wave -> leave_screen -> travel -> return_with_note
```
