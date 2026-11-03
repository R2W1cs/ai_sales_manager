## 4. Primitive kit (shadcn + Base UI)

Generate from BFS/shadcn pins in `20` §3 / `11`. Wrap; do not fork styles.

| Primitive (`components/ui`)          | Base UI role              | Domain use                                                                                                                                      |
| ------------------------------------ | ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `Button`                             | Button                    | All CTAs. Variants §5.1                                                                                                                         |
| `Input` / `Textarea`                 | Input                     | Forms, composer                                                                                                                                 |
| `Select`                             | Select                    | Filters, industry, tone                                                                                                                         |
| `Checkbox` / `Switch` / `RadioGroup` | Checkbox / Switch / Radio | Gates, reply mode                                                                                                                               |
| `Badge`                              | (span + tokens)           | Channel, status, temperature word                                                                                                               |
| `Avatar`                             | Avatar                    | Assignee, operator                                                                                                                              |
| `Dialog` / `AlertDialog`             | Dialog                    | Product form, destructive confirm                                                                                                               |
| `Sheet`                              | Dialog/drawer             | Pane 3 at `lg`; mobile details; **sidebar below `lg`**. **z-index `--z-overlay`** (`20` §6.2) so the 56px header stays visible. Not `--z-modal` |
| `Popover`                            | Popover                   | Filters, lead-score “pourquoi”                                                                                                                  |
| `DropdownMenu`                       | Menu                      | User menu, workspace switcher, notification panel                                                                                               |
| `Tooltip`                            | Tooltip                   | Icon-only header controls                                                                                                                       |
| `Tabs`                               | Tabs                      | Inbox views, settings, catalog import                                                                                                           |
| `Table`                              | Table                     | Products, team members                                                                                                                          |
| `Skeleton`                           | (div)                     | Page and list load (`20` §11)                                                                                                                   |
| `Progress`                           | Progress                  | CSV import, quota bar                                                                                                                           |
| `Separator`                          | Separator                 | Sidebar                                                                                                                                         |
| `Command`                            | Combobox/listbox          | `CommandPalette` only                                                                                                                           |
| `ScrollArea`                         | ScrollArea                | Pane 1 list, transcript                                                                                                                         |

**Forbidden wrappers:** custom `Modal` that is not `Dialog`/`Sheet`; `Drawer` from another library; Radix-direct imports; `framer-motion` `motion.div`.

Toasts: prefer in-place `ErrorBanner` + `aria-live`. If a toast is used (failed confirm), `var(--z-toast)` and **one** at a time. No toast storm (`22` §15, `20` §10).

---

## 5. Shared atoms

### 5.1 `Button` variants

Map to `20` §4.6. Heights: `h-10` default, `h-9` labelled compact chips, `h-11` primary actions below `lg`.

| `variant`     | Token treatment                                  | When                                                                                                                           |
| ------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| `primary`     | `--color-accent` fill, `--color-accent-fg` label | One primary per cluster: confirm order, activate, approve-and-send, send                                                       |
| `secondary`   | canvas + `--color-border`, navy text             | Takeover, reconnect, insert suggestion                                                                                         |
| `destructive` | `--color-danger` / `--color-header-fg`           | Cancel order, delete product — **only** after `ConfirmDialog`                                                                  |
| `ghost`       | transparent, `--surface-hover`                   | Icon-only header, dismiss, text-style actions (navy, optional underline). **No separate `link` variant** — `20` §4.6 is closed |

`loading`: keep colours; `aria-busy`; `pointer-events: none`; no extra colour. Spinner **inside** the button (`22` §16.2).

`disabled`: `--surface-disabled` / `--text-disabled`; never lime.

### 5.2 `StatusPill`

Closed set. Word + optional Lucide icon. **Never colour alone.**

| `status`           | Reference copy           | Colour token         | Notes                                                                               |
| ------------------ | ------------------------ | -------------------- | ----------------------------------------------------------------------------------- |
| `draft_pending`    | `📝 Brouillon à valider` | `--color-warning`    | Default new-tenant chrome                                                           |
| `ai_active`        | `🤖 IA en cours`         | `--color-success`    | Last AI outbound is non-draft (`§7.3`). Do not read `replyMode` to choose this pill |
| `human_handling`   | `👤 Repris par {name}`   | `--color-info`       | Include relative time                                                               |
| `handoff_critical` | escalation label         | `--color-danger`     | Tier 1 `critical`                                                                   |
| `handoff_high`     | escalation label         | `--color-warning`    | Tier 1 `high`                                                                       |
| `handoff_normal`   | escalation label         | `--color-text-muted` | Tier 1 `normal` — word+icon, not a third colour                                     |
| `channel_active`   | `Actif`                  | `--color-success`    | Connect cards                                                                       |
| `channel_error`    | disconnect copy          | `--color-warning`    | Banner, not pill-only                                                               |
| `order_pending`    | `En attente`             | `--color-warning`    | Order desk                                                                          |
| `order_confirmed`  | `Confirmée`              | `--color-success`    |                                                                                     |

