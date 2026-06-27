# 11 - TEST SUITE

Version: 1.0

Status:
Draft

---

# Purpose

The Test Suite defines the automated validation framework for Our Companion.

Unlike conventional software testing,

the Companion Test Suite validates runtime behavior, long-term continuity and user experience across complete scenarios.

The objective is to detect regressions before developers begin manual playtesting.

---

# Objectives

The Test Suite should:

- Validate every major Companion subsystem.
- Execute reproducible scenarios.
- Detect regressions automatically.
- Verify runtime consistency.
- Reduce manual verification effort.

---

# Design Philosophy

Traditional testing verifies:

Functions

↓

Modules

↓

APIs

Companion testing additionally verifies:

- Presence
- Timing
- Continuity
- Relationship
- Notebook Growth
- Discovery Rhythm
- Experience Stability

The Test Suite validates the Companion as a living system.

---

# Test Levels

## Unit Test

Purpose

Verify individual modules.

Examples

- Memory
- Context
- Runtime
- Scheduler

---

## Integration Test

Purpose

Verify interaction between modules.

Examples

Discovery

↓

Reflection

↓

Notebook

↓

Notification

---

## Runtime Test

Purpose

Verify runtime execution.

Examples

State transitions

Queue execution

Recovery

Scheduler

---

## Scenario Test

Purpose

Run predefined Scenarios.

Examples

- First Launch
- Day 30
- Long Absence
- Heavy Discovery

Scenario Tests should restore complete validation worlds.

---

## Experience Test

Purpose

Validate complete Companion experiences.

Examples

Morning Routine

↓

Working

↓

Discovery

↓

Notebook

↓

Conversation

↓

Sleep

---

## Regression Test

Purpose

Ensure previous experiences remain correct.

Every completed feature should replay historical validation scenarios.

---

# Test Categories

CVK should support automated testing for:

- Runtime
- Discovery
- Notebook
- Journey
- Relationship
- Conversation
- Reflection
- Memory
- Notification

Every major subsystem should have regression coverage.

---

# Test Execution

Execution order

Environment

↓

Load Scenario

↓

Run Simulation

↓

Execute Events

↓

Collect Results

↓

Generate Report

↓

Reset Environment

Every execution should begin from a clean state.

---

# Assertions

Support assertions such as:

Relationship Increased

Notebook Updated

Discovery Completed

Reflection Generated

Notification Queued

Conversation Continued

Assertions should validate behavior instead of implementation details.

---

# Test Data

Tests should never modify shared environments.

Every test should use:

- Temporary Runtime
- Temporary Database
- Temporary Snapshot

After execution,

all temporary data should be discarded.

---

# Test Reports

Every execution should generate:

Summary

Passed

Failed

Warnings

Performance

Runtime Log

Experience Notes

Reports should remain easy to compare across builds.

---

# Continuous Validation

Whenever possible,

the Test Suite should execute automatically after:

- Feature Merge
- Runtime Changes
- AI Integration Updates
- Major Refactoring

Developers should detect regressions early.

---

# Failure Recovery

If a test fails,

CVK should preserve:

- Runtime Snapshot
- Event History
- Debug Overlay State
- Inspector State
- Logs

Developers should reproduce failures immediately.

---

# Experience Assertions

Traditional assertions verify values.

Companion assertions verify experiences.

Examples

Instead of:

Notification Count == 1

Verify:

The Companion waits until the Meeting ends before presenting the Discovery Card.

Instead of:

Relationship == 80

Verify:

The Companion naturally references previous shared experiences.

Experience Assertions should become first-class validation targets.

---

# Golden Scenarios

CVK should maintain a permanent collection of validation scenarios.

Examples

- First Launch
- First Discovery
- First Week
- Day 30
- One Year
- Return After Vacation
- Heavy Notebook
- Heavy Discovery

Every release must successfully pass all Golden Scenarios before approval.

---

# Regression Snapshot

When a regression is detected,

CVK should automatically save:

- Runtime Snapshot
- Scenario
- Event History
- Runtime Timeline
- Inspector State

Developers should reproduce the issue by loading a single Regression Snapshot.

Regression Snapshots should become part of future regression testing.

---

# Responsibilities

Test Suite owns:

- Automated validation
- Regression testing
- Scenario execution
- Report generation

It does NOT own:

- Runtime implementation
- Business logic
- Manual playtesting
- AI reasoning

---

# Developer Notes

Automated testing should verify correctness.

Manual Playtesting should verify companionship.

Both are required before release.

---

# Acceptance Criteria

A completed Test Suite should:

- Execute every validation scenario automatically.
- Detect regressions reliably.
- Produce reproducible reports.
- Integrate with CVK.
- Reduce manual verification workload.