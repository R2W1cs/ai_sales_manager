# 06 — AI Human Handoff Rules

Comprehensive human handoff invariants, triggers, priority resolution, staff briefing context, and takeover lifecycle.

> [!IMPORTANT]
> This spec was split into modular domain parts for AI context efficiency; the part files are authoritative.

## Document Parts

- [`01-triggers-briefing.md`](06_AI_HUMAN_HANDOFF_RULES/01-triggers-briefing.md): **Handoff invariants, trigger taxonomy, priority rules & staff briefing context**
  - _Guidance:_ Read if implementing handoff detection, trigger evaluation, priority scoring, or staff handoff cards.
- [`02-takeover-lifecycle-events.md`](06_AI_HUMAN_HANDOFF_RULES/02-takeover-lifecycle-events.md): **Purchase handoff, agent takeover, timeout escalation, notifications & state machine**
  - _Guidance:_ Read if implementing human takeover actions, return-to-AI transitions, handoff timeouts, or event dispatch.

## Agent Navigation Guidance

When implementing specific tasks, prefer reading only the exact part file(s) in `06_AI_HUMAN_HANDOFF_RULES/` required for your domain (see bullets above) rather than loading all documentation.
