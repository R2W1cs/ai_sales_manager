# 21 — Brand Strategy

| Field           | Value                                                                                                                                                                                                         |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Document ID     | `21_BRAND_STRATEGY`                                                                                                                                                                                           |
| Status          | Approved — canonical for brand positioning, voice & tone, naming, trust cues, and product personality                                                                                                         |
| Owner           | Product / Brand & Design                                                                                                                                                                                      |
| Audience        | Product managers, UX designers, frontend engineers, prompt engineers, marketing, AI coding agents                                                                                                             |
| Depends on      | `00_PROJECT_OVERVIEW.md`, `01_PRODUCT_REQUIREMENTS.md` (NFR-UX / NFR-I18N), `03_MVP_SCOPE.md`                                                                                                                 |
| Consumed by     | `20_DESIGN_SYSTEM.md`, `22_UX_FLOWS.md`, `23_UI_COMPONENTS.md`, `apps/web` UI copy, marketing/sales collateral                                                                                                |
| Upstream source | `docs/AI_Sales_Agent_Brain_Dump.md` → `# Product Vision`, `# What we are (positioning)`, `# Target Market`, `# Customer Profile`, `# Tunisian/MENA trust patterns`, `# Trust surfaces`, `# Language strategy` |

---

## 1. Purpose and scope

This document is **canonical for how the product presents its identity, personality, tone of voice, terminology, and trust framework**. It governs the voice of the operator platform and establishes the brand boundaries for AI agent interactions and merchant-facing copy.

**In scope:** brand positioning, value proposition, brand archetype, personality traits, dual-voice architecture (operator platform vs. customer-facing AI), tone guidelines across UI states, naming conventions, trust strategy for the Tunisian/MENA market, localization rules, and copy standards for engineering/AI agents.

**Out of scope, and where it lives instead:**

| Topic                                                                        | Canonical location                |
| ---------------------------------------------------------------------------- | --------------------------------- |
| UI tokens, color hexes, typography scales, spacing, CSS variables            | `20_DESIGN_SYSTEM.md`             |
| Customer-facing AI persona, Derja dialect rules, intent taxonomy, guardrails | `05_AI_BEHAVIOR_SPECIFICATION.md` |
| Handoff escalation reasons, priorities, staff briefing schemas               | `06_AI_HUMAN_HANDOFF_RULES.md`    |
| Screen layouts, three-pane inbox flows, onboarding screens                   | `22_UX_FLOWS.md`                  |
| Component specifications, UI props, button variants                          | `23_UI_COMPONENTS.md`             |
| Visual screenshot benchmarks                                                 | `24_REFERENCE_SCREENS.md`         |
| API endpoints, HTTP status codes, error payloads                             | `13_API_DESIGN.md`                |

---

## 2. Brand Foundations & Positioning

### 2.1 Brand core and mission

- **Vision:** Become the AI sales operating system for SMBs in emerging markets.
- **Mission:** Empower social commerce merchants with an autonomous, reliable AI sales employee and a human command center that turns chaotic messaging into qualified, confirmed orders.

### 2.2 Category positioning: Sales Operating System

The market is saturated with generic AI chatbots and customer support widgets. We are **not** an FAQ bot, a ticketing helpdesk, or a toy chatbot.

> **Positioning:** An AI sales employee + a human sales desk, built specifically for how merchants sell on Instagram, Messenger, and WhatsApp.

```
┌─────────────────────────────────────────────────────────────────────────┐
│                      WHAT WE ARE VS. WHAT WE ARE NOT                    │
├────────────────────────────────────┬────────────────────────────────────┤
│ WHAT WE ARE                        │ WHAT WE ARE NOT                    │
├────────────────────────────────────┼────────────────────────────────────┤
│ An AI Sales Employee + Sales Desk  │ A generic FAQ chatbot              │
│ A Revenue Generation System        │ A customer support helpdesk        │
│ Grounded Commerce Workflow Tool    │ An ungrounded conversational toy   │
│ A Sales Command Center (Triage)    │ Another chaotic chat app / inbox   │
│ A Reliable Partner for SMBs        │ Complex, bloated enterprise ERP    │
└────────────────────────────────────┴────────────────────────────────────┘
```

### 2.3 Strategic Pillars (The Competitive Moat)

1. **Local Linguistic Fluency:** Native understanding of Tunisian Arabic (Derja), Arabizi, French, and English, with natural code-switching that builds instant customer rapport.
2. **Grounded Commerce Workflow:** Direct understanding of variants, stock levels, short-lived reservations, delivery fees, and order creation. The AI drives toward real database orders.
3. **Business Memory:** Grounded tenant rules, operational policies, and customer history. No hallucinated discounts or unverified promises.
4. **Transparent Sales ROI:** The platform directly links conversational activity to closed orders and generated revenue (`DT`), making ROI obvious.

---

## 3. Brand Personality & Archetype

### 3.1 Brand Archetype: The Competent Commercial Partner

The brand behaves like an exceptionally skilled, dependable, and discreet commercial operations manager. It is technically sophisticated, deeply practical, and committed to merchant profitability.

### 3.2 Core Personality Traits

