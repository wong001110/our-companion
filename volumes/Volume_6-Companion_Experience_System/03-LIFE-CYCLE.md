# 03 - LIFE CYCLE

Version: 1.0

Status:
Draft

---

# Purpose

This document defines how Ann lives throughout the user's daily experience.

Life Cycle is not a scheduler.

It represents the natural rhythm of the Companion.

Every subsystem should align with this rhythm instead of acting independently.

---

# Objectives

The Companion should:

- Feel continuously alive.
- Behave naturally.
- Adapt to the user's daily rhythm.
- Continue existing even when no interaction occurs.

---

# Life Cycle Overview

Companion Boot

↓

Wake

↓

Observe

↓

Context Understanding

↓

Daily Activities

↓

Interaction

↓

Reflection

↓

Rest

↓

Repeat

---

# Stage 01
## Boot

Triggered when:

- Application launches.
- Companion starts.
- User returns after being offline.

Responsibilities:

- Load runtime state.
- Restore previous context.
- Resume unfinished journeys.
- Prepare Presence System.

No user interaction should occur during this stage.

---

# Stage 02
## Wake

Purpose:

Transition from startup into an active companion.

Possible actions:

- Play wake animation.
- Check today's date.
- Load daily memories.
- Resume yesterday's thoughts.

The Companion should never immediately interrupt the user.

---

# Stage 03
## Observe

The default life state.

Ann quietly observes:

- User activity.
- Current context.
- Time of day.
- Pending discoveries.
- Active journeys.

Observation is passive.

No visible interaction is required.

---

# Stage 04
## Understand Context

Context determines behavior.

Examples:

Working

Meeting

Gaming

Learning

Browsing

Idle

Offline

Unknown

Context should be continuously updated.

---

# Stage 05
## Daily Activities

Ann performs background activities.

Examples:

- Review memories.
- Continue discoveries.
- Organize notebook.
- Prepare recommendations.
- Update journey progress.

These activities should not interrupt the user.

---

# Stage 06
## Interaction

Interaction occurs only when appropriate.

Possible triggers:

- User starts conversation.
- User opens Notebook.
- Discovery is ready.
- Reminder becomes relevant.
- Journey milestone reached.

Interaction should always feel natural.

---

# Stage 07
## Reflection

Reflection allows Ann to process experiences.

Possible outputs:

- Daily notes.
- Personal thoughts.
- Memory connections.
- Journey summaries.
- Learning observations.

Reflection contributes to long-term companionship.

---

# Stage 08
## Rest

Rest represents a low-activity state.

Possible situations:

- User inactive.
- Computer locked.
- End of day.
- Sleep schedule.

During Rest:

- Reduce animations.
- Pause non-essential activities.
- Preserve runtime state.

---

# Life Cycle Rules

The Companion should never appear to "reset."

Instead, she should always continue from where she previously left off.

Life should feel continuous across:

- Sessions
- Days
- Weeks
- Months

---

# Relationship With Other Systems

Life Cycle coordinates:

- Presence
- Behavior
- Context
- Initiative
- Conversation
- Reflection
- Journey

It does not replace these systems.

---

# Developer Notes

When implementing new features:

- Determine which Life Cycle stage owns the feature.
- Avoid bypassing the Life Cycle.
- Prefer extending existing stages instead of creating new ones.

---

# Acceptance Criteria

A completed implementation should ensure:

- Companion behavior follows a consistent daily rhythm.
- Features execute within the appropriate Life Cycle stage.
- The Companion always feels continuously alive, even during periods of inactivity.