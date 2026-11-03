# 16 — Integration Design

Social channel integrations, Meta Graph API client, webhook verification, token management, and WhatsApp stub.

> [!IMPORTANT]
> This spec was split into modular domain parts for AI context efficiency; the part files are authoritative.

## Document Parts

- [`01-adapters-webhooks.md`](16_INTEGRATION_DESIGN/01-adapters-webhooks.md): **Channel adapter interface, webhook signature verification & payload normalization**
  - _Guidance:_ Read if implementing channel adapter interfaces, Instagram/Messenger webhooks, or ingress normalization.
- [`02-oauth-graph-client-ops.md`](16_INTEGRATION_DESIGN/02-oauth-graph-client-ops.md): **Meta OAuth flow, Graph API client, rate limiting, WhatsApp stub & logging**
  - _Guidance:_ Read if implementing Meta OAuth connection, Graph API message sending, rate limit backoff, or WhatsApp stubs.

## Agent Navigation Guidance

When implementing specific tasks, prefer reading only the exact part file(s) in `16_INTEGRATION_DESIGN/` required for your domain (see bullets above) rather than loading all documentation.
