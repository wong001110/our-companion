# Creator System Placeholder

The Companion Creator system is not implemented in Volume 01.

However, Volume 01 must reserve architecture for it.

## Future Creator Goals

Users should eventually be able to:

- change companion name
- configure personality
- upload character assets
- upload sprite sheets
- upload Spine assets
- configure animation mapping
- preview behavior
- package a companion
- later choose voice or TTS

## Important Separation

The Brain must be reusable.

A custom character package should not change cognitive logic.

Target model:

```txt
Companion Brain
  +
Character Package
```

Character Package contains:

```txt
name
personality preset
emotion mapping
animation assets
voice reserved
tts reserved
metadata
```

## Volume 01 Requirement

Do not hardcode Ann-specific assumptions into brain modules.

Ann can be the default character, but the architecture must support future replacement.
