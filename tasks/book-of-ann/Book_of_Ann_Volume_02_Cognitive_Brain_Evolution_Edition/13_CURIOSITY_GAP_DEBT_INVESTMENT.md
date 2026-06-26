# Curiosity Gap, Debt, and Investment

## Curiosity Gap

A missing understanding that blocks deeper exploration.

Example:

```txt
User explores AI Agent memory but has little understanding of evaluation.
```

## Gap Type

```ts
type CuriosityGap = {
  id: string
  conceptId?: string
  journeyId?: string
  description: string
  priority: number
  status: 'open' | 'exploring' | 'satisfied' | 'paused'
  createdAt: string
}
```

## Curiosity Debt

A high-value gap that Ann has noticed but has not found the right moment or material for.

Example:

```txt
Evaluation for AI agents
```

Ann keeps it in mind until a good discovery appears.

## Curiosity Investment

A measure of whether a direction deserves more exploration.

Investment is not the same as user likes.

It considers:

- long-term value
- current project relevance
- knowledge gap
- user momentum
- novelty
- diminishing returns

## Events

```txt
CuriosityDebtCreated
CuriosityDebtResolved
CuriosityInvestmentUpdated
```

## Product Effect

Ann can say later:

```txt
I finally found something that explains the part we were missing.
```
