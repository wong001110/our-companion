# Our Companion Panel Asset List

## Asset Philosophy

Assets should make the Panel feel like Ann's notebook. They should decorate and skin the UI, not replace dynamic HTML content.

Do not render text into assets unless it is purely decorative and never needs localization.

## Required Assets

### 1. Notebook Background

Filename suggestion:

```text
notebook-bg.png
```

Purpose:
- Main content background for Home / Discoveries / Journeys / Memories / Ask Ann
- Should look like open notebook paper or scrapbook paper

Recommended format:
- PNG or WebP
- Large enough for desktop panel
- Can be sliced or repeated if needed

Notes:
- Keep center area relatively clean for readable HTML content.
- Avoid strong texture behind body text.

### 2. Paper Card Frame

Filename suggestion:

```text
paper-card-frame.png
```

Purpose:
- Used for content cards such as status, current focus, discoveries, memories, journey items

Implementation:
- Use CSS `border-image` or 9-slice style scaling
- Text content must be HTML inside the card

### 3. Sticky Note Frame

Filename suggestion:

```text
sticky-note-frame.png
```

Purpose:
- Used for next steps, small notes, Ann messages, reminder blocks

Implementation:
- Use as background or border-image
- Keep text as HTML

### 4. Chat Bubble Frame

Filename suggestion:

```text
chat-bubble-ann.png
chat-bubble-user.png
chat-bubble-tail-ann.png
chat-bubble-tail-user.png
```

Purpose:
- Custom image-based chat bubble styling

Implementation:
- Main bubble uses 9-slice / `border-image`
- Tail is separate image positioned with CSS pseudo-element
- Do not stretch the full bubble directly with `background-size: 100% 100%`

### 5. Masking Tape

Filename suggestion:

```text
tape-purple.png
tape-cream.png
tape-pink.png
```

Purpose:
- Decorative tape pieces on cards, photos, labels

Implementation:
- Absolute positioned decoration
- Non-interactive

### 6. Section Label Tape

Filename suggestion:

```text
section-label-tape.png
```

Purpose:
- Header label background for section titles like `Ann's Status`, `Current Focus`, `Recent Discoveries`

Text should be HTML layered above the tape image.

### 7. Photo Frame

Filename suggestion:

```text
photo-frame.png
polaroid-frame.png
```

Purpose:
- Display discovery thumbnails, memory images, inspiration references

Implementation:
- Frame as image asset
- Actual thumbnail should be HTML image inside frame

### 8. Doodle Icons

Filename suggestions:

```text
doodle-heart.svg
doodle-star.svg
doodle-cat.svg
doodle-map.svg
doodle-book.svg
doodle-sparkle.svg
doodle-plant.svg
```

Purpose:
- Small decorative icons throughout the notebook

Recommended format:
- SVG for simple icons
- PNG if hand-drawn texture is important

### 9. Ann Avatar / Mini Portrait

Filename suggestion:

```text
ann-avatar.png
ann-mini-reading.png
ann-mini-thinking.png
```

Purpose:
- Small Ann presence inside notebook cards

Important:
- This should not compete with the Overlay character.
- Use mini portrait or sticker version only.

### 10. Empty State Illustration

Filename suggestion:

```text
empty-notebook.png
empty-discoveries.png
empty-journeys.png
```

Purpose:
- Friendly empty states

Tone:
- Warm and encouraging
- Avoid system-like empty states

## Optional Assets

- Notebook rings
- Paper clips
- Torn paper edges
- Bookmark ribbon
- Tiny flower pot doodle
- Coffee cup doodle
- Cat paw marks
- Corner shadow overlay

## Asset Usage Rules

Use assets for visual warmth.
Do not use assets to hide poor layout.
Do not make the interface unreadable with too many decorations.
Keep decorations non-essential and removable.

## Suggested Folder Structure

```text
src/renderer/assets/panel/
├─ notebook/
│  ├─ notebook-bg.png
│  └─ notebook-rings.png
├─ frames/
│  ├─ paper-card-frame.png
│  ├─ sticky-note-frame.png
│  ├─ chat-bubble-ann.png
│  ├─ chat-bubble-user.png
│  ├─ chat-bubble-tail-ann.png
│  └─ chat-bubble-tail-user.png
├─ decorations/
│  ├─ tape-purple.png
│  ├─ tape-cream.png
│  ├─ tape-pink.png
│  ├─ paperclip.png
│  └─ bookmark.png
├─ doodles/
│  ├─ heart.svg
│  ├─ star.svg
│  ├─ cat.svg
│  ├─ map.svg
│  ├─ book.svg
│  └─ sparkle.svg
└─ ann/
   ├─ ann-avatar.png
   ├─ ann-mini-reading.png
   └─ ann-mini-thinking.png
```

