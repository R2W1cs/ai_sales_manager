## 6. Spacing, radius, elevation, motion

| Token         | Value                                                                                                                                               |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Space unit    | **4px**. Scale 4 / 8 / 12 / 16 / 24 / 32 / 48                                                                                                       |
| Card padding  | 16px default; 12px in inbox list rows                                                                                                               |
| Sidebar width | **240px** desktop; overlay drawer on mobile                                                                                                         |
| Header height | **56px**                                                                                                                                            |
| Radius        | **8px** (`--radius: 0.5rem`). Buttons, inputs, cards share it. **Only** the 8px unread dot uses full-round (`rounded-full`). Not buttons            |
| Border        | 1px `--color-border`. Sidebar/header separators allowed; not every widget                                                                           |
| Shadow        | `0 1px 2px rgb(0 0 0 / 0.06)` max on dropdowns/popovers. **No** heavy floating KPI cards                                                            |
| Motion        | **≤ 150ms** opacity/transform on open. Skeletons, not spinners, for page load. AI status is copy (`Analyse de la conversation…`), not a looping orb |

### 6.1 Control heights

| Token                      |   Height | Tailwind | Use                                                         |
| -------------------------- | -------: | -------- | ----------------------------------------------------------- |
| `--control-height`         | **40px** | `h-10`   | Default input and button                                    |
| `--control-height-compact` | **36px** | `h-9`    | Table row actions, inbox row chips — labelled controls only |
| `--control-height-mobile`  | **44px** | `h-11`   | Primary actions below `lg` (takeover, send, confirm)        |

**Forbidden:** `h-8` / 32px on buttons or inputs. Unread dots stay 8px.

### 6.2 z-index

Closed scale. No `z-[999]`.

| Token          | Value | Use                                                                                 |
| -------------- | ----: | ----------------------------------------------------------------------------------- |
| `--z-base`     |     0 | Page                                                                                |
| `--z-sticky`   |    10 | Pane / table sticky headers                                                         |
| `--z-overlay`  |    15 | Mobile sidebar and inbox sheets — **below** the header so 56px chrome stays visible |
| `--z-header`   |    20 | App header                                                                          |
| `--z-dropdown` |    40 | Menus (must sit above header)                                                       |
| `--z-popover`  |    50 | Popovers, tooltips                                                                  |
| `--z-modal`    |    60 | Dialogs, destructive confirm                                                        |
| `--z-toast`    |    70 | Toasts if used; prefer aria-live (§10)                                              |

---

## 7. Layout and breakpoints

Desktop is the reference. Mobile is designed, not scaled-down (NFR-UX-02). Below `lg`, inbox is list **or** chat **or** context (stack); primary actions use `--control-height-mobile`.

| Name     |    Width | Shell                                                                            |
| -------- | -------: | -------------------------------------------------------------------------------- |
| QA width |      375 | NFR-UX-02. **Not** a Tailwind `screens` key — do not add `xs`                    |
| `md`     |      768 | Below `lg`: overlay sidebar from header `[≡]` (`22` / `23`). Not a third pattern |
| `lg`     | **1024** | Icon-only sidebar `64px`; inbox list + chat; context as sheet                    |
| `xl`     | **1280** | Sidebar `240px`; three-pane command center (`22`)                                |
| `2xl`    |     1536 | Same; do not add a fourth pane                                                   |

App shell (all authenticated pages except full-bleed auth):

```
┌─────────────────────────────────────────────┐
│ Header 56px — dark navy                     │
├──────────┬──────────────────────────────────┤
│ Sidebar  │ Main: title → hint → filters/CTA │
│ 240px    │ → Level 1 … Level 4              │
└──────────┴──────────────────────────────────┘
```

Inbox **does not** use the dashboard KPI grid. Structure and collapse: `22`.

The **240px** sidebar is **app chrome**, outside the three inbox panes. At `xl`, the panes inside **main** follow Brain Dump `# Sales Command Center`: list **~28%** / thread **~44%** / context **~28%**. Pixel `minmax` and mobile stack live in `22`. Do not add a fourth pane. Do not place 360 + 420 + 320 **beside** the 240px sidebar (that overflows `xl` 1280).