Do not add a “streaming / thinking orb” pill. AI wait copy is thread status text (`20` §11).

### 5.3 `TemperatureBadge`

```ts
type TemperatureBadgeProps = {
  temperature: "hot" | "warm" | "cold";
  /** Optional numeric score for title tooltip only — never a colour band. */
  score?: number;
};
```

| `temperature` | Icon + word (`fr-TN`) |
| ------------- | --------------------- |
| `hot`         | `🔥 Chaud`            |
| `warm`        | `🟡 Tiède`            |
| `cold`        | `⚪ Froid`            |

Do **not** paint the row with `--surface-selected`. Do **not** use danger red for hot. Do **not** derive the band from `score` in the client.

### 5.4 `ChannelBadge`

`channel: "instagram" | "messenger" | "whatsapp" | "playground"`. Small zinc label: `Instagram` / `Messenger`. Hide `whatsapp` unless tenant account **and** `whatsapp_enabled`. `playground` only on playground routes, never in merchant inbox (`13` §6.1).

### 5.5 `MoneyText`

```ts
type MoneyTextProps = {
  amount: string; // JSON Decimal string (`13` §2.8). Never a JS number.
  /** ISO from API — display still DT */
  currency?: "TND";
};
```

Renders `12 540 DT` (`20` §8, NFR-UX-08). `font-variant-numeric: tabular-nums`. `white-space: nowrap`. Never `$`, never raw `TND` in chrome.

### 5.6 `EmptyState`

```ts
type EmptyStateProps = {
  titleKey: string;
  bodyKey: string;
  action?: { labelKey: string; href?: string; onClick?: () => void };
};
```

Exactly **one** action. Copy for inbox scenarios is frozen in `22` §16.1 — do not rewrite.

### 5.7 `ErrorBanner`

Maps `13` §2.6 `error.code` → `errors.{code}` catalog. English `error.message` is never shown raw. Always: what happened + what to do (NFR-UX-04). Do **not** copy that status table here. The HTTP wrapper maps `hint`: `reauth` → `POST /auth/refresh` once then retry, else `/login`; `retry` → banner + retry CTA; `upgrade` → quota copy (`22` §16.1).

### 5.8 `ConfirmDialog`

`AlertDialog`. Danger colour **only** on the confirm control. Required for cancel order, delete product, disconnect channel, close thread, remove member (`20` §11, NFR-UX-03). Cancel order requires a reason field (`22` §8.3).

### 5.9 `PermissionGate`

```ts
type PermissionGateProps = {
  code: PermissionCode; // 13 §2.11 closed list
  children: React.ReactNode;
  fallback?: React.ReactNode; // default: render nothing
};
```

Hides chrome. Server still 403s. Employee label in UI is **Agent**; code remains `employee`. No fourth role.

### 5.10 `TrustFooter`

Canonical line from `21` §7.3. Only on onboarding, settings, billing, blocked empty states. Not on every inbox pane.

---

## 6. Application shell

Layout contract: `20` §7 + `22` §3 / §14. Header `56px` / `--color-header`. Selected nav: `--surface-selected` + `3px` start border `--color-accent`.

### 6.0 Full-bleed auth (`C-AUTH-01`–`05`)

Live in `components/auth/`, not `shell/`. These pages **do not** mount `GlobalHeader`, `AppSidebar`, `NotificationBell`, or `PlanUsageCard`. Brand mark + `LanguageSwitcher` + the form. Routes from `13` §4.

| Component            | Page               | Submit                                                   | Notes                                                                                                                                                                               |
| -------------------- | ------------------ | -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `LoginForm`          | `/login`           | `POST /api/v1/auth/login` `{ email, password }`          | **401** same copy for bad password and unknown email. **429** → `ErrorBanner` (FR-AUTH-009, 5/min). Success → first membership `/inbox`, or `/onboarding` if `memberships` is empty |
| `RegisterForm`       | `/register`        | `POST /api/v1/auth/register` `{ email, password, name }` | Password **min 10**. **Does not** create a business (`13` §4). **409** `conflict` on duplicate email. Then `POST /api/v1/businesses` on onboarding step 1                           |
| `AcceptInviteForm`   | `/invite`          | `POST /api/v1/auth/invitations/accept`                   | Body: `token` plus `{ password, name }` for a new user, or an already-established session. Creates membership (FR-AUTH-011). Then `/inbox`                                          |
| `ForgotPasswordForm` | `/forgot-password` | `POST /api/v1/auth/forgot-password`                      | **Should** FR-AUTH-008. Always treat **204** as success copy (do not reveal whether the email exists)                                                                               |
| `ResetPasswordForm`  | `/reset-password`  | `POST /api/v1/auth/reset-password` `{ token, password }` | **Should**. Single-use token                                                                                                                                                        |

Google OAuth (`GET /api/v1/auth/google`) is **Should** FR-AUTH-006. `LoginForm` may include a secondary _Continuer avec Google_ that navigates to that path. Omit the control if Should is not shipping. Do not invent a JS OAuth popup client.

