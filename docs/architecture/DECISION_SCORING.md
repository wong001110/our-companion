# Decision Scoring

## Overview

The scoring model evaluates each candidate to determine the best next move.

---

## Scoring Formula

```
finalScore = baseScore 
  - (userModePenalty)
  - (fatiguePenalty)
  + (recencyBonus)
  + (insightBonus)
  + (curiosityBonus)
  - (energyPenalty)
  + (confidenceBonus)
```

---

## Factors

### Base Score
Each candidate type has a base score:
- `stay_quiet`: 0.3
- `respond`: 0.6
- `share_discovery`: 0.65
- `start_discovery`: 0.6
- Other types: 0.45-0.55

### User Mode Penalty
- `focused` or `working`: -0.15 × interruptionCost

### Fatigue Penalty
- If fatigueScore > 70: -0.15

### Recency Bonus
- If last interaction > 4 hours ago: +0.1

### Insight Bonus
- If topInsightImportance > 0.7: +0.1

### Curiosity Bonus
- If topCuriosityScore > 0.7: +0.05

### Energy Penalty
- If character energy < 30: -0.1

### Confidence Bonus
- +0.1 × candidate.confidence

---

## Score Range

All scores are clamped to [0, 1].

Higher scores indicate better candidates.
