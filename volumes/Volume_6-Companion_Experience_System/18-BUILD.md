# 18 - BUILD

Version: 1.0

Status:
Draft

---

# Purpose

This document defines the recommended implementation roadmap for Volume 06.

Its purpose is to provide AI Argent and developers with a practical development sequence.

Implementation should follow incremental milestones instead of attempting to complete the entire Companion Life System at once.

---

# Build Objectives

The implementation should:

- Follow OSES.
- Follow Volume 06 specifications.
- Produce a working Companion after every milestone.
- Keep the application stable throughout development.

---

# Development Strategy

Every feature should follow:

Specification

↓

Implementation

↓

Developer Debug

↓

Review

↓

Merge

↓

Next Feature

No implementation should skip Review.

---

# Build Phase 1
## Runtime Foundation

Modules

- Runtime Coordinator
- State Machine
- Context
- Behavior

Deliverables

- Basic runtime loop
- State transitions
- Context updates
- Behavior selection

Success Criteria

The Companion can boot, idle and switch between runtime states.

---

# Build Phase 2
## Presence System

Modules

- Presence
- Attention
- Initiative

Deliverables

- Desktop presence
- Basic idle animation
- Context-aware initiative

Success Criteria

Ann feels alive without requiring conversation.

---

# Build Phase 3
## Conversation System

Modules

- Conversation Runtime
- Reflection

Deliverables

- Conversation lifecycle
- Session continuity
- Reflection generation

Success Criteria

Conversations continue naturally across sessions.

---

# Build Phase 4
## Notebook Experience

Modules

- Notebook
- Card System
- Notification

Deliverables

- Notebook navigation
- Card rendering
- Notification queue

Success Criteria

Notebook becomes the primary long-term interaction space.

---

# Build Phase 5
## Journey & Relationship

Modules

- Journey
- Relationship

Deliverables

- Journey timeline
- Milestones
- Relationship progression

Success Criteria

Companionship evolves through long-term interaction.

---

# Module Priority

Priority 1

- Runtime
- Context
- Behavior

Priority 2

- Presence
- Attention
- Initiative

Priority 3

- Conversation
- Reflection

Priority 4

- Notebook
- Cards
- Notification

Priority 5

- Journey
- Relationship

Lower priority modules should never block higher priority implementation.

---

# Coding Standards

Implementation should:

- Follow existing project structure.
- Use modular architecture.
- Prefer composition over inheritance.
- Avoid duplicated business logic.
- Keep runtime deterministic.

---

# Developer Checklist

Before Merge verify:

- Feature matches specification.
- Runtime remains stable.
- No unnecessary coupling.
- Logging added where appropriate.
- Unit tests updated.
- Existing functionality unaffected.

---

# AI Argent Checklist

Before implementing a module:

- Read OSES.
- Read corresponding Volume document.
- Identify dependencies.
- Avoid modifying unrelated modules.
- Follow existing project conventions.

When uncertain:

Do not invent new architecture.

Follow the Volume specification.

---

# Debug Requirements

Developer should verify:

- Runtime transitions
- State synchronization
- Context updates
- Event dispatch
- Memory leaks
- CPU usage
- Rendering performance
- Animation synchronization

Debug before requesting Review.

---

# Review Checklist

Review should confirm:

- Specification compliance
- OSES compliance
- Coding style consistency
- Runtime stability
- UI consistency
- Companion identity preserved

If major inconsistencies exist:

Return to implementation instead of merging.

---

# Merge Criteria

A module may be merged only when:

- Implementation complete
- Debug complete
- Review passed
- No critical runtime issues
- Acceptance criteria satisfied

---

# Acceptance Criteria

Volume 06 Build is considered complete when:

- Every module defined in this Volume has been implemented.
- Runtime remains stable during long sessions.
- Ann behaves consistently across all interaction methods.
- Notebook, Conversation and Presence work together as a unified Companion experience.
- Future Volumes can extend CLS without architectural redesign.