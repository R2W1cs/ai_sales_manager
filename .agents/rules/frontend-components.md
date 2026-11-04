---
trigger: always_on
description: Mandatory frontend rules for apps/web: Tailwind v4 syntax, index.css design tokens, component translations, and devl Base UI components via Shoogle MCP
---

# Frontend Component Architecture & Styling Rules

When working on any frontend task in `apps/web/` (implementing or modifying pages, layouts, sidebars, navigation, modals, forms, data tables, metrics, widgets, cards, or charts), the AI agent must strictly adhere to four core mandates:

1. **Always write in Tailwind v4 syntax** (CSS-first `@theme inline`, `@custom-variant dark`, slash opacity syntax).
2. **Always use design tokens from `apps/web/src/index.css`** (never arbitrary/hardcoded hex, rgb, or raw palette colors).
3. **Always translate components** (zero hardcoded UI strings, 100% parity across `fr.json`, `ar.json`, and `en.json` via `next-intl`).
4. **Prioritize Base UI & the `@devl` registry via `shoogle` MCP** (never introduce Radix UI).

---

## 1. Tailwind v4 Syntax Mandate

`apps/web` runs on **Tailwind CSS v4** (`@import "tailwindcss";` in `src/index.css`). All styling must strictly adhere to Tailwind v4 conventions:

- **CSS-First Theme Architecture**:
  - Theme variables and design tokens are declared directly in CSS via `@theme inline` inside [`apps/web/src/index.css`](apps/web/src/index.css).
  - **No `tailwind.config.js`**: Tailwind v4 eliminates JavaScript config files. Never attempt to create or reference a legacy Tailwind config file.
- **Modern Opacity Syntax**:
  - Always use the modern slash modifier syntax for opacity:
    - ✅ **Allowed**: `bg-primary/50`, `text-foreground/80`, `border-border/60`, `outline-ring/50`, `bg-muted/40`.
    - ❌ **Forbidden**: Legacy opacity utility classes or arbitrary color-opacity hacks.
- **Dark Mode Variant**:
  - Dark mode is configured via `@custom-variant dark (&:is(.dark *));`.
  - Apply dark styling directly with the `dark:` variant (e.g. `dark:bg-card`, `dark:text-foreground`, `dark:border-border`).
- **Logical Properties First**:
  - All spacing, positioning, borders, and text alignments must use CSS logical properties for bidirectional RTL support (see §4).
- **CSS Variables & Calc**:
  - Native CSS variable references and calculations (`calc(...)`) are supported directly inline without needing extra Tailwind plugins or syntax workarounds.

---

## 2. Design Tokens from `index.css` Mandate

All colors, surface backgrounds, borders, rings, radii, and fonts **MUST** be selected from the semantic design tokens defined in [`apps/web/src/index.css`](apps/web/src/index.css).

### Semantic Token Directory

| Token Category | Tailwind Utility Classes | Semantic Purpose |
| :--- | :--- | :--- |
| **Surfaces & Backgrounds** | `bg-background`, `bg-card`, `bg-popover`, `bg-muted`, `bg-accent`, `bg-sidebar` | Main viewport background, elevated cards, popovers/dialogs, secondary panels, hovered items, and sidebar navigation |
| **Foregrounds & Typography** | `text-foreground`, `text-card-foreground`, `text-popover-foreground`, `text-muted-foreground`, `text-accent-foreground`, `text-primary-foreground`, `text-secondary-foreground`, `text-sidebar-foreground` | High-contrast body text, card content, subtle secondary text, hover foregrounds, and sidebar labels |
| **Brand Accent (Primary)** | `bg-primary`, `text-primary-foreground`, `ring-primary`, `border-primary` | Brand primary buttons, interactive highlights, and active elements (lime accent token) |
| **Secondary Accent** | `bg-secondary`, `text-secondary-foreground`, `border-secondary` | Secondary buttons, subtle pills, non-primary interactive states |
| **Destructive / Error** | `bg-destructive`, `text-destructive-foreground`, `text-destructive`, `border-destructive` | Destructive buttons, error alerts, deletion modals, validation errors |
| **Warning** | `bg-warning`, `text-warning-foreground`, `text-warning`, `border-warning` | Pending states, attention banners, SLA warnings, cautious actions |
| **Success** | `bg-success`, `text-success-foreground`, `text-success`, `border-success` | Positive confirmations, paid statuses, delivery successes, active states |
| **Borders & Controls** | `border-border`, `border-input`, `ring-ring`, `outline-ring` | Dividers, form input borders, focus rings, and outline rings |
| **Border Radii** | `rounded-sm`, `rounded-md`, `rounded-lg`, `rounded-xl`, `rounded-2xl`, `rounded-3xl`, `rounded-4xl` | Standardized corner rounding mapped to `--radius` |
| **Sidebar System** | `bg-sidebar`, `text-sidebar-foreground`, `bg-sidebar-primary`, `bg-sidebar-accent`, `text-sidebar-accent-foreground`, `border-sidebar-border`, `ring-sidebar-ring` | App navigation rails, sidebars, and nested workspace drawers |
| **Data Visualizations** | `bg-chart-1`, `bg-chart-2`, `bg-chart-3`, `bg-chart-4`, `bg-chart-5` | Charts, conversion funnels, analytics graphs, and status metrics |
| **Fonts** | `font-sans`, `font-heading` | Body typography (IBM Plex Sans / Noto Sans Arabic) and headings |

### Strict Prohibitions
- **NO Arbitrary Palette Colors**: Never use unsemantic raw palette classes like `bg-blue-500`, `text-gray-700`, `border-zinc-300`, `text-red-600`, or `bg-slate-50`. Map all UI elements to the semantic tokens above (`bg-primary`, `text-foreground`, `border-border`, `text-destructive`, `bg-muted`, etc.).
- **NO Hardcoded Hex / RGB**: Never write arbitrary inline colors like `bg-[#0f172a]` or `text-[rgb(20,20,20)]`. Third-party official brand assets (e.g. WhatsApp green, Messenger blue) are the only narrow exception.

---

## 3. Always Translate Components Mandate

Every component in `apps/web/` must be 100% internationalized. **Zero hardcoded user-facing strings are permitted.**

- **Mandatory Translation Sourcing**:
  - **Client Components** (`"use client"`): Sourced via `useTranslations(namespace)` from `next-intl`.
  - **Server Components**: Sourced via `await getTranslations(namespace)` from `next-intl/server`.
- **Scope of Coverage**:
  - Button text, link labels, headings, titles, descriptions, and empty state copy.
  - Form input placeholders, helper text, and validation error messages.
  - Toast alerts, confirmation dialogs, error banners, and modal headers.
  - Table column headers, badge labels, filter tags, and dropdown actions.
  - Accessibility labels: `aria-label`, `title`, and `<span className="sr-only">`.
- **100% Catalog Parity**: Whenever adding or modifying any key, it **must** be added identically to all three message catalogs:
  1. [`apps/web/src/i18n/messages/fr.json`](apps/web/src/i18n/messages/fr.json) (French - default locale)
  2. [`apps/web/src/i18n/messages/ar.json`](apps/web/src/i18n/messages/ar.json) (Tunisian/Standard Arabic - RTL)
  3. [`apps/web/src/i18n/messages/en.json`](apps/web/src/i18n/messages/en.json) (English)
- **External / Registry Components**: When pulling components from `@devl` or creating new widgets, immediately replace all hardcoded English or French text with `t('...')` calls and populate the message catalogs.

---

## 4. RTL Layout & CSS Logical Properties

Arabic (`ar`) sets `dir="rtl"` on `<html>`. To ensure UI layouts, sidebars, drawers, and forms flip seamlessly, physical positioning utilities are strictly forbidden:

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

- **Directional Icons**: Chevrons, back/forward arrows, and step indicators must include `rtl:rotate-180` or `rtl:-scale-x-100` (e.g. `<ArrowRight className="size-4 rtl:rotate-180" />`).
- **Dynamic Content**: Always add `dir="auto"` to text inputs, textareas, chat bubbles, and customer notes so Arabic and Latin scripts auto-align to their natural direction.

---

## 5. Component Sourcing: Shoogle MCP & devl Registry

Before creating, hand-authoring, or inventing new UI components, layouts, or widgets:

### Architectural Constraints
- **Base UI Only**: Stack is Next.js 16 (React 19) + Base UI (`base-vega` style in `apps/web/components.json`).
- **Radix UI is strictly forbidden**: If an external component references `@radix-ui/*`, replace those primitives with Base UI equivalents.
- **Why `@devl`**: Components from `devl` (`devl.dev` by Sean Brydon, built on `coss-ui`) are designed around Base UI and Tailwind CSS, providing production-ready layouts (app shells, rails, multi-pane splits) and form patterns that match our design system.

### Protocol for Sourcing Components

1. **Search devl via Shoogle MCP**:
   - Primary: `search_registry_items_scoped` with `registries: ["@devl"]` and query keyword (e.g. `"app-shell"`, `"workspace-rail"`, `"split-resizable"`, `"workspace-settings"`, `"notifications"`, `"chart"`, `"card"`).
   - Fallback: `search_registry_items` across the catalog for broader Base UI patterns.

2. **Pull and Install Components**:
   ```bash
   pnpm --filter web dlx shadcn@latest add @devl/<component-name>
   # or
   npx shadcn@latest add @devl/<component-name>
   ```

3. **Post-Install Normalization**:
   - Verify project alias imports: `@/components/...`, `@/lib/utils`, `@/hooks/...`.
   - Ensure all styling uses **Tailwind v4 syntax** and tokens from `index.css`.
   - Wire all text and accessibility labels to `next-intl` (see §3).
   - Replace physical positioning classes with logical equivalents (see §4).

---

## 6. Key `devl` Components Reference

Common patterns in `devl` suitable for this application:
- **Layouts & Shells**: `app-shell`, `workspace-rail`, `mini-rail`, `two-pane`, `three-pane`, `split-resizable`, `focus-mode`, `bottom-nav`
- **Forms & Settings**: `workspace-settings`, `invite-teammates`, `notifications`, `api-key`
- **Dashboards & Activity**: charts, activity heatmaps, metrics, filters, data rails

---

## 7. Verification Checklist for Frontend Changes

Before marking any frontend task as complete:
1. **Tailwind v4 Syntax**: No legacy v3 classes or configuration files; modern slash opacity syntax used throughout (`bg-primary/50`, etc.).
2. **Design Tokens**: All colors and surfaces map to semantic tokens from `index.css` (no raw `gray-500`, `blue-600`, hex codes).
3. **Always Translate**: 100% of user-facing strings use `t('...')` with verified parity across `fr.json`, `ar.json`, and `en.json`.
4. **RTL Ready**: Logical properties (`ms-*`, `pe-*`, `border-s-*`, `text-start`, `inset-s-*` / `start-*`, `inset-e-*` / `end-*`) used everywhere.
5. **Quality Gates**:
   ```bash
   pnpm fix && pnpm check:full && pnpx react-doctor@latest apps/web -y --scope changed --json-compact --no-telemetry --no-color
   ```
