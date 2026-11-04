---
trigger: always_on
description: Mandatory rule for frontend UI tasks in apps/web to strictly use next-intl translations and logical RTL styling
---

# Frontend Internationalization (i18n) & RTL Layout Rules

When creating, updating, or refactoring any frontend components, layouts, pages, forms, modals, or widgets in `apps/web/`, all code must comply with the internationalization (`next-intl`) and bidirectional (`LTR`/`RTL`) architectural standards.

---

## 1. Always Translate Components (Zero Hardcoded UI Strings)

Every single frontend component in `apps/web/` must always be fully translated. Direct hardcoding of raw strings (in French, English, Arabic, or any language) inside TSX/JSX elements is strictly prohibited.

- **Mandatory Translation Sourcing**:
  - **Client Components**: Sourced via `useTranslations(namespace)` from `next-intl`.
  - **Server Components**: Sourced via `await getTranslations(namespace)` from `next-intl/server`.
- **Scope of Translated Content**:
  - Button text, labels, headers, descriptions, and paragraph copy.
  - Form input placeholders and validation messages.
  - Toast notifications and error alerts (`ErrorBanner`).
  - Dropdown menu items, tabs, and status badges.
  - Accessibility labels: `aria-label`, `title`, and `<span className="sr-only">`.
- **Strict Prohibition**:
  - Direct hardcoding of raw strings inside TSX/JSX elements is strictly prohibited. Every user-facing string must be translated.

---

## 2. Catalog Parity & Completeness (Fr / Ar / En)

The project supports three locales: **French (`fr` - primary default)**, **Tunisian/Standard Arabic (`ar` - RTL)**, and **English (`en`)**.

Whenever adding or modifying any translation key, the key **MUST be added identically across all three catalog files**:
1. [`apps/web/src/i18n/messages/fr.json`](apps/web/src/i18n/messages/fr.json)
2. [`apps/web/src/i18n/messages/ar.json`](apps/web/src/i18n/messages/ar.json)
3. [`apps/web/src/i18n/messages/en.json`](apps/web/src/i18n/messages/en.json)

### Standard Namespaces
Place keys in the appropriate namespace:
- `common`: Generic verbs & UI tokens (`save`, `cancel`, `edit`, `delete`, `search`, `all`, `now`, relative time units `minuteShort`, `hourShort`, `dayShort`).
- `nav`: Sidebar links, navigation badges, and menu toggles.
- `auth`: Authentication flows, invitations, login, registration, password validation.
- `roles`: Workspaces, permissions, and roles (`owner`, `admin`, `agent`).
- `inbox`: Conversations, message bubbles, AI draft approval, customer dossier, and filters.
- `onboarding`: Multi-step onboarding wizard, gates, and store setup.
- `orders`: Order drawer, items, pricing, payment terms (COD, bank transfer).
- `channels`: Social platforms (Instagram, Messenger, WhatsApp), connection status.
- `kpis`: Metrics, dashboard statistics, and conversion indicators.
- `languages`: Language names (`fr`, `ar`, `en`) and language switcher labels.
- `errors`: API and runtime error titles/descriptions.
- `usage`: Quota widgets, billing plans, and AI message consumption.

---

## 3. Brand & Terminology Guidelines (`docs/20_design/21_BRAND_STRATEGY/02-terminology-localization-visuals.md`)

- **Merchant Workspace**: Always use `Entreprise` / `Boutique` (Arabic: `شركة` / `متجر`). Never use deprecated terms like `Espace` or `Workspace`.
- **System User**: Always use `Agent` or `Utilisateur` (Arabic: `وكيل` / `مستخدم`). Never use `Opérateur`.
- **End Shopper / Lead**: Always use `Client` or `Lead` (Arabic: `حريف` / `مشتري`). Never use `Prospect`.
- **Currency Format**: Always format prices with Tunisian Dinar as `DT` (e.g. `12.500 DT` or `{price} DT`, Arabic: `د.ت` or `دينار تونسي`). Never use `$`, `€`, or unlocalized codes.

---

## 4. RTL Layout & CSS Logical Properties

Arabic (`ar`) sets `dir="rtl"` on `<html>`. To ensure UI layouts, sidebars, drawers, and forms flip seamlessly:

### Required Logical Properties (Tailwind CSS)

| Physical Utility (FORBIDDEN) | Logical Utility (MANDATORY) | Purpose |
| :--- | :--- | :--- |
| `left-*` | `inset-s-*` | Inline-start positioning |
| `right-*` | `inset-e-*` | Inline-end positioning |
| `ml-*` | `ms-*` | Margin inline-start |
| `mr-*` | `me-*` | Margin inline-end |
| `pl-*` | `ps-*` | Padding inline-start |
| `pr-*` | `pe-*` | Padding inline-end |
| `border-l-*` | `border-s-*` | Border inline-start |
| `border-r-*` | `border-e-*` | Border inline-end |
| `text-left` | `text-start` | Text alignment start |
| `text-right` | `text-end` | Text alignment end |
| `rounded-tl-*` | `rounded-ss-*` | Top-start corner radius |
| `rounded-tr-*` | `rounded-se-*` | Top-end corner radius |

> **Inline Positioning Note**: Always use `inset-s-*` and `inset-e-*` for inline positioning (e.g. `inset-s-2.5`, `inset-e-2`). The old `start-*` / `end-*` positioning classes are deprecated and replaced with `inset-s-*` and `inset-e-*`.

### Bidirectional Elements & Direction Icons
- **Directional Icons**: Directional arrows and chevrons (such as next/previous steps or breadcrumbs) must include `rtl:rotate-180` or `rtl:-scale-x-100` (e.g. `<ArrowRight className="size-4 rtl:rotate-180" />`).
- **Dynamic / Multilingual Text**: Always add `dir="auto"` to textareas, message inputs, chat bubbles, and customer notes so Arabic and Latin scripts auto-align to their natural direction.

---

## 5. SSR & Hydration Guidelines

- In Client Components requiring active locale context, use `useLocale()` from `next-intl`.
- Never parse `document.cookie` during initial render inside `useState(() => ...)` as it causes SSR hydration mismatches.
- Never call `setState` synchronously within `useEffect` (violates React 19 / oxlint `react(set-state-in-effect)`). Derive state directly during render.

---

## 6. Verification Checklist for New Components

Before completing any frontend card:
1. `pnpm check:full` passes with 0 errors.
2. `pnpm --filter web check-types` and `pnpm --filter web lint` pass with 0 errors.
3. Catalog parity test passes: run `pnpm test:everything` to verify 100% key parity across `fr.json`, `ar.json`, and `en.json`.
