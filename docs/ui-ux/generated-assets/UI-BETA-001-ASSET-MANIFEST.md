# UI-BETA-001 Generated Asset Manifest

## Generation and provenance

- Tool: OpenAI built-in image generation. The backing model identifier is not exposed and is not inferred.
- Generation date: 2026-07-17.
- Reasoning/selection agents: Lead Codex agent, informed by the read-only Visual Art Director audit (`/root/visual_art_audit`).
- Candidate policy: four separately generated candidates per role.
- Source format: generated PNG on a flat green chroma-key background.
- Alpha processing: the imagegen skill's `remove_chroma_key.py` helper; selected results received one alpha-aware Lanczos downsample to 512×512 with no upscaling.
- Candidate provenance: every generated source and alpha-converted candidate, including rejected candidates, is retained under `artifacts/ui-ux/UI-BETA-001/2026-07-17/assets/`.
- Comparison evidence: `artifacts/ui-ux/UI-BETA-001/2026-07-17/assets/generated-asset-contact-sheet.png`.

The image-generation API did not expose a separate negative-prompt field. The “negative prompt” entries below record the explicit negative constraints included in each generation request rather than inventing an unavailable parameter.

## Asset: authorship-pencil.png

- Semantic purpose: a quiet decorative authorship cue for the personal Notebook home page; it does not mean Edit and carries no interactive state.
- Surface usage: Home page header only.
- Intended display size: 48×48 CSS px at normal panel widths; 42×42 CSS px at compact widths.
- Runtime file: `apps/desktop/renderer/public/assets/panel/generated/notebook/authorship-pencil.png`.
- Selected candidate: `authorship-a2`.
- Source candidate: `artifacts/ui-ux/UI-BETA-001/2026-07-17/assets/candidates-source/authorship-a2.png`.
- Alpha candidate: `artifacts/ui-ux/UI-BETA-001/2026-07-17/assets/candidates-alpha/authorship-a2.png`.
- SHA-256: `7edaee66eec9e94f7c833b341191f755b49b2575a7c58f8034915d8b08dd5f68`.
- Technical validation: 512×512 sRGB RGBA PNG; all four corner alpha values are 0; non-empty alpha bounds `(157, 139, 368, 342)`.
- Generation prompt: “Create one compact hand-drawn 2D notebook doodle on a flat chroma-green background: a warm wooden pencil angled gently lower-left to upper-right, its graphite tip drawing one short relaxed cocoa underline loop. Use gently irregular cocoa-brown linework, a warm cream/wood base, one muted-lavender band, and at most one restrained dusty-pink eraser. Center the object with 12–18% safe padding, use a compact silhouette and source strokes that remain about 2 px when displayed near 48 px. Quiet, personal, softly authored, maximum three principal colors.”
- Negative prompt/constraints: “No paper sheet, letters, sparkles, hearts, edit button, button container, cast shadow, text, glyph, logo, watermark, character, notification badge, glossy 3D rendering, fake transparency, white matte, crop, or edge contact.”
- Selection rationale: most compact silhouette, clearest underline gesture, restrained palette, and least likely candidate to read as an Edit control.
- Integration files: `apps/desktop/renderer/src/ui/NotebookPrimitives.tsx`, `apps/desktop/renderer/src/pages/HomePage.tsx`, `apps/desktop/renderer/src/styles/panel-layout.css`, `apps/desktop/renderer/src/styles/responsive.css`, and `apps/desktop/renderer/src/ui/NotebookDoodle.test.ts`.

Rejected authorship candidates: `a1`, `a3`, and `a4` remained readable but were taller or visually heavier than the compact runtime role.

## Asset: conversation-letter.png

- Semantic purpose: a quiet decorative cue for private conversation/history; it does not mean Mail, Inbox, notification, delivery, or account state.
- Surface usage: Chat page header only.
- Intended display size: 42×42 CSS px at normal panel widths; 38×38 CSS px at compact widths.
- Runtime file: `apps/desktop/renderer/public/assets/panel/generated/notebook/conversation-letter.png`.
- Selected candidate: `conversation-b3`.
- Source candidate: `artifacts/ui-ux/UI-BETA-001/2026-07-17/assets/candidates-source/conversation-b3.png`.
- Alpha candidate: `artifacts/ui-ux/UI-BETA-001/2026-07-17/assets/candidates-alpha/conversation-b3.png`.
- SHA-256: `6b7a49536fdc048f8223b0ad7590b7a41b243f55d00ee50e35807c513a310077`.
- Technical validation: 512×512 sRGB RGBA PNG; all four corner alpha values are 0; non-empty alpha bounds `(160, 134, 356, 347)`.
- Generation prompt: “Create one compact hand-drawn 2D notebook doodle on a flat chroma-green background: a partially open warm-cream paper note or envelope with one muted-lavender fold and one short abstract cocoa conversational curve above it. Use gently irregular cocoa-brown linework, center the object with 12–18% safe padding, keep the silhouette quiet and compact, and use source strokes that remain about 2 px when displayed near 42 px. Personal notebook tone, maximum three principal colors.”
- Negative prompt/constraints: “No stamp, badge, unread dot, arrow, heart, bell, Social/account implication, delivery motion, button container, cast shadow, text, glyph, logo, watermark, character, notification state, glossy 3D rendering, fake transparency, white matte, crop, or edge contact.”
- Selection rationale: quietest and most compact envelope; the abstract curve avoids notification and account semantics.
- Integration files: `apps/desktop/renderer/src/ui/NotebookPrimitives.tsx`, `apps/desktop/renderer/src/pages/ChatPage.tsx`, `apps/desktop/renderer/src/styles/panel-layout.css`, `apps/desktop/renderer/src/styles/responsive.css`, and `apps/desktop/renderer/src/ui/NotebookDoodle.test.ts`.

Rejected conversation candidates: `b1` was oversized and mail-like; `b2` introduced a heart-like notification flourish; `b4` read as message delivery because of its large inserted note.

## Accessibility and integration boundary

Both assets are decorative: empty alternative text, `aria-hidden="true"`, `draggable="false"`, no focusability, no pointer behavior, and a load-error fallback that hides the image without removing meaning. They are limited to narrative Notebook surfaces and do not appear in Social, Settings, Network, publishing, Visit controls, dialogs, errors, progress, or developer tools.
