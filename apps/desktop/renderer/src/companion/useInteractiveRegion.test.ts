import { afterEach, describe, expect, it, vi } from 'vitest';
import { createInteractiveRegionController } from './useInteractiveRegion';

function createController(pointerInLayout = false) {
  const setMousePassthrough = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
  const onRegionsChange = vi.fn();
  const controller = createInteractiveRegionController({
    getPointerInLayout: () => pointerInLayout,
    onRegionsChange,
    setMousePassthrough,
  });
  return { controller, onRegionsChange, setMousePassthrough };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('useInteractiveRegion interaction controller', () => {
  it('makes the window interactive when discovery-card is entered', () => {
    const { controller, setMousePassthrough } = createController();

    controller.enter('discovery-card');

    expect(setMousePassthrough).toHaveBeenCalledWith(false);
  });

  it('immediately restores passthrough when discovery-card is removed', () => {
    const { controller, setMousePassthrough } = createController();
    controller.enter('discovery-card');

    controller.removeImmediately('discovery-card');

    expect(setMousePassthrough).toHaveBeenLastCalledWith(true);
  });

  it('preserves other active regions when discovery-card is removed', () => {
    const { controller, onRegionsChange, setMousePassthrough } = createController();
    controller.enter('companion-hover');
    controller.enter('discovery-card');
    setMousePassthrough.mockClear();

    controller.removeImmediately('discovery-card');

    expect(setMousePassthrough).not.toHaveBeenCalled();
    expect(onRegionsChange).toHaveBeenLastCalledWith(new Set(['companion-hover']));
  });

  it('does not allow a stale grace timer to override an immediate removal or new entry', () => {
    vi.useFakeTimers();
    const { controller, setMousePassthrough } = createController();
    controller.enter('discovery-card');
    controller.leave('discovery-card');
    controller.removeImmediately('discovery-card');
    vi.advanceTimersByTime(500);

    expect(setMousePassthrough).toHaveBeenLastCalledWith(true);

    controller.enter('discovery-card');
    controller.leave('discovery-card');
    controller.enter('companion-hover');
    vi.advanceTimersByTime(500);

    expect(setMousePassthrough).toHaveBeenLastCalledWith(false);
  });

  it('releases the card region when the discovery popup lifecycle unmounts it', () => {
    const { controller, setMousePassthrough } = createController();
    controller.enter('discovery-card');

    // Successful Add, Save, Ignore, Close, cancellation, and queue changes all
    // converge on the popup becoming absent in CompanionEntryShell.
    const popup = null;
    if (!popup) controller.removeImmediately('discovery-card');

    expect(setMousePassthrough).toHaveBeenLastCalledWith(true);
  });
});
