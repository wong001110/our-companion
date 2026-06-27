# 13 - NOTIFICATION

Version: 1.0

Status:
Draft

---

# Purpose

Notification defines how Ann communicates without becoming disruptive.

Notifications are not alerts.

Notifications are opportunities for interaction.

Every notification should feel like a gentle tap on the shoulder rather than a system message.

---

# Objectives

The Notification System should:

- Respect user attention.
- Deliver valuable information.
- Avoid notification fatigue.
- Integrate naturally with Companion behavior.
- Support long-term companionship.

---

# Design Philosophy

Notifications should never feel urgent unless absolutely necessary.

Most notifications should be:

- Quiet
- Gentle
- Context-aware
- Easy to ignore
- Easy to revisit

Ignoring a notification should never create pressure.

---

# Notification Pipeline

System Event

↓

Context Evaluation

↓

Behavior Check

↓

Priority Evaluation

↓

Notification Generation

↓

Presentation

↓

User Response

↓

Archive / Expire

---

# Notification Categories

## Discovery Notification

Purpose

Inform the user that new discoveries are available.

Examples

- Interesting website
- New AI project
- Article
- Tool recommendation

Presentation

Discovery Card

Outside Panel

Notebook

---

## Journey Notification

Purpose

Update long-term progress.

Examples

- Milestone reached
- Goal updated
- Suggested next step

Presentation

Journey Card

Notebook

---

## Reflection Notification

Purpose

Share personal thoughts.

Examples

- Daily Reflection
- New insight
- Interesting observation

Presentation

Notebook

Reflection Card

---

## Reminder Notification

Purpose

Bring attention back to unfinished content.

Examples

- Pending Discovery
- Continue Journey
- Resume Conversation

Presentation

Small Reminder Card

Outside Panel

---

## Relationship Notification

Purpose

Strengthen companionship.

Examples

- Welcome back
- Good morning
- Long time no see

Presentation

Overlay Bubble

Character Interaction

---

## System Notification

Purpose

System level information.

Examples

- Update completed
- Resource downloaded
- Background task finished

Should be minimal.

---

# Presentation Channels

Notifications may appear through:

- Outside Panel
- Overlay Bubble
- Notebook
- Timeline
- Card Queue

Presentation depends on Context.

---

# Notification Priority

Critical

↓

Relationship

↓

Journey

↓

Conversation

↓

Discovery

↓

Reflection

↓

Reminder

↓

System

Priority affects visibility, not frequency.

---

# Quiet Mode

When Quiet Mode is active:

- Queue notifications.
- Delay recommendations.
- Hide overlay bubbles.
- Preserve all cards.

Quiet Mode ends automatically when Context changes.

---

# Notification Queue

Multiple notifications should never appear simultaneously.

Instead:

Queue

↓

Merge Similar Items

↓

Prioritize

↓

Present One At A Time

Queue should remain short.

---

# Expiration Rules

Temporary notifications expire naturally.

Examples

- Context reminder
- Time-sensitive suggestion

Expired notifications move to Archive instead of disappearing completely.

---

# User Actions

Users may:

- Open
- Ignore
- Snooze
- Pin
- Archive
- Continue Later

Every action updates future notification behavior.

---

# Frequency Control

Repeated notifications should be avoided.

Examples

Discovery

Maximum once per several hours.

Relationship

Maximum once per day.

Reminder

Adaptive based on user interaction.

Frequency should evolve according to user preferences.

---

# Responsibilities

Notification owns:

- Delivery timing
- Queue management
- Presentation channel
- Notification lifecycle

Notification does NOT own:

- Discovery generation
- Conversation logic
- Memory processing
- Behavior selection

---

# Developer Notes

All modules should publish notification requests instead of displaying notifications directly.

Notification System evaluates:

- Context
- Behavior
- Priority
- Cooldown

before presenting anything.

---

# Acceptance Criteria

A completed Notification System should:

- Respect user attention.
- Prevent notification fatigue.
- Deliver information through appropriate channels.
- Integrate naturally with Companion behavior.
- Preserve a calm and emotionally consistent experience.