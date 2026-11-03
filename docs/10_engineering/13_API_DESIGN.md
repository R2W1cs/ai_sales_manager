# 13 — API Design

REST API contracts, resource DTOs, endpoint specifications, query parameters, error envelope, and Socket.IO events.

> [!IMPORTANT]
> This spec was split into modular domain parts for AI context efficiency; the part files are authoritative.

## Document Parts

- [`01-conventions-dto-contracts.md`](13_API_DESIGN/01-conventions-dto-contracts.md): **API conventions, error envelope, pagination headers, and shared resource DTOs**
  - _Guidance:_ Read if designing endpoints, defining shared DTOs, handling pagination, or formatting error responses.
- [`02-auth-workspace-inbox.md`](13_API_DESIGN/02-auth-workspace-inbox.md): **Endpoints: Auth, businesses, members, onboarding, conversations & inbox**
  - _Guidance:_ Read if implementing authentication routes, team management, onboarding wizard APIs, or inbox listing/querying.
- [`03-pipeline-orders-customers.md`](13_API_DESIGN/03-pipeline-orders-customers.md): **Endpoints: Sales pipeline, order management & customer profiles**
  - _Guidance:_ Read if implementing Kanban pipeline endpoints, order capture/status APIs, or customer detail routes.
- [`04-integrations-ai-admin-catalog.md`](13_API_DESIGN/04-integrations-ai-admin-catalog.md): **Endpoints: Channel webhooks, AI admin/playground, catalog, knowledge & rules**
  - _Guidance:_ Read if implementing Meta OAuth/webhooks, AI simulation playground, catalog CRUD, or knowledge upload APIs.
- [`05-realtime-platform-governance.md`](13_API_DESIGN/05-realtime-platform-governance.md): **Endpoints: Notifications, analytics, audit logs, Socket.IO realtime events & rules**
  - _Guidance:_ Read if implementing notifications/analytics APIs, Socket.IO gateway events, or reviewing API exclusions.

## Agent Navigation Guidance

When implementing specific tasks, prefer reading only the exact part file(s) in `13_API_DESIGN/` required for your domain (see bullets above) rather than loading all documentation.
