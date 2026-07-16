# UI-BETA-001 Generated Narrative Asset Brief

## Decision

Generate only two missing semantic roles. Reuse the existing notebook doodles for discovery, journey, and memory roles.

| Role | Decision | Intended display |
|---|---|---:|
| Notebook authorship | Generate `authorship-pencil.png` | 48 px wide; 42 px at compact widths |
| Chat conversation | Generate `conversation-letter.png` | 42 px wide; 38–40 px at compact widths |
| Discovery | Reuse `doodles/sparkle.png` | 44 px |
| Journey | Reuse `doodles/map.png` | 50 px |
| Memory | Reuse `doodles/heart.png` | 44 px |

## Shared Family Rules

- Hand-drawn 2D notebook doodle with gently irregular cocoa-brown linework.
- Warm cream base, one muted lavender accent, and at most one restrained dusty-pink or pale-gold accent.
- Quiet, personal, softly authored, and legible around 44 px.
- One centered object with 12–18% transparent safe padding.
- Approximately 18–22 px source line weight at 512 px so the final apparent stroke is about 2 px.
- Maximum three principal colors.
- No cast shadow, text, glyphs, logos, watermarks, characters, notification badges, status meanings, or button containers.
- Decorative only. Adjacent visible headings retain all meaning.

## Authorship Pencil

A compact warm wooden pencil angled gently from lower-left to upper-right. Its graphite tip draws one short relaxed cocoa underline loop. Use one muted-lavender band and optionally a dusty-pink eraser. Do not include a paper sheet, letters, sparkles, hearts, or edit-control framing.

## Conversation Letter

A compact partially open cream paper note or envelope with one muted-lavender fold and one short abstract cocoa conversational curve above it. Do not include a stamp, badge, unread dot, arrow, heart, bell, or Social/account implication.

## Candidate and Selection Policy

- Generate four candidates per role on a flat chroma-key background.
- Remove chroma locally to create true alpha candidates.
- Reject fake transparency, white matte pixels, cropped silhouettes, glyph-like marks, overly glossy rendering, and styles that do not match the existing 96 px doodles.
- Select one final per role only after comparing all candidates at source scale and intended display size on both notebook paper and dark shell backgrounds.
- Final integration assets are 512×512 sRGB RGBA PNGs with fully transparent corners.

## Integration Boundary

Narrative surfaces only: Home, Chat, Discoveries, Journeys, and Memories. Generated assets must not appear in Social, Settings, Network, publishing, Visit controls, dialogs, errors, progress, or developer tools.

## Generation Tool

OpenAI built-in image generation. The backing model identifier is not exposed and must not be invented.
