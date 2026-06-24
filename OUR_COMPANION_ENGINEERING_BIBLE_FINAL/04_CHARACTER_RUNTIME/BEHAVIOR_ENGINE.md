# Behavior Engine

Behavior maps intent + emotion to state + animation.

## Examples
- wandering + neutral -> walking animation
- wandering + tired -> slow_walk or sleep
- sharing_discovery + shy -> shy_discover animation
- sharing_discovery + excited -> run_discover animation
- helping_task + focused -> task_start animation
- task success + proud -> task_success animation
- task failure + confused -> task_fail animation

## Rule
The same state can have multiple emotional variants. If asset variant is missing, fallback to base animation.
