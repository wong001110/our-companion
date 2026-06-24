# Emotion Engine

## Range
Each emotion is 0-100.

## Decay
Every runtime cycle:
- excited *= 0.90
- happy *= 0.95
- proud *= 0.95
- curious *= 0.97
- shy *= 0.98
- tired decays slowly during active time, increases at late hours
- concerned decays when task/discovery resolves

Clamp to 0-100.

## Event modifiers
User accepts discovery:
- happy +12
- proud +10
- shy -4

User rejects discovery:
- shy +5
- curious -3

User ignores multiple discoveries:
- shy +8
- talking probability decreases

New high-score discovery:
- curious +15
- excited +8

Task success:
- proud +8
- happy +6

Task failure:
- confused +10
- concerned +8

Late night:
- tired +10

Repeated topic matching character expertise:
- curious +8
- focused +8
