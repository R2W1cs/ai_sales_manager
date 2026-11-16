---
id: phase-2-catalog-whatsapp
status: partial
---

# Phase 2 — Catalog connectivity + WhatsApp

**Partial.** WhatsApp Cloud API is **unblocked for pilots** (`ADR-026`). Shopify/WooCommerce sync and payment gateways remain **blocked** (`ADR-027`) until handoff → confirmed conversion is proven.

## Goal

Remove the two post-launch blockers: catalog load and WhatsApp-first merchants (`04` §5.1).

## Headline capability

- **Active now:** WhatsApp Cloud API (official Meta only) behind `WHATSAPP_ENABLED`
- **Still deferred:** Shopify/Woo sync, Sheets import, payment gateways

## Exit signal

Time-to-first-AI-reply < 1 day; ≥50% merchants connect a catalog source; WhatsApp adoption among WhatsApp-first merchants (`04` §3 / §5.5).

## Entry

- WhatsApp: pilot demand or founder pull-forward (`ADR-026`) — **met for implementation**
- Catalog sync platforms: Phase 1 launch gate + CSV pain evidence (`ADR-027`) — **not met**

## Cards

WhatsApp implementation lands in:

- `apps/api/src/integrations/adapters/meta-whatsapp.adapter.ts`
- `apps/api/src/integrations/meta/meta-api.client.ts`
- Feature gate: `WHATSAPP_ENABLED` + existing `whatsapp` channel enum

Do **not** invent Stripe/Konnect/D17 or unofficial WhatsApp clients. Do **not** invent Shopify/Woo `T-*` until `ADR-027` revisit triggers fire.
