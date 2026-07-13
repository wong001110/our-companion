# S4 Visit client lifecycle

The renderer gets sanitized Visit invitation/session summaries through narrow IPC only. It never receives a local Companion ID, local asset path, cache path, object key, pre-signed URL, or token.

The Visitor Owner prepares by confirming Online Mode and an existing local-to-network Companion mapping, then reports ready. The Host prepares by fetching session-scoped Pack metadata, reusing or downloading the immutable Pack through the established atomic SHA-256 cache flow, and reports ready only after verification.

The main-process Visit coordinator starts one 15-second heartbeat per preparing, ready, or active session. It stops heartbeats and cancels transfers when the session is terminal, Online Mode is disabled, authentication is lost, the server changes, logout occurs, or the app exits. A restart restores active session tracking when sessions are refreshed.

S4 displays consent and session status only. It does not render a remote Companion or provide movement, AI, chat, interaction, or remote controls.
