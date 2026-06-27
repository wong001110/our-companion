# 07 - DEBUG OVERLAY

Version: 1.0

Status:
Draft

---

# Purpose

Debug Overlay provides real-time visibility into the internal state of the Companion.

Unlike traditional logging systems,

Debug Overlay allows developers to observe Companion behavior while interacting with the application.

It should become the primary runtime debugging interface.

---

# Objectives

Debug Overlay should allow developers to:

- Observe runtime state.
- Inspect Companion decisions.
- Monitor internal systems.
- Identify unexpected behavior.
- Verify runtime synchronization.

---

# Design Philosophy

The Overlay should explain:

"What is Ann doing?"

More importantly,

"Why is Ann doing it?"

The Overlay should expose reasoning inputs rather than only final outputs.

---

# Overlay Principles

The Overlay should be:

- Real-time
- Lightweight
- Dockable
- Searchable
- Customizable
- Non-intrusive

It must never interfere with Companion interaction.

---

# Overlay Sections

## Runtime

Display

- Runtime State
- Runtime Tick
- Runtime Mode
- Scheduler Status
- Current FPS

---

## Context

Display

- Current Context
- Confidence
- Active Context Sources
- Override Status
- Last Context Change

---

## Behavior

Display

- Current Behavior
- Previous Behavior
- Behavior Confidence
- Trigger Source
- Cooldown Status

---

## Attention

Display

- Primary Attention
- Secondary Attention
- Attention Priority
- Attention History

---

## Initiative

Display

- Current Initiative
- Cooldown
- Waiting Reason
- Next Opportunity

---

## Presence

Display

- Presence Mode
- Animation
- Visibility
- Current Expression

---

## Conversation

Display

- Conversation State
- Current Topic
- Session Duration
- Pending Response

---

## Discovery

Display

- Current Discovery
- Discovery Queue
- Search Status
- Completion Progress

---

## Journey

Display

- Active Journey
- Current Milestone
- Journey Stage

---

## Relationship

Display

- Relationship Stage
- Trust
- Shared Experiences
- Last Relationship Event

---

## Notebook

Display

- Pending Pages
- Reflection Queue
- Recent Updates

---

## Memory

Display

- Working Memory
- Long-term Memory
- Memory Queue
- Last Memory Update

---

## Notification

Display

- Active Notifications
- Notification Queue
- Pending Cards

---

# Timeline View

Overlay should support a timeline.

Example

09:00

↓

Wake

↓

Context Changed

↓

Discovery Started

↓

Reflection Generated

↓

Idle

Developers should review execution history visually.

---

# Event Stream

Real-time event stream.

Examples

10:12:05

Behavior Changed

10:12:08

Discovery Started

10:12:12

Memory Updated

10:12:20

Notebook Generated

Filtering should be supported.

---

# Search

Developers should search:

- Runtime Events
- Memory
- Discovery
- Journey
- Notifications
- Context Changes

---

# Pinning

Important values may be pinned.

Examples

Current Behavior

Relationship

Journey

Runtime Tick

Pinned values remain visible.

---

---

# Decision Trace

Developers should inspect why a decision was made.

Instead of only displaying:

Behavior

↓

Working

CVK should expose:

Context

↓

Working (95%)

↓

Meeting (3%)

↓

Away (2%)

↓

Behavior Selected

↓

Working

Every runtime decision should provide:

- Inputs
- Candidate Results
- Final Selection
- Rejected Candidates
- Selection Reason

Decision Trace should be available throughout the Companion Runtime.

---

# Runtime Health

Overlay should continuously monitor:

- Runtime Errors
- Queue Backlog
- Memory Usage
- CPU Usage
- Event Rate
- AI Response Time

Health indicators should immediately highlight abnormal runtime conditions.

---

# Layout

Overlay should support:

- Floating Window
- Docked Panel
- Sidebar
- Compact Mode
- Full Debug View

Developers should configure layouts freely.

---

# Responsibilities

Debug Overlay owns:

- Runtime visualization
- Event visualization
- State visualization
- Debug metrics

It does NOT own:

- Runtime execution
- Business logic
- AI reasoning
- Data manipulation

---

# Developer Notes

Every new Companion module should expose debug information.

If developers cannot observe a module,

the module is considered difficult to validate.

Visibility is part of maintainability.

---

# Acceptance Criteria

A completed Debug Overlay should:

- Display every major Companion subsystem.
- Update in real time.
- Explain Companion behavior.
- Improve debugging efficiency.
- Become the primary runtime inspection interface.