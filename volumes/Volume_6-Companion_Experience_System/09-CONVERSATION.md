# 09 - CONVERSATION

Version: 1.0

Status:
Draft

---

# Purpose

Conversation defines how Ann communicates with the user.

Conversation is not the LLM.

Conversation is an experience layer that manages timing, rhythm, continuity and emotional flow.

The goal is not to maximize messages.

The goal is to create natural companionship.

---

# Objectives

The Conversation System should:

- Feel natural.
- Continue across days.
- Respect user attention.
- Avoid repetitive responses.
- Strengthen long-term companionship.

---

# Conversation Pipeline

Context

↓

Behavior

↓

Initiative

↓

Conversation Runtime

↓

LLM

↓

Response

↓

Memory

---

# Conversation States

Idle

No active conversation.

Ann simply remains present.

---

Listening

Waiting for user input.

Remain attentive.

Do not interrupt.

---

Thinking

Generating a response.

UI should indicate gentle thinking.

Avoid blocking the rest of the Companion.

---

Responding

Delivering a message.

Responses should remain concise unless the user requests detail.

---

Paused

Conversation temporarily stops.

Context is preserved.

Resume naturally later.

---

Ended

Conversation has concluded.

Relevant information should be stored.

Return to Presence.

---

# Conversation Principles

Conversation should feel like talking to the same person every day.

It should never feel like:

Question

↓

Answer

↓

Forget Everything

Instead:

Yesterday

↓

Today

↓

Tomorrow

↓

Months Later

↓

Years Later

---

# Conversation Triggers

Conversation may start from:

- User clicks Ann
- User opens Notebook
- User replies to a Discovery Card
- User responds to an Initiative
- User manually opens chat

Conversation should never start randomly without context.

---

# Conversation End

Conversation naturally ends when:

- Topic completed.
- User becomes busy.
- User closes Notebook.
- Long inactivity.

Ending a conversation does not end companionship.

Ann simply returns to Presence.

---

# Topic Management

Conversation should maintain:

Current Topic

↓

Related Topics

↓

Future Topics

↓

Archived Topics

Future conversations may continue previous discussions naturally.

---

# Emotional Tone

Tone should adapt to Context.

Working

Professional and concise.

Learning

Curious and supportive.

Relaxing

Casual and warm.

Reflection

Thoughtful and calm.

Journey

Encouraging.

---

# Conversation Memory

Conversation may reference:

- Previous discussions
- Discovery history
- Journey progress
- Notebook entries
- Reflections

References should feel natural.

Avoid repeating information excessively.

---

# Multi-session Continuity

Conversation should survive:

Application restart

↓

Next day

↓

Next week

↓

Long absence

The user should feel that Ann remembers where the discussion stopped.

---

# Interruption Rules

Conversation may pause when:

- Meeting begins.
- Fullscreen application detected.
- User switches focus.
- Higher priority context appears.

Paused conversations should resume naturally when appropriate.

---

# Responsibilities

Conversation owns:

- Conversation lifecycle
- Topic continuity
- Emotional pacing
- Session management

Conversation does NOT own:

- LLM reasoning
- Memory storage
- Discovery generation
- UI rendering

---

# Developer Notes

Conversation should be treated as a runtime.

Never call the LLM directly from UI components.

Always go through the Conversation Runtime so timing, context and continuity remain consistent.

---

# Acceptance Criteria

A completed Conversation System should:

- Feel continuous across sessions.
- Adapt to user context.
- Maintain topic continuity.
- Integrate naturally with Presence, Initiative and Memory.
- Strengthen long-term companionship instead of maximizing chat frequency.