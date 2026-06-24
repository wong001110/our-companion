# Our Companion Panel Redesign Pack

This pack describes how to redesign the Our Companion Panel into Ann's Notebook.

## Files

- `PANEL_UI_SPEC.md` — product and UI direction
- `ASSET_LIST.md` — image assets needed for the notebook style
- `IMPLEMENTATION_RULES.md` — technical rules for Codex implementation

## Core Message for Codex

The Overlay character is the living companion.
The Panel is Ann's notebook, not a control panel, dashboard, or operating system.

Keep the Overlay character system separate.
Refactor only the Panel visual experience unless explicitly requested.

## Recommended First Task

Start by replacing the current `Room` page with a `Home` / `Ann's Notebook` page.

Use image-based decorative assets for notebook background, paper cards, sticky notes, tape, doodles, and chat bubbles.
Keep all text, buttons, lists, inputs, and dynamic content rendered as HTML.

