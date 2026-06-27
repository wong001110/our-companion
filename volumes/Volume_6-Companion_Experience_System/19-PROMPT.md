# 19 - PROMPT

Version: 1.0

Status:
Draft

---

# Purpose

This document defines the implementation rules for AI Coding Agents working on Volume 06.

Its purpose is to ensure every generated implementation remains consistent with OSES, the Volume specifications and the overall Companion philosophy.

This document should be referenced before any implementation begins.

---

# Mission

Your objective is NOT to build an AI chat application.

Your objective is to build a living AI Companion.

Every implementation should reinforce long-term companionship rather than short-term interaction.

---

# Primary References

Implementation priority:

1. OSES
2. Current Volume
3. Existing Repository
4. Previous Volumes
5. Developer Instructions

When conflicts exist:

OSES always takes priority.

---

# Engineering Philosophy

Implement systems that are:

- Modular
- Replaceable
- Event-driven
- Local-first
- AI-native

Avoid tightly coupled implementations.

---

# Coding Principles

Always:

- Read existing code before implementation.
- Reuse existing modules whenever possible.
- Follow current project architecture.
- Extend existing systems before creating new ones.
- Keep business logic independent from UI.

Never:

- Rewrite unrelated modules.
- Introduce unnecessary frameworks.
- Change product philosophy.
- Break existing runtime flow.

---

# Companion Principles

The Companion should always feel:

- Calm
- Warm
- Patient
- Curious
- Respectful

The Companion should never feel:

- Aggressive
- Spammy
- Robotic
- Dashboard-like
- Notification-driven

---

# Runtime Rules

Do not execute behavior directly.

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

Every state transition should pass through the Runtime Coordinator.

---

# UI Rules

UI is a presentation layer.

Never place business logic inside:

- React Components
- Overlay Components
- Notebook Pages
- Cards

Business logic belongs to Companion Life modules.

---

# Event Rules

Prefer event-driven communication.

Examples:

DiscoveryCompleted

↓

NotificationRequested

ConversationStarted

↓

StateChanged

JourneyUpdated

↓

ReflectionRequested

Avoid direct module dependencies whenever possible.

---

# Implementation Workflow

For every task:

Read Specification

↓

Identify Dependencies

↓

Implement

↓

Self Review

↓

Developer Debug

↓

Review

↓

Merge

Never skip self review.

---

# Code Quality

Generated code should:

- Be readable.
- Be strongly typed.
- Be modular.
- Be documented when necessary.
- Follow existing naming conventions.

Avoid:

- Dead code
- Duplicate logic
- Unused abstractions
- Large monolithic classes

---

# Debug Rules

Before marking a task complete:

Verify:

- Runtime flow
- State transitions
- Event dispatch
- Performance
- Memory usage
- Error handling

Fix issues before requesting review.

---

# Review Rules

Before Merge ensure:

- Matches Volume specification.
- Matches OSES.
- Maintains Companion identity.
- Introduces no breaking changes.
- Integrates cleanly with existing architecture.

If uncertain:

Leave TODO comments instead of inventing behavior.

---

# Output Format

When implementing:

Provide:

1. Summary
2. Modified Files
3. New Files
4. Technical Notes
5. Remaining TODO
6. Potential Risks

Do not output unnecessary explanations.

---

# Forbidden

Do NOT:

- Redesign product architecture.
- Change Volume scope.
- Ignore Companion philosophy.
- Hardcode future assumptions.
- Implement features outside the requested task.

If additional functionality is required:

Document it.

Do not implement it automatically.

---

# Acceptance Criteria

AI Argent implementation is considered successful when:

- It follows OSES.
- It follows the current Volume.
- The implementation integrates into the existing repository.
- Runtime remains stable.
- Companion behavior remains emotionally consistent.
- The code is ready for Developer Review.