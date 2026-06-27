# Interruption Policy

## Overview

The interruption policy prevents the companion from annoying the user.

---

## Rules

### 1. Stay Quiet Never Interrupts
The `stay_quiet` candidate never triggers an interruption.

### 2. Focused User Protection
If user is `focused` or `working`, candidates with high interruption cost (> 0.3) are blocked.

### 3. Fatigue Protection
If fatigue score > 80, candidates with interruption cost > 0.2 are blocked.

### 4. Ignore History Protection
If user has ignored 3+ discoveries recently, candidates with interruption cost > 0.3 are blocked.

### 5. Confidence Threshold
Candidates with confidence < 0.4 are blocked.

### 6. Value Threshold
Candidates with expectedUserValue < 0.3 are blocked.

---

## Interruption Cost by Candidate Type

| Type | Typical Cost |
|------|--------------|
| `stay_quiet` | 0 |
| `respond` | 0.2 |
| `ask_question` | 0.3 |
| `share_discovery` | 0.4 |
| `start_discovery` | 0.1 |
| `continue_journey` | 0.2 |
| `suggest_action` | 0.35 |
| `update_memory` | 0.05 |
| `perform_character_reaction` | 0.15 |

---

## Future Enhancements

- **Time-based policies**: Different rules for different times of day
- **User preferences**: Allow users to set interruption tolerance
- **Learning**: Adapt policies based on user feedback
- **Context-aware**: More nuanced rules based on conversation context
