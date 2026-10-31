# Backlog Dependency Graph & Architectural Flow

This document provides a comprehensive view of task dependencies, execution order, parallel execution lanes, and dependency rationales across all 11 waves (W0–W10) of Phase 1 MVP.

---

## 1. High-Level Wave Progression

```mermaid
graph TD
    W0["W0: Bootstrap<br/><i>(Monorepo, DB, Kernel, CI)</i>"] --> W1["W1: Identity & Workspace<br/><i>(Auth, Tenancy, RBAC, Settings)</i>"]
    W1 --> W2["W2: Catalog & Knowledge<br/><i>(Products, Variants, Rules, RAG)</i>"]
    W1 --> W3["W3: Channels<br/><i>(Meta OAuth, Webhooks, Outbound)</i>"]
    W2 --> W5["W5: AI, Playground & Handoff<br/><i>(Orchestrator, Guardrails, Handoff)</i>"]
    W3 --> W4["W4: Inbox API & Scoring<br/><i>(Conversations, Lock, Realtime)</i>"]
    W4 --> W5
    W4 --> W6["W6: Orders & Customers<br/><i>(Orders, Reservations, Pipeline)</i>"]
    W5 --> W6
    W5 --> W7["W7: Notifications & Analytics<br/><i>(Alerts, Billing, Daily Rollup)</i>"]
    W6 --> W7
    W1 --> W8["W8: Web P0<br/><i>(Auth UI, Shell, Realtime Inbox, Onboarding)</i>"]
    W4 --> W8
    W5 --> W8
    W8 --> W9["W9: Web P1 / P2<br/><i>(Pipeline UI, Products UI, Analytics UI, Settings)</i>"]
    W6 --> W9
    W7 --> W9
    W0 --> W10["W10: Ops & Launch Gate<br/><i>(ECS Infra, Security Matrix, Launch Sign-off)</i>"]
    W8 --> W10
    W9 --> W10

    classDef done fill:#10b981,stroke:#059669,color:#ffffff;
    classDef inprog fill:#3b82f6,stroke:#2563eb,color:#ffffff;
    classDef pending fill:#64748b,stroke:#475569,color:#ffffff;

    class W0 done;
    class W1 inprog;
    class W2,W3,W4,W5,W6,W7,W8,W9,W10 pending;
```

---

## 2. Complete Task Dependency Graph

```mermaid
graph LR
    subgraph W0["Wave 0: Bootstrap (Done)"]
        T_BOOT_01["T-BOOT-01: Monorepo Scaffold"] --> T_BOOT_02["T-BOOT-02: Shared Kernel & Zod"]
        T_BOOT_02 --> T_BOOT_03["T-BOOT-03: Prisma DB Schema"]
        T_BOOT_03 --> T_BOOT_04["T-BOOT-04: Compose & Seed"]
        T_BOOT_01 --> T_BOOT_05["T-BOOT-05: CI Workflow"]
        T_BOOT_03 --> T_BOOT_06["T-BOOT-06: Nest Module Shells"]
    end

    subgraph W1["Wave 1: Identity & Workspace"]
        T_BOOT_06 --> T_AUTH_01["T-AUTH-01: Auth Endpoints"]
        T_AUTH_01 --> T_AUTH_02["T-AUTH-02: Tenancy & RBAC"]
        T_AUTH_02 --> T_AUTH_03["T-AUTH-03: Accept Invite"]
        T_AUTH_01 --> T_AUTH_04["T-AUTH-04: Auth Throttles"]
        T_AUTH_01 -.-> T_AUTH_05["T-AUTH-05: Forgot/Reset (Opt)"]
        T_AUTH_01 -.-> T_AUTH_06["T-AUTH-06: Google OAuth (Opt)"]
        T_AUTH_02 --> T_BIZ_01["T-BIZ-01: Business Create & Seed"]
        T_BIZ_01 --> T_AI_10["T-AI-10: AI Settings API"]
        T_BIZ_01 --> T_BIZ_02["T-BIZ-02: Business Profile"]
        T_BIZ_01 --> T_BIZ_03["T-BIZ-03: Members & Invites"]
        T_BIZ_01 --> T_BIZ_04["T-BIZ-04: Onboarding State"]
        T_AUTH_02 --> T_BIZ_06["T-BIZ-06: Feature Flags"]
        T_AUTH_02 --> T_BIZ_07["T-BIZ-07: Audit Logging"]
        T_BIZ_01 -.-> T_BIZ_08["T-BIZ-08: Soft-Delete (Opt)"]
    end

    subgraph W2["Wave 2: Catalog & Knowledge"]
        T_BIZ_01 --> T_CAT_01["T-CAT-01: Categories CRUD"]
        T_CAT_01 --> T_CAT_02["T-CAT-02: Products & Variants"]
        T_CAT_02 --> T_CAT_03["T-CAT-03: CSV Import/Export"]
        T_CAT_02 --> T_CAT_04["T-CAT-04: Catalog Re-index"]
        T_BIZ_01 --> T_KNOW_01["T-KNOW-01: Business Rules"]
        T_BIZ_01 --> T_KNOW_02["T-KNOW-02: Knowledge Docs"]
        T_KNOW_02 --> T_KNOW_03["T-KNOW-03: RAG pgvector Worker"]
        T_CAT_04 --> T_KNOW_03
    end

    subgraph W3["Wave 3: Channels"]
        T_BIZ_01 --> T_INT_01["T-INT-01: Meta OAuth & Accounts"]
        T_BIZ_06 --> T_INT_01
        T_INT_01 --> T_INT_02["T-INT-02: Webhooks & HMAC"]
        T_INT_02 --> T_INT_03["T-INT-03: Canonical Adapters"]
        T_INT_03 --> T_INT_04["T-INT-04: Outbound Pipeline"]
        T_INT_03 --> T_INT_05["T-INT-05: Media MinIO"]
        T_INT_03 --> T_INT_06["T-INT-06: WhatsApp Stub"]
        T_INT_01 --> T_INT_07["T-INT-07: Channel Health"]
    end

    subgraph W4["Wave 4: Inbox API & Scoring"]
        T_INT_03 --> T_CONV_01["T-CONV-01: Conversations List"]
        T_CONV_01 --> T_CONV_02["T-CONV-02: Thread & Actions"]
        T_CONV_02 --> T_CONV_03["T-CONV-03: State Machine"]
        T_CONV_03 --> T_CONV_04["T-CONV-04: Redis Concurrency Lock"]
        T_CONV_02 --> T_CONV_05["T-CONV-05: Timeline Projection"]
        T_CONV_02 --> T_CONV_06["T-CONV-06: Socket.IO Gateway"]
        T_AUTH_02 --> T_CONV_06
        T_CONV_02 --> T_LEAD_01["T-LEAD-01: Lead Scoring Engine"]
    end

    subgraph W5["Wave 5: AI, Playground & Handoff"]
        T_KNOW_03 --> T_AI_01["T-AI-01: AI Sales Orchestrator"]
        T_CAT_02 --> T_AI_01
        T_CONV_04 --> T_AI_01
        T_AI_01 --> T_AI_02["T-AI-02: Guardrails & Safety"]
        T_AI_01 --> T_AI_03["T-AI-03: Prompt Versions"]
        T_AI_01 --> T_AI_04["T-AI-04: Reply Modes Engine"]
        T_AI_10 --> T_AI_04
        T_AI_01 --> T_AI_05["T-AI-05: Model Fallback"]
        T_AI_01 --> T_HAND_01["T-HAND-01: 15 Handoff Triggers"]
        T_AI_01 --> T_AI_06["T-AI-06: Playground Sandbox"]
        T_AI_06 --> T_AI_07["T-AI-07: Playground Gate G4"]
        T_BIZ_04 --> T_BIZ_05["T-BIZ-05: Live Activation Gate"]
        T_CAT_02 --> T_BIZ_05
        T_INT_01 --> T_BIZ_05
        T_AI_07 --> T_BIZ_05
        T_AI_04 --> T_AI_08["T-AI-08: On-Demand Suggest"]
        T_AI_02 --> T_AI_09["T-AI-09: Golden Eval Benchmark"]
        T_AI_01 --> T_OBS_01["T-OBS-01: AI Decision Traces"]
        T_AI_04 --> T_OBS_02["T-OBS-02: AI Message Feedback"]
    end

    subgraph W6["Wave 6: Orders & Customers"]
        T_CONV_02 --> T_ORD_01["T-ORD-01: Orders Lifecycle"]
        T_ORD_01 --> T_ORD_02["T-ORD-02: Stock Reservation Worker"]
        T_ORD_01 --> T_ORD_03["T-ORD-03: Orders Query API"]
        T_ORD_01 --> T_ORD_04["T-ORD-04: Manual Order Draft"]
        T_LEAD_01 --> T_CONV_07["T-CONV-07: Pipeline Board API"]
        T_ORD_01 --> T_CONV_07
        T_HAND_01 --> T_HAND_02["T-HAND-02: Purchase Handoff Flow"]
        T_ORD_01 --> T_HAND_02
        T_INT_03 --> T_CUST_01["T-CUST-01: Customer Identity Linking"]
        T_CUST_01 --> T_CUST_02["T-CUST-02: Customer Profile & VIP"]
        T_CUST_01 --> T_CUST_03["T-CUST-03: Customer Manual Merge"]
        T_BIZ_07 --> T_CUST_03
        T_CUST_01 --> T_CUST_04["T-CUST-04: Customer Lifecycle Stage"]
        T_ORD_01 --> T_CUST_04
    end

    subgraph W7["Wave 7: Notifications, Usage & Analytics"]
        T_HAND_01 --> T_NOTIF_01["T-NOTIF-01: Notification Dispatcher"]
        T_LEAD_01 --> T_NOTIF_01
        T_NOTIF_01 --> T_NOTIF_02["T-NOTIF-02: In-App Notification Feed"]
        T_CONV_06 --> T_NOTIF_02
        T_BIZ_01 --> T_BILL_01["T-BILL-01: Billing Plans Seed"]
        T_BILL_01 --> T_BILL_02["T-BILL-02: Usage Events Metering"]
        T_AI_01 --> T_BILL_02
        T_BILL_02 --> T_BILL_03["T-BILL-03: Quota Enforcement"]
        T_OBS_01 --> T_BILL_04["T-BILL-04: AI Usage & Costs"]
        T_ORD_01 --> T_ANL_01["T-ANL-01: Daily Analytics Rollup"]
        T_HAND_01 --> T_ANL_01
        T_ANL_01 --> T_ANL_02["T-ANL-02: Analytics Dashboard API"]
    end

    subgraph W8["Wave 8: Web P0 (Auth, Shell, Inbox, Onboarding)"]
        T_AUTH_01 --> T_WEB_01["T-WEB-01: Web Auth UI"]
        T_AUTH_03 --> T_WEB_01
        T_WEB_01 --> T_WEB_02["T-WEB-02: Web App Shell"]
        T_BILL_03 --> T_WEB_02
        T_NOTIF_02 --> T_WEB_02
        T_WEB_02 --> T_WEB_03["T-WEB-03: Web Realtime Inbox UI"]
        T_CONV_02 --> T_WEB_03
        T_ORD_01 --> T_WEB_03
        T_AI_08 --> T_WEB_03
        T_WEB_02 --> T_WEB_04["T-WEB-04: Web Onboarding Wizard"]
        T_BIZ_04 --> T_WEB_04
        T_AI_06 --> T_WEB_04
        T_INT_01 --> T_WEB_04
        T_CAT_03 --> T_WEB_04
        T_WEB_01 --> T_WEB_05["T-WEB-05: next-intl Catalogs"]
        T_WEB_03 --> T_WEB_06["T-WEB-06: Playwright E2E Path"]
        T_WEB_04 --> T_WEB_06
    end

    subgraph W9["Wave 9: Web P1 / P2"]
        T_WEB_02 --> T_WEB_07["T-WEB-07: Web Pipeline Board"]
        T_CONV_07 --> T_WEB_07
        T_WEB_02 --> T_WEB_08["T-WEB-08: Web Products UI"]
        T_CAT_02 --> T_WEB_08
        T_WEB_02 --> T_WEB_09["T-WEB-09: Web Analytics Dashboard"]
        T_ANL_02 --> T_WEB_09
        T_WEB_02 --> T_WEB_10["T-WEB-10: Web Settings Tabs"]
        T_KNOW_01 --> T_WEB_10
        T_BIZ_03 --> T_WEB_10
        T_BILL_03 --> T_WEB_10
        T_AI_10 --> T_WEB_10
    end

    subgraph W10["Wave 10: Ops & Launch Gate"]
        T_BOOT_04 --> T_OPS_01["T-OPS-01: ECS Fargate Topology"]
        T_OPS_01 --> T_OPS_02["T-OPS-02: CI/CD Deploy Workflow"]
        T_BOOT_05 --> T_OPS_02
        T_OPS_01 --> T_OPS_03["T-OPS-03: Health & CloudWatch"]
        T_AUTH_02 --> T_OPS_04["T-OPS-04: Security Matrix Tests"]
        T_INT_04 --> T_OPS_05["T-OPS-05: Fault Injection Tests"]
        T_AI_05 --> T_OPS_05
        T_OPS_03 --> T_OPS_06["T-OPS-06: Ops Runbook"]
        T_WEB_06 --> T_OPS_07["T-OPS-07: Launch Gate Sign-off"]
        T_OPS_04 --> T_OPS_07
        T_OPS_05 --> T_OPS_07
    end
```

