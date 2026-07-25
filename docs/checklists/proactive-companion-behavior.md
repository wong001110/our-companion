# Proactive Companion Behavior — Manual Test Checklist

Record before testing:

- OS and version:
- build/commit SHA:
- Companion name:
- proactive mode:
- local time:

Use the Developer Runtime Time Controller only to accelerate time. Do not manually invoke prompt IPC.

## Settings

- [ ] Open **Settings → Companion**.
- [ ] Confirm proactive mode offers Off, Quiet, Balanced and Active.
- [ ] Confirm unfinished-topic, goal, Journey and quiet-presence toggles are available.
- [ ] Change settings, restart the app and confirm they persist.

## Hard gates

- [ ] Set mode to Off and advance time beyond every threshold; confirm no proactive prompt.
- [ ] Set Attention to Focus and advance time; confirm no prompt.
- [ ] Set Do Not Disturb and advance time; confirm no prompt.
- [ ] Start a conversation and advance time; confirm no prompt interrupts it.
- [ ] Drag the Companion during a due tick; confirm no prompt.
- [ ] Test between 23:00 and 07:00; confirm no prompt.
- [ ] Produce or simulate three ignored initiatives; confirm proactivity is suppressed.

## Unfinished topic

- [ ] End a conversation with an unfinished topic recorded.
- [ ] Advance runtime time beyond two hours.
- [ ] Confirm the Companion enters a thinking state and shows one gentle continuation line.
- [ ] Confirm the line does not quote the private topic or show internal IDs.

## Goal check-in

- [ ] Create a stable Goal through normal conversation.
- [ ] Confirm the Goal Memory is Active and not review-pending.
- [ ] Advance beyond four hours of inactivity.
- [ ] Confirm one small-step prompt appears.
- [ ] Pause the Goal in Memory Review, advance again, and confirm it no longer creates the opportunity.

## Journey reflection

- [ ] Ensure at least one active Journey exists and no higher-priority unfinished topic or Goal opportunity is due.
- [ ] Advance beyond six hours of inactivity.
- [ ] Confirm a Journey next-step prompt appears.

## Quiet presence

- [ ] Ensure no eligible unfinished topic, Goal or Journey opportunity is due.
- [ ] Advance beyond eight hours of inactivity.
- [ ] Confirm a no-pressure presence line appears and the Companion uses a resting state.

## Budget and cooldown

- [ ] Quiet mode: confirm no more than one prompt per day and at least 12 hours between prompts.
- [ ] Balanced mode: confirm no more than two prompts per day and at least 6 hours between prompts.
- [ ] Active mode: confirm no more than three prompts per day and at least 3 hours between prompts.
- [ ] Restart during a cooldown and confirm counters persist.

## Language and presentation

- [ ] Test an English UI/reply language prompt.
- [ ] Test a Simplified Chinese UI/reply language prompt.
- [ ] Confirm the prompt uses the normal Companion speech bubble.
- [ ] Confirm no Discovery card appears unless a separate Discovery command exists.
- [ ] Confirm the Renderer displays the Main Process decision and does not create extra prompts by itself.

## Result

- [ ] PASS
- [ ] FAIL

Failure notes, runtime time, opportunity type and screenshots:
