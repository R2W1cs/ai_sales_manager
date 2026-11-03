## 9. LLM routing — exact model IDs

This section is the decision the Brain Dump left as “Primary: OpenAI.” It is now pinned for dialect **and** for tools.

### 9.0 API id verification (2026-08-13)

These strings are **provider API ids**, not Cursor chat slugs. Checked against first-party docs on **2026-08-13**. Do not substitute a marketing name, a ChatGPT label, or a getting-started example that drifted.

| Role                 | API id                   | First-party                                                                                                                                 | Notes                                                                                                                      |
| -------------------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Primary reply        | `gemini-3.5-flash`       | [Gemini 3.5 Flash](https://ai.google.dev/gemini-api/docs/models/gemini-3.5-flash) — model code `gemini-3.5-flash`, stable, function calling | Google getting-started may show `gemini-3.6-flash`. **Do not auto-upgrade.** New Flash ids need a golden-set pass (OQ-48). |
| Fallback 1           | `gpt-5.6-terra`          | [OpenAI Models](https://developers.openai.com/api/docs/models)                                                                              | Balanced tier.                                                                                                             |
| Fallback 2           | `claude-sonnet-5`        | [Claude Sonnet 5](https://docs.anthropic.com/en/docs/about-claude/models/whats-new-sonnet-5)                                                | Dateless id is the pinned snapshot for this generation.                                                                    |
| Classifier / summary | `gpt-5.6-luna`           | OpenAI Models                                                                                                                               | High-volume / cheap tier.                                                                                                  |
| Embeddings           | `text-embedding-3-small` | OpenAI embeddings                                                                                                                           | 1536-d; do not use `large` until NFR-PERF-06 fails.                                                                        |

**Forbidden aliases (they are not our pins):**

| Do not send                                                   | Why                                                         |
| ------------------------------------------------------------- | ----------------------------------------------------------- |
| `gpt-5.6`                                                     | Alias **routes to `gpt-5.6-sol`** (flagship price/latency). |
| `gpt-5.6-sol`                                                 | Overkill for a 2–3 sentence DM.                             |
| `gemini-3-flash-preview` / `gemini-3.6-flash`                 | Preview or newer Flash — not this pin.                      |
| `claude-sonnet-4-5`, `claude-sonnet-4.5`, `claude-sonnet-4-6` | Previous generation ids.                                    |
| Cursor names (`claude-sonnet-5-thinking-*`, etc.)             | Not provider API ids.                                       |

Call options: OpenAI `reasoning.effort = none` (or `low` if `none` is unavailable). Gemini: do not enable high thinking on the DM hot path.

### 9.1 The language problem

Inbound DMs in this market are routinely:

- Tunisian Arabic in **Arabic script**
- **Arabizi / Tunizi** (Latin): `b9adech`, `nheb nechri`, `famma hoodie M?` (3=ع, 7=ح, 9=ق, 5=خ, 8=غ)
- French
- Code-switching in one message

The sales agent must **understand Arabizi** and **reply in the same script** (`05` §4). A model that “speaks Arabic” but answers in MSA or switches script is a product failure, not a style issue.

### 9.2 Evidence (do not re-litigate from Twitter)

| Source                                      | What it measured                                                                                     | Winner                                                                                                                                                                                                  | Caveat                                                                               |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| **TounsiBench** (EMNLP 2025)                | Generate replies **in Tunisian Arabic**; dialectal adherence 0–2                                     | **GPT-4o** (1.95) ahead of GPT-4o-mini (1.87). Most other models drift to MSA                                                                                                                           | Gemini and Claude were **not** in the 10-model set                                   |
| **Mahdi 2025** (arXiv 2511.16683, Nov 2025) | **Tunizi → Arabic script** transliteration, Tunizi translation, sentiment. This is the Arabizi paper | **Gemini 2.5 Flash** best transliteration (CER **0.15**) and best translation (METEOR 0.45). Claude Sonnet 4.5 second (CER 0.19). **GPT-4o Mini** CER 0.26 and **normalizes Tunizi into MSA / English** | n=100, indicative; GPT-4o _full_ was not tested — mini is the weak OpenAI data point |
| **ESPRIT-Derja-Qwen3-8B / Labess-7B**       | Fine-tuned Derja / Arabizi                                                                           | Conversational dialect                                                                                                                                                                                  | Authors warn **factual answers are unreliable**. Unusable as a grounded sales agent  |

**Product constraint the papers do not measure:** tool calling, structured outputs, and “never invent a price.” That is why we do **not** use a Derja-finetuned 8B as primary, and why the classifier stays on a model with excellent JSON/tools.

### 9.3 Decision — split by stage

Customer-facing Derja/Arabizi is the Gemini family (only published winner on **Tunizi**). Grounding-critical structured work stays on OpenAI (TounsiBench winner’s successor, best function-calling ecosystem, Brain Dump primary provider). One extra cheap classify call is already in the pipeline (`05` §5).

| Stage                                                                  | Model id                     | Provider  | Why this id                                                                                                                                                                                                                                                                                |
| ---------------------------------------------------------------------- | ---------------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Response Generator** (customer-visible reply, tool-using sales turn) | **`gemini-3.5-flash`**       | Google    | Successor of Gemini 2.5 Flash, the best published **Arabizi/Tunizi** model. Flash-class latency fits p95 < 30s. Function calling is supported. Do **not** use Pro/reasoning-heavy variants on the DM hot path.                                                                             |
| **Fallback 1** (same stage, on Gemini error/timeout)                   | **`gpt-5.6-terra`**          | OpenAI    | Successor of GPT-4o, TounsiBench #1 for **generating** Tunisian. Terra is the cost/quality balance (`gpt-5.6-sol` is flagship price; `luna` is the cheap tier). `reasoning.effort = none` (or `low` if none unavailable) so we do not spend the latency budget on hidden chain-of-thought. |
| **Fallback 2**                                                         | **`claude-sonnet-5`**        | Anthropic | Verified API id (§9.0). Tunizi paper used Sonnet **4.5** as second place — 5 is the current Sonnet we call, not a guessed rename.                                                                                                                                                          |
| **Intent classifier**                                                  | **`gpt-5.6-luna`**           | OpenAI    | JSON intent + confidence only. Cheap, structured. Not customer-visible, so Arabizi _generation_ quality does not apply; it must still **read** Arabizi (covered in golden set).                                                                                                            |
| **Conversation summary** (handoff briefing)                            | **`gpt-5.6-luna`**           | OpenAI    | Small/fast, as specified in `05` §16. Template fallback if it fails.                                                                                                                                                                                                                       |
| **Embeddings**                                                         | **`text-embedding-3-small`** | OpenAI    | 1536 dimensions; pgvector index size and NFR-PERF-06. Do not use `large` until recall is proven insufficient.                                                                                                                                                                              |
| **AI suggestions** (staff drafts)                                      | Same as Response Generator   | —         | Same guardrails, same dialect. Billed in `ai_usage`.                                                                                                                                                                                                                                       |

**Do not use on customer replies:** `gpt-5.6-luna` or `gpt-4o-mini` — the Arabizi paper shows mini-class OpenAI **normalizes Tunizi to MSA**. `gpt-5.6-sol` — overkill cost/latency for a 2–3 sentence DM. Open-weight Derja models — they hallucinate facts.

### 9.4 Defaults stored in `ai_settings`

Seeded per business; Owner/Admin may change **within the allow-list below**. `custom_system_append` still cannot weaken grounding (`05` §3.2).

| Field                                | MVP default                               |
| ------------------------------------ | ----------------------------------------- |
| `model_primary`                      | `gemini-3.5-flash`                        |
| `model_fallback`                     | `gpt-5.6-terra`                           |
| `model_fallback_2`                   | `claude-sonnet-5`                         |
| `model_classifier`                   | `gpt-5.6-luna`                            |
| `model_summary`                      | `gpt-5.6-luna`                            |
| `embedding_model`                    | `text-embedding-3-small`                  |
| `temperature` (generator)            | **0.4** — natural Derja without wandering |
| `temperature` (classifier / summary) | **0**                                     |
| `max_tokens` (generator)             | **400** — DMs are short (`05` §15.2)      |
| `max_tokens` (classifier)            | **200**                                   |
| `rag_top_k`                          | **5**                                     |
| `confidence_threshold`               | **0.65**                                  |

Allow-list for `model_primary` in MVP: `gemini-3.5-flash`, `gpt-5.6-terra`, `claude-sonnet-5`. Anything else is a spec change.

### 9.5 Provider failure order (Response Generator)

```
gemini-3.5-flash
  → timeout 15s or error
gpt-5.6-terra
  → timeout 15s or error
claude-sonnet-5
  → escalate HUMAN_REQUIRED reason=ai_timeout / integration_failure
```

Do not send a degraded MSA apology composed “from memory.” `05` §19.

### 9.6 SDKs and env

| Provider Layer    | Packages                | Auth env                             |
| ----------------- | ----------------------- | ------------------------------------ |
| Vercel AI Gateway | `ai`, `@ai-sdk/gateway` | `AI_GATEWAY_API_KEY`                 |
| OpenID Connect    | `ai`, `@ai-sdk/gateway` | `VERCEL_OIDC_TOKEN` (optional cloud) |

All requests route through **Vercel AI SDK + Vercel AI Gateway** (`AiGatewayService`), providing a single centralized credential (`AI_GATEWAY_API_KEY`) for OpenAI, Google Gemini, Anthropic Claude, and embeddings. Provider port lives in the AI module (`AiGatewayService`); tools call **our** services, not vendor “agent” loops.

Timeouts: **15s** per attempt (`05` §19). Total generator budget must leave room for tools + one fallback inside p95 **30s** inbound→first reply.

### 9.7 Dialect instructions (generator, not a second model)

The primary model still needs an explicit contract or it will answer Arabizi in Arabic script or MSA:

1. Detect script in Normalize (already required).
2. System prompt: match customer language **and script**; Arabizi stays Arabizi; do not “correct” into MSA; do not translate product names.
3. Golden set **must** include ≥30 Arabizi turns, ≥30 Arabic-script Derja, ≥20 French, ≥20 mixed (`famma black hoodie size M?`).

A Derja-finetuned 8B is **not** a post-processor in MVP (extra hop, ungrounded). Revisit only if the golden set fails dialectal adherence after prompt work (OQ-47).

### 9.8 Cost posture (indicative, not a quote)

Generator is Flash-class by design: high DM volume. Classifier/summary is Luna. Embeddings are `small`. `ai_usage` records provider, model id, tokens, estimated USD every call including suggestions (NFR-COST-01). If margin breaks, switch primary to `gpt-5.6-terra` only after the golden set still passes **Arabizi script-match**.

---
