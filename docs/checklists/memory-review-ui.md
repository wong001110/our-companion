# Memory Review UI — Manual Test Checklist

Record before testing:

- OS and version:
- build/commit SHA:
- Companion name:
- UI language:

## Page structure

- [ ] Open the Memory tab.
- [ ] Confirm there are no normal-user **Add**, **Edit** or **Delete** controls.
- [ ] Confirm search, Memory type filter and review-state filter are visible.
- [ ] Confirm cards show type, source, evidence class, confidence, observation count and updated date.
- [ ] Confirm raw Memory, Pattern, Curiosity, Research, Candidate and Insight IDs are not displayed.

## Confirm Memory

- [ ] Select an unreviewed Memory and click **Confirm**.
- [ ] Refresh the page and restart the app.
- [ ] Confirm the Memory remains Confirmed and Active.
- [ ] Ask a relevant question and confirm the Memory may be used normally.

## Ask for confirmation

- [ ] Click **Ask again** on an active Memory.
- [ ] Confirm its state becomes Needs confirmation / Paused.
- [ ] Ask a relevant question and confirm the paused Memory is not used.
- [ ] Trigger Discovery around the same topic and confirm the paused Memory does not increase candidate relevance.
- [ ] Confirm the Memory content and provenance remain visible in review.

## Dispute and pause use

- [ ] Click **Pause use** on a Memory that is no longer correct.
- [ ] Confirm the disputed notice appears.
- [ ] Restart the app and confirm the state persists.
- [ ] Ask the Companion to recall the disputed information and confirm it is not asserted.
- [ ] Confirm the Memory is not deleted silently.

## Restore

- [ ] Confirm a paused Memory again.
- [ ] Confirm it becomes Active without changing its title, summary or evidence class.
- [ ] Confirm later retrieval can use it again.

## Influence summary

- [ ] Click **View influence**.
- [ ] Confirm only counts are shown for Patterns, Interests, Curiosity, Research, Discoveries and Insights.
- [ ] Confirm no internal IDs appear.
- [ ] Confirm closing the panel does not change Memory state.

## Localization and accessibility

- [ ] Repeat the page flow in English.
- [ ] Repeat the page flow in Simplified Chinese.
- [ ] Navigate filters and actions by keyboard.
- [ ] Confirm action status and errors are announced or visibly presented.

## Result

- [ ] PASS
- [ ] FAIL

Failure notes, affected Memory description and screenshots:
