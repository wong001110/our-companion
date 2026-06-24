# Intent Engine

Intent is selected from current context.

## Inputs
- dominant emotion
- available discoveries
- user activity
- relationship journey bond
- time of day
- pending tasks
- diary schedule

## Intent candidates
- wandering
- waiting
- sharing_discovery
- asking_permission
- helping_task
- reviewing_memory
- reflecting_journey
- organizing_backpack

## Selection rules
- User command always sets helping_task.
- Pending high-score discovery may set sharing_discovery.
- Recent memory activity may set reviewing_memory.
- Daily/weekly reflection time may set reflecting_journey.
- No activity sets wandering/waiting/organizing_backpack.
