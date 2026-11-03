# 15 — AI Architecture

AI orchestrator, intent classification, policy engine, tool execution, RAG retriever, prompt assembly, and golden evaluation.

> [!IMPORTANT]
> This spec was split into modular domain parts for AI context efficiency; the part files are authoritative.

## Document Parts

- [`01-orchestrator-intent-tools.md`](15_AI_ARCHITECTURE/01-orchestrator-intent-tools.md): **AI orchestrator flow, turn sequence, intent classifier, policy engine & tool executor**
  - _Guidance:_ Read if implementing AI orchestrator service, intent classification pipeline, policy rules, or tool dispatch.
- [`02-rag-prompts-evaluation.md`](15_AI_ARCHITECTURE/02-rag-prompts-evaluation.md): **RAG embeddings retriever, prompt assembly, fallback circuit breaker & eval golden set**
  - _Guidance:_ Read if implementing vector search, prompt template assembly, AI circuit breakers, or eval benchmarks.
- [`03-intent-classifier-pipeline.md`](15_AI_ARCHITECTURE/03-intent-classifier-pipeline.md): **Intent taxonomy, deterministic rules, cheap LLM fallback, multi-intent & Tunisian Arabizi**
  - _Guidance:_ Read if implementing or maintaining the intent taxonomy, deterministic rule catalog, Arabizi/dialect matching, or cheap LLM fallback.
- [`04-intent-contracts-evaluation.md`](15_AI_ARCHITECTURE/04-intent-contracts-evaluation.md): **Zod contracts, observability, golden set benchmarks, performance goals & evolution roadmap**
  - _Guidance:_ Read if implementing shared Zod schemas, telemetry, golden-set evaluation CI gates, or performance auditing.

## Agent Navigation Guidance

When implementing specific tasks, prefer reading only the exact part file(s) in `15_AI_ARCHITECTURE/` required for your domain (see bullets above) rather than loading all documentation.
