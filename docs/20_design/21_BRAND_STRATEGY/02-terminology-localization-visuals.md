## 6. Naming Architecture & Domain Terminology

To prevent cognitive drift between product, marketing, design, and code, enforce these canonical terms:

### 6.1 Platform Terminology (Closed Glossary)

| Concept            | Canonical Term (French UI)                      | Canonical Term (Code / API)      | Forbidden / Deprecated Terms                 |
| ------------------ | ----------------------------------------------- | -------------------------------- | -------------------------------------------- |
| Merchant Workspace | **Entreprise**                                  | `business`                       | Espace, Organisation, Tenant, Magasin        |
| System User        | **Utilisateur**                                 | `user`                           | Membre, Opérateur, Admin (sauf pour le rôle) |
| User Roles         | **Propriétaire**, **Administrateur**, **Agent** | `owner`, `admin`, `employee`     | Superadmin, Manager, Vendeur                 |
| End Shopper        | **Client**                                      | `customer`                       | Prospect, Utilisateur final, Contact         |
| Inbound Stream     | **Conversation**                                | `conversation`                   | Chat, Ticket, Thread, Message                |
| Live Chat Station  | **Boîte de réception** / **Command Center**     | `inbox` / `sales command center` | Messagerie, Chatbot UI                       |
| Triage Indicator   | **Score du lead** (0–100)                       | `lead_score`                     | Probabilité d'achat, Note client             |
| Lead Temperature   | **Chaud**, **Tiède**, **Froid**                 | `hot`, `warm`, `cold`            | Élevé/Moyen/Faible, Rouge/Vert               |
| Order in progress  | **Commande en attente**                         | `order` (`PENDING_CONFIRMATION`) | Brouillon de commande, Panier                |
| Product Variant    | **Variante** (Taille, Couleur)                  | `product_variant`                | Option, Sous-produit, Modèle                 |
| Human Escalation   | **Escalade humaine** / **À traiter**            | `HUMAN_REQUIRED`                 | Erreur IA, Transfert ticket                  |

### 6.2 Translation of Technical Terms to Business Copy

| Internal Architecture Term                           | What the Merchant Sees                                |
| ---------------------------------------------------- | ----------------------------------------------------- |
| `embedding` / `vector search`                        | _Recherche dans le catalogue et les règles métier_    |
| `intent: purchase_intent`                            | _Intention d'achat confirmée_                         |
| `circuit_breaker: open`                              | _Service temporairement ralenti, bascule automatique_ |
| `low_confidence` (below merchant threshold, `05` §7) | _Besoin de confirmation humaine_                      |
| `ai_cost` / `ai_tokens`                              | _Volume de messages traités_                          |

---

## 7. Trust Strategy & MENA Localization

### 7.1 The Core Trust Question

In emerging social commerce markets, merchants are cautious about handing their customer interactions to automated software. Every screen must answer:

> **"Can I trust this system with my customers, my brand reputation, and my money?"**

### 7.2 The 4 Trust Pillars

1. **Financial Precision:** Currency is always formatted as **`DT`** (e.g. `12 540 DT` using narrow no-break space grouping). Never `$` or raw `TND` in merchant UI.
2. **Local Identity & Proximity:** Highlighting local development and responsive local support.
3. **Data Security & Privacy:** EU-hosted infrastructure ensuring GDPR-compliant data standards.
4. **The Silence Guarantee:** The dashboard stays calm and quiet when the AI handles traffic smoothly. We do not manufacture false urgency to prove platform activity.

### 7.3 Canonical Trust Footer

To be placed on Onboarding, Settings, Billing, and Account Activation screens:

```text
Développé en Tunisie · Support local · Données hébergées en Europe · Conforme RGPD
```

---

## 8. Visual Identity Principles

_(Visual tokens, CSS variables, and exact values are strictly defined in `20_DESIGN_SYSTEM.md`)_

> **Brand decisions define the emotional purpose of visual choices. The Design System defines their technical implementation.**

