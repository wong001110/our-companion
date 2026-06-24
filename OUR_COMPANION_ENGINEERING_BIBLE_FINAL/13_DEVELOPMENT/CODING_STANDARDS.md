# Coding Standards

- TypeScript strict mode.
- No direct DB access from renderer.
- No direct shell execution from renderer.
- All AI JSON responses must be validated.
- All tool calls must go through ToolService.
- Keep domain logic testable and UI-independent.
- Prefer simple services over complex frameworks.
- Use clear names over clever abstractions.
