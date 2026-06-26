# Argent Execution Checklist

Before coding:

- [ ] Read `01_ARGENT_MASTER.md`
- [ ] Read `12_MIGRATION_STRATEGY.md`
- [ ] Inspect current project structure
- [ ] Identify existing packages
- [ ] Identify direct engine calls
- [ ] Identify current AI API calls
- [ ] Identify current animation flow
- [ ] Identify current tool/action flow

During coding:

- [ ] Add shared models without breaking imports
- [ ] Add event bus without replacing existing flows
- [ ] Add provider interfaces
- [ ] Add compatibility docs
- [ ] Keep current behavior working

After coding:

- [ ] Run tests
- [ ] Run app
- [ ] Verify existing discovery behavior still works
- [ ] Verify existing character animation still works
- [ ] Verify existing speech bubble still works
- [ ] Verify no direct provider lock-in was added
- [ ] Document migration changes
