export const ANN_FRAME = { width: 300, height: 300 };
const sheetPath = (file) => `assets/characters/ann/animations/${file}`;
function anim(name, frames, frameMs) {
    return {
        name,
        sheet: sheetPath(`${name}.png`),
        frameWidth: ANN_FRAME.width,
        frameHeight: ANN_FRAME.height,
        frames,
        frameMs,
        columns: frames,
        rows: 1
    };
}
export const annAnimations = {
    idle_laptop: anim('idle_laptop', 6, 520),
    idle_coffee: anim('idle_coffee', 4, 620),
    idle_notes: anim('idle_notes', 3, 520),
    idle_tired: anim('idle_tired', 4, 560),
    walk: anim('walk', 8, 180),
    return: anim('return', 4, 220),
    think: anim('think', 6, 420),
    focus_typing: anim('focus_typing', 4, 220),
    discovery: anim('discovery', 8, 260),
    discovery_shy: anim('discovery_shy', 4, 340),
    talk: anim('talk', 6, 280),
    talk_happy: anim('talk_happy', 4, 300),
    task_start: anim('task_start', 4, 300),
    task_success: anim('task_success', 4, 320),
    task_failed: anim('task_failed', 4, 360)
};
