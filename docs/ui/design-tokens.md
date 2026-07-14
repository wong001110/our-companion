# Design tokens

`src/styles/tokens.css` is the renderer's shared token source. It defines application, sidebar, paper and elevated surfaces; primary, success, warning and danger colors; text and border colors; spacing; radius; shadows; and motion durations.

`reset.css` establishes box sizing, a screen-reader-only utility, and a visible keyboard focus ring. Feedback, quick-action, and responsive styling live in their own modules and are imported by the renderer stylesheet.

The notebook visuals remain decorative rather than structural: form controls retain solid, high-contrast surfaces and the Social empty state uses a calm compact paper card.

The remaining legacy rules in `styles.css` are tracked in the UI execution log; they must be consolidated into domain modules before CSS-cleanup acceptance is claimed.
