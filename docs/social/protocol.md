# Protocol 0.4

The client sends protocol `0.4` and version `0.4.0`. S5 adds `visualVisits`, which is available only when the server reports verified private asset-transfer capability. Visit lifecycle remains REST-authoritative; Socket.IO only invalidates local state.

The renderer receives only a sanitized remote Visitor model. It has a network Companion ID, immutable Asset Pack ID, public name, manifest-derived animation timing, and `companion-network:` URLs. It never receives an R2 URL, token, cache root, local owner Companion ID, memory, prompts, or AI/tool access.
