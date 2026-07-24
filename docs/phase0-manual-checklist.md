# Phase 0 manual verification checklist

Run this checklist on a packaged desktop build after automated validation passes.
Record the operating system, packaged build identifier, and observed result for any failed item.

## Startup and ordinary use

- [ ] Launch the app with an existing Companion and confirm the Companion and panel windows appear normally.
- [ ] Send an English text message and confirm one normal reply is stored in History.
- [ ] Switch reply language to Simplified Chinese and confirm canonical Memory framing is Chinese while quoted evidence remains unchanged.
- [ ] Restart the app and confirm existing conversation and Memory data remain available.

## Grounding and privacy

- [ ] Enter a stable preference, then ask the Companion to recall it; confirm the displayed fact matches the original evidence.
- [ ] Enter a phone number, email, bank account, Malaysian address, or API key in a “remember” request; confirm no durable Memory appears.
- [ ] Open developer diagnostics and confirm the raw sensitive value does not appear in inspection or upload payloads.
- [ ] Confirm a saved do-not-mention boundary is acknowledged without displaying the prohibited target.

## Actions and permissions

- [ ] Request an Action requiring permission, choose **Allow once**, and confirm it executes once without changing the persistent permission.
- [ ] Repeat and choose **Always allow**; confirm later requests execute without another prompt.
- [ ] Cancel a pending Action and confirm no Action executes and no attached Memory candidate is stored.
- [ ] Force or simulate an Action adapter failure and confirm no attached Memory candidate is stored.

## Network and Visit lifecycle

- [ ] Enable online mode, connect successfully, then disable it; confirm reconnect attempts stop.
- [ ] Start and end a Visit flow and confirm no heartbeat or visual Visit state remains after shutdown.

## Vector recovery

- [ ] With the local E5 model installed, rebuild Memory vectors and confirm search remains unavailable only during maintenance.
- [ ] Interrupt the app during a rebuild, relaunch, and confirm SQLite Memory is intact and vector recovery can be retried.
- [ ] Temporarily remove or rename the E5 cache and confirm lexical/structured Memory retrieval still works without a crash.

## Shutdown and late-write protection

- [ ] Start a slow research, speech, or Action request and immediately quit the app; confirm shutdown completes without a SQLite-closed exception.
- [ ] During shutdown, attempt another renderer action; confirm it is rejected with an app-shutting-down error.
- [ ] Relaunch after the interrupted operation and confirm no duplicate message, Memory, Action, or discovery record was persisted.
- [ ] Quit twice in quick succession and confirm there is no crash or duplicate cleanup error.

## Automated evidence

- [ ] GitHub Actions **Phase 0 validation** is green on the final commit.
- [ ] `npm run typecheck` passes locally.
- [ ] `npm test` passes locally.
- [ ] `npm run arch:check` passes locally.
- [ ] `npm run build` passes locally.
