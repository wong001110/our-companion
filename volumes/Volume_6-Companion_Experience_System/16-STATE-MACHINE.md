# 16 - STATE MACHINE

Version: 1.0

Status:
Draft

---

# Purpose

The State Machine defines the runtime execution model of the Companion.

It provides a unified state management system for all Companion behaviors.

Every visible Companion action should be represented by a runtime state.

The State Machine should remain independent from AI reasoning.

---

# Objectives

The State Machine should:

- Coordinate Companion behavior.
- Prevent conflicting states.
- Support smooth transitions.
- Keep animation synchronized.
- Remain extensible.

---

# Runtime Pipeline

Context

↓

Behavior

↓

State Selection

↓

Animation

↓

UI

↓

Interaction

↓

Next State

---

# Runtime States

## Boot

Application initialization.

Responsibilities

- Load runtime
- Restore session
- Initialize systems

Next

Wake

---

## Wake

Ann starts a new session.

Examples

- Wake animation
- Resume notebook
- Restore context

Next

Observe

---

## Observe

Default runtime state.

Responsibilities

- Monitor environment
- Update context
- Wait for events

Possible Transitions

Thinking

Conversation

Working

Idle

---

## Idle

Ann is simply existing.

Examples

- Breathing
- Looking around
- Small movements
- Reading notebook

Possible Transitions

Observe

Conversation

Working

Sleep

---

## Thinking

Internal processing.

Examples

- Reflection
- Planning
- Context analysis

UI

Thinking animation only.

---

## Working

Background execution.

Examples

- Discovery
- Notebook organization
- Memory indexing
- Journey update

Working should remain mostly invisible.

---

## Conversation

User interaction state.

Responsibilities

- Listen
- Respond
- Continue topic

Exit Conditions

Conversation finished

↓

Observe

---

## Returning

Background task completed.

Examples

- Discovery finished
- Reflection completed
- Journey updated

Purpose

Reconnect with the user naturally.

---

## Notification

Temporary presentation state.

Examples

- Discovery card
- Reminder
- Journey update

Notification should automatically return to Observe or Idle.

---

## Sleep

Low activity mode.

Examples

- Night
- Away
- System sleep

Responsibilities

- Pause non-essential tasks
- Save runtime state
- Minimize resource usage

Resume

Wake

---

# State Transition Rules

Transitions should be smooth.

Avoid:

Idle

↓

Thinking

↓

Idle

↓

Thinking

↓

Idle

within a short period.

Always stabilize before switching.

---

# Transition Priority

Emergency

↓

Conversation

↓

Returning

↓

Notification

↓

Working

↓

Thinking

↓

Observe

↓

Idle

↓

Sleep

Higher priority states interrupt lower priority states.

---

# Interrupt Rules

Conversation

may interrupt

Observe

Idle

Thinking

---

Emergency

may interrupt

all states.

---

Sleep

cannot interrupt

Conversation

unless explicitly requested.

---

# Recovery Rules

After interruption:

Return to previous state whenever possible.

Example

Observe

↓

Working

↓

Conversation

↓

Working

↓

Observe

State history should be preserved.

---

# State Ownership

State Machine owns:

- Runtime state
- State transitions
- Transition validation
- Interrupt handling
- Recovery flow

State Machine does NOT own:

- AI reasoning
- Behavior selection
- Context detection
- Memory generation
- Discovery execution

---

# Animation Mapping

Each runtime state maps to animation sets.

Examples

Idle

↓

Idle Animation

Thinking

↓

Thinking Animation

Working

↓

Working Animation

Conversation

↓

Talking Animation

Returning

↓

Return Animation

Sleep

↓

Sleep Animation

Animation assets remain independent from runtime logic.

---

# Event Mapping

Examples

Application Started

↓

Boot

↓

Wake

↓

Observe

---

Discovery Finished

↓

Returning

↓

Notification

↓

Observe

---

User Click

↓

Conversation

↓

Observe

---

Night

↓

Sleep

↓

Wake

↓

Observe

---

# Future Expansion

Future runtime states may include:

- Reading
- Drawing
- Listening
- Eating
- Walking
- Exploring
- Celebrating

New states should integrate with existing transition rules.

---

# Developer Notes

Never transition directly from UI.

Always request a runtime state change through the State Machine.

The State Machine remains the single source of truth for Companion runtime behavior.

---

# Acceptance Criteria

A completed State Machine should:

- Coordinate every Companion runtime state.
- Prevent invalid transitions.
- Synchronize animation and runtime.
- Support interruption and recovery.
- Remain scalable for future Companion behaviors.