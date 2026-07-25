# Memory and Proactive Productization — Release Checklist

## Automated validation

Record the GitHub Actions run ID or local command transcript beside the release decision.

- [ ] `npm ci`
- [ ] `npm run typecheck`
- [ ] `npm test`
- [ ] `npm run arch:check`
- [ ] `npm run build`
- [ ] Vector product-state tests pass.
- [ ] Memory review transition tests pass.
- [ ] Proactive policy tests pass.
- [ ] Existing Grounding, lifecycle, Discovery Memory and privacy regression tests pass.

## Product documentation

- [ ] `docs/product/vector-memory-productization.md` matches implementation.
- [ ] `docs/product/memory-review-and-control.md` matches implementation.
- [ ] `docs/product/proactive-companion-behavior.md` matches implementation.
- [ ] Companion core loop and state ownership docs are updated.
- [ ] Direction-correction audit, legacy table and implementation log are current.
- [ ] Root README links all product specs and manual checklists.

## Real-device validation

- [ ] Complete [Vector Memory checklist](vector-memory-productization.md) on packaged Windows.
- [ ] Complete [Vector Memory checklist](vector-memory-productization.md) on packaged macOS.
- [ ] Complete [Memory Review checklist](memory-review-ui.md) in English.
- [ ] Complete [Memory Review checklist](memory-review-ui.md) in Simplified Chinese.
- [ ] Complete [Proactive Behavior checklist](proactive-companion-behavior.md) with accelerated runtime time.
- [ ] Record all failures with build SHA, OS, input, expected result, actual result and screenshot/log reference.

## Release decision

- [ ] Automated checks green.
- [ ] No data loss, privacy bypass or write-after-close regression.
- [ ] No normal-user direct durable Memory editor remains.
- [ ] Vector fallback remains usable without the model.
- [ ] Proactive prompts respect Off, Focus, Do Not Disturb, late hours and cooldowns.
- [ ] Real-device failures are either fixed or explicitly accepted as post-release limitations.

Final decision:

```text
Memory and proactive productization ready: YES / NO
Blocking reason:
Validated build SHA:
Validated on:
Validation evidence:
```
