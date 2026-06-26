# Character Foundation

The Character Engine is not the brain.

It is the embodied expression of decisions.

## Character Owns

- personality
- mood
- emotion
- energy
- behavior state
- animation policy

## Character Does Not Own

- discovery ranking
- memory storage
- command execution
- decision timing
- source fetching

## Character State Example

```ts
type CharacterState = {
  mood: 'neutral' | 'curious' | 'happy' | 'thinking' | 'tired'
  intent: 'idle' | 'present_discovery' | 'perform_task' | 'reflect'
  energy: number
  animationKey?: string
}
```

## Animation Policy

A decision maps to character state:

```txt
Decision: speak about discovery
  ↓
Mood: curious
Intent: present_discovery
Animation: discovery_present
```

A desktop action maps to performance:

```txt
Action: open_youtube
  ↓
Mood: helpful
Intent: perform_task
Animation sequence: run -> tap -> type -> confirm -> return
```

## Migration Note

If current character-engine already handles animation, keep it.

Add layers:

```txt
state
emotion
behavior
animation-policy
```

Do not let animation code call business engines.