Page IA (every settings/list page): title → one-line explanation → primary controls + one primary action → Level 1 … Level 4. Never equal weight.

---

## 8. Language, RTL, formats

| Topic               | Pin                                                                                                                                                                                                                           |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Default locale      | `fr-TN` (`next-intl`)                                                                                                                                                                                                         |
| Also                | `ar-TN` (RTL), `en`                                                                                                                                                                                                           |
| Strings             | `next-intl` catalogs. **No** hard-coded French in components (NFR-I18N-03)                                                                                                                                                    |
| RTL                 | `dir` on `<html>` from locale. Use logical CSS (`ps`/`pe`, `ms`/`me`, `start`/`end`). Lucide icons that imply direction (chevrons) flip                                                                                       |
| Nav item set (MVP)  | Tableau de bord, Conversations, Pipeline, Produits, Clients, Commandes, Analyses, Intégrations, Paramètres — **`fr-TN` reference copy** for the closed item list and order. Implement via catalogs, never JSX string literals |
| Money               | `12 540 DT` — space as grouping, 0–3 fraction digits from `12` Decimal, suffix `DT`                                                                                                                                           |
| Dates               | Business timezone (`luxon` on API; UI via `next-intl` + `timezone` from `GET /api/v1/businesses/:id`)                                                                                                                         |
| API `error.message` | English (`13`). UI maps `code` → French string                                                                                                                                                                                |

Do not show post-MVP nav (Campagnes, Séquences, Rendez-vous, empty Leads module).

---

## 9. Density and chrome rules

For every control, it must do at least one of: inform, decide, navigate, trust, explain AI, act. Else remove.

| Do                                             | Do not                                                   |
| ---------------------------------------------- | -------------------------------------------------------- |
| 4–6 metric cards on overview                   | 12 tiny icon cards                                       |
| One chart when it answers “what changed?”      | Eight sparkline ornaments                                |
| Tables 5–7 columns default                     | Every DTO field                                          |
| Quiet inbox when AI is handling (`22`)         | Badge on every conversation                              |
| Plan usage on header or Paramètres             | Hidden limits until 403                                  |
| Four §15 KPIs (+ usage / needs-me on overview) | Revenue, CSAT, embeddings, raw confidence, model latency |
| Trust line where it earns a connect/activate   | Decorative “RGPD” stickers on every page                 |

Conflict priority (Brain Dump): product requirements → usability → a11y → consistency → Tunisian relevance → context-rich → aesthetics.

Trust copy (settings footer, onboarding, billing, blocked empty states):

`Développé en Tunisie · Support local · Données hébergées en Europe`

Exact legal wording is `21`. Do not invent a privacy-policy URL here.

### 9.1 Forbidden visual patterns

Do not use:

- Glassmorphism
- Gradient backgrounds
- Neon/glowing AI effects
- Floating AI assistant avatars
- Excessive rounded cards
- Dashboard wallpaper backgrounds
- Decorative illustrations inside operational screens
- Rainbow charts
- Gamified UI patterns
- Crypto/web3 visual language
- Excessive badges and pills
- Large hero sections inside authenticated app pages

The product should feel like a professional sales workspace, not a marketing landing page.

---

## 10. Accessibility

| Rule           | Pin                                                                                                         |
| -------------- | ----------------------------------------------------------------------------------------------------------- |
| Contrast       | AA for text and UI components on core flows                                                                 |
| Focus          | Visible ring §4.4; never `outline-none` without a replacement                                               |
| Keyboard       | Sidebar, inbox list, dialogs, filters operable without a pointer                                            |
| Hit target     | `--control-height-mobile` (**44px**) below `lg` for primary actions (takeover, send, confirm)               |
| Icons          | Text label unless the control is a well-known header icon **and** has `aria-label` (notifications, account) |
| Live regions   | New inbox message / handoff: polite aria-live on the list, not a toast storm                                |
| Reduced motion | Honour `prefers-reduced-motion: reduce` (instant show/hide)                                                 |
| Colour         | Temperature and status always have a word or icon, not colour alone                                         |

Playwright covers takeover + confirm (`11`). Contrast is a review gate, not a “fix later”.

---

## 11. Loading, empty, error (visual)

