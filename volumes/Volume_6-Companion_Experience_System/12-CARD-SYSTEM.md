# 12 - CARD SYSTEM

Version: 1.0

Status:
Draft

---

# Purpose

Cards are the primary presentation unit of Our Companion.

Everything Ann wants to share should first become a Card.

Cards provide a consistent, lightweight and discoverable experience across the entire product.

---

# Objectives

The Card System should:

- Standardize content presentation.
- Reduce UI complexity.
- Encourage exploration.
- Support long-term organization.
- Remain reusable across all modules.

---

# Design Philosophy

A Card is an invitation.

It is not a notification.

It is not a popup.

It represents something Ann wishes to share.

The user decides whether to interact.

---

# Card Lifecycle

Generate

↓

Prepare

↓

Present

↓

Interact

↓

Update

↓

Archive

---

# Card Categories

## Discovery Card

Purpose

Present interesting discoveries.

Examples

- Websites
- Articles
- AI Models
- Open Source Projects
- Videos

Actions

- Open
- Discuss
- Save
- Archive

---

## Memory Card

Purpose

Reconnect important memories.

Examples

- Previous conversation
- Shared experience
- Important milestone

Actions

- Review
- Continue Conversation
- Pin

---

## Reflection Card

Purpose

Share Ann's thoughts.

Examples

- Daily reflection
- Observation
- Insight
- Pattern

Actions

- Read
- Discuss
- Archive

---

## Journey Card

Purpose

Track long-term progress.

Examples

- Goal update
- Milestone
- New direction

Actions

- Continue
- Review
- Complete

---

## Conversation Card

Purpose

Resume previous discussions.

Examples

- Unfinished topic
- Follow-up question
- Suggested continuation

Actions

- Resume
- Ignore
- Archive

---

## Reminder Card

Purpose

Provide gentle reminders.

Examples

- Discovery waiting
- Pending journey
- Scheduled review

Reminders should never become repetitive.

---

## System Card

Purpose

Represent Companion events.

Examples

- Welcome back
- New version
- Feature introduction

System Cards should be rare.

---

# Card Components

Every Card may contain:

- Header
- Title
- Summary
- Illustration
- Metadata
- Action Buttons
- Tags
- Timestamp

Optional:

- Character Comment
- Related Cards
- Progress

---

# Card States

Generated

Prepared

Visible

Pinned

Completed

Archived

Expired

Cards transition naturally between states.

---

# Card Priority

Critical

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

Archive

Priority affects presentation order only.

---

# Card Placement

Cards may appear in:

- Outside Panel
- Notebook
- Timeline
- Journey
- Collections
- Search Results

The same Card may appear in multiple locations without duplication.

---

# Card Interaction

Possible actions include:

- Open
- Discuss
- Pin
- Save
- Archive
- Dismiss
- Share
- Continue

Interaction should require minimal effort.

---

# Card Expiration

Some Cards expire naturally.

Examples

- Temporary recommendations
- Context-sensitive reminders

Expired Cards should move to Archive instead of being deleted.

---

# Card Relationship

Cards may reference:

- Notebook Pages
- Discoveries
- Memories
- Conversations
- Journeys
- Other Cards

Cards should form a connected network instead of isolated items.

---

# Responsibilities

Card System owns:

- Card structure
- Rendering model
- State transitions
- Reusable interaction patterns

Card System does NOT own:

- Discovery generation
- Memory processing
- Reflection generation
- Conversation logic

---

# Developer Notes

Every new feature that presents information should reuse the Card System whenever possible.

Avoid creating custom presentation components unless there is a clear UX requirement.

Cards should remain lightweight, reusable and visually consistent.

---

# Acceptance Criteria

A completed Card System should:

- Provide a unified presentation model.
- Support all major Companion modules.
- Encourage exploration.
- Minimize UI fragmentation.
- Preserve long-term information naturally.