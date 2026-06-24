# Discovery Ranking Formula

```text
final_score =
  0.35 * user_interest_score +
  0.25 * user_history_score +
  0.20 * character_expertise_score +
  0.10 * novelty_score +
  0.10 * usefulness_score
```

## Score meanings
- user_interest_score: explicit user selected interests.
- user_history_score: recent topics/journey/memory graph relevance.
- character_expertise_score: active character expertise and curiosity bias.
- novelty_score: freshness and uniqueness.
- usefulness_score: practical learning/exploration value.

## Character perspective
Discoveries are not purely user-optimized. Active character bias must affect ranking so the companion feels like it has a perspective.
