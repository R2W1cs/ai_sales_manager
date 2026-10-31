---
id: T-WEB-05
parent: T-WEB-05
wave: W8
status: done
optional: false
depends:
  - T-WEB-01
fs:
  - FS-WEB-01
read:
  - docs/20_design/20_DESIGN_SYSTEM/02-layout-motion-a11y.md
  - docs/00_product/03_MVP_SCOPE/01-in-scope-boundaries.md
files:
  - apps/web/src/i18n/messages/fr.json
  - apps/web/src/i18n/messages/ar.json
  - apps/web/src/i18n/messages/en.json
  - apps/web/src/i18n/request.ts
done_cmd: pnpm --filter web check-types && pnpm --filter web lint
next: T-WEB-06
---

# Task: Internationalization Catalogs & RTL layout (Arabic/French/English)

## 1. Objective & Value

Implement next-intl localization catalogs for French (primary), Arabic (with RTL `dir='rtl'` layout), and English.

**Why this exists**: Provide Tunisian merchants with a localized UI in their preferred language.

---

## 2. Scope Boundaries

### Modify (Allowlisted paths)

- `apps/web/src/i18n/`

### Do Not Modify (Forbidden boundaries)

- `apps/api/`

---

## 3. Technical Contract & Interfaces

- Locales: `fr` (French - default), `ar` (Arabic with RTL direction), `en` (English).
- Zero hardcoded UI strings; all labels sourced from `useTranslations()`.

---

## 4. Invariants & Security Guardrails

- 🔒 **RTL Layout**: Arabic locale sets `dir='rtl'` on HTML root and flips navigation/drawer alignments.

---

## 5. Implementation Steps

1. Author comprehensive translation catalogs in `fr.json`, `ar.json`, `en.json`.
2. Configure next-intl middleware and request configuration.
3. Add language switcher component in header.
4. Author tests verifying catalog completeness without missing keys.

---

## 6. Acceptance Criteria & Test Scenarios

- [ ] **Locale Switch**: Switching language changes all UI text seamlessly.
- [ ] **RTL Direction**: Switching to Arabic applies `dir='rtl'`.

---

## 7. Verification Commands

```bash
# 1. Run typecheck & lint
pnpm --filter web check-types && pnpm --filter web lint

# 2. Run full workspace check
pnpm check:full
```

---

## 8. Human Contribution (What to do from your side)

- **🧪 Manual QA**: Switch language selector between FR, AR (verify RTL layout), and EN in browser.

---

## 9. Expected Deliverables

Translation catalogs and i18n configuration in `apps/web`.
