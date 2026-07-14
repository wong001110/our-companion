# S5 Visual Visit client runtime

`VisualVisitService` runs in the Electron main process. It reconciles REST-authoritative active Visit sessions after online restoration and Visit invalidations. One active session yields exactly one of two local outcomes:

- Visitor owner: the verified Network-to-local mapping puts the local visual runtime in `away_visiting`. The local sprite and interaction UI are hidden, normal life scheduling is paused, new Companion turns and visible commands are rejected, and reconciliation restores `home` when the session is terminal.
- Host: the session-authorized immutable Pack is downloaded or revalidated before a remote Visitor model is published. The isolated renderer runtime ID is `visit:<sessionId>` and is never a local Companion database ID.

The renderer consumes only a sanitized model: public name, session/network/Pack identifiers, manifest animation timing, and `companion-network:` asset URLs. The protocol resolves bytes only from the Pack of the currently active host Visitor, a verified cache record, and a manifest-declared image. It rejects traversal, stale/unknown Packs, undeclared files, and never returns a physical cache path.

Remote movement is local presentation only. `RemoteVisitorLayer` has one timer/controller, uses a session-seeded sequence, idles for 2–6 seconds, moves at 60 px/s inside the current work area, selects manifest animations, and clamps on viewport changes. No position, animation frame, input, AI, tool, speech, memory, or conversation data is sent across the network.

Entering is played once, Idle loops, cardinal walking is required, optional diagonal animations are used when available, and cardinal fallback is used otherwise. Removing a Visitor starts Leave locally and then releases the renderer runtime. A sprite-load failure reports a sanitized local error, removes only the remote renderer runtime, and waits for a reconnect or fresh Visit invalidation before retrying; it never ends the Server Session. Application restart/reconnect fetches authoritative sessions again rather than restoring a prior position.

Deferred from S5: remote AI, speech, tools, memory, interaction, dragging, host controls, multiple visitors, and Social UI redesign.
