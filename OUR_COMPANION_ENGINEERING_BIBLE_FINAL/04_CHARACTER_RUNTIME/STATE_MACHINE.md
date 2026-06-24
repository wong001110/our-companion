# Character State Machine

## Core states
- idle
- walking
- sleeping
- observing
- thinking
- discovering
- talking
- executing
- returning
- organizing_backpack

## Normal idle loop
```text
idle -> walking -> observing -> thinking -> idle
idle -> sleeping -> idle
idle -> organizing_backpack -> idle
```

## Discovery loop
```text
idle/walking/observing
  -> thinking
  -> discovering
  -> talking
  -> idle
```

## Task loop
```text
idle
  -> thinking
  -> executing
  -> returning
  -> talking
  -> idle
```

## State transition priority
1. User command
2. Safety / error
3. Discovery share
4. Diary/reflection
5. Idle behavior
