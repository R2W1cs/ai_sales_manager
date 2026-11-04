---
trigger: always_on
---

# Verification After Coding

After finishing any coding task or backlog leaf, **always** run the unified multi-gate verification suite before marking work as complete:

```bash
pnpm test:everything
```

_Note: For fast intermediate iteration, `pnpm fix && pnpm check:full` and `pnpm test:everything --fast` may be used. Before completing any backlog card, `pnpm test:everything` (or `python3 backlog/_runner.py test-everything`) must pass all 8 gates._

The task is considered done when:
- `pnpm test:everything` passes with 0 errors across all 8 gates (done_cmd, arch boundaries, linter/formatter, typecheck, unit tests, API smoke probes, Playwright E2E, and React Doctor).
- react-doctor shows 0 issues found

If it fails, fix all reported issues and re-run until it passes.
