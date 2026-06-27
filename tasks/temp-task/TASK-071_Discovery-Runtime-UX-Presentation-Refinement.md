# TASK-071 — Discovery Runtime UX & Presentation Refinement

## Background

Volume 7 Runtime has been successfully applied.

Discovery can already:

* Generate candidates
* Trigger Ann return
* Generate AI reasoning
* Store discoveries

However, the current runtime UX still behaves like an engineering demo instead of a desktop companion.

This task focuses only on runtime behavior and presentation.

Do **not** redesign the Discovery Engine.

---

# Current Problems

## 1. Ann speaks too much

Current behavior:

* Discovery reasoning is spoken almost entirely.
* Ann sounds like an assistant reading a report.

Desired:

Ann only speaks one short personality-driven sentence.

Example:

> "这个可能会对我们的记忆系统有帮助。"

The detailed explanation belongs inside the discovery card.

---

## 2. Discovery Card appears too late

Current behavior:

```text
Ann starts speaking
↓
wait
↓
card appears
```

Desired:

```text
Discovery surfaced
↓
card appears immediately
↓
Ann starts speaking simultaneously
```

The user should already be able to read and interact with the card while Ann is still talking.

Speech must never block rendering.

---

## 3. Discovery Return groups everything together

Current behavior:

```text
Send Ann Exploring

↓

Multiple discoveries returned

↓

One large shared panel containing every discovery
```

Desired:

```text
Send Ann Exploring

↓

Generate N candidates

↓

Insert each candidate into Discovery Pool

↓

Surface ONE candidate

↓

Remaining candidates stay inside pool
```

Each candidate is an independent discovery.

Do not group multiple discoveries into one return board.

---

## 4. Discovery Candidates contain duplicates

Current issues:

* Same title appears multiple times.
* Same discovery may exist in Candidate list and Recent Feed.
* Scheduler repeatedly inserts identical items.

Required:

Deduplicate before insertion.

Recommended key:

```ts
normalize(title) + "::" + source
```

If duplicate exists:

Update score/metadata instead of creating another record.

---

## 5. Discovery / Insight mismatch

Observed issue:

Discovery title:

```text
Local-first app patterns for personal memory tools
```

Insight body:

```text
Building expressive desktop companions with PixiJS...
```

This indicates title/body are generated from different candidates.

Required:

All generated content must reference the same DiscoveryCandidate.

Never mix candidate IDs.

---

## 6. Mock data repeats forever

Current runtime repeatedly shows:

* Ambient AI companion interfaces
* Local-first memory tools
* PixiJS animation
* Cozy developer room

Audit the discovery source.

If mock/demo data is being used:

* clearly mark as demo
* isolate under debug mode
* rotate instead of repeating identical candidates forever

---

## 7. Debug section header visibility

Inactive debug section headers are too pale.

Current result:

Section titles become unreadable.

Required:

Use readable purple headers for all sections.

Example:

```css
Inactive:
rgba(137,89,190,0.68)

Active:
#8959be

Text:
white
```

All section names must remain readable.

---

# Required Runtime Flow

When user clicks:

```text
Send Ann Exploring
```

Runtime should execute:

```text
Ann leaves

↓

Collect discoveries

↓

Generate multiple candidates

↓

Deduplicate

↓

Insert individually into Discovery Pool

↓

Ann returns

↓

Ann says ONE short sentence

↓

Immediately display ONE DiscoveryPopoutCard

↓

Remaining candidates stay pooled

↓

After current card is handled
or interval expires

↓

Surface next candidate
```

NOT:

```text
Generate everything

↓

Display giant shared board
```

---

# Discovery Candidate Model

```ts
type DiscoveryCandidate = {
    id: string;

    title: string;

    summary: string;

    cardBody: string;

    whyThisMatters: string;

    source: string;

    sourceType:
        | "mock"
        | "real"
        | "generated"
        | "cached";

    tags: string[];

    relevanceScore?: number;

    noveltyScore?: number;

    category?:
        | "AI & Tech"
        | "Design"
        | "Life"
        | "Other";

    status:
        | "pooled"
        | "surfaced"
        | "viewed"
        | "saved"
        | "ignored"
        | "added_to_journey";

    createdAt: string;

    surfacedAt?: string;

    dedupeKey: string;
};
```

---

# Discovery Reason Prompt

Update LLM prompt.

Ann should not explain everything.

Return:

```ts
{
    why_this_matters: string;

    recommended_action:
        | "view"
        | "save"
        | "ignore"
        | "add_to_journey";

    short_message: string;

    card_title: string;

    card_body: string;

    tags: string[];
}
```

Rules:

* short_message is spoken.
* maximum one sentence.
* maximum 18 words.
* card_body contains detail.
* Do not repeat summary.
* Speak as Ann.
* Do not sound like a report.

---

# Renderer Changes

Current behavior likely resembles:

```ts
showTypewriterSpeech();

await speech;

showCard();
```

Replace with:

```ts
setDiscoveryPopup(payload);

void showTypewriterSpeech(payload.shortMessage);
```

Card rendering must happen immediately.

Speech animation must never block UI.

---

# Discovery Popout

The popup card should contain:

* title
* summary
* tags
* source
* action buttons

Buttons:

* View
* Save
* Add to Journey
* Ignore

Only one popup should exist at a time.

---

# Discovery Pool Scheduling

After first popup:

Remaining candidates remain inside Discovery Pool.

Next candidate appears:

* after user handles current card

OR

* after configured interval

Production:

```text
3 minutes
```

Debug:

```text
10 seconds
```

Never surface multiple popup cards simultaneously.

---

# Debug Information

Each candidate should expose:

```text
Discovery ID

Dedupe Key

Source Type

Created Time

Current Status

Scheduler Round
```

This allows duplicate issues to be diagnosed quickly.

---

# Acceptance Criteria

* Ann only speaks short personality-driven messages.
* Discovery card appears immediately.
* Card does not wait for speech animation.
* Every discovery is an independent candidate.
* Send Ann Exploring no longer opens one shared board.
* Discovery Pool stores candidates individually.
* Duplicate discoveries are removed before insertion.
* Discovery title/body/insight always reference the same candidate.
* Mock discoveries no longer endlessly repeat.
* Debug section headers remain readable.
* Discovery runtime feels like a living desktop companion instead of a debug viewer.
