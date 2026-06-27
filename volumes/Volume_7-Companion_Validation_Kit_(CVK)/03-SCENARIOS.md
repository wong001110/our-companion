# 03 - SCENARIOS

Version: 1.0

Status:
Draft

---

# Purpose

Scenarios provide predefined Companion worlds for validation.

Unlike Simulation, which modifies individual variables,

Scenarios reproduce complete user situations.

A Scenario should configure the entire Companion world with one action.

---

# Objectives

Scenarios should allow developers to:

- Reproduce real user journeys.
- Verify complete experiences.
- Share reproducible test environments.
- Reduce manual setup.

---

# Design Philosophy

Simulation changes individual variables.

Scenario recreates an entire world.

Example

Simulation

Relationship = 80

↓

Scenario

Day 30

Relationship 80

Notebook populated

Journey active

Discovery pending

Reflection completed

Outside Panel waiting

The Scenario represents a believable Companion state.

---

# Scenario Components

Every Scenario contains:

- Current Time
- Runtime State
- Context
- Relationship
- Memory
- Journey
- Discovery
- Notebook
- Notifications
- Runtime Queue

A Scenario should restore all components together.

---

# Default Scenarios

## Fresh Installation

Purpose

Brand new user.

State

- No memories
- No discoveries
- Empty notebook
- First launch
- First conversation

---

## First Day

Purpose

Validate onboarding.

State

- First discovery assigned
- Notebook created
- Initial relationship
- Welcome flow

---

## One Week Together

Purpose

Validate early companionship.

State

- Several discoveries
- Daily reflections
- Growing notebook
- Active journey

---

## One Month Together

Purpose

Validate medium-term experience.

State

- Rich notebook
- Multiple journeys
- Discovery history
- Stronger relationship

---

## Long-term Companion

Purpose

Validate mature experience.

State

- Large memory base
- Active long-term projects
- Deep relationship
- Historical notebook

---

## Return After Long Absence

Purpose

Validate return experience.

State

- User absent
- Pending discoveries
- Missed reflections
- Welcome back interaction

---

## Heavy Discovery

Purpose

Stress test Discovery flow.

State

- Large discovery queue
- Multiple cards
- Notebook updates
- Recommendation prioritization

---

## Journey Completion

Purpose

Validate milestone experience.

State

- Final milestone reached
- Reflection generated
- Archive prepared
- Celebration available

---

# Scenario Loading

Loading a Scenario should:

1. Reset current simulation.
2. Restore saved state.
3. Synchronize runtime.
4. Refresh UI.
5. Resume Companion naturally.

The user should not observe inconsistent transitions.

---

# Scenario Persistence

Scenarios may be:

- Built-in
- Custom
- Exported
- Shared

Developers should be able to create reusable Scenario libraries.

---

# Scenario Categories

Experience

Examples

- Day 1
- Day 30
- Anniversary

Development

Examples

- Empty notebook
- Large notebook
- Memory stress

Debug

Examples

- Broken journey
- Notification overflow
- Runtime recovery

Regression

Examples

- Previously reported bugs
- Historical test cases

---

# Scenario Versioning

Every Scenario should include:

- Version
- Compatible OSES version
- Compatible Volume version
- Creation date
- Author

Older Scenarios should remain reproducible whenever possible.

---

# Responsibilities

Scenario owns:

- World templates
- Environment restoration
- Reproducible testing
- Shared validation environments

Scenario does NOT own:

- Runtime logic
- AI reasoning
- Business logic
- Feature implementation

---

# Developer Notes

Avoid manually reproducing complex situations.

If a situation is tested repeatedly,

convert it into a reusable Scenario.

Scenarios should become part of the project's validation assets.

---

# Acceptance Criteria

A completed Scenario System should:

- Restore complete Companion worlds.
- Reduce repetitive setup work.
- Support consistent playtesting.
- Enable shared validation across developers.
- Improve regression testing for long-term Companion behavior.