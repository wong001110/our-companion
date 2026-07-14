# Companion Quick Actions

Quick Actions appear around the Companion as speech bubbles for Talk, Listen, Open Panel, and More. Placement is resolved by the pure `resolveQuickActionLayout` function, which flips bubbles across work-area edges and is unit-tested for center, all corners, small areas, and mixed bubble sizes.

Visibility uses a 220 ms hover delay and a 420 ms leave grace period. A timer-backed state machine drives the React hook and has fake-timer coverage for delay, grace cancellation, pinning, and closing. Clicking the Companion pins actions; a second click, outside interaction, dragging, or Escape closes them. Reduced-motion rules suppress spatial burst animation.

The Companion and bubbles participate in the click-through interactive group. Bubbles are unavailable while the local Companion is away visiting.
