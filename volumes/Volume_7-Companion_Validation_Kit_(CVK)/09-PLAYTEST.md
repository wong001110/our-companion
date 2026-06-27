# 09 - PLAYTEST

Version: 1.0

Status:
Draft

---

# Purpose

Playtest defines how developers evaluate the Companion experience.

Unlike traditional QA,

Playtesting focuses on the quality of companionship rather than functional correctness.

The objective is to answer:

"Would someone actually enjoy living with this Companion?"

---

# Objectives

Playtest should validate:

- Daily experience
- Long-term experience
- Companion personality
- User comfort
- Emotional consistency
- Product rhythm

Playtesting should focus on experience rather than implementation.

---

# Design Philosophy

Passing every unit test does not mean the Companion feels alive.

Playtesting validates:

Experience

↓

Feeling

↓

Continuity

↓

Companionship

These qualities cannot be measured by automated testing alone.

---

# Playtest Levels

## Level 1

Feature Validation

Purpose

Verify a single feature.

Examples

- Discovery Return
- Notebook Update
- New Animation

---

## Level 2

Flow Validation

Purpose

Verify complete user flows.

Examples

Assign Discovery

↓

Ann Leaves

↓

Discovery Completes

↓

Outside Panel

↓

Conversation

↓

Notebook

---

## Level 3

Daily Experience

Purpose

Evaluate one complete day.

Examples

Morning

↓

Working

↓

Discovery

↓

Reflection

↓

Night

---

## Level 4

Long-term Experience

Purpose

Evaluate weeks or months.

Examples

Day 1

↓

Day 7

↓

Day 30

↓

Day 90

↓

Day 365

Simulation should accelerate validation.

---

# Experience Checklist

Every playtest should evaluate:

- Was Ann natural?
- Was Ann helpful?
- Was Ann intrusive?
- Was Ann repetitive?
- Was timing appropriate?
- Did the Companion feel alive?

Developers should answer these questions after each scenario.

---

# Evaluation Categories

## Presence

Questions

Did Ann feel present without demanding attention?

---

## Conversation

Questions

Did conversations continue naturally?

Did previous discussions matter?

---

## Discovery

Questions

Were discoveries interesting?

Was sharing timing appropriate?

---

## Notebook

Questions

Did Notebook become richer over time?

Was content meaningful?

---

## Journey

Questions

Did long-term progress feel continuous?

Were milestones satisfying?

---

## Relationship

Questions

Did the Companion feel different after weeks or months?

Was relationship growth believable?

---

# Regression Playtest

Every completed feature should replay previous scenarios.

Examples

First Day

↓

One Week

↓

One Month

↓

Return After Vacation

The new feature should not reduce previous Companion quality.

---

# Experience Gates

A feature should not be merged solely because it functions correctly.

Before Merge, verify:

□ Works correctly.

□ Integrates naturally.

□ Does not interrupt Companion rhythm.

□ Improves overall experience.

□ Passes long-term simulation.

Only after passing all Experience Gates should the feature be considered complete.

---

# Observation

During playtesting developers should observe:

- User interruption frequency
- Idle duration
- Notification timing
- Discovery quality
- Emotional consistency

Observations should become future improvements.

---

# Playtest Report

Each playtest should produce:

Scenario

↓

Expected Experience

↓

Actual Experience

↓

Issues Found

↓

Improvement Ideas

↓

Next Validation

Reports should focus on experience instead of implementation details.

---

# Playtest Metrics

Suggested metrics

- Companion Comfort
- Discovery Relevance
- Notebook Growth
- Conversation Continuity
- Relationship Consistency
- Interaction Frequency

Metrics should support discussion,

not replace human judgement.

---

# Responsibilities

Playtest owns:

- Experience validation
- Long-term evaluation
- User flow verification
- Regression playtesting

Playtest does NOT own:

- Automated testing
- Unit testing
- Runtime debugging
- Performance testing

---

# Developer Notes

Developers should periodically stop implementing new features.

Instead,

play with the Companion.

Many experience problems only appear during natural interaction.

---

# Acceptance Criteria

A completed Playtest process should:

- Validate complete Companion experiences.
- Detect repetitive behavior.
- Improve long-term companionship.
- Guide future product refinement.
- Keep development focused on user experience.