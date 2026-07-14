# Accessibility foundations

Navigation uses real buttons and `aria-current="page"`. Settings categories use the tab role. The renderer has a visible `:focus-visible` style, input labels, polite status regions, assertive error handling where relevant, and a reusable confirmation dialog with alert-dialog semantics and Escape dismissal.

The creation entry card is a real button, not a clickable `div`. Quick Actions close with Escape and are keyboard reachable after opening. The UI accessibility Playwright check injects axe into the Panel and requires zero critical and serious violations; moderate findings are written to the run report.