---

## 3. Parallel Execution Lanes

While the serial `CURSOR.md` path executes tasks topologically, multiple independent sub-trees can be executed in parallel once their dependencies are satisfied:

| Lane       | Focus Area         | Entry Task  | Unlocking Dependency     | Independent Path                                         |
| ---------- | ------------------ | ----------- | ------------------------ | -------------------------------------------------------- |
| **Lane A** | Knowledge & RAG    | `T-KNOW-01` | `T-BIZ-01`               | `T-KNOW-01` -> `T-KNOW-02` -> `T-KNOW-03`                |
| **Lane B** | Catalog Management | `T-CAT-01`  | `T-BIZ-01`               | `T-CAT-01` -> `T-CAT-02` -> `T-CAT-03` -> `T-CAT-04`     |
| **Lane C** | Meta Channels      | `T-INT-01`  | `T-BIZ-01`, `T-BIZ-06`   | `T-INT-01` -> `T-INT-02` -> `T-INT-03` -> `T-INT-04..07` |
| **Lane D** | Customer CRM       | `T-CUST-01` | `T-INT-03`               | `T-CUST-01` -> `T-CUST-02` -> `T-CUST-03` -> `T-CUST-04` |
| **Lane E** | Production Infra   | `T-OPS-01`  | `T-BOOT-04`              | `T-OPS-01` -> `T-OPS-02` -> `T-OPS-03` -> `T-OPS-06`     |
| **Lane F** | Frontend Web P0    | `T-WEB-01`  | `T-AUTH-01`, `T-AUTH-03` | `T-WEB-01` -> `T-WEB-05`                                 |

