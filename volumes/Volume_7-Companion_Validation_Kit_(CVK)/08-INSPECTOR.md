# 08 - INSPECTOR

Version: 1.0

Status:
Draft

---

# Purpose

The Inspector provides complete visibility into the current internal state of the Companion.

Unlike Debug Overlay, which focuses on runtime monitoring,

Inspector focuses on understanding the Companion itself.

Its objective is to answer one question:

"What is Ann thinking right now?"

---

# Objectives

Inspector should allow developers to:

- Inspect Companion reasoning.
- Understand current priorities.
- View active memories.
- Inspect runtime objects.
- Verify Companion decisions.
- Diagnose unexpected behavior.

---

# Design Philosophy

The Companion should never become a black box during development.

Every meaningful decision should be inspectable.

Developers should understand:

Current World

↓

Current Thoughts

↓

Current Decision

↓

Current Action

---

# Inspector Architecture

Inspector

↓

Runtime Snapshot

↓

Companion Object

↓

Subsystem Inspectors

↓

Detailed Views

---

# Companion Overview

Display:

- Current Name
- Runtime State
- Presence State
- Current Context
- Current Behavior
- Current Emotion
- Relationship Stage
- Active Journey

This page provides an overview of the current Companion.

---

# Context Inspector

Display:

Current Context

Context Candidates

Context Confidence

Context History

Context Override

Current Environment

Developers should understand why a Context was selected.

---

# Behavior Inspector

Display:

Current Behavior

Candidate Behaviors

Selection Priority

Behavior Cooldown

Previous Behavior

Behavior History

---

# Thought Inspector

Display:

Current Objective

Current Plan

Current Focus

Current Curiosity

Current Reflection

Current Internal Notes

This section should represent the Companion's current internal state.

---

# Memory Inspector

Display:

Working Memory

Short-term Memory

Long-term Memory

Retrieved Memories

Memory Importance

Memory Sources

Developers should inspect why specific memories were recalled.

---

# Journey Inspector

Display:

Current Journey

Journey Stage

Current Milestone

Pending Milestones

Journey Progress

Related Memories

---

# Discovery Inspector

Display:

Current Discovery Task

Discovery Progress

Current Search Target

Pending Discoveries

Discovery History

Discovery Queue

---

# Notebook Inspector

Display:

Pending Reflections

Pending Pages

Current Draft

Notebook Queue

Recent Entries

---

# Conversation Inspector

Display:

Conversation State

Current Topic

Conversation Goals

Referenced Memories

Pending Response

Conversation History

---

# Relationship Inspector

Display:

Relationship Stage

Trust

Shared Experiences

Recent Growth

Relationship Timeline

---

# Notification Inspector

Display:

Pending Notifications

Card Queue

Suppressed Notifications

Cooldown

Delivery Strategy

---

# Runtime Object Inspector

Developers may inspect:

- Runtime Objects
- Queues
- Events
- Timers
- Schedulers
- Active Tasks

Each object should expose its current state.

---

# Object Navigation

Inspector should support navigation between related objects.

Example

Discovery

↓

Generated Reflection

↓

Notebook Entry

↓

Memory

↓

Conversation

Developers should follow runtime relationships naturally.

---

# Reasoning Timeline

Inspector should preserve recent decision history.

Example

09:00

↓

Context

Working

↓

Behavior

Thinking

↓

Memory Retrieved

Project Alpha

↓

Discovery Suggested

AI Article

↓

Notification Delayed

Meeting Detected

↓

Return To Idle

Developers should replay the reasoning path instead of inspecting only the current state.

---

# Live Updates

Inspector should update automatically.

Developers should not manually refresh data.

Changes should appear immediately.

---

# Freeze View

Developers may freeze Inspector.

Runtime continues.

Inspector remains unchanged.

Useful for comparing runtime changes.

---

# Responsibilities

Inspector owns:

- Runtime inspection
- Object inspection
- Companion inspection
- Runtime navigation

Inspector does NOT own:

- Runtime execution
- Data modification
- Business logic
- AI reasoning

---

# Developer Notes

Every major Companion object should expose an Inspector interface.

Objects that cannot be inspected are difficult to validate and debug.

Inspection should become part of module development.

---

# Acceptance Criteria

A completed Inspector should:

- Expose every major Companion subsystem.
- Explain Companion decisions.
- Navigate runtime relationships.
- Support live updates.
- Eliminate black-box debugging.