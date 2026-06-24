# Ann Asset Contract

Reference assets in this folder are not loaded directly by the desktop companion:

- `ann-room-concept.png` — room and mood reference
- `ann-sprite-sheet.png` — labeled visual reference (white background)
- `demo.png` — product concept reference

## Desktop sprite sheets

The desktop companion renders **horizontal sprite sheets** from `animations/`:

| Property | Value |
|----------|-------|
| Frame size | **300×300 px** |
| Layout | Single horizontal row (`width = frames × 300`, `height = 300`) |
| Alignment | Horizon-aligned feet across frames (author in your art tool) |
| Background | Transparent |

### Three-part format

1. **`animations/{name}.png`** — hand-authored sprite sheet (e.g. `idle_laptop.png`)
2. **`animationConfig.ts`** — frame count, timing, sheet path (`apps/desktop/renderer/src/character/ann/animationConfig.ts`)
3. **`SpriteAnimator.ts`** — sprite sheet player (`apps/desktop/renderer/src/character/SpriteAnimator.ts`)

### Adding or updating an animation

1. Export the sheet as a horizontal PNG into `assets/characters/ann/animations/`
2. Add or update the entry in `animationConfig.ts`
3. Run `npm run assets:ann:sync` to copy sheets into the renderer public folder
4. Reload the desktop app

Do not load `ann-sprite-sheet.png` as the companion — it would render the whole reference sheet instead of an isolated character.
