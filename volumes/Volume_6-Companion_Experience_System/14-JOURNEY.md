# 14 - JOURNEY

Version: 1.0

Status:
Draft

---

# Purpose

Journey defines the long-term companionship between Ann and the user.

Unlike Tasks, a Journey has no fixed deadline.

A Journey represents an ongoing story shared between Ann and the user.

Its purpose is to encourage exploration, growth and continuity rather than task completion.

---

# Objectives

The Journey System should:

- Support long-term companionship.
- Organize personal explorations.
- Record meaningful milestones.
- Encourage continuous progress.
- Preserve shared history.

---

# Design Philosophy

A Journey is not a project management tool.

A Journey is a chapter in the user's life.

Ann accompanies the user throughout the Journey.

She observes, supports and records experiences instead of managing deadlines.

---

# Journey Lifecycle

Created

↓

Active

↓

Paused

↓

Resumed

↓

Completed

↓

Archived

Journeys may remain active for:

- Days
- Weeks
- Months
- Years

---

# Journey Types

## Exploration Journey

Examples

- Learning AI
- Studying Japanese
- Building a product
- Researching a topic

---

## Creative Journey

Examples

- Writing
- Drawing
- Music
- Game Development

---

## Personal Journey

Examples

- Daily Habit
- Reading
- Fitness
- Reflection

---

## Companion Journey

Examples

- First Month Together
- Shared Memories
- Anniversary
- Relationship Growth

---

# Journey Components

Every Journey contains:

- Title
- Description
- Current Goal
- Status
- Timeline
- Milestones
- Related Cards
- Related Memories
- Reflection
- Progress Summary

---

# Milestones

Milestones represent meaningful events.

Examples

- First Prototype
- First Discovery
- Feature Completed
- One Month Progress

Milestones should celebrate progress without creating pressure.

---

# Timeline

Journey maintains a chronological timeline.

Examples

Journey Created

↓

First Conversation

↓

Important Discovery

↓

Milestone

↓

Reflection

↓

Completion

Timeline should remain readable after months or years.

---

# Relationship With Other Systems

Journey connects with:

- Discovery
- Reflection
- Memory
- Conversation
- Notebook
- Cards

Journey acts as a central timeline rather than owning these systems.

---

# Journey Cards

Journey may generate:

- Progress Card
- Milestone Card
- Reflection Card
- Reminder Card
- Suggestion Card

Cards should summarize the current state instead of displaying every event.

---

# Progress

Progress is qualitative.

Examples

- Just Started
- Exploring
- Building Momentum
- Deep Exploration
- Mature
- Completed

Avoid percentage-based progress unless explicitly required.

---

# Pause & Resume

Journeys may pause naturally.

Examples

- User becomes busy.
- Interest changes.
- New priorities appear.

Ann should remember paused Journeys and gently reintroduce them when appropriate.

---

# Completion

Completion does not end the Journey.

Instead:

Journey

↓

Reflection

↓

Archive

↓

Future Reference

Completed Journeys continue contributing to future conversations and memories.

---

# Responsibilities

Journey owns:

- Journey lifecycle
- Timeline
- Milestones
- Progress summaries
- Cross-module references

Journey does NOT own:

- Task execution
- Discovery implementation
- Memory storage
- Conversation runtime

---

# Developer Notes

Journeys should be lightweight.

Do not model them as task managers.

Always prioritize narrative continuity over productivity metrics.

---

# Acceptance Criteria

A completed Journey System should:

- Support long-term companion experiences.
- Preserve meaningful history.
- Encourage continuous exploration.
- Integrate naturally with Notebook, Reflection and Memory.
- Make users feel that Ann has been accompanying them throughout the journey.