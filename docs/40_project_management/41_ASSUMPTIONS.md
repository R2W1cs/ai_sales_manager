# 41 — Assumptions

| Field           | Value                                                                                      |
| --------------- | ------------------------------------------------------------------------------------------ |
| Document ID     | `41_ASSUMPTIONS`                                                                           |
| Status          | Approved — canonical for working answers where the Brain Dump was silent or docs disagreed |
| Owner           | Product / Founder                                                                          |
| Audience        | Engineers, product, AI coding agents                                                       |
| Depends on      | `00_PROJECT_OVERVIEW.md` §15–16, owning OQ tables, `40_DECISIONS.md`                       |
| Consumed by     | `43_CHANGELOG.md`, launch/legal reviews, coding agents resolving OQ-*                      |
| Upstream source | `docs/AI_Sales_Agent_Brain_Dump.md` (gaps only)                                            |

---

## 1. Purpose and scope

This document is **canonical for what we are assuming until the founder or a revisit trigger locks it**. It does **not** invent product behaviour.

If the Brain Dump already decided it, it is an `ADR-*` (`40`). If we knowingly shipped a shortcut, it is `42_TECH_DEBT.md`. If a spec still has an OQ table, **that table remains the full text**; this file is the **index**, the **conflict resolutions**, and the **numbering rules**.

**In scope:** assumption id (= `OQ-*`), working answer in one line, owner, revisit, conflict winners.

**Out of scope, and where it lives instead:**

| Topic                                  | Canonical location         |
| -------------------------------------- | -------------------------- |
| Locked architecture / stack / channels | `40_DECISIONS.md`          |
| Known shortcuts and repayment          | `42_TECH_DEBT.md`          |
| Full OQ rationale                      | The owning spec’s OQ table |
| Launch-gate checklist                  | `03` §10                   |
| Calendar math                          | `31`                       |

**Conflict:** Brain Dump wins over these docs (`00` §15.2). Among docs, the **owning** canonical file wins (handoff → `06`, FRs → `01`, widgets → `23`). This file records the winner; then the loser is patched.

---

## 2. How to add or change

1. Add or edit the OQ on the **owning** spec.
2. Add or edit the row here if it is a Brain Dump gap, a founder confirm, or a cross-doc conflict.
3. Never reuse an `OQ-*` number. If two files used the same number, **retag the newer file** (see §4).
4. Promoting to an ADR: lock in `40`, update the canonical engineering/design doc, then mark the OQ “promoted” here.
5. Append `43_CHANGELOG.md`.

Agents must not treat a working answer as a new endpoint, widget, or status.

---

## 3. Numbering

`OQ-*` is the only id. There is no second `A-*` scheme.

| Range                   | Typical home                                                              |
| ----------------------- | ------------------------------------------------------------------------- |
| OQ-01–05                | `00`                                                                      |
| OQ-06–17, OQ-24 (merge) | `01` / `02`                                                               |
| OQ-18–24                | `03`                                                                      |
| OQ-25–29                | `04`                                                                      |
| OQ-30–38                | `05` / `06`                                                               |
| OQ-39–75                | `10`–`18`, `20`–`21`                                                      |
| OQ-76–77                | `21`                                                                      |
| **OQ-78–81**            | **`31` calendar / capacity** (retagged; do not use OQ-31–34 for schedule) |

---

## 4. Conflicts resolved here

These were real disagreements. **Winner is binding.** Loser files are patched to match.

| #       | Collision                                                                                                                                                                    | Winner                                    | Why                                       |
| ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- | ----------------------------------------- |
| **C-1** | `01` OQ-09 implied a **7-day stale-handoff warning in MVP**. `06` / `14` say auto-close at **30 days** if no pending order; **7-day warning = Phase 2**.                     | `06` (handoff canonical)                  | `01` deferred the assumption to this file |
| **C-2** | `05` §14.2 / OQ-33 said generate suggestions **on conversation open**. `01` OQ-16 + FR-AI-020a + `23` / `30` / `32` say **explicit `[Suggérer]`**, not on open or keystroke. | `01` OQ-16 + `23`                         | UI contract and cost control frozen later |
| **C-3** | `31` reused **OQ-31–34** already used in `05`.                                                                                                                               | `05` keeps OQ-31–34. `31` is **OQ-78–81** | Numbers are never reused                  |

No Brain Dump contradiction is on file. If one appears, record it here and follow the Brain Dump.

---

## 5. Founder must confirm (blocks money or public name)