- **Accent Philosophy:** Lime accent represents vitality, positive action, and confirmed commerce. It is used as a sharp, focused scalpel (primary CTA buttons, active selection borders, focus rings) — **never** as a large background wash. Hex values and CSS variables live in `20_DESIGN_SYSTEM.md`.
- **Canvas Philosophy:** A dark navy header creates an authoritative, anchored frame. The main content workspace stays clean white and zinc neutrals for readability. Exact tokens live in `20`.
- **Typography Personality:** IBM Plex Sans conveys engineering precision, functional elegance, and industrial B2B credibility. Pair with IBM Plex Sans Arabic for authentic, un-distorted RTL text.
- **Visual Restraint (The Anti-Gimmick Rule):**
  - NO cartoon robot avatars.
  - NO glowing neon outlines or AI "magic spark" icons.
  - NO glassmorphism or muddy gradient mesh backgrounds.
  - NO distracting decorative illustrations inside operational screens.

### 8.1 Brand Anti-Patterns

Never use in marketing copy, in-app messaging, notifications, or documentation:

- **"AI magic" marketing language:** Avoid framing technology as incomprehensible sorcery or hyperbole.
- **Fake urgency:** Do not manufacture artificial countdowns, flashing alerts, or synthetic urgency badges.
- **Excessive celebration animations:** No confetti explosions, floating ribbons, or gamification fireworks on ordinary business transactions.
- **Gamification mechanics:** No point counters, xp bars, or streak badges for mundane sales desk tasks.
- **Hacker/cyber aesthetics:** No terminal green phosphors, dark cyber grids, or matrix code rain.
- **Sci-fi robot imagery:** No floating droid heads, metallic robot hands, or sci-fi mascots.
- **Startup cliché phrases:** Strictly forbidden in all copy:
  - _"revolutionize / révolutionner"_
  - _"next generation / nouvelle génération"_
  - _"unlock the power of AI / libérer la puissance de l'IA"_
  - _"AI-powered everything / tout alimenté par l'IA"_

---

## 9. Rules for Coding Agents & Technical Writers

1. **Catalog String Rule:** Never write hardcoded French or Arabic literals inside React JSX components. Always map UI strings through `next-intl` message keys (NFR-I18N-03).
2. **Naming Discipline:** Use the terminology from §6.1. Do not use "ticket" for conversations or "bot" for the AI Sales Agent.
3. **Error Copy Mandate:** Every error message must clearly explain what happened and provide the exact next step the operator must take (NFR-UX-04).
4. **Tone Consistency:** Keep platform notifications factual and quiet. Do not congratulate the user with excessive confetti or exclamation marks on routine operations.
5. **Brand Hierarchy:** If marketing aesthetics conflict with workflow efficiency or WCAG AA contrast, **workflow and accessibility win** (Conflict Priority in `20_DESIGN_SYSTEM.md` §9).

---

## 10. Open Questions

| #     | Question                                                 | Working Answer                                                                                                                                                                                                                                                                                                 | Owner           | Revisit Trigger           |
| ----- | -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- | ------------------------- |
| OQ-76 | Official customer-facing platform commercial brand name? | Working name **"AI Sales Agent"** serves as a functional product descriptor, not the final brand name. The commercial brand name must be **distinctive, trademark-checkable, memorable, and not a generic AI category phrase**. Final commercial naming and logo mark will be selected prior to public launch. | Brand / Founder | Pre-launch GTM review     |
| OQ-77 | Custom brand illustration style for onboarding?          | Keep onboarding illustration-minimal in MVP; rely on real UI previews and clean typography                                                                                                                                                                                                                     | Design          | Post-MVP conversion audit |

---

## 11. References

- `docs/AI_Sales_Agent_Brain_Dump.md` → `# Product Vision`, `# What we are (positioning)`, `# Tunisian/MENA trust patterns`
- `docs/00_product/00_PROJECT_OVERVIEW.md` §2, §3, §14
- `docs/00_product/01_PRODUCT_REQUIREMENTS.md` NFR-UX, NFR-I18N
- `docs/00_product/05_AI_BEHAVIOR_SPECIFICATION.md` — AI Persona and Grounding
- `docs/20_design/20_DESIGN_SYSTEM.md` — Canonical Visual Tokens
- `docs/20_design/22_UX_FLOWS.md` — Sales Command Center UX & Onboarding flows
- `docs/20_design/23_UI_COMPONENTS.md` — Component inventory, props, operator copy keys
