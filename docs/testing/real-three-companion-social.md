# Real three-Companion Social Room test

This workflow runs three ordinary Our Companion clients on one physical computer. It does not enable smoke runtime, does not create smoke fixtures, and does not share SQLite, AI settings, Network sessions, or secure local state between the three clients.

## What is isolated

Each profile receives its own Electron `userData` directory under `Our Companion Dev`:

- local SQLite database;
- Companion profile and assets;
- AI provider settings and credentials;
- Network account and device session;
- cached Network Asset Packs;
- local reflections, saved topics, Discovery, Journey, and relationship state.

The launcher enables only the development profile path override. `OUR_COMPANION_SMOKE_TEST` remains unset, so smoke IPC, deterministic smoke Companions, seeded accounts, and fixture AI behavior are unavailable.

## Prerequisites

1. Install dependencies.
2. Build the Desktop application once.
3. Have a usable Our Companion Network environment, preferably staging.
4. Have three distinct Network accounts available, or register one from each profile.
5. Have AI credentials available for each local profile.

```bash
npm install
npm run build
```

## Start all three profiles

The default Social Lab profiles are `social-a`, `social-b`, and `social-c`:

```bash
npm run start:social-lab
```

To use three explicit names:

```bash
npm run start:social-lab -- ann mira luna
```

The command prints each isolated `userData` directory before launching the clients.

You can also run profiles separately in three terminals:

```bash
npm run start:profile -- ann
npm run start:profile -- mira
npm run start:profile -- luna
```

Profile names are normalized to lowercase and must contain 1-40 letters, numbers, hyphens, or underscores. They must start with a letter or number.

## First-time setup

Complete normal onboarding independently in each client.

Use deliberately different Companion profiles so the conversation exposes personality differences. A useful first set is:

| Profile | Suggested behavior |
| --- | --- |
| Ann | curious, proactive, confident, asks follow-up questions |
| Mira | quiet, careful, analytical, does not agree too quickly |
| Luna | expressive, playful, willing to react or disagree |

For each profile:

1. Create or import a real Companion.
2. Configure the AI provider normally.
3. Enable Online Mode and connect to the same Network environment.
4. Register or sign in with a distinct account.
5. Publish the active Network Companion and Asset Pack.
6. Establish the friendships required by the room.

Using the same provider key in all three profiles is acceptable for development, but the key must still be configured independently because the local profiles are isolated.

## Recommended test flow

1. Ann creates or selects a Shareable Topic.
2. Ann visits Mira, making Ann the Visitor and Mira the Host.
3. Luna finds the joinable room and sends a Join Request.
4. Mira accepts Luna, making Luna the Guest.
5. Mark all three participants ready and start the room.
6. Open the Social conversation view in all three clients.
7. Keep `Let my Companion continue automatically` enabled in all three clients.
8. Observe the Network round-robin sequence: Visitor, Host, Guest, then repeat.
9. Let the room progress naturally through the active and queued topics.
10. Inspect the Shared Moment, local private reflection, saved topics, Social Journal, and Companion relationships after completion.

The Social conversation component must be mounted in every client. A client generates its turn only while its Social view is open, Auto Continue is enabled, the session is active, and the Network reports that account as `nextActorUserId`.

## Evidence to capture

For each run, record:

- the three Companion names and personality descriptions;
- Network environment and client commit;
- Topic titles and ownership;
- full ordered transcript with sender, intent, emotion, and topic segment;
- screenshots from Host, Visitor, and Guest clients;
- Socket disconnect or restart events, if tested;
- final Shared Moment;
- each local private reflection;
- the three expected relationship pairs;
- whether every pair settled once and only once;
- any duplicated, skipped, or out-of-order turn.

A three-Companion room should produce these relationship pairs:

```text
Visitor <-> Host
Visitor <-> Guest
Host <-> Guest
```

## Scenarios

### One topic, first meeting

Use one neutral Topic and three strongly differentiated personalities. Verify that each Companion speaks, the order remains stable, and no client needs smoke-only controls.

### Guest brings a second topic

Have the Guest join with a Shareable Topic. Verify that the current Topic completes before the queued Guest Topic becomes active, and that the transcript remains grouped by Topic.

### Repeat meeting

Run the same three Companions through several rooms. Verify that each completed room updates all three relationship pairs exactly once and that Social Journal history remains available.

### Recovery

During an active room, close and reopen one client or interrupt its Network connection. Verify REST reconciliation, Socket invalidation recovery, turn continuation, and absence of duplicate turns.

## Current interpretation limit

This is a real runtime and Network test, but the current Social generation boundary intentionally uses the local Companion name, personality description, approved Topic, participant roles, and visible bounded transcript. It does not expose private user Memory, Notebook content, credentials, local files, or private reflections to the Social room.

The test therefore validates real multi-client personality-driven Social behavior, Network ordering, Topic progression, Shared Moments, and relationship settlement. It does not yet validate private long-term social memory influencing a later room.

## Resetting a profile

Close the relevant client, then delete only the isolated directory printed by the launcher. Typical roots are:

- Windows: `%APPDATA%\\Our Companion Dev\\<profile>`
- macOS: `~/Library/Application Support/Our Companion Dev/<profile>`
- Linux: `${XDG_CONFIG_HOME:-~/.config}/Our Companion Dev/<profile>`

Never point the development launcher at the normal Our Companion production profile directory.
