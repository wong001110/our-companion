# Vector Memory Productization — Manual Test Checklist

Record before testing:

- OS and version:
- packaged or development build:
- build/commit SHA:
- existing local E5 cache: yes / no
- existing Memory count:

## First-run and fallback

- [ ] Open **Settings → Memory** with no local E5 model installed.
- [ ] Confirm state is **Not installed**, not a generic crash/error.
- [ ] Confirm the page says keyword and structured retrieval remain available.
- [ ] Chat with the Companion and confirm ordinary current-turn conversation still works.
- [ ] Ask about a previously saved Memory and record whether the lexical fallback retrieves it correctly.

Expected: no automatic model download and no network request caused by ordinary chat.

## Explicit installation

- [ ] Click **Install local model**.
- [ ] Confirm the UI enters an installing/busy state and prevents duplicate clicks.
- [ ] Confirm the app remains responsive during installation.
- [ ] Confirm the state changes to Indexing or Ready without restarting.
- [ ] Confirm the model path is not exposed in the normal Settings UI.

Expected: network access occurs only because the user explicitly started installation.

## Indexing and retrieval

- [ ] Create at least one English preference and one Simplified Chinese preference through normal conversation.
- [ ] Wait for indexing and confirm indexed/eligible counts converge.
- [ ] Ask semantically similar questions that do not repeat the same keywords.
- [ ] Confirm the correct Memory is used and unrelated Memory is not surfaced.
- [ ] Test one mixed Chinese-English query.

Record false-positive or missed retrieval examples verbatim.

## Rebuild

- [ ] Click **Rebuild vector index**.
- [ ] Confirm the state enters Indexing.
- [ ] Confirm Memory records remain visible throughout rebuild.
- [ ] Confirm chat continues with lexical/structured fallback while rebuild is active.
- [ ] Confirm indexed/eligible counts recover after completion.
- [ ] Restart the app and confirm the status remains Ready.

Expected: no Memory rows, titles, evidence or review states change.

## Failure and recovery

- [ ] Temporarily rename or remove the local model cache.
- [ ] Restart the app and confirm Not installed/Degraded is shown.
- [ ] Confirm ordinary chat does not crash.
- [ ] Restore or reinstall the model and confirm recovery.
- [ ] Interrupt the app during indexing, restart, and confirm jobs recover or can be rebuilt.

## Result

- [ ] PASS
- [ ] FAIL

Failure notes, logs and screenshots:
