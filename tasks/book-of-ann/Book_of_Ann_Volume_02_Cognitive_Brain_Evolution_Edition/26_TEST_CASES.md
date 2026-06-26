# Volume 02 Test Cases

## Signal

- Captures internet signal.
- Captures future companion signal type without crashing.
- Normalizes URL.

## Discovery

- Creates discovery from signal.
- Rejects low-quality signal.
- Generates fingerprint.

## Deduplication

- Same URL with UTM is duplicate.
- Same GitHub repo with different ref is duplicate.
- Similar title can be near duplicate.
- Old concept with new update becomes revival candidate.

## Concept

- Creates new concept.
- Matches existing concept.
- Updates lastSeenAt.

## Curiosity

- High growth concept gets high score.
- Repeated ignored topic reduces momentum.
- Budget decreases when discovery is selected.

## Decision

- Focus mode queues.
- Idle + high growth speaks.
- Low novelty remembers only.
- Daily share limit queues.
- Repeated ignores reduce proactive speaking.

## Event Flow

- SignalCaptured leads to DiscoveryCreated.
- DiscoveryCreated can lead to DecisionRequested.
- Decision emits CompanionDecisionMade.
