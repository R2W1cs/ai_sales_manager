# 22 — UX Flows & Screen Specifications

UX screen flows, application shell, onboarding wizard, Sales Command Center three-pane inbox, and golden user journeys.

> [!IMPORTANT]
> This spec was split into modular domain parts for AI context efficiency; the part files are authoritative.

## Document Parts

- [`01-shell-onboarding-activation.md`](22_UX_FLOWS/01-shell-onboarding-activation.md): **UX invariants, application shell navigation, onboarding 4-step wizard & activation gates**
  - _Guidance:_ Read if implementing main app layout, sidebar navigation, onboarding steps, or channel connect modals.
- [`02-inbox-three-pane-command-center.md`](22_UX_FLOWS/02-inbox-three-pane-command-center.md): **Sales Command Center 3-pane architecture (Triage list, Chat transcript, Action deck)**
  - _Guidance:_ Read if implementing inbox layout, conversation triage list, message thread, takeover controls, or lead deck.
- [`03-views-pipeline-catalog-settings.md`](22_UX_FLOWS/03-views-pipeline-catalog-settings.md): **Pipeline Kanban view, catalog management, AI settings, analytics & realtime optimistic UI**
  - _Guidance:_ Read if implementing sales pipeline board, product catalog UI, AI personality settings, or analytics charts.
- [`04-journeys-states-accessibility.md`](22_UX_FLOWS/04-journeys-states-accessibility.md): **Responsive mobile layout, notification rules, empty/loading states, golden journeys & WCAG**
  - _Guidance:_ Read if implementing mobile responsive drawer, empty states, error fallbacks, or checking UX acceptance criteria.

## Agent Navigation Guidance

When implementing specific tasks, prefer reading only the exact part file(s) in `22_UX_FLOWS/` required for your domain (see bullets above) rather than loading all documentation.
