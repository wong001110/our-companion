# Book of Ann Engineering Module Template

Every major module should keep implementation documentation in this order.

1. Overview
2. Vision
3. Responsibilities
4. Current State
5. Target State
6. Migration Plan
7. Architecture
8. Mermaid Sequence
9. Mermaid State Machine
10. Mermaid Class Diagram
11. Interfaces
12. Data Models
13. JSON Schemas
14. Events
15. Prompt Contracts
16. API Contracts
17. Edge Cases
18. Failure Recovery
19. Performance Targets
20. Security
21. Test Matrix
22. Acceptance Criteria
23. ADR
24. Future Extensions
25. Review Checklist

## Required Mermaid Diagrams

Each engine should provide:

- `flowchart`
- `sequenceDiagram`
- `stateDiagram-v2`
- `classDiagram`
- `erDiagram` when persistent relationships exist

## Test Matrix

Each engine should specify:

- Unit tests
- Integration tests
- Regression tests
- Failure injection tests
- Performance tests
- Compatibility tests

## Execution Standard

Before modifying a module:

1. Read the corresponding RFC.
2. Read the ADR.
3. Read the migration plan.
4. Generate or update an implementation checklist.
5. Preserve compatibility.
6. Update documentation after completion.
