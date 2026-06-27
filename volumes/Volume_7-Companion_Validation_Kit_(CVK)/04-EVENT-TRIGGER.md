# 04 - EVENT TRIGGER

Version: 1.0

Status:
Draft

---

# Purpose

The Event Trigger System allows developers to manually invoke Companion events without waiting for natural execution.

It is designed to accelerate validation, debugging and experience verification.

An Event Trigger should reproduce the same behavior as a naturally occurring event.

No special developer-only logic should exist after an event is triggered.

---

# Objectives

The Event Trigger System should:

- Execute Companion events immediately.
- Preserve normal runtime behavior.
- Support repeatable validation.
- Reduce manual setup.
- Enable isolated feature testing.

---

# Design Philosophy

Events should remain the primary communication mechanism inside Our Companion.

CVK should trigger events.

It should never bypass them.

Correct

Developer

↓

Trigger Event

↓

Runtime

↓

Behavior

↓

Result

Incorrect

Developer

↓

Directly Modify UI

↓

Skip Runtime

↓

Invalid Test

---

# Event Categories

## Runtime Events

Examples

- Application Boot
- Wake
- Sleep
- Resume
- Shutdown
- Runtime Tick

Purpose

Validate runtime transitions.

---

## Presence Events

Examples

- Enter Idle
- Start Thinking
- Return From Task
- Begin Conversation
- End Conversation

Purpose

Validate Presence System.

---

## Discovery Events

Examples

- Discovery Started
- Discovery Completed
- Discovery Failed
- Discovery Cancelled
- Duplicate Discovery
- Discovery Timeout

Purpose

Validate Discovery experience.

---

## Notebook Events

Examples

- New Reflection
- Daily Summary
- Weekly Summary
- New Note
- Archive Entry

Purpose

Validate Notebook updates.

---

## Journey Events

Examples

- Journey Created
- Milestone Reached
- Journey Paused
- Journey Resumed
- Journey Completed

Purpose

Validate Journey progression.

---

## Relationship Events

Examples

- First Meeting
- Trust Increased
- Anniversary
- Long Absence
- Shared Milestone

Purpose

Validate Companion relationship changes.

---

## Memory Events

Examples

- Memory Added
- Memory Updated
- Memory Forgotten
- Memory Conflict
- Memory Consolidation

Purpose

Validate Memory System.

---

## Notification Events

Examples

- Card Generated
- Reminder Created
- Notification Queued
- Notification Expired

Purpose

Validate Notification flow.

---

## Conversation Events

Examples

- Conversation Started
- Conversation Continued
- Topic Changed
- Conversation Ended

Purpose

Validate Conversation Runtime.

---

# Trigger Execution

Every trigger should follow:

Developer

↓

Event Request

↓

Runtime Validation

↓

Event Bus

↓

Affected Modules

↓

UI Update

↓

Debug Log

No module should receive direct manipulation.

---

# Trigger Configuration

Every trigger should support:

- Execute Once
- Repeat
- Delay
- Schedule
- Chain

Example

Discovery Completed

↓

Generate Reflection

↓

Generate Card

↓

Queue Notification

↓

Return To Idle

---

# Event Chains

Multiple events may execute together.

Example

Morning Simulation

↓

Wake

↓

Morning Greeting

↓

Generate Reflection

↓

Discovery Starts

↓

Idle

Chains should remain configurable.

---

# Trigger History

CVK should record:

- Trigger Name
- Time
- Parameters
- Runtime Result
- Success / Failure

Developers should be able to replay previous triggers.

---

---

# Macro

Macros represent reusable event sequences.

Unlike individual Event Triggers,

a Macro reproduces an entire Companion experience.

Example:

Morning Routine

↓

Wake

↓

Generate Reflection

↓

Check Discovery

↓

Start Discovery

↓

Return Idle

---

# Macro Library

CVK should include reusable Macros.

Examples

- Morning Routine
- End Of Day
- Return After Vacation
- Discovery Finished
- Journey Milestone
- Weekly Review

Developers may create custom Macros.

---

# Macro Sharing

Macros should be exportable.

Teams should reuse common validation flows instead of manually triggering events.

---

# Safety Rules

Trigger execution must:

- Respect runtime validation.
- Produce structured logs.
- Avoid corrupting data.
- Support rollback where possible.

Production builds must disable manual triggering.

---

# Responsibilities

Event Trigger owns:

- Manual event execution
- Trigger configuration
- Event history
- Event chaining

It does NOT own:

- Event implementation
- Runtime logic
- Business rules
- Companion decisions

---

# Developer Notes

Whenever a new runtime event is introduced,

it should automatically become triggerable inside CVK.

Developers should never create events that cannot be manually reproduced.

---

# Acceptance Criteria

A completed Event Trigger System should:

- Execute every major Companion event.
- Preserve authentic runtime behavior.
- Support repeatable debugging.
- Enable event chaining.
- Provide complete execution history.