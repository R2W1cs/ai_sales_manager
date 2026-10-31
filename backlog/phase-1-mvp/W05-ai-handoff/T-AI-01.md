---
id: T-AI-01
parent: T-AI-01
wave: W5
status: done
optional: false
depends:
  - T-KNOW-03
  - T-CAT-02
  - T-CONV-04
fs:
  - FS-AI-01
read:
  - docs/10_engineering/15_AI_ARCHITECTURE/01-orchestrator-intent-tools.md
  - docs/00_product/05_AI_BEHAVIOR_SPECIFICATION/01-personality-language-pipeline.md
  - docs/30_execution/32_FEATURE_SPECIFICATIONS.md
files:
  - apps/api/src/ai/orchestrator/orchestrator.service.ts
  - apps/api/src/ai/prompts/prompt-builder.service.ts
  - apps/api/src/ai/tools/catalog-search.tool.ts
  - apps/api/src/ai/tools/stock-check.tool.ts
  - apps/api/src/ai/tools/policy-lookup.tool.ts
  - apps/api/src/ai/ai.module.ts
done_cmd: pnpm --filter api test -- src/ai
next: T-AI-02
---

# Task: AI Sales Agent core orchestrator & tool execution pipeline

## 1. Objective & Value

Implement core AI Sales Agent turn orchestrator with Vercel AI SDK, tool loop agent, Tunisian Derja prompt engineering, and strict catalog grounding.

**Why this exists**: Deliver autonomous sales conversations that answer product inquiries, check stock, look up policies, and guide shoppers toward purchase without hallucinations.

---

## 2. Scope Boundaries

### Modify (Allowlisted paths)

- `apps/api/src/ai/orchestrator.*`
- `apps/api/src/ai/prompt-builder.*`
- `apps/api/src/ai/tools/`
- `apps/api/src/ai/ai.module.ts`

### Do Not Modify (Forbidden boundaries)

- `apps/web/`

---

## 3. Technical Contract & Interfaces

- `OrchestratorService.executeTurn(conversationId, inboundMessage)`
- Tools Provided: `searchCatalog({ query, category })`, `checkStock({ variantId })`, `getStorePolicy({ type })`, `requestHumanHandoff({ reason, briefing })`
- Model Pinned: Claude 3.5 Sonnet / GPT-4o with temperature 0.2

---

## 4. Invariants & Security Guardrails

- 🔒 **Zero Grounding Violation**: Agent must never invent prices, stock levels, or delivery fees not returned by tools.
- 🛡️ **Token Logging**: Record prompt tokens, completion tokens, and latency in `ai_usage` table for every turn.

---

## 5. Implementation Steps

1. Implement `PromptBuilderService` assembling merchant tone, rules, RAG context, and history.
2. Implement deterministic tools for catalog search, stock checking, and policy lookups.
3. Implement `OrchestratorService` executing AI tool loop and saving generated response.
4. Author unit/integration tests mocking AI provider and verifying tool call sequence.

---

## 6. Acceptance Criteria & Test Scenarios

- [ ] **Grounded Response**: Product inquiry returns verified catalog price and stock.
- [ ] **Tool Loop**: Orchestrator calls search and stock tools before outputting answer.
- [ ] **Token Recording**: Logs token counts and model ID in `ai_usage` table.

---

## 7. Verification Commands

```bash
# 1. Run unit/integration tests
pnpm --filter api test -- src/ai

# 2. Run full workspace check
pnpm check:full
```

---

## 8. Human Contribution (What to do from your side)

- **🔑 Environment variables**: Provide `AI_GATEWAY_API_KEY` in `.env`.
- **🧪 Manual QA & Smoke test**: Ask AI in Tunisian Derja ('9addeh el robe noire?'); verify grounded response with correct price and stock.
- **👁️ Review & Sign-off**: Verify zero tolerance for hallucinated prices or unverified discounts.

---

## 9. Expected Deliverables

AI orchestrator service, tool definitions, prompt builder, and unit tests in `apps/api/src/ai`.