| Trait                            | How it manifests in the product                                                               | What we avoid                                                              |
| -------------------------------- | --------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| **Grounded & Truthful**          | Exposes exact stock, real delivery rules, and honest metrics. Explains AI decisions clearly.  | Never guesses, never exaggerates AI capabilities, no inflated metrics.     |
| **Disciplined & Restrained**     | Quiet when things are working; surfaces only decision-critical items (the Silence Guarantee). | No noisy alert storms, no spam notifications, no cluttered dashboards.     |
| **Commercial & Action-Oriented** | Focuses on sales conversion, qualified buyers, and revenue in DT.                             | No academic AI discussions, no vanity traffic counters.                    |
| **Culturally Attuned**           | Respects local commerce patterns (COD, Instagram/Messenger selling, regional delivery).       | No generic Silicon Valley tropes; no stereotypical orientalist decoration. |
| **Professional & Composed**      | Modern Western SaaS visual elegance combined with robust enterprise clarity.                  | No crypto/web3 neon, no cartoon mascots, no glowing AI sparkles.           |

### 3.3 Psychological Design Principles

The brand is designed around four fundamental user psychology drivers:

#### 1. Control

Merchants must feel they are regaining operational mastery over overwhelming, chaotic customer conversations.

- **Design implications:** Clear system status, deterministic workflows, visible ownership of actions, no opaque or hidden background automation.

#### 2. Trust

Merchants must trust the AI with their hard-won customer relationships and direct revenue.

- **Design implications:** Show explicit sources and rationale for AI actions, never exaggerate capabilities, choose rigorous transparency over "AI magic."

#### 3. Cognitive Ease

The product drastically reduces mental workload rather than creating a new complex interface to manage.

- **Design implications:** Progressive disclosure, minimal unnecessary choices, disciplined visual hierarchy, predictable and consistent UI patterns.

#### 4. Competence

The product should feel like an experienced, highly capable commercial sales employee.

- **Design implications:** Precise financial language, professional tone, revenue-focused metrics (`DT`), strict avoidance of playful chatbot antics.

### 3.4 Personality Spectrum

To maintain strict behavioral boundaries across AI prompts, UX copy, and visual design:

```
MORE:                                 LESS:
✓ Professional                        ✗ Playful
✓ Intelligent                         ✗ Experimental
✓ Calm                                ✗ Entertaining
✓ Reliable                            ✗ Futuristic
✓ Practical                           ✗ Emotional
```

---

## 4. Dual-Voice Architecture

The product speaks in two distinct voices depending on the audience:

```
                          ┌───────────────────────────┐
                          │   DUAL-VOICE ARCHITECTURE │
                          └─────────────┬─────────────┘
                                        │
             ┌──────────────────────────┴──────────────────────────┐
             ▼                                                     ▼
┌─────────────────────────┐                               ┌─────────────────────────┐
│   PLATFORM VOICE        │                               │   AI AGENT VOICE        │
│   (Operator-Facing)     │                               │   (Customer-Facing)     │
├─────────────────────────┤                               ├─────────────────────────┤
│ • Audience: Merchants   │                               │ • Audience: Shoppers    │
│ • Language: French (TN) │                               │ • Language: Derja / FR  │
│ • Tone: B2B, Concise,   │                               │ • Tone: Helpful, Polite,│
│   Disciplined, Clear    │                               │   Commercial, Grounded  │
│ • Governed by: This doc │                               │ • Governed by: 05_AI    │
└─────────────────────────┘                               └─────────────────────────┘
```

### 4.1 Platform Voice (Merchant & Operator Surface)

- **Primary Language:** French (`fr-TN`) as the standard B2B language for Tunisian commerce.
- **Register:** Professional, crisp, respectful, transparent.
- **Rules:**
  1. **Concise:** Keep labels, tooltips, and explanations short. Merchants work fast.
  2. **Action-Oriented:** Every notification or error must tell the operator what to do next.
  3. **Business-First Language:** Use terms like _Commandes_, _Chiffre d'affaires_, _Taux de conversion_. Never expose raw engineering jargon (_vector distance_, _embeddings_, _LLM latency_).

### 4.2 AI Agent Voice (End-Customer In-Chat Surface)

- **Governed by:** `05_AI_BEHAVIOR_SPECIFICATION.md` and merchant-configured tone settings (`ai_settings.tone`).
- **Register:** Warm, polite, sales-oriented social commerce communication in Tunisian Arabic / Arabizi / French.
- **Tone Guardrail:** Friendly but strictly professional; does not over-promise; grounded in product availability.

---

## 5. Tone of Voice Matrix across UI States

| UI Context                    | Tone & Attitude                        | Good Copy Example (French)                                                           | Bad Copy Example                                                     |
| ----------------------------- | -------------------------------------- | ------------------------------------------------------------------------------------ | -------------------------------------------------------------------- |
| **Normal / Active State**     | Calm, affirmative, concise             | _Agent actif sur Instagram et Messenger._                                            | _L'intelligence artificielle ultra-puissante analyse vos messages !_ |
| **Escalation / Handoff**      | Clear, urgent, context-rich            | _Intervention requise : client prêt à commander (Taille M)._                         | _Alerte ! L'IA ne sait plus quoi faire !_                            |
| **Empty State**               | Instructive, reassuring, action-driven | _Aucune conversation pour le moment. Connectez votre page Instagram pour commencer._ | _Aucune donnée disponible._                                          |
| **Quota Warning (80% / 95%)** | Factual, proactive, respectful         | _Vous avez utilisé 80% de vos messages IA ce mois-ci._                               | _Attention ! Dépassement imminent !_                                 |
| **System Error**              | Transparent, accountable, actionable   | _Impossible de synchroniser le catalogue. Vérifiez le format de votre fichier CSV._  | _Erreur 500 : Échec inattendu._                                      |
| **Destructive Action**        | Serious, explicit about consequences   | _Supprimer ce produit annulera les réservations en cours._                           | _Êtes-vous sûr ?_                                                    |

---
