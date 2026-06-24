# Our Companion Panel Implementation Rules

## Primary Instruction

Refactor the Panel visual experience into Ann's Notebook.
Do not refactor the Overlay character system unless explicitly required.

The Overlay is Ann herself.
The Panel is Ann's notebook.

## Do Not Do

Do not make the Panel feel like:

- Operating system
- Admin dashboard
- Developer console
- Analytics page
- File manager
- Productivity command center

Do not show developer/debug content in normal user mode:

- raw animation state
- movement score
- animation review
- state machine labels
- engine state
- internal event names

Keep these inside Developer Mode only.

## Image + HTML Rules

Use image assets for skins and decorations.
Use HTML for dynamic content.

Correct:

```text
paper-card-frame.png + HTML title/body/buttons
```

Wrong:

```text
one full card image that already contains text
```

Correct:

```text
chat bubble border image + HTML message text
```

Wrong:

```text
full chat bubble image stretched to fit text
```

## Stretchable Image Rule

For custom frames, paper cards, and chat bubbles, use 9-slice behavior.

Preferred CSS method:

```css
.notebook-card {
  border-style: solid;
  border-width: 24px;
  border-image-source: url("../assets/panel/frames/paper-card-frame.png");
  border-image-slice: 24 fill;
  border-image-width: 24px;
  border-image-repeat: round;
}
```

For cleaner paper texture, use a separate background layer:

```css
.notebook-card {
  background-image: url("../assets/panel/textures/paper-texture.png");
  background-size: cover;
}
```

For chat bubble tails, use a separate image:

```css
.chat-bubble.ann::after {
  content: "";
  position: absolute;
  left: 20px;
  bottom: -10px;
  width: 24px;
  height: 18px;
  background: url("../assets/panel/frames/chat-bubble-tail-ann.png") center / contain no-repeat;
}
```

## Layout Rules

The Panel should have:

- Dark soft app shell
- Left navigation
- Warm notebook content area
- Paper-like cards
- Soft purple accents
- Small Ann presence via avatar/sticker only

Do not place a large duplicate Ann character in the Panel because the Overlay already represents Ann.

## Component Suggestions

Recommended components:

```text
PanelShell
PanelSidebar
NotebookPage
NotebookSectionTitle
PaperCard
StickyNote
DiscoveryCard
JourneyCard
MemoryEntry
AnnMessageCard
NotebookChatBubble
NotebookInput
```

## Section Responsibilities

### Home

Show:
- Ann's Status
- Ann's Message
- Current Focus
- At a Glance
- Mood

### Discoveries

Show:
- Discovery card grid
- Soft filters
- Search/sort if needed
- Saved/favorite affordance

### Journeys

Show:
- Active journeys
- Completed journeys
- Progress
- Next step sticky note

### Memories

Show:
- Timeline entries
- Memory cards
- Tags/favorites
- Optional attached image

### Ask Ann

Show:
- Notebook-styled chat
- Prompt chips
- Input bar

### Settings

Show:
- Ann's Behavior
- Appearance
- Privacy & Memory
- Developer Mode

## Copywriting Rules

Use human, companion-like language.

Prefer:

```text
Ann is reading your notes.
Ann found something interesting.
Ann remembers this from our journey.
```

Avoid:

```text
Current state: idle
Movement score: 25
Engine status: waiting
```

## Development Scope

Recommended first implementation scope:

1. Rename Room to Home or Notebook
2. Replace empty room layout with notebook page layout
3. Add PaperCard / StickyNote reusable components
4. Move developer-only panels behind Developer Mode
5. Keep current navigation behavior
6. Keep current Overlay character behavior
7. Add asset folder structure and placeholder assets if final assets are not ready

## Acceptance Criteria

The redesign is successful when:

- The Panel feels like Ann's notebook
- The Overlay remains the living companion
- No normal user page feels like an OS or debug dashboard
- Dynamic content is still rendered as HTML
- Image assets decorate the UI without blocking localization or interaction
- Chat bubbles/cards can stretch without ugly distortion

