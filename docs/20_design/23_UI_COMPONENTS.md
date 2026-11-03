# 23 — UI Components

Comprehensive UI component specifications, atomic primitives, composite widgets, inbox pane components, and layout templates.

> [!IMPORTANT]
> This spec was split into modular domain parts for AI context efficiency; the part files are authoritative.

## Document Parts

- [`01-composition-file-map.md`](23_UI_COMPONENTS/01-composition-file-map.md): **Component architecture, invariants, and comprehensive frontend component file tree**
  - _Guidance:_ Read if locating where UI components live, understanding component hierarchy, or creating new widget files.
- [`02-primitives-shared-atoms-shell.md`](23_UI_COMPONENTS/02-primitives-shared-atoms-shell.md): **Primitive kit (shadcn + Base UI), shared atoms (Badges, Buttons, Inputs) & app shell**
  - _Guidance:_ Read if implementing low-level atomic UI components, form controls, status badges, or sidebar navigation.
- [`03-inbox-command-center.md`](23_UI_COMPONENTS/03-inbox-command-center.md): **Inbox components: Conversation row, Chat transcript, Message bubbles, Action deck & handoff**
  - _Guidance:_ Read if implementing inbox list items, message bubbles, takeover banner, customer detail cards, or order drawer.
- [`04-views-onboarding-governance.md`](23_UI_COMPONENTS/04-views-onboarding-governance.md): **Onboarding components, views (Pipeline, Catalog, Settings), UI states, i18n & anti-patterns**
  - _Guidance:_ Read if implementing onboarding cards, pipeline cards, catalog tables, settings forms, or checking forbidden UI patterns.

## Agent Navigation Guidance

When implementing specific tasks, prefer reading only the exact part file(s) in `23_UI_COMPONENTS/` required for your domain (see bullets above) rather than loading all documentation.