Link _Mot de passe oublié ?_ on `LoginForm` only if `ForgotPasswordForm` ships.

### 6.1 `GlobalHeader` (`C-SHELL-01`)

Height `h-14`. Focus ring on header: 2px accent + 2px `--color-header-fg` offset (`20` §4.4).

| Slot      | Component               | Notes                                                                                                                                                       |
| --------- | ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Menu      | hamburger `[≡]`         | **Below `lg` only.** `aria-label` _Ouvrir le menu_. Opens `AppSidebar` as `Sheet` at `--z-overlay` (header stays visible). No swipe. Preserve current route |
| Brand     | mark + `AI Sales Agent` | Product descriptor until OQ-76                                                                                                                              |
| Workspace | `WorkspaceSwitcher`     | `current_business.name` + role (`Propriétaire` / `Administrateur` / `Agent`)                                                                                |
| Search    | ghost icon              | Opens `CommandPalette`. Does **not** call `q=` on conversations (that is 501 until `pg_trgm`)                                                               |
| Socket    | `SocketStatus`          | Connected / reconnecting copy `22` §13.2                                                                                                                    |
| Locale    | `LanguageSwitcher`      | `FR` / `AR` / `EN` → `fr-TN` / `ar-TN` / `en`                                                                                                               |
| Bell      | `NotificationBell`      | Count = unread **allowed** notification types only (`22` §15)                                                                                               |
| User      | `UserMenu`              | Avatar, name, role. Logout → `POST /api/v1/auth/logout` then `/login`                                                                                       |

### 6.2 `AppSidebar` (`C-SHELL-02`)

| Breakpoint     | Sidebar                                                                                                |
| -------------- | ------------------------------------------------------------------------------------------------------ |
| `xl` ≥1280     | `240px` (`w-60`) expanded                                                                              |
| `lg` 1024–1279 | `64px` icon-only (`22` §18)                                                                            |
| `< lg`         | Overlay `Sheet` at `--z-overlay`, opened from header `[≡]` (`22` §14.2). **No swipe.** Route unchanged |

MVP links (`22` §3.2) — catalogs, not JSX:

| Key             | href         | Badge                                    |
| --------------- | ------------ | ---------------------------------------- |
| `nav.inbox`     | `/inbox`     | needs-me count                           |
| `nav.pipeline`  | `/pipeline`  | none                                     |
| `nav.products`  | `/products`  | none                                     |
| `nav.analytics` | `/analytics` | none                                     |
| `nav.settings`  | `/settings`  | none — **hide for Employee** (`22` §3.3) |

`20` §8 lists additional IA items (Tableau de bord, Clients, Commandes, Intégrations). **Do not add them to the sidebar in MVP** unless `22` adds the route. Channel management lives under Settings → Canaux. Do not add Campagnes / Séquences / Rendez-vous.

Footer: `PlanUsageCard` **only if `usage.read`** (Owner). `GET /api/v1/usage` is Owner-only (`13` §13); Admin/Employee must **not** call it. They see quota via `403` `ai_paused` / the Pane 2 banner, not a fake member usage endpoint. Warning thresholds 80% / 95% apply to that Owner payload (FR-BILL-006). Employee: no billing CTA (`billing.manage`).

Playground is **not** a sidebar item. Owner/Admin reach it from onboarding step 5 only.

### 6.3 `CommandPalette` (`C-SHELL-08`)

`Cmd+K` / `Ctrl+K`. Jump to open conversations in the **loaded** list, products (if catalog GET succeeded), and primary actions (takeover on open thread). Do not fake full-text conversation search (`13` `q` → 501).

### 6.4 `NotificationBell` + `NotificationPanel` (`C-SHELL-05/10`)

Bell **owns** `GET /api/v1/notifications` (§3.5). Count = unread rows (`?unread=true`). Client event `notification.new` increments. Only the four `12` `NotificationType` values chime — mapped to `22` §15.1 copy. Dedup / batching is server-side; UI must not invent extra badges on routine AI replies. `NotificationPanel` is a child — it does not start a second query.

`NotificationPanel` is the bell `DropdownMenu` (not a new page, not a fifth type):

| `type` (`12`)   | Operator copy (`22` §15.1)  |
| --------------- | --------------------------- |
| `HOT_LEAD`      | Hot lead                    |
| `ORDER_REQUEST` | Order awaiting confirmation |
| `HANDOFF`       | AI escalation / uncertainty |
| `ESCALATION`    | Angry / complaint           |

Row click → `/inbox?id=` when `entityType=conversation`. There is **no** `/orders` route in MVP (`22` §3.2). If `entityType=order` and the DTO has no `conversationId`, do not invent `/orders/:id` — persist ORDER_REQUEST against the conversation (`entityType=conversation`) or omit deep-link until `13` adds `conversationId`. Mark that row: `PATCH /api/v1/notifications/:id/read` **204**. _Tout marquer lu_ → `POST /api/v1/notifications/read-all`. Cursor pagination `13` §2.7. Empty: quiet copy, no CTA storm.

---
