# 04 - CONTEXT

Version: 1.0

Status:
Draft

---

# Purpose

Context represents Ann's current understanding of the user's situation.

It is the foundation of Companion decision making.

Behavior should never be selected directly.

Behavior should always be selected from Context.

---

# Objectives

Context should allow Ann to answer:

- What is the user doing?
- Is now a good time?
- Should I speak?
- Should I wait?
- Should I observe?
- Should I recommend something?

---

# Context Architecture

Environment

↓

Signals

↓

Context

↓

Behavior

↓

Action

↓

UI / Animation

---

# Context Sources

Context may be derived from multiple systems.

Examples:

- Desktop Activity
- Active Window
- Running Task
- Time
- Calendar
- Journey
- Conversation
- Memory
- Discovery
- User Interaction

No single source should determine Context alone.

---

# Context Categories

## Working

Examples

- Coding
- Writing
- Designing
- Editing

Behavior

- Stay Quiet
- Observe
- Delay Initiative

---

## Learning

Examples

- Reading
- Watching Tutorials
- Research

Behavior

- Allow lightweight recommendations
- Save discoveries
- Avoid interruption

---

## Relaxing

Examples

- Browsing
- Watching Videos
- Listening Music

Behavior

- More relaxed interaction
- Discovery sharing allowed
- Casual conversation permitted

---

## Gaming

Examples

- Fullscreen Games
- Controller Activity

Behavior

- Silent Presence
- Disable unnecessary notifications
- Queue discoveries for later

---

## Meeting

Examples

- Video Conference
- Presentation
- Screen Sharing

Behavior

- Silent Mode
- Suspend initiative
- Continue background activities only

---

## Away

Examples

- No keyboard activity
- Device idle

Behavior

- Slow animations
- Continue reflection
- Organize notebook
- Continue discovery tasks

---

## Sleeping

Examples

- Night schedule
- Computer sleep

Behavior

- Persist state
- Pause runtime
- Resume naturally next session

---

# Context Priority

If multiple contexts exist simultaneously,
the highest priority should be selected.

Priority Example

Meeting

↓

Working

↓

Learning

↓

Gaming

↓

Relaxing

↓

Idle

Priority rules may evolve in future versions.

---

# Context Transition

Context should change smoothly.

Avoid rapid switching.

Example

Working

↓

Idle (10 seconds)

↓

Working

Should remain:

Working

Instead of repeatedly changing state.

Use stabilization before transition.

---

# Unknown Context

Unknown is valid.

If confidence is low:

- Observe
- Wait
- Collect more signals

Never guess aggressively.

---

# Context Lifetime

Each context has:

- Start Time
- Last Updated
- Confidence
- Expiration

Expired contexts should be removed naturally.

---

# Relationship With Other Modules

Context provides input to:

- Behavior
- Initiative
- Presence
- Conversation
- Notification
- Journey

Context never directly controls UI.

---

# Developer Notes

When introducing new features:

Do not create feature-specific contexts.

Instead:

- Extend existing contexts.
- Improve context confidence.
- Reuse current behavior rules.

Context should remain generic and reusable.

---

# Acceptance Criteria

A completed Context System should:

- Correctly identify the user's general situation.
- Prevent inappropriate interruptions.
- Provide stable input for Behavior selection.
- Remain extensible for future Context types.