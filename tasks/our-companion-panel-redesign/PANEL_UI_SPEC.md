# Our Companion Panel UI Spec

## Core Direction

The Overlay character is the living companion.
The Panel is Ann's notebook, not a control panel, dashboard, operating system, or developer dashboard.

The goal is to make the Panel feel like opening Ann's personal notebook: warm, private, cozy, exploratory, and companion-like.

## Product Role Separation

### Overlay Character

The Overlay represents Ann herself.

Responsibilities:
- Provide living presence on desktop
- Show animation, emotion, idle behavior, and small reactions
- Create companionship feeling
- Stay lightweight and always present

Do not duplicate the full character experience inside the Panel unless needed for decorative avatar usage.

### Panel

The Panel represents Ann's notebook.

Responsibilities:
- Show what Ann is thinking about
- Show discoveries Ann found
- Show journeys/projects in progress
- Show memory highlights
- Allow user to ask Ann questions
- Provide soft context, not system controls

The Panel should not feel like:
- OS dashboard
- Admin console
- Analytics panel
- Developer state inspector
- File manager
- Productivity command center

## Navigation

Recommended navigation:

- Home
- Discoveries
- Journeys
- Memories
- Ask Ann
- Settings

Avoid using `Room` as the primary section name because it implies a virtual room/game space, while the current product direction is notebook + desktop companion.

## Visual Style

The visual style should follow:

- Soft lavender / purple primary palette
- Warm cream notebook paper
- Soft pink accent
- Hand-drawn anime-inspired details
- Scrapbook / journal / notebook feeling
- Paper cards, sticky notes, masking tape, doodles, small icons
- Cozy, intimate, private atmosphere

Avoid:

- Hard dashboard grids
- Neon cyber panels
- Heavy glassmorphism
- Dense tables
- Developer terminology
- Metrics-first UI

## Layout Concept

The Panel should use a dark app shell with a warm notebook content area.

Recommended layout:

```text
┌──────────────────────────────────────────────┐
│ Our Companion                                │
├──────────────┬───────────────────────────────┤
│ Sidebar      │ Ann's Notebook                │
│              │                               │
│ Home         │ Paper cards / sticky notes     │
│ Discoveries  │ Dynamic HTML content           │
│ Journeys     │ Image-based decorations         │
│ Memories     │                               │
│ Ask Ann      │                               │
│ Settings     │                               │
└──────────────┴───────────────────────────────┘
```

## Home Section

Home should summarize Ann's current life and thinking.

Suggested blocks:

1. Ann's Status
   - Natural language state
   - Example: `Ann is reading your notes and thinking about new ideas.`
   - Do not show raw engine state like `idle`, `task_start`, or `movement_score`.

2. Ann's Message
   - Short note from Ann
   - Example: `I found something interesting today. It might help with our project.`

3. Current Focus
   - The topic/project Ann is currently paying attention to
   - Optional progress bar

4. At a Glance
   - New discoveries count
   - Journeys in progress
   - Memories collected

5. Mood
   - Soft emotional label
   - Example: `Curious & Excited`

## Discoveries Section

Discoveries should feel like Ann collected references and placed them into a scrapbook.

Suggested UI:

- Card grid
- Each card resembles paper/photo clipped with tape
- Image thumbnail optional
- Title
- Short summary
- Source/time
- Tag/category
- Favorite/save action

Filters can exist, but should feel soft:

- All
- AI & Tech
- Design
- Life
- Other

Avoid making this feel like a data table.

## Journeys Section

Journeys are ongoing explorations/projects.

Suggested UI:

- Vertical list of journey cards
- Each card has:
  - title
  - short purpose
  - progress
  - next step sticky note
  - small doodle icon

Tabs:

- Active
- Completed

Journey cards should feel like Ann's planning notes, not project management tickets.

## Memories Section

Memories should feel like Ann's timeline of shared moments with the user.

Suggested UI:

- Timeline or journal entries
- Date markers
- Paper note cards
- Optional image/photo attachment
- Tags
- Favorite marker

Tone should be personal and reflective.

Example entries:

- `Talked about pixel art`
- `Discovered together`
- `Late night coding`

## Ask Ann Section

Ask Ann should feel like writing into Ann's notebook or passing notes.

Suggested UI:

- Chat area on notebook paper background
- User bubble and Ann bubble
- Soft prompt chips
- Input bar at bottom

Prompt chips examples:

- `What should we explore next?`
- `Summarize our current journey`
- `Help me think through this idea`
- `What did you remember?`

Use custom chat bubble assets where appropriate, but keep text rendered as HTML.

## Settings Section

Settings should remain functional but visually softened.

Group settings as:

- Ann's Behavior
- Appearance
- Privacy & Memory
- Developer Mode

Developer Mode should contain animation review, raw state, movement score, and debugging controls. These should not appear in normal user sections.

## Dynamic Content Rule

Do not put dynamic text inside images.

Use images for:

- Notebook background
- Paper cards
- Masking tape
- Sticker decorations
- Photo frames
- Dividers
- Decorative doodles
- Chat bubble frame

Use HTML/CSS for:

- Text
- Buttons
- Lists
- Inputs
- Progress bars
- Clickable controls
- Dynamic content

## Technical Direction

Use React/HTML for layout and dynamic content.
Use image assets as decorative skins.
Use 9-slice / CSS `border-image` for stretchable custom frames and chat bubbles.

