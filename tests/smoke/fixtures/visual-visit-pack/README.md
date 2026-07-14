# Deterministic S5 fixture

The smoke-only local Companion bootstrap generates transparent `300 × 300` PNG sprite sheets with a deterministic neutral Companion silhouette for every local Companion animation. The resulting published Pack includes the S5-required `Idle_Neutral`, `Enter`, `Leave`, `Walk_Left`, `Walk_Right`, `Walk_Up`, and `Walk_Down` animations. It is generated at runtime to keep binary files out of the source tree and never uses a production Companion asset.
