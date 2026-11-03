# 14 — System Design

State machines, asynchronous message pipelines, BullMQ background jobs, Redis distributed locks, and realtime events.

> [!IMPORTANT]
> This spec was split into modular domain parts for AI context efficiency; the part files are authoritative.

## Document Parts

- [`01-state-machine-message-pipeline.md`](14_SYSTEM_DESIGN/01-state-machine-message-pipeline.md): **Conversation state machine, inbound message pipeline & outbound reply modes**
  - _Guidance:_ Read if implementing conversation status transitions, webhook ingress pipeline, or message reply handlers.
- [`02-locks-jobs-events-scoring.md`](14_SYSTEM_DESIGN/02-locks-jobs-events-scoring.md): **Distributed locks, BullMQ queue jobs, domain events, lead scoring & failure modes**
  - _Guidance:_ Read if implementing Redis locking, async job workers, event bus dispatchers, lead scoring, or retry policies.

## Agent Navigation Guidance

When implementing specific tasks, prefer reading only the exact part file(s) in `14_SYSTEM_DESIGN/` required for your domain (see bullets above) rather than loading all documentation.
