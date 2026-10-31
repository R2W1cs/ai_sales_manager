---
id: phase-2-catalog-whatsapp
status: blocked
---

# Phase 2 — Catalog connectivity + WhatsApp

**Blocked.** Do not split into cards until Phase 1 exit (`04` §4.4) and Phase 2 specs exist (`13` / `16` / `01` for this phase). Do not invent Shopify, Woo, or WhatsApp Cloud API `T-*` here.

## Goal

Remove the two post-launch blockers: catalog load and WhatsApp-first merchants (`04` §5.1).

## Headline capability

Shopify/Woo sync, CSV hardening, **WhatsApp Cloud API** (`04` §3).

## Exit signal

Time-to-first-AI-reply < 1 day; ≥50% merchants connect a catalog source; WhatsApp adoption among WhatsApp-first merchants (`04` §3 / §5.5).

## Entry

Phase 1 launch gate (`03` §10) plus `04` §4.4. WhatsApp work starts when `04` §5.4 is true. Reordering requires an ADR in `40`.

## Cards

None until unblocked. MVP already ships the WhatsApp **adapter stub** (`T-INT-06`) and `whatsapp_enabled` false — do not duplicate that work here.
