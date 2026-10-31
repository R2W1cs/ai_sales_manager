# Contributing

## Branching

- `main` is protected in spirit: no direct pushes after the first commit; everything arrives by pull request.
- Branch names: `phase/<name>` for a phase (for example `phase/design`), `feat/<scope>-<short>` for features, `fix/<scope>-<short>`, `docs/<short>`, `test/<short>`.
- One pull request per cohesive change. Keep them reviewable (under about 400 changed lines where possible).

## Commits

Use [Conventional Commits](https://www.conventionalcommits.org/): `feat(orders): confirm pending order`, `docs(design): add class diagrams`, `test(api): cover inbox pagination`.

**Commit as yourself.** Each member commits from their own GitHub account and their own Git identity. Never commit work under someone else's name, and never rewrite shared history to change authorship; the history is evidence of who did what.

## Pull requests

1. Fill in the PR template: what, why, how tested, linked story or backlog id.
2. At least one reviewer who is not the author approves.
3. CI must be green.
4. Squash or merge commits are both fine; do not force-push `main`.

## Ownership

| Area | Lead |
|---|---|
| `docs/01-requirements`, `docs/02-methodology`, `docs/03-design` | Rayen |
| Frontend and ethics | Aymen |
| Backend, optimization and refactoring | Moataz |
| Testing | Asma |

## AI-assisted work

Tools such as Claude, ChatGPT, Copilot or Cursor are allowed under the course rules, with these conditions:

1. Plan, prompt, **review**, test, document. AI output is a draft, never a result.
2. Record each meaningful use in [`docs/ai-usage-log.md`](../ai-usage-log.md): tool, purpose, prompt, what was kept, what was changed or rejected.
3. The author of a pull request is responsible for every line in it, whoever or whatever wrote it.
