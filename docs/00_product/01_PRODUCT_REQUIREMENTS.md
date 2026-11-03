# 01 — Product Requirements

Canonical functional requirements (FRs) and non-functional requirements (NFRs) for authentication, catalog, inbox, AI, and commerce.

> [!IMPORTANT]
> This spec was split into modular domain parts for AI context efficiency; the part files are authoritative.

## Document Parts

- [`01-framework-standards.md`](01_PRODUCT_REQUIREMENTS/01-framework-standards.md): **Documentation architect prompt, standards, quality rules & actors**
  - _Guidance:_ Read if reviewing overall documentation governance, architecture standards, or actor personas.
- [`02-identity-catalog-knowledge.md`](01_PRODUCT_REQUIREMENTS/02-identity-catalog-knowledge.md): **FR-AUTH, FR-BIZ, FR-CAT (Auth, identity, workspaces, catalog)**
  - _Guidance:_ Read if implementing authentication, multi-tenancy, member onboarding, or product catalog FRs.
- [`03-channels-conversations.md`](01_PRODUCT_REQUIREMENTS/03-channels-conversations.md): **FR-KNOW, FR-INT, FR-CONV (Knowledge base, integrations, inbox)**
  - _Guidance:_ Read if implementing business knowledge RAG, social channels (Instagram/FB), or inbox FRs.
- [`04-ai-handoff-commerce.md`](01_PRODUCT_REQUIREMENTS/04-ai-handoff-commerce.md): **FR-AI, FR-HAND, FR-ORD, FR-CUST, FR-NOTIF (AI agent, handoff, orders, customers)**
  - _Guidance:_ Read if implementing AI sales agent autonomy, human handoff triggers, order capture, or notifications.
- [`05-platform-nfr-governance.md`](01_PRODUCT_REQUIREMENTS/05-platform-nfr-governance.md): **FR-ANL, FR-BILL, AI gates, analytics KPIs, NFRs & constraints**
  - _Guidance:_ Read if implementing analytics, billing, feature flags, audit logging, or checking NFR constraints.

## Agent Navigation Guidance

When implementing specific tasks, prefer reading only the exact part file(s) in `01_PRODUCT_REQUIREMENTS/` required for your domain (see bullets above) rather than loading all documentation.