---

## 4. Detailed Dependency Rationales

| Dependent Task | Required Dependency                            | Architectural & Technical Rationale                                                                 |
| -------------- | ---------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `T-AUTH-02`    | `T-AUTH-01`                                    | Guards require active JWT session extraction and user resolution from auth endpoints.               |
| `T-AUTH-03`    | `T-AUTH-02`                                    | Invitation acceptance creates workspace memberships that must satisfy TenancyGuard checks.          |
| `T-BIZ-01`     | `T-AUTH-02`                                    | Provisioning a business workspace assigns active Owner role which requires RBAC guards.             |
| `T-AI-10`      | `T-BIZ-01`                                     | AI agent configuration attaches to the seeded AI agent and settings created with workspace.         |
| `T-CAT-01`     | `T-BIZ-01`                                     | Categories must be strictly scoped to an existing tenant business workspace.                        |
| `T-CAT-02`     | `T-CAT-01`                                     | Products and variants require category hierarchy for classification and catalog organization.       |
| `T-KNOW-03`    | `T-KNOW-02`, `T-CAT-04`                        | Vector search worker indexes chunks from both knowledge documents and catalog products.             |
| `T-INT-01`     | `T-BIZ-01`, `T-BIZ-06`                         | Channel accounts connect to tenant business and check feature flags (`whatsapp_enabled`).           |
| `T-INT-02`     | `T-INT-01`                                     | Webhook verification requires matching incoming account ID to stored channel accounts.              |
| `T-INT-03`     | `T-INT-02`                                     | Inbound normalization parses raw webhook events saved in `integration_events`.                      |
| `T-CONV-01`    | `T-INT-03`                                     | Inbox conversation listing presents threads generated by normalized inbound messages.               |
| `T-CONV-04`    | `T-CONV-03`                                    | Concurrency locking wraps state machine transitions during turn processing.                         |
| `T-AI-01`      | `T-KNOW-03`, `T-CAT-02`, `T-CONV-04`           | AI orchestrator executes tool calls querying vector RAG, checks variant stock, and holds turn lock. |
| `T-HAND-01`    | `T-AI-01`                                      | Handoff triggers intercept orchestrator output and trigger human escalation with briefing.          |
| `T-ORD-01`     | `T-CONV-02`                                    | Order drafting and confirmation link directly to active conversation threads.                       |
| `T-HAND-02`    | `T-HAND-01`, `T-ORD-01`                        | Purchase handoff flow collects customer details, reserves stock, and creates pending order.         |
| `T-NOTIF-01`   | `T-HAND-01`, `T-LEAD-01`                       | Notification dispatcher triggers on handoffs and hot lead discoveries.                              |
| `T-BILL-02`    | `T-BILL-01`, `T-AI-01`                         | Usage metering records token counts and messages from AI orchestrator against plan limits.          |
| `T-ANL-01`     | `T-ORD-01`, `T-HAND-01`                        | Daily analytics aggregates GMV from orders and resolution rates from handoffs.                      |
| `T-WEB-01`     | `T-AUTH-01`, `T-AUTH-03`                       | Web authentication UI calls register, login, and invite acceptance API endpoints.                   |
| `T-WEB-02`     | `T-WEB-01`, `T-BILL-03`, `T-NOTIF-02`          | App shell mounts navigation, tenant switcher, usage widget, and notification popover.               |
| `T-WEB-03`     | `T-WEB-02`, `T-CONV-02`, `T-ORD-01`, `T-AI-08` | Realtime inbox provides thread actions, draft approvals, suggest triggers, and order drawer.        |
| `T-WEB-06`     | `T-WEB-03`, `T-WEB-04`                         | Playwright E2E suite tests user journey from signup to inbox takeover and order confirmation.       |
| `T-OPS-07`     | All required tasks                             | Final launch gate sign-off verifies 100% of Must functional requirements are complete.              |
