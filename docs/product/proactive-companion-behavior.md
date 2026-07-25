# Proactive Companion Behavior

## Purpose

The Companion may initiate a small interaction when there is a meaningful reason and the user's attention is available. Proactivity is not a notification feed and does not create a second scheduler or decision authority.

## Single Scheduler Rule

The existing Main Process `CompanionRuntime` life scheduler remains the only owner of proactive timing. The Renderer never decides when the Companion should initiate.

## Initial Opportunity Types

| Type | Source | Minimum inactivity | Visible behavior |
| --- | --- | ---: | --- |
| `unfinished_topic` | latest unfinished conversation session | 2 hours | thinking state + gentle continuation prompt |
| `goal_check_in` | active, safe Goal Memory | 4 hours | thinking state + one-small-step prompt |
| `journey_reflection` | active Journey | 6 hours | thinking state + next-step reflection prompt |
| `quiet_presence` | extended inactivity | 8 hours | resting state + no-pressure presence line |

Prompts are intentionally generic. They do not quote Memory, disclose private content or claim a specific recollection.

## User Modes

| Mode | Daily maximum | Minimum gap |
| --- | ---: | ---: |
| `off` | 0 | never |
| `quiet` | 1 | 12 hours |
| `balanced` | 2 | 6 hours |
| `active` | 3 | 3 hours |

Each opportunity type can also be enabled or disabled separately.

## Hard Gates

No proactive prompt is emitted when:

- Attention mode is Focused or Do Not Disturb;
- a conversation is active;
- the Companion is being dragged;
- the local Companion is away visiting;
- local time is between 23:00 and 07:00;
- the daily budget or cooldown is exhausted;
- the user has ignored at least three recent initiatives;
- no prior user interaction exists.

## State Ownership

- Policy and opportunity selection: Main `ProactiveCompanionPolicy`.
- Timing: existing `CompanionRuntime` life scheduler.
- Preferences and prompt counters: local `app_settings`.
- Prompt delivery: typed `CompanionProactivePrompt` IPC.
- Display: Renderer speech bubble only; Renderer does not make the decision.

## Acceptance Criteria

1. Exactly one life scheduler owns the timing.
2. Settings persist across restart.
3. Focused and Do Not Disturb modes suppress prompts.
4. Late-night, cooldown, daily-limit and repeated-ignore gates work.
5. Goal, Journey, unfinished-topic and quiet-presence opportunities are independently testable.
6. Prompt text never contains raw Memory content or internal IDs.
7. English and Simplified Chinese prompts are available.
