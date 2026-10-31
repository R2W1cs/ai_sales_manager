---
id: T-WEB-11
parent: T-WEB-11
wave: W9
status: pending
optional: false
depends:
  - T-WEB-10
fs:
  - FS-AUTH-02
read:
  - docs/20_design/21_BRAND_STRATEGY/01-positioning-personality-voice.md
  - docs/20_design/20_DESIGN_SYSTEM/01-tokens-color-typography.md
  - docs/20_design/22_UX_FLOWS/01-shell-onboarding-activation.md
  - docs/20_design/23_UI_COMPONENTS/01-composition-file-map.md
  - docs/30_execution/32_FEATURE_SPECIFICATIONS.md
files:
  - apps/web/src/app/page.tsx
  - apps/web/src/components/marketing/marketing-header.tsx
  - apps/web/src/components/marketing/landing-hero.tsx
  - apps/web/src/components/marketing/interactive-chat-demo.tsx
  - apps/web/src/components/marketing/bento-features.tsx
  - apps/web/src/components/marketing/marketing-footer.tsx
done_cmd: pnpm --filter web lint && pnpm --filter web check-types
next: T-OPS-01
---

# Task: Public Marketing Landing Page UI (`/`)

## 1. Objective & Value

Implement a high-converting public landing page at `apps/web/src/app/page.tsx` that communicates the product positioning for Tunisian and MENA social commerce merchants, demonstrates bilingual Derja/French sales qualification, and fulfills public verification requirements for Meta App Review.

**Why this exists**: Provides an authoritative public web presence, educates prospective merchants on the AI Sales Agent value proposition, converts inbound visitors into signups, and provides the public terms/privacy compliance required by Meta.

---

## 2. Scope Boundaries

### Modify (Allowlisted paths)

- `apps/web/src/app/page.tsx`
- `apps/web/src/components/marketing/marketing-header.tsx`
- `apps/web/src/components/marketing/landing-hero.tsx`
- `apps/web/src/components/marketing/interactive-chat-demo.tsx`
- `apps/web/src/components/marketing/bento-features.tsx`
- `apps/web/src/components/marketing/marketing-footer.tsx`

### Do Not Modify (Forbidden boundaries)

- `apps/api/`
- `apps/worker/`

---

## 3. Technical Contract & Interfaces

- **Root Route `/`**: Renders public landing page for unauthenticated visitors, with direct navigation to `/login` and `/register`.
- **`MarketingHeader` (`C-MKT-01`)**: Displays brand title, language selector, login link, and primary registration CTA.
- **`LandingHero` (`C-MKT-02`)**: Displays commercial descriptor (_"L'employé de vente IA pour le commerce social en Tunisie"_), trust badges (Meta Official API, live stock sync, COD support), and primary CTA to `/register`.
- **`InteractiveChatDemo` (`C-MKT-03`)**: Demonstrates simulated Instagram DM thread in Tunisian Derja + French, showing real-time stock check, variant reservation, and COD order creation.
- **`BentoFeatures` (`C-MKT-04`)**: Visual 4-pillar grid covering Derja fluency, inventory grounding, Silence Guarantee, and transparent ROI in Dinars (`DT`).
- **`MarketingFooter` (`C-MKT-05`)**: Provides compliant links to `/privacy`, `/terms`, support contact, and developer verification info.

---

## 4. Invariants & Security Guardrails

- 🔒 **Zero Data Leakage**: No tenant data, internal tokens, or sensitive merchant information rendered on public page.
- 🛡️ **No Cross-Boundary Imports**: Never import from `apps/api/src/`.
- ⚡ **Performance & SEO**: Clean Server Component rendering for instant FCP and SEO meta tags.

---

## 5. Implementation Steps

1. Build `MarketingHeader` with brand mark, language switcher, and auth links.
2. Build `LandingHero` component using design tokens (dark navy hero, restrained lime accent).
3. Build `InteractiveChatDemo` component showcasing realistic Derja/French qualification transcript and order confirmation.
4. Build `BentoFeatures` component detailing the 4 strategic differentiators.
5. Build `MarketingFooter` component with required legal and privacy links.
6. Assemble marketing page at `apps/web/src/app/page.tsx` replacing boilerplate.

---

## 6. Acceptance Criteria & Test Scenarios

- [ ] **Hero & Navigation**: Displays commercial proposition and links to `/login` and `/register`.
- [ ] **Interactive Simulation**: Renders bilingual Derja/French conversation mock with order card in `DT`.
- [ ] **Feature Pillars**: Bento grid displays 4 core value pillars with responsive layout.
- [ ] **Footer Compliance**: Legal links and language selection visible.

---

## 7. Verification Commands

```bash
# 1. Type check and lint web package
pnpm --filter web check-types && pnpm --filter web lint

# 2. Run full workspace check
pnpm check:full
```
