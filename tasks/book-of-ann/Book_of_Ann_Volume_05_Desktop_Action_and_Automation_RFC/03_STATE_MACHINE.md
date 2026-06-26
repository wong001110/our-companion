# Action State Machine

Idle
 -> Planning
 -> AwaitPermission
 -> Executing
 -> Performing
 -> Completed

Failure path:
Executing -> Failed -> Recovery -> Idle
