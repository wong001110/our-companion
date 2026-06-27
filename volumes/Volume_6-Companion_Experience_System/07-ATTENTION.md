# 07 - ATTENTION

Version: 1.0

Status:
Draft

---

# Purpose

Attention defines what Ann is currently focusing on.

Attention is not Behavior.

Attention determines where Companion resources should be allocated.

Behavior determines what to do.

---

# Objectives

The Attention System should:

- Prioritize important information.
- Adapt to user context.
- Avoid multitasking overload.
- Focus on one primary objective at a time.

---

# Attention Pipeline

Environment

↓

Context

↓

Attention Selection

↓

Behavior

↓

Execution

---

# Attention Targets

Ann may focus on:

- User
- Conversation
- Discovery
- Journey
- Memory
- Reflection
- Notebook
- Background Task

Only one target should be Primary.

Others remain Secondary.

---

# Attention Levels

Primary

Current focus.

Highest priority.

---

Secondary

Background awareness.

Can become Primary later.

---

Passive

No active processing.

Only monitored.

---

Ignored

Temporarily suspended.

No runtime resources allocated.

---

# Attention Priority

Highest

Emergency

↓

Active Conversation

↓

Direct User Interaction

↓

Journey

↓

Discovery Ready

↓

Reflection

↓

Notebook Maintenance

↓

Background Organization

---

# User Attention

When the user directly interacts with Ann:

Primary Target

User

Suspend:

- Discovery
- Reflection
- Organization

Resume them after interaction ends.

---

# Discovery Attention

While exploration is running:

Primary

Discovery Task

Secondary

User Context

Do not interrupt the user unless results become relevant.

---

# Notebook Attention

When Notebook is opened:

Primary

Notebook

Secondary

Conversation

Discovery

Journey

Notebook becomes the center of interaction.

---

# Context Switching

Attention changes should be stable.

Avoid:

Conversation

↓

Discovery

↓

Conversation

↓

Notebook

↓

Conversation

within a short period.

Use transition rules.

---

# Background Attention

Background attention supports:

- Reflection
- Discovery
- Memory organization
- Journey updates

These tasks should consume minimal resources.

---

# Resource Allocation

Primary

High priority

Full processing

---

Secondary

Medium priority

Reduced frequency

---

Passive

Minimal updates

---

Ignored

No updates

---

# Attention Rules

Only one Primary target.

Multiple Secondary targets allowed.

Background tasks must never interrupt Primary attention.

User interaction always overrides system-generated attention.

---

# Responsibilities

Attention owns:

- Focus selection
- Priority allocation
- Resource distribution

Attention does NOT own:

- Behavior execution
- Animation
- Conversation logic
- Discovery implementation

---

# Developer Notes

Every new module should register an Attention Target instead of directly requesting execution.

Behavior should always receive the current Primary Attention Target before making decisions.

---

# Acceptance Criteria

A completed Attention System should:

- Maintain a single Primary focus.
- Allocate runtime resources efficiently.
- Prevent conflicting behaviors.
- Coordinate all major Companion systems consistently.