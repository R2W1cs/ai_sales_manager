# 12 — Database Design

Canonical PostgreSQL schema, Prisma models, enums, relationships, JSONB contracts, vector index, and migration strategy.

> [!IMPORTANT]
> This spec was split into modular domain parts for AI context efficiency; the part files are authoritative.

## Document Parts

- [`01-rules-enums-er.md`](12_DATABASE_DESIGN/01-rules-enums-er.md): **Database rules, multi-tenancy conventions, domain enums & ER module views**
  - _Guidance:_ Read if reviewing naming conventions, tenancy patterns, soft delete policies, or global enum definitions.
- [`02-identity-catalog-inventory.md`](12_DATABASE_DESIGN/02-identity-catalog-inventory.md): **Schema: Identity, workspaces, members, products, variants, images & stock**
  - _Guidance:_ Read if implementing or querying users, businesses, memberships, catalog products, or inventory models.
- [`03-customers-messaging-integrations.md`](12_DATABASE_DESIGN/03-customers-messaging-integrations.md): **Schema: Customers, identities, channel integrations, conversations & messages**
  - _Guidance:_ Read if implementing or querying customer profiles, social channels, conversation threads, or message events.
- [`04-orders-knowledge-ai-schema.md`](12_DATABASE_DESIGN/04-orders-knowledge-ai-schema.md): **Schema: Orders, order items, knowledge chunks, embeddings & AI observability**
  - _Guidance:_ Read if implementing or querying orders, checkout data, RAG embeddings, AI turn logs, or evaluations.
- [`05-billing-notifications-audit.md`](12_DATABASE_DESIGN/05-billing-notifications-audit.md): **Schema: Billing subscriptions, feature flags, daily analytics, notifications & audit**
  - _Guidance:_ Read if implementing or querying billing plans, feature flags, aggregate analytics, notifications, or audit logs.
- [`06-jsonb-migrations-seeds.md`](12_DATABASE_DESIGN/06-jsonb-migrations-seeds.md): **Stored JSONB contracts, integrity checklist, pgvector SQL, migrations & seeds**
  - _Guidance:_ Read if validating JSONB payload structures, creating raw pgvector HNSW migrations, or authoring seeds.

## Agent Navigation Guidance

When implementing specific tasks, prefer reading only the exact part file(s) in `12_DATABASE_DESIGN/` required for your domain (see bullets above) rather than loading all documentation.
