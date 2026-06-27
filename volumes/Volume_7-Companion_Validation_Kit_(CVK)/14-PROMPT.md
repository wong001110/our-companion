# 14 - PROMPT

Version: 1.0

Status:
Draft

---

# Purpose

This document defines the implementation rules for AI Coding Agents working with the Companion Validation Kit (CVK).

Its objective is to ensure every new feature developed for Our Companion is immediately observable, reproducible and verifiable.

CVK is part of the development workflow.

It is not an optional developer utility.

---

# Mission

Your objective is NOT only to implement Companion features.

Your objective is also to ensure every feature can be:

- Simulated
- Inspected
- Validated
- Reproduced
- Debugged

A feature that cannot be validated is considered incomplete.

---

# Primary References

Implementation priority:

1. OSES
2. Current Volume
3. Existing Repository
4. Previous Volumes
5. Developer Instructions

If conflicts exist,

OSES always takes priority.

---

# Validation First

Before implementing a feature,

identify:

- How it will be simulated.
- How it will be inspected.
- How it will be debugged.
- How it will be tested.
- How it will be replayed.

If no validation path exists,

design one before writing code.

---

# Development Workflow

Every implementation should follow:

Read Specification

↓

Identify Dependencies

↓

Implement Feature

↓

Register Validation

↓

Support Simulation

↓

Support Inspector

↓

Support Snapshot

↓

Run Playtest

↓

Regression Test

↓

Developer Review

↓

Merge

Never bypass validation.

---

# Required Validation Support

Every new Companion feature should provide:

Simulation Entry

Inspector Support

Debug Overlay Data

Snapshot Compatibility

Validation Registration

Playtest Scenario

Regression Test

Features missing any of these should not be merged.

---

# Runtime Rules

Never bypass the Companion Runtime.

Always follow:

Context

↓

Behavior

↓

State Machine

↓

Runtime

↓

Presentation

Validation should observe runtime,

not replace it.

---

# Debug Rules

Generated features should expose:

Current State

Current Inputs

Current Outputs

Current Decisions

Current Queues

Current Health

Developers should understand why a feature behaves as it does.

---

# Scenario Support

Whenever applicable,

add the feature to existing Scenarios.

Examples

First Launch

Day 30

Return After Vacation

Heavy Discovery

Heavy Notebook

Features should appear naturally during validation.

---

# Snapshot Rules

Feature state should be serializable.

Snapshots should correctly:

Save

↓

Restore

↓

Replay

Feature behavior should remain identical after restoration.

---

# Playtest Rules

Every feature should define:

Expected Experience

Potential Risks

Validation Steps

Success Criteria

Playtesting should verify user experience,

not only implementation correctness.

---

# Regression Rules

Whenever fixing a bug:

Create Regression Scenario

↓

Create Regression Snapshot

↓

Update Regression Test

↓

Document Root Cause

Regression prevention is more valuable than repeated bug fixing.

---

# Code Quality

Generated code should:

- Follow project conventions.
- Be modular.
- Be testable.
- Be observable.
- Be maintainable.

Avoid:

- Hidden runtime state
- Hardcoded validation
- Debug-only business logic
- Direct runtime manipulation

---

# Output Format

When implementing,

provide:

1. Summary

2. Files Modified

3. Validation Steps

4. Simulation Entry

5. Snapshot Compatibility

6. Playtest Scenario

7. Risks

8. Remaining TODO

Keep implementation reports concise.

---

# Forbidden

Do NOT:

- Skip Validation Registration.
- Skip Simulation support.
- Skip Inspector support.
- Hide internal runtime state.
- Bypass Runtime Coordinator.
- Modify production-only behavior for debugging.

If validation cannot be completed,

document the limitation explicitly.

---

# Success Criteria

AI Argent implementation is considered successful only when:

- The feature works correctly.
- It integrates with the Companion Runtime.
- It supports CVK validation.
- It passes Playtest.
- It passes Regression.
- It is ready for long-term Companion verification.

Implementation alone is not considered completion.

Validation completes the feature.