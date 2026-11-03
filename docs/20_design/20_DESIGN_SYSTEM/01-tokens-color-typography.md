# 20 — Design System

| Field           | Value                                                                                                                                                        |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Document ID     | `20_DESIGN_SYSTEM`                                                                                                                                           |
| Status          | Approved — frozen as operator UI tokens v1                                                                                                                   |
| Owner           | Product / Design                                                                                                                                             |
| Audience        | `apps/web`, AI coding agents, visual QA                                                                                                                      |
| Depends on      | `01_PRODUCT_REQUIREMENTS.md` NFR-UX / NFR-I18N, `21_BRAND_STRATEGY.md` (meaning only), `11_TECH_STACK.md` §8, `13_API_DESIGN.md` (French API messages vs UI) |
| Consumed by     | Next.js + Tailwind + shadcn in `apps/web`, `22_UX_FLOWS.md`, `23_UI_COMPONENTS.md`, `24_REFERENCE_SCREENS.md`                                                |
| Upstream source | `docs/AI_Sales_Agent_Brain_Dump.md` → `# UX/UI Design Direction`                                                                                             |

---

## 1. Purpose and scope

This document is **canonical for how the merchant UI looks and feels at the token layer**. If a colour, typeface, radius, breakpoint, or shadcn theme key is not here, it does not exist. Add it here first, then implement.

**In scope:** colour, surfaces, control states, type, overflow, spacing, radius, elevation, z-index, control heights, motion, RTL, density, a11y contrast, number/date/money display, shadcn/Tailwind mapping, app-shell chrome (header/sidebar tokens — not page flows).

**Out of scope, and where it lives instead:**

| Topic                                                       | Canonical location                                                    |
| ----------------------------------------------------------- | --------------------------------------------------------------------- |
| Voice, logo, naming                                         | `21_BRAND_STRATEGY.md`                                                |
| Inbox three-pane, onboarding steps, notification discipline | `22_UX_FLOWS.md`                                                      |
| Component props, empty-state copy per screen                | `23_UI_COMPONENTS.md`                                                 |
| Screenshot / visual benchmarks                              | `24_REFERENCE_SCREENS.md` (until then: NFR-UX-11 generated dashboard) |
| Ubiquitous language                                         | `07_DOMAIN_MODEL.md` (until then: `00` §14; columns in `12`)          |
| Routes, permission codes, DTO field names                   | `13_API_DESIGN.md`                                                    |
| Package versions (Next, Tailwind, shadcn **kit**)           | `11_TECH_STACK.md`                                                    |
| Auth/RBAC (UI hiding is not a control)                      | `17_SECURITY_DESIGN.md`                                               |
| Customer-facing AI dialect                                  | `05_AI_BEHAVIOR_SPECIFICATION.md`                                     |

**References:** `§N` is this file. Sibling docs are filenames.

---

## 2. Invariants

1. **Context-rich, not clutter-rich** (NFR-UX-07). Information density without visual density. Target ~**20% less visual noise** than a typical dense dashboard — remove decoration, not decisions.
2. Merchant UI language is **French** (`fr-TN`). Arabic UI is RTL (`ar-TN`). English is a third locale. **AI chat language is not the UI language** (NFR-UX-08).
3. Currency display is **DT** with `fr-TN` grouping: `12 540 DT` (narrow no-break space). Not `$`, not `TND` in the chrome.
4. Accent is **OnchainStack lime, restrained**. Primary buttons, selected **start border**, subtle highlights. **Do not** flood backgrounds, charts, or body text with lime.
5. Header is **dark navy/black**. Page canvas is white / zinc. No glassmorphism, no crypto-dashboard neon, no gradient mesh.
6. Exactly **four** analytics KPIs on Analyses (`01` §15): Messages handled, Orders created, Human handoffs, Conversion. Overview may add **only** plan usage and needs-me (4–6 cards) — never revenue, CSAT, or a fifth vanity KPI.
7. shadcn/ui + **Base UI** + Tailwind **4** (`11`). Style is **vega**. Tokens in this file override Inter, catalog `lime`, and compact Nova/Mira.
8. No Framer Motion / GSAP / Lottie in MVP (`11` `animation: none`).
9. WCAG **2.1 AA** on core flows (NFR-UX-05). Lime is never the only cue (also text/icon).
10. WhatsApp chrome is **Phase 2**. MVP shows Instagram + Messenger. Do not ship empty WhatsApp nav.

---

## 3. Stack mapping (shadcn)

| BFS / shadcn key    | Pin                                                                                                                                                                  |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `uiLibrary`         | `shadcn-ui` (`11`)                                                                                                                                                   |
| `shadcnBase`        | **`base`** (Base UI, not Radix)                                                                                                                                      |
| `shadcnStyle`       | **`vega`** — classic balanced spacing. Not `nova` / `mira` (compact), not `maia` / `luma` (pills), not `lyra` / `sera` (boxy). Do not shrink type to fake density    |
| `shadcnBaseColor`   | **`zinc`** — neutrals only. Brand is lime + navy, not “zinc app”                                                                                                     |
| `shadcnColorTheme`  | **`zinc`** at scaffold, then **override `--primary`** to §4 lime. Do not use catalog `lime` (it paints too much)                                                     |
| `shadcnFont`        | Catalog has **no IBM Plex**. Scaffold **`noto-sans`** (avoid Inter). **Ship IBM Plex Sans + IBM Plex Sans Arabic** (§5) via `next/font` in the first `apps/web` pass |
| `shadcnIconLibrary` | **`lucide`**                                                                                                                                                         |
| `shadcnRadius`      | BFS **`default`**; CSS **`--radius: 0.5rem`** (8px). Moderate, not pills                                                                                             |

CSS variables live in `apps/web` (e.g. `app/globals.css`). Tailwind maps to those variables. Do not hard-code hex in components except in this file’s source tokens.

---

## 4. Colour

### 4.1 Brand and canvas

| Token                   | Hex                               | Use                                                                                                                                                                                         |
| ----------------------- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--color-accent`        | **`#A3E635`** (Tailwind lime-400) | Primary **button** fill, selected-row **start border**, focus ring (with navy offset), positive highlight. Never a selected-row fill. Maps to shadcn **`--primary`**, not shadcn `--accent` |
| `--color-accent-hover`  | **`#84CC16`** (lime-500)          | Hover on accent fill                                                                                                                                                                        |
| `--color-accent-active` | **`#65A30D`** (lime-600)          | Pressed primary                                                                                                                                                                             |
| `--color-accent-fg`     | **`#0B1220`**                     | Text/icons **on** accent. Never white-on-lime-400 (contrast)                                                                                                                                |
| `--color-header`        | **`#0B1220`**                     | Global header background                                                                                                                                                                    |
| `--color-header-fg`     | **`#FAFAFA`**                     | Header text/icons (zinc-50)                                                                                                                                                                 |
| `--color-canvas`        | **`#FFFFFF`**                     | Main workspace                                                                                                                                                                              |
| `--color-muted`         | **`#F4F4F5`** (zinc-100)          | Section bands, skeleton, unread row wash                                                                                                                                                    |
| `--color-border`        | **`#E4E4E7`** (zinc-200)          | Default hairline. Do not outline every card                                                                                                                                                 |
| `--color-text`          | **`#18181B`** (zinc-900)          | Body                                                                                                                                                                                        |
| `--color-text-muted`    | **`#52525B`** (zinc-600)          | Secondary labels (still AA on white)                                                                                                                                                        |

Working pin for “OnchainStack lime” = **lime-400** (OQ-73). Do not use CSS `lime` (`#00FF00`). lime-50 (`#F7FEE7`) is **`--surface-selected` only**, not a page background.

### 4.2 Semantic (not lime)

| Token                   | Hex       | Use                                    |
| ----------------------- | --------- | -------------------------------------- |
| `--color-success`       | `#15803D` | Confirmed, connected, sent             |
| `--color-warning`       | `#B45309` | Pending approval, 80% usage            |
| `--color-danger`        | `#B91C1C` | Error, disconnect, destructive default |
| `--color-danger-hover`  | `#991B1B` | Destructive hover                      |
| `--color-danger-active` | `#7F1D1D` | Destructive pressed                    |
| `--color-info`          | `#1D4ED8` | Neutral info (not “AI magic”)          |

Lead temperature (inbox): **hot / warm / cold** are a **word + icon**, never a row fill. Do not use `--surface-selected` for warm (that token is selection only). Do not use red for hot leads (reserved for errors / handoff-critical).

Handoff priority: **critical** danger, **high** warning, **normal** zinc. Channel: small grey labels `Instagram` / `Messenger` — not official brand gradients. Merchant UI may say **Agent** for the Employee role (`13`); that is a label, not a fourth role.

### 4.3 shadcn HSL (source)

```css
:root {
  --background: 0 0% 100%;
  --foreground: 240 6% 10%;
  --card: 0 0% 100%;
  --card-foreground: 240 6% 10%;
  --primary: 83 78% 55%; /* #A3E635 — buttons. Our --color-accent */
  --primary-foreground: 222 49% 8%; /* #0B1220 */
  --secondary: 240 5% 96%;
  --secondary-foreground: 240 6% 10%;
  --muted: 240 5% 96%;
  --muted-foreground: 240 4% 33%; /* zinc-600, AA on white */
  --accent: 240 5% 96%; /* zinc hover — NOT lime */
  --accent-foreground: 240 6% 10%;
  --destructive: 0 72% 42%; /* #B91C1C */
  --border: 240 6% 90%;
  --ring: 83 78% 55%; /* lime focus */
  --radius: 0.5rem;
}
```

**Name collision:** our `--color-accent` is lime. shadcn `--accent` is **zinc hover**. Lime buttons are shadcn `--primary`. Do not set shadcn `--accent` to lime — that floods menus and ghost hover.

Header is **not** `--background`. It is `--color-header` on the shell only. Do not put the whole app in dark mode in MVP (OQ-74).

### 4.4 Contrast rules

| Pair                        | Rule                                                                                                            |
| --------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Body text on canvas         | zinc-900 on white                                                                                               |
| Muted text                  | zinc-600 minimum on white (not zinc-400)                                                                        |
| Accent as **text** on white | **Forbidden** for small type. Use navy or zinc-900. Accent is fill/border/icon                                  |
| Accent fill button          | navy (`#0B1220`) label                                                                                          |
| Header                      | `--color-header-fg` on `--color-header`                                                                         |
| Focus                       | `--focus-ring` (§4.5): 2px accent + 2px navy offset. **On header:** 2px accent + 2px `--color-header-fg` offset |
| Charts                      | zinc scale + **one** accent series. No rainbow, no 3D                                                           |

### 4.5 Surfaces

Closed set. Do not invent `zinc-*` in JSX.

| Token                   | Value                                              | Use                                                                                                 |
| ----------------------- | -------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `--surface-raised`      | `#FFFFFF`                                          | Dropdowns, popovers, dialogs. Colour = canvas; lift = §6 shadow only                                |
| `--surface-subtle`      | `#F4F4F5`                                          | Alias of `--color-muted`. Section bands, unread wash                                                |
| `--surface-hover`       | `#FAFAFA`                                          | Row, nav, secondary/ghost hover                                                                     |
| `--surface-selected`    | `#F7FEE7`                                          | Selected list row and selected nav item. Navy text. **Not** lime-400 fill. **Not** lead-temperature |
| `--surface-active`      | `#F4F4F5`                                          | Pressed secondary/ghost. Same fill as subtle — do not invent a fourth grey                          |
| `--surface-disabled`    | `#F4F4F5`                                          | Disabled control background. Distinguish with `--text-disabled`, not a new grey                     |
| `--text-disabled`       | `#A1A1AA`                                          | Disabled labels only (inactive UI). Not body copy                                                   |
| `--color-border-strong` | `#D4D4D8`                                          | Input hover border                                                                                  |
| `--focus-ring`          | 2px `--color-accent` + 2px offset `--color-header` | Pages. On header, offset is `--color-header-fg`. No third focus colour                              |

Selected chrome: `--surface-selected` + `3px solid var(--color-accent)` on `border-inline-start`. A selected conversation must not look like a primary button.

### 4.6 Control states

Lime-400 fill is **primary default / hover / active only**.

| State    | Primary                                                                     | Secondary                        | Destructive                                   | Input                       |
| -------- | --------------------------------------------------------------------------- | -------------------------------- | --------------------------------------------- | --------------------------- |
| default  | `--color-accent` / `--color-accent-fg`                                      | canvas + `--color-border` / navy | `--color-danger` / `--color-header-fg`        | canvas + `--color-border`   |
| hover    | `--color-accent-hover` / navy                                               | `--surface-hover`                | `--color-danger-hover` / `--color-header-fg`  | `--color-border-strong`     |
| active   | `--color-accent-active` / navy                                              | `--surface-active`               | `--color-danger-active` / `--color-header-fg` | same as focus               |
| focus    | default + `--focus-ring`                                                    | default + `--focus-ring`         | default + `--focus-ring`                      | `--focus-ring`, border navy |
| disabled | `--surface-disabled` / `--text-disabled`; no lime                           | same                             | same                                          | same                        |
| loading  | keep default colours; `aria-busy`; `pointer-events: none`; no extra spinner | same                             | same                                          | readonly + skeleton line    |

Ghost / icon-only: transparent default, `--surface-hover` on hover, no border. Component props stay in `23`.

---

## 5. Typography

| Role                     | Family                                                  | Notes                                                |
| ------------------------ | ------------------------------------------------------- | ---------------------------------------------------- |
| UI Latin (`fr-TN`, `en`) | **IBM Plex Sans**                                       | Google Fonts or `next/font`. Weights 400 / 500 / 600 |
| UI Arabic (`ar-TN`)      | **IBM Plex Sans Arabic**                                | Same sizes; `font-family` stack switches with locale |
| Numerals                 | IBM Plex Sans, **`font-variant-numeric: tabular-nums`** | KPIs, money, lead score                              |
| Customer chat bubbles    | Same family                                             | Do not use a “fun” display face for Derja            |

**Forbidden:** Inter as the brand face, Comic / script, shrinking `text-[11px]` to cram density.

| Step      | Size / line          | Use                                                           |
| --------- | -------------------- | ------------------------------------------------------------- |
| `display` | 24px / 32px, 600     | Page title only                                               |
| `title`   | 18px / 28px, 600     | Pane titles, KPI value (KPI value may be 28–32px / 36px, 600) |
| `body`    | **16px / 24px**, 400 | Default. Inbox messages included                              |
| `label`   | 14px / 20px, 500     | Nav, filters, table headers                                   |
| `caption` | 12px / 16px, 400     | Timestamps, “Il y a 2 min”. Never for primary content         |

Minimum body **16px**. Comfortable line length in the chat pane; do not full-bleed paragraphs across 1440px.

### 5.1 Overflow

| Content               | Rule                                                                                                                                    |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Nav labels            | 1 line; `text-overflow: ellipsis`; `title` = full label                                                                                 |
| Customer names        | 1 line ellipsis                                                                                                                         |
| Product names         | 2 lines (`line-clamp-2`), then ellipsis                                                                                                 |
| Open thread messages  | Wrap. Do not ellipsis the open bubble                                                                                                   |
| List preview snippets | 1 line ellipsis                                                                                                                         |
| URLs                  | `overflow-wrap: anywhere`                                                                                                               |
| Arabic (`ar-TN`)      | Line-based clamp/ellipsis only. Never `overflow: hidden` on a single glyph run; never letter-spacing tricks that clip connected letters |
| Mixed-direction chat  | Customer bubbles: `dir="auto"` (NFR-I18N-02). Latin SKUs inside Arabic/Derja must not flip the whole pane                               |
| Money, KPIs, scores   | `white-space: nowrap` + tabular nums                                                                                                    |

---
