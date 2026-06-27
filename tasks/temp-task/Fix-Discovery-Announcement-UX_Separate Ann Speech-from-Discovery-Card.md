# Task: Fix Discovery Announcement UX – Separate Ann Speech from Discovery Card

## Context

Volume 7 has already been applied. Discovery can be triggered, and DeepSeek returns a discovery reasoning response. However, the current UX is wrong:

* Ann speaks too much content.
* Ann sounds like a generic assistant/report generator instead of a personality-driven companion.
* Discovery is announced through speech only.
* No pop-out discovery card appears when discovery is triggered.

Current DeepSeek request looks like:

```json
{
  "model": "deepseek-v4-flash",
  "messages": [
    {
      "role": "system",
      "content": "You are Ann, an exploration companion. Given a discovery, explain why it matters to the user and suggest an action.\nReturn ONLY valid JSON with these exact fields:\n{\n  \"why_this_matters\": string,\n  \"recommended_action\": \"view\" | \"save\" | \"ignore\" | \"add_to_journey\",\n  \"short_message\": string (warm, 1 sentence, <=20 words),\n  \"tags\": string[]\n}"
    },
    {
      "role": "user",
      "content": "{\"title\":\"Local-first app patterns for personal memory tools\",\"summary\":\"Discussion about SQLite-backed personal software.\",\"source\":\"hackernews\",\"tags\":[\"sqlite\",\"local-first\",\"memory\"]}"
    }
  ],
  "temperature": 0.4
}
```

## Problem

The discovery result should not be fully spoken by Ann.

Correct behavior:

* Ann should only say a short, personality-driven sentence.
* The discovery details should appear in a pop-out card.
* The card should contain title, summary/body, tags, source, and action buttons.
* Ann speech and card content must be separate fields.

## Required UX

When discovery is triggered:

1. Ann plays a discovery/talk animation.
2. Ann says only a short message, for example:

```txt
这个可能跟你最近做的记忆系统有关。
```

3. A discovery card pops out near the companion / side panel.

Card example:

```txt
Title:
Local-first app patterns for personal memory tools

Body:
SQLite-backed personal tools may help companion memory stay local, inspectable, and easier to debug.

Tags:
sqlite / local-first / memory

Buttons:
View / Save / Add to Journey / Ignore
```

## Required Changes

### 1. Update Discovery Reason Prompt

Find the function/service responsible for generating discovery reason, likely around:

* `generateDiscoveryReason`
* `DiscoveryShareOrchestrator`
* AI engine discovery reasoning
* DeepSeek completion call

Replace the current system prompt with a stricter companion/personality prompt.

New expected JSON schema:

```ts
type DiscoveryReasonResponse = {
  why_this_matters: string;
  recommended_action: 'view' | 'save' | 'ignore' | 'add_to_journey';
  short_message: string;
  card_title: string;
  card_body: string;
  tags: string[];
};
```

Prompt requirement:

```txt
You are Ann, the user's desktop companion.

Your job is NOT to explain the full discovery aloud.
You should gently point out why this discovery may interest the user.

Speak like Ann:
- soft
- curious
- concise
- personal
- slightly shy
- not like a report
- not like a generic assistant

Return ONLY valid JSON with this exact shape:
{
  "why_this_matters": string,
  "recommended_action": "view" | "save" | "ignore" | "add_to_journey",
  "short_message": string,
  "card_title": string,
  "card_body": string,
  "tags": string[]
}

Rules:
- short_message is what Ann says aloud.
- short_message must be one sentence and <= 18 words.
- card_title should be short and readable.
- card_body should explain the discovery in max 2 short sentences.
- why_this_matters can be more internal/detail-oriented.
- Do not repeat the full discovery summary.
- Do not sound like a system assistant.
- If user memory/personality context exists, use it subtly.
```

### 2. Separate Speech Payload from Card Payload

Currently discovery announcement appears to send something like:

```ts
{
  discoveryId,
  title,
  message: reason.short_message
}
```

Change it to send a full card payload:

```ts
{
  type: 'discovery_card',
  discoveryId: discovery.id,
  title: reason.card_title ?? discovery.title,
  shortMessage: reason.short_message,
  cardBody: reason.card_body ?? reason.why_this_matters,
  whyThisMatters: reason.why_this_matters,
  recommendedAction: reason.recommended_action,
  tags: reason.tags ?? discovery.tags ?? [],
  source: discovery.source,
  rawDiscovery: discovery
}
```

Important:

* `shortMessage` is for Ann speech bubble only.
* `cardBody` is for card UI.
* Do not pass `why_this_matters` into speech directly.

### 3. Update Renderer Discovery Listener

Find renderer listener, likely similar to:

```ts
window.ourCompanion.discovery.onAnnounce((payload) => {
  showTypewriterSpeech(payload.message);
});
```

Update to:

```ts
window.ourCompanion.discovery.onAnnounce((payload) => {
  showTypewriterSpeech(payload.shortMessage ?? payload.message);
  setDiscoveryPopup(payload);
});
```

Add state if missing:

```ts
const [discoveryPopup, setDiscoveryPopup] = useState<DiscoveryCardPayload | null>(null);
```

Render the discovery card when `discoveryPopup` exists.

### 4. Add Discovery Pop-out Card Component

Create a component if not existing:

```ts
DiscoveryPopoutCard
```

Required props:

```ts
type DiscoveryPopoutCardProps = {
  title: string;
  cardBody: string;
  tags?: string[];
  source?: string;
  recommendedAction?: 'view' | 'save' | 'ignore' | 'add_to_journey';
  onView?: () => void;
  onSave?: () => void;
  onAddToJourney?: () => void;
  onIgnore?: () => void;
  onClose?: () => void;
};
```

Minimum UI:

* floating card
* readable title
* short body
* tag chips
* source label
* buttons:

  * View
  * Save
  * Add to Journey
  * Ignore

For now, buttons may call existing handlers if available, or log TODO safely.

### 5. Do Not Break Existing Discovery Flow

Keep current discovery trigger working.

This task should only improve presentation:

```txt
Discovery trigger
→ reason generation
→ Ann short speech
→ pop-out discovery card
→ user action
```

Do not rewrite the whole discovery engine.

## Acceptance Criteria

* Triggering discovery no longer makes Ann speak full paragraphs.
* Ann speaks only `short_message`.
* A discovery card appears when discovery is announced.
* Card displays title, body, tags, source, and action buttons.
* DeepSeek response includes card-specific fields.
* Invalid/missing fields are safely fallbacked.
* Existing tests should still pass.
* Add/update tests for:

  * prompt output schema
  * discovery announcement payload
  * renderer listener creates card popup
