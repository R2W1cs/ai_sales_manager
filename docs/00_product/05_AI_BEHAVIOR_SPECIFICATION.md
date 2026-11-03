# 05 — AI Behavior Specification

Authoritative AI sales agent behavior, four core laws, language handling, intent taxonomy, tools, prompts, and safety limits.

> [!IMPORTANT]
> This spec was split into modular domain parts for AI context efficiency; the part files are authoritative.

## Document Parts

- [`01-personality-language-pipeline.md`](05_AI_BEHAVIOR_SPECIFICATION/01-personality-language-pipeline.md): **Four laws, agent identity, multilingual behavior (Derja/French/Arabic) & pipeline**
  - _Guidance:_ Read if implementing agent persona, multilingual response generation, or decision pipeline logic.
- [`02-intent-tools-context.md`](05_AI_BEHAVIOR_SPECIFICATION/02-intent-tools-context.md): **Intent taxonomy, confidence ladder, tool catalog & context assembly**
  - _Guidance:_ Read if implementing AI intent classification, tool definitions, tool execution, or prompt context builder.
- [`03-runtime-safety-prompts.md`](05_AI_BEHAVIOR_SPECIFICATION/03-runtime-safety-prompts.md): **Turn loop, fallbacks, circuit breaker, grounding, memory, prompts & safety**
  - _Guidance:_ Read if implementing AI orchestrator runtime, prompt templates, grounding evaluation, or safety guardrails.

## Agent Navigation Guidance

When implementing specific tasks, prefer reading only the exact part file(s) in `05_AI_BEHAVIOR_SPECIFICATION/` required for your domain (see bullets above) rather than loading all documentation.