| State       | Pin                                                                                                                                                |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Page load   | Zinc skeletons matching the layout. Not a centered spinner                                                                                         |
| AI turn     | Status text in the thread (`Analyse de la conversation…` / `Préparation de la réponse…`). **MVP does not stream tokens** (`15`). No fake streaming |
| Empty       | Title + why it matters + **one** CTA (NFR-UX-06). Never “No data.”                                                                                 |
| Error       | What happened + what to do (NFR-UX-04). Map `13` `code`                                                                                            |
| Destructive | Confirm in a dialog (NFR-UX-03). Danger colour on the confirm control only                                                                         |

Copy examples belong in `23` / `22`. This file only forbids bare empty and generic `Loading…`.

---

## 12. How coding agents must use this

1. Tokens in CSS variables / Tailwind theme. No one-off hex or `zinc-*` in JSX — use §4.5 surfaces.
2. Primary buttons: accent fill + navy label. Secondary: zinc border, navy text. Destructive: danger, never lime. States: §4.6.
3. Selected row ≠ primary button: `--surface-selected` + 3px start border, not lime fill. Temperature is word+icon, not that wash.
4. Control heights are `h-10` / `h-9` / `h-11` only (§6.1). No `h-8` on controls.
5. z-index from §6.2 only. Overlay is **15** (below header). No `z-[999]`.
6. Overflow from §5.1. Arabic: line clamp, never glyph clipping. Chat bubbles `dir="auto"`.
7. Do not add a fifth analytics tile. The four names are `01` §15. Do not add WhatsApp nav in MVP.
8. Do not use Inter, Geist, Nova/Mira compact styles, or catalog `lime` theme. shadcn `--accent` stays zinc; lime is `--primary` / `--color-accent`.
9. Do not install Framer Motion “for polish.”
10. `fr-TN` strings in catalogs (nav labels in §8 are reference, not JSX). RTL via logical properties.
11. Body text ≥ 16px. Do not shrink to fit.
12. Header stays dark; pages stay light. No app-wide dark mode in MVP.
13. UI hiding ≠ authorization (`17`). Employee may be labelled Agent; do not add a fourth role.
14. Inbox pane **percentages** are this file; pixel `minmax`, collapse, and notification caps are `22`.
15. If a screen feels busy, remove chrome first (borders, icons, duplicate labels), not KPIs.
16. Do not add a Tailwind `xs` breakpoint for 375.
17. Components consume tokens; they do not redefine them. Do not add colors, spacing, typography, radius, or state values inside components. If a component needs a new visual rule, add it here first.

---

## 13. Open questions

| #     | Question                     | Working answer                                                                  | Owner   | Revisit                      |
| ----- | ---------------------------- | ------------------------------------------------------------------------------- | ------- | ---------------------------- |
| OQ-73 | Exact OnchainStack lime hex? | **`#A3E635`** (lime-400). Restrained use. Change only with a founder brand file | Design  | If `21` ships a logo palette |
| OQ-74 | Dark mode for the workspace? | **No in MVP.** Dark **header** only                                             | Product | Merchant requests            |
| OQ-75 | Custom icon set vs Lucide?   | **Lucide**                                                                      | Design  | Decided                      |

Do not reopen four-KPI, French-primary UI, or unofficial WhatsApp.

---

## 14. References

- `docs/AI_Sales_Agent_Brain_Dump.md` → `# UX/UI Design Direction`
- `docs/00_product/01_PRODUCT_REQUIREMENTS.md` NFR-UX, NFR-I18N, §15 KPIs
- `docs/10_engineering/11_TECH_STACK.md` §2.1, §8
- `docs/10_engineering/13_API_DESIGN.md` §2.8
- `docs/10_engineering/15_AI_ARCHITECTURE.md` — no token streaming
- `docs/20_design/21_BRAND_STRATEGY.md` — brand positioning, voice & tone, naming, trust cues
- `docs/20_design/22_UX_FLOWS.md` — Sales Command Center UX, three-pane mechanics, onboarding flows
- `docs/20_design/23_UI_COMPONENTS.md` — component inventory, props, states
- `docs/20_design/24_REFERENCE_SCREENS.md` — visual benchmarks (export pending)
