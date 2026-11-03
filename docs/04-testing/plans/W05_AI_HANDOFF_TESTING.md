# Wave W5 Testing Specification — AI Sales Agent, Orchestration & Handoff

| Field       | Value                                                                                       |
| ----------- | ------------------------------------------------------------------------------------------- |
| Wave ID     | `W5`                                                                                        |
| Wave Title  | AI Sales Agent, Orchestration & Handoff                                                     |
| Cards       | `T-AI-01` through `T-AI-09`, `T-HAND-01`, `T-OBS-01`, `T-OBS-02`, `T-BIZ-05` (21 leaves)    |
| Status      | Canonical AI Testing Guide for Wave W5 Completion Gate                                      |
| Focus Areas | Orchestrator, prompt assembly, classifier, tool calling, 15 handoff triggers, AI Playground |

---

## 1. Automated Verification Suites

```bash
# 1. AI Orchestrator & Prompts Suite
pnpm --filter api test -- src/ai

# 2. Handoff Evaluator & Rules Suite
pnpm --filter api test -- src/handoff

# 3. Observability, Traces & Actions Suite
pnpm --filter api test -- src/observability

# 4. Monorepo Quality Gate
pnpm check:full
```

---

## 2. Invariant & Edge Case Testing Matrix

### A. Classifier & PII Shielding (`17_SECURITY_DESIGN.md` §8.2)

- **Prompt Data Protection**:
  - Inbound classification prompt receives message content only.
  - Zero customer phone numbers, physical addresses, or CRM identity tables dumped into model prompts.

### B. 15 Canonical Handoff Triggers (`06_AI_HUMAN_HANDOFF_RULES.md`)

- **Exhaustive Trigger Assertions**:
  1. `customer_explicit_request` (e.g. "parler à un humain", "service client") -> `HIGH`.
  2. `price_negotiation_limit` (discount request exceeds rule threshold) -> `HIGH`.
  3. `out_of_stock_alternative_rejected` -> `MEDIUM`.
  4. `delivery_delay_complaint` -> `HIGH`.
  5. `order_modification_request` on confirmed order -> `HIGH`.
  6. `return_or_refund_request` -> `HIGH`.
  7. `custom_product_inquiry` -> `MEDIUM`.
  8. `technical_product_question_unanswered` -> `MEDIUM`.
  9. `payment_dispute_or_issue` -> `HIGH`.
  10. `repeated_customer_frustration` (negative sentiment detection) -> `HIGH`.
  11. `lead_score_hot_threshold` crossed -> `HIGH`.
  12. `unsupported_language_or_dialect` -> `LOW`.
  13. `suspicious_fraud_indicators` -> `HIGH`.
  14. `catalog_conflict_detected` -> `MEDIUM`.
  15. `max_ai_turns_reached` (fallback loop prevention) -> `MEDIUM`.
- **State & Briefing Mutation**:
  - Handoff trigger MUST set conversation status to `HUMAN_REQUIRED`.
  - Attaches `handoff_context` briefing (`summary`, `reason`, `suggested_action`).

### C. AI Playground Sandbox (`13` §11)

- **Isolated Sandbox Execution**:
  - Playground requests set `is_test = true`.
  - Zero messages sent to Meta Graph API.
  - Role check: `EMPLOYEE` forbidden from accessing Playground (`403 forbidden`).

---

## 3. CLI Smoke & Integration Simulation

```bash
# 1. Simulate Handoff Trigger via AI Message Evaluator
curl -s -X POST http://localhost:3001/api/v1/ai/evaluate \
  -H "Authorization: Bearer $TOKEN" \
  -H "X-Business-Id: $BIZ_ID" \
  -H "Content-Type: application/json" \
  -d '{"conversationId":"$CONV_ID","message":"Je veux parler à un responsable immédiatement"}' | jq '{handoffTriggered, reason, priority}'

# 2. Playground Conversation Turn
curl -s -X POST http://localhost:3001/api/v1/ai/playground/turns \
  -H "Authorization: Bearer $TOKEN" \
  -H "X-Business-Id: $BIZ_ID" \
  -H "Content-Type: application/json" \
  -d '{"message":"Quel est le prix des baskets ?"}'
```

---

## 4. Wave W5 Completion Gate Checklist

- [ ] All 21 leaves in W5 marked `status: done`.
- [ ] Unit tests for all 15 handoff triggers pass at 100%.
- [ ] Prompt PII shielding invariants verified via test assertions.
- [ ] `pnpm check:full` exits 0.