Working answers exist so engineering is not stuck. They are **not** ADRs.

| OQ            | Working answer                                                                                          | Owner           | Revisit                      |
| ------------- | ------------------------------------------------------------------------------------------------------- | --------------- | ---------------------------- |
| OQ-02         | SaaS charge may be TND or provider EUR/USD until a local PSP. **Chrome stays `DT`.** Catalog/API `TND`. | Founder         | Phase 1 launch               |
| OQ-04 / OQ-72 | Targeted erasure on request (`17` §8.3). **No** automatic 24-month purge in MVP.                        | Founder / Legal | Before first paying customer |
| OQ-18         | Design partners: free **plan with real limits**. No bypass path in code.                                | Founder         | Before first onboarding      |
| OQ-76         | UI string **"AI Sales Agent"** is a descriptor, not the commercial brand.                               | Founder         | Pre-launch GTM               |
| OQ-78         | `wk 1` Monday **unset** (`31` §2.2).                                                                    | Founder         | Before `M0`                  |
| OQ-79         | Schedule baselines **2 EE**; rescale table in `31` §3.2.                                                | Founder         | Before `M0`                  |
| OQ-80         | Founder is **not** counted as an EE.                                                                    | Founder         | Before `M0`                  |
| OQ-27         | Phase 4 PSP for Tunisia: **undecided** at phase start.                                                  | Founder         | Phase 4                      |

---

## 6. Build-now product assumptions

Brain Dump was silent or underspecified. Implement the working answer until the revisit.

| OQ    | Working answer                                                                                                           | Owner        | Revisit                     | Home            |
| ----- | ------------------------------------------------------------------------------------------------------------------------ | ------------ | --------------------------- | --------------- |
| OQ-01 | Merchant UI `fr-TN` / `ar-TN` / `en`. Customer AI language per business.                                                 | Product      | Frozen                      | `00`, `20`      |
| OQ-03 | One primary agent per business in MVP.                                                                                   | Product      | Phase 3                     | `00`            |
| OQ-05 | Platform owns the golden set; merchants send `ai_feedback`.                                                              | AI           | Phase 2                     | `00`            |
| OQ-07 | `draft_only` is Should; may omit the radio (`23`).                                                                       | Product      | `M4` / `31`                 | `01`            |
| OQ-08 | Employees never see AI cost.                                                                                             | Product      | Phase 2                     | `01`, `ADR-022` |
| OQ-09 | Auto-close at **30 days** with no pending order, including `HUMAN_REQUIRED`. No 7-day warning in MVP.                    | Product      | Phase 2                     | `06`, `14`      |
| OQ-10 | Soft-delete **releases seats immediately**.                                                                              | Product      | Phase 2                     | `01`            |
| OQ-11 | Edited-then-approved draft counts as **AI-sent** with an edit flag.                                                      | Product      | Phase 2                     | `02`            |
| OQ-12 | Reopen after `RESOLVED` → `AI_ACTIVE` if `ai_enabled` and no pending order; else `HUMAN_REQUIRED`.                       | Engineering  | `M5`                        | `02`, `14`      |
| OQ-13 | Employee **may cancel** a pending order with a required reason.                                                          | Product      | Phase 2                     | `02`            |
| OQ-14 | **No** system message that a human took over; the human just replies.                                                    | Product      | Phase 2                     | `02`            |
| OQ-15 | Ship documented lead-score defaults; tune after 1,000 conversations.                                                     | Product      | Phase 2                     | `01`, `14`      |
| OQ-16 | Suggestions **on explicit click only** in MVP. Not on thread open.                                                       | AI / Product | Phase 2 cost                | `01`, `23`      |
| OQ-17 | Read-only pipeline **ships** at launch.                                                                                  | Product      | `M6`                        | `01`            |
| OQ-19 | Launch gate = **3** design partners; Phase 1 exit = **10** paying.                                                       | Product      | Launch                      | `03`, `04`      |
| OQ-20 | Strong H2 + loud payment demand → **re-plan Phase 4 earlier**, do not squeeze into Phase 1.                              | Founder      | Phase 1 review              | `03`, `04`      |
| OQ-21 | Pipeline includes **manual** orders (revenue view). Attribution stays in analytics.                                      | Product      | `M6`                        | `03`            |
| OQ-22 | WhatsApp counts against the **same** message allowance in MVP; meter separately internally.                              | Founder      | Phase 1 review              | `03`            |
| OQ-23 | Phase 2 template drafts: order-confirmation follow-up + re-engagement. **No authoring UI** in MVP.                       | Product      | `M3` (channel work)         | `03`            |
| OQ-24 | Auto-match platform id; auto-link **verified** phone; Owner/Admin manual merge; **no** fuzzy name merge.                 | Engineering  | First cross-channel partner | `01`, `03`      |
| OQ-30 | Instruct Latin-script Tunisian Arabic **explicitly**; verify on golden set.                                              | AI           | Golden set                  | `05`            |
| OQ-31 | Low-confidence streak **resets on first successful turn**.                                                               | AI           | Post-launch                 | `05`            |
| OQ-32 | LLM call timeout **15s** (inside 30s p95).                                                                               | Engineering  | Load test                   | `05`, `15`      |
| OQ-33 | **Superseded by OQ-16.** Click only.                                                                                     | Product      | —                           | `05` patched    |
| OQ-34 | Golden set starts at **50**, grows from production feedback; `11` §9.7 minima still apply.                               | AI           | Continuous                  | `05`, `15`      |
| OQ-35 | Bulk threshold defaults qty ≥ 5 or ≥ 500 DT; override via rules.                                                         | Product      | 1,000 conv.                 | `06`            |
| OQ-36 | Store `ai_timeout` **separate** from `integration_failure` in KPI breakdown.                                             | Analytics    | Launch                      | `06`            |
| OQ-37 | VIP + complaint → **one** `ESCALATION` `critical`; `also_matched` includes `vip_customer`.                               | Product      | Launch                      | `06`            |
| OQ-38 | Employees **can confirm** orders (FR-HAND-010). Sensitive threads: Owner/Admin-first in UI, not a hard API block in MVP. | Product      | `17` matrix                 | `06`            |
| OQ-81 | Hold the **2-week** `31` buffer; do not spend it on a third EE ramp.                                                     | Product      | `M5`                        | `31`            |

---

## 7. Engineering working answers (pointer)

Full text stays on the owning spec. Do not re-litigate in PRs.

| Home | OQs                                                                                                                                 |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `10` | OQ-39 three Fargate services; OQ-41 `score_lead` on `ai` queue; OQ-42 no outbox table                                               |
| `11` | OQ-40 Prisma 7 gate; OQ-43 UUID v4; OQ-44 Next on ECS; OQ-45 Zod 4; OQ-46–48 models (**ADR-018**); OQ-53 no second APM              |
| `12` | OQ-55 HNSW; OQ-56 `delivery_status` column                                                                                          |
| `13` | OQ-56 same                                                                                                                          |
| `14` | OQ-59 own queues; OQ-60 suggest shares conversation lock; OQ-61 no scoring denorm                                                   |
| `15` | OQ-62 streak from traces; OQ-63 breaker; OQ-64 no unbounded tool loop                                                               |
| `16` | OQ-65 Graph `v23.0`; OQ-66 QPS 20/10; OQ-67 HMAC = app secret; OQ-68 SM; OQ-69 no identity_status                                   |
| `17` | OQ-54/70 RLS off (**ADR-005**); OQ-57 no `business_id` in access JWT; OQ-58 no access denylist; OQ-71 no field-level PII encryption |
| `18` | OQ-49 apex domain / ACM                                                                                                             |
| `20` | OQ-73 lime `#A3E635`; OQ-74 no dark workspace; OQ-75 Lucide                                                                         |
| `21` | OQ-77 onboarding illustration-minimal                                                                                               |
| `04` | OQ-25–29 Phase 2–5 sequencing — not Phase 1 build blockers                                                                          |

OQ-06 (encryption) = OQ-71: volume at rest + SM for provider tokens; field-level PII is `42`.

---

## 8. Promoted to ADR (do not re-open as OQ)

| Was                                                                                                                                                                                             | Now                                  |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| Modular monolith, Meta Option C, RLS off, ECS ×3, REST, pgvector, Socket.IO, Base UI not Radix, pinned models, G4 ≠ `reply_mode`, four KPIs, Owner `/usage`, no unofficial WhatsApp, no NAT/K8s | `ADR-001`–`024` in `40_DECISIONS.md` |

---

## 9. References

- `docs/AI_Sales_Agent_Brain_Dump.md` — highest authority; gaps only
- `docs/00_product/00_PROJECT_OVERVIEW.md` §15.3, §16
- `docs/40_project_management/40_DECISIONS.md`
- `docs/40_project_management/42_TECH_DEBT.md`
- Owning OQ tables in `01`–`06`, `10`–`18`, `20`–`21`, `31`
