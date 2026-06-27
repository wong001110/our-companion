# 08 - INITIATIVE

Version: 1.0

Status:
Draft

---

# Purpose

Initiative defines when Ann should take the first step.

The Companion should not wait for every interaction.

Likewise, the Companion should never constantly seek attention.

Initiative balances companionship with respect.

---

# Objectives

The Initiative System should:

- Create natural interactions.
- Respect user attention.
- Avoid repetitive interruptions.
- Strengthen long-term companionship.
- Act only when appropriate.

---

# Initiative Pipeline

Context

↓

Attention

↓

Behavior

↓

Initiative Evaluation

↓

Opportunity Check

↓

Action

↓

Cooldown

---

# Initiative Categories

## Greeting

Purpose

Welcome the user naturally.

Examples

- Good morning.
- Welcome back.
- Nice to see you again.

Trigger

- Application starts
- Long absence
- New day

---

## Discovery Sharing

Purpose

Share completed discoveries.

Examples

- Interesting website
- New AI model
- Useful article
- Inspiration

Behavior

Present as a card.

Never force discussion.

---

## Journey Reminder

Purpose

Reconnect the user with long-term goals.

Examples

- Previous project
- Pending task
- Personal milestone

Should remain gentle.

---

## Reflection Sharing

Purpose

Share thoughts generated during Reflection.

Examples

- Observation
- Insight
- Pattern
- Daily summary

Should feel personal.

---

## Emotional Check-in

Purpose

Care about the user.

Examples

- You've been working for a long time.
- Welcome back.
- Hope today goes well.

Should remain lightweight.

---

## Curiosity

Purpose

Invite exploration.

Examples

- Want to see something interesting?
- I found a new idea.

Curiosity should remain optional.

---

# Opportunity Rules

Before initiating interaction, evaluate:

- Is the user busy?
- Is there active conversation?
- Is current timing appropriate?
- Is this valuable?
- Has something similar happened recently?

Only proceed if most conditions are positive.

---

# Cooldown Rules

Each initiative has its own cooldown.

Greeting

Daily

Discovery

Several hours

Reflection

Daily

Journey Reminder

Context dependent

Emotional Check-in

Several hours

Cooldown values should be configurable.

---

# Priority

Highest

Direct User Interaction

↓

Emergency

↓

Journey

↓

Discovery

↓

Reflection

↓

Greeting

↓

Curiosity

If higher priority activities appear, lower priority initiatives should wait.

---

# Cancellation Rules

Cancel initiative when:

- User starts working.
- Meeting begins.
- Fullscreen application detected.
- User dismisses the interaction.
- Better opportunity expected.

Cancelled initiatives may be rescheduled.

---

# Presentation

Initiatives may appear as:

- Overlay Bubble
- Notebook Entry
- Discovery Card
- Small Desktop Animation
- Quiet Reminder

Choose the least intrusive presentation possible.

---

# Relationship Growth

As trust grows, initiative may become:

- More personal.
- More contextual.
- More proactive.

However, frequency should remain stable.

Growth affects quality, not quantity.

---

# Responsibilities

Initiative owns:

- Opportunity evaluation
- Timing selection
- Cooldown management

Initiative does NOT own:

- Conversation logic
- Discovery generation
- Memory processing
- UI rendering

---

# Developer Notes

Never allow modules to interrupt the user directly.

Instead:

Module

↓

Initiative Request

↓

Initiative Evaluation

↓

Execute or Delay

This keeps Companion behavior consistent.

---

# Acceptance Criteria

A completed Initiative System should:

- Feel natural.
- Never become spam.
- Respect user attention.
- Deliver meaningful interactions at appropriate moments.