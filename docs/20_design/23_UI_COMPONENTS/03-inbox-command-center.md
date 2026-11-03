## 7. Inbox — Sales Command Center

`InboxLayout` implements `22` §5 / §14.1. Owns `GET /conversations/:id` (pass detail into panes — §3.5). Opening a thread **does not** mark it read via that GET (`13` §6.2). `InboxLayout` must `POST .../read` (**204**) when the operator selects the conversation. Unread wash then clears from the list DTO / refetch.

| Breakpoint     | Panes                                                                                    |
| -------------- | ---------------------------------------------------------------------------------------- |
| `xl` ≥1280     | 3-pane inside **main** (~28 / 44 / 28). Sidebar 240px is **outside** the split (`20` §7) |
| `lg` 1024–1279 | List + chat; Pane 3 = `Sheet` at `--z-overlay`                                           |
| `< lg`         | Single-pane stack: list → chat → details sheet. Primary actions `h-11`                   |

Do not place 360+420+320 **beside** the sidebar (overflows `xl`).

### 7.1 `ConversationList` (`C-INBOX-02`)

`GET /api/v1/conversations` (`13` §6.1) — this component **owns** the list query (§3.5). Default `view=needs_me`, `sort=sales_priority`. Exclude `isTest`. Cursor pagination `13` §2.7. Row shape = list DTO in `13` §3.3 (do not re-declare fields here).

**Do not re-sort on the client.** Server order is the priority model (`22` §6.1). Client may move a row when `conversation.status` / `conversation.handoff` arrives, then reconcile on refetch.

Unread row wash: `--surface-subtle`. Selected: `--surface-selected` + 3px start accent. Hover: `--surface-hover`. Min card height below `lg`: **72px** (`22` §14.2).

`InboxViewTabs`: **`needs_me` | `all` only** — those are the `view` values in `13` §6.1. Unread is a **row flag** (`unread` on the DTO → `--surface-subtle` wash), not a third tab and not a client-side filter of the loaded page. Search input visible; submitting `q` that returns **501** `not_implemented` shows `ErrorBanner`, does not grep the loaded page.

No snooze affordance. No archived lane in the default list (`RESOLVED` hidden).

### 7.2 `ConversationCard` (`C-INBOX-03`)

Must answer _open or skip?_ without opening (`22` §6.2). Anatomy:

1. `ChannelBadge` + customer name (1-line ellipsis, `title` = full name — `20` §5.1)
2. `TemperatureBadge` + tabular `leadScore`
3. Product/value: from `pendingOrder` when present (`MoneyText` on `total`). List DTO has **no** product name — do not invent _Hoodie Noir (M)_ on the card. Detail/order desk shows line items.
4. `lastMessagePreview` 1-line ellipsis, `dir="auto"`
5. Tier 1 only: urgency strip with `escalationReason` mapped via `21` §6.2 / `06` (never raw enum in chrome)
6. Assignee `Avatar` if `assignedUserId`
7. Relative time from `lastMessageAt` (or `handoffAt` on Tier 1)

Keyboard: arrow keys move selection; Enter opens (`22` §19).

### 7.3 `ThreadHeader` + `AutonomyToolbar` (`C-INBOX-06/07`)

Header left: full name, `ChannelBadge`, verified phone indicator if present.

Header right — **named controls** (`22` §5 / §14):

| Control             | When          | Contract                                                                                                          |
| ------------------- | ------------- | ----------------------------------------------------------------------------------------------------------------- |
| `[Info]`            | Always        | `xl`: toggles Pane 3 collapse. `lg` and below: opens Pane 3 `Sheet` at `--z-overlay`. `aria-label` _Fiche client_ |
| `AssignControl`     | `inbox.write` | §7.15                                                                                                             |
| `CloseThreadButton` | `inbox.write` | §7.16                                                                                                             |

Then pick chrome from the **open thread DTO**, not from `GET /api/v1/ai/settings` (`ai.configure` is 403 for Employee). Settings / step 6 still PATCH `replyMode` via that route (Owner/Admin).

| Condition (evaluate top to bottom)                                               | Pill                                                        | Primary control                                               | Contract                                                                                                             |
| -------------------------------------------------------------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `status` is `HUMAN_HANDLING` (or takeover 200)                                   | `human_handling`                                            | `[Réactiver l'IA]`                                            | `POST .../resume-ai`. **409** `pending_order_blocks_resume` → keep human chrome + explain                            |
| `status` is `HUMAN_REQUIRED`                                                     | `handoff_*` from `handoffPriority`                          | `[Prendre la main]`                                           | `POST .../takeover`. Drafts, if any, stay on `MessageBubble` / `DraftActions` — they do **not** replace this toolbar |
| Open thread has any message with `deliveryStatus=draft` (AI still on the thread) | `draft_pending`                                             | `DraftActions`                                                | `POST .../messages/:messageId/approve`                                                                               |
| `aiEnabled` and last AI outbound is `queued` \| `sent` \| `delivered`            | `ai_active`                                                 | `[Prendre la main]`                                           | `POST .../takeover` — pending until **200**                                                                          |
| `aiEnabled` but no AI outbound yet (generating or new thread)                    | `draft_pending`                                             | wait copy in thread (`20` §11); do **not** assume `auto_send` | Safer default (FR-AI-011). Flips to `ai_active` when a non-draft AI message arrives                                  |
| Else (AI paused)                                                                 | `handoff_*` if `handoffPriority` set, else `human_handling` | `[Prendre la main]`                                           | `POST .../takeover`                                                                                                  |

Do **not** guess `replyMode` from a green pill. After resume **200**, re-run the table from GET thread + messages.

Takeover button: `aria-busy`, label `Prise en main…`. Do not switch the pill to “you own this” until 200.

Below `lg`, takeover / send / confirm use `--control-height-mobile`.

### 7.4 `MessageBubble` (`C-INBOX-09`)

`GET .../messages` — this component **owns** the messages query (§3.5). Reverse page so oldest→newest (`13` §2.7). Include `draft` and `failed`. `senderType` is `customer` \| `ai` \| `human` \| `system` (`12` `SenderType`). **Not** `user`.

| Kind     | When                                                              | Chrome                                                                                                                                                                                                                                                                                                                                                           |
| -------- | ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Customer | `senderType=customer`                                             | Left, `--surface-subtle`, `dir="auto"`. Timestamp on hover (`caption`)                                                                                                                                                                                                                                                                                           |
| AI sent  | `senderType=ai` and `deliveryStatus` in `queued\|sent\|delivered` | Right, `--surface-subtle` + `🤖 IA` chip (no unnamed “navy tint” — `20` §4.5 is closed). Owner/Admin hover: `prompt_version_id` + grounding (`tools_called`, `fallback_used` from `12` §14.2). Do **not** show `latency_ms`, model id, or raw `confidence` as chrome. Employee: no `aiMetadata` tooltip. All roles with `inbox.write`: `MessageFeedback` (§7.17) |
| AI draft | `senderType=ai` and `deliveryStatus=draft`                        | Right, canvas + `--color-warning` outline, `📝 Brouillon` + `DraftActions`. **Default post-activation transcript**                                                                                                                                                                                                                                               |
| Human    | `senderType=human`                                                | Right, `--color-header` fill, `--color-header-fg`, operator avatar                                                                                                                                                                                                                                                                                               |
| System   | `senderType=system`                                               | Render as `SystemEventChip`, **not** a bubble                                                                                                                                                                                                                                                                                                                    |
| Failed   | `deliveryStatus=failed`                                           | Danger outline + `[Réessayer l'envoi]` → `POST .../retry`                                                                                                                                                                                                                                                                                                        |

Queued human/AI outbound: show as queued, **not** delivered (`22` §13.2). `delivered` only if the DTO says so.

First low-confidence turn: caption _Précision demandée par l'IA_ on the AI bubble (`22` §7.5). Second consecutive: thread is Tier 1 — do not invent a third numeric band.

Open bubbles wrap; do not ellipsis (`20` §5.1).

### 7.5 `DraftActions` (`C-INBOX-11`)

DraftActions infers mode from the thread: if `POST .../approve` would be valid (message is `draft`), show Approve. On **409** (`draft_only`), hide Approve and copy into composer (`13` §6.2). Do not fetch `replyMode` from `GET /ai/settings` in the inbox.

```ts
type DraftActionsProps = {
  conversationId: string;
  messageId: string;
  content: string;
};
```

| State                                  | Approve                                                              | Edit                     |
| -------------------------------------- | -------------------------------------------------------------------- | ------------------------ |
| Message is `draft`                     | `[Approuver et envoyer]` → `POST .../approve` optional `{ content }` | Inline edit then approve |
| Approve returns **409** (`draft_only`) | Hide; copy into `Composer`; send via `POST .../messages`             | Composer                 |
| No `draft` (e.g. `auto_send`)          | Not rendered                                                         | —                        |

Primary button is **Approve**, not Takeover, while a draft is the job.

### 7.6 `SuggestionPanel` (`C-INBOX-12`)

Visible only in `HUMAN_HANDLING` or `HUMAN_REQUIRED`. Trigger is **`[Suggérer]` on `Composer`** (§7.7) — one control, not a second button on the panel. Click → `POST .../suggest` **202**. Pending skeleton `< 5 s` (`22` §7.3 / §16.2). Result: `conversation.suggestion` or `draft` message.

Actions: `[Insérer dans le champ]` (composer only) / `[Envoyer directement au client]` (`POST .../messages`). Nothing ships without a click.

**409** complaint/refund: unmount the panel. **403** `ai_paused`: quota `ErrorBanner`, no retry loop. Not generated on thread open or keystroke.

### 7.7 `Composer` (`C-INBOX-13`)

Multiline `Textarea`, `dir="auto"`. Send: `POST .../messages` `{ content }` + Idempotency-Key. **201** `deliveryStatus=queued` → append bubble. This send **is** implicit takeover (`ai_enabled=false` on the server). Do **not** also `POST .../takeover` unless the operator clicked `[Prendre la main]`.

`[Suggérer]`: secondary control next to Send, **only** when status is `HUMAN_HANDLING` or `HUMAN_REQUIRED`. Same `POST .../suggest` **202** as §7.6. Hide on complaint/refund threads (would 409). Hide when `403` `ai_paused`.

`/` opens canned snippets (local templates). Image: multipart as in `13` §6.2. No payment-link chip.

### 7.8 `SystemEventChip` (`C-INBOX-10`)

Centered, not a bubble (`22` §2 item 6 / §7.2). Handoff, order created, takeover. Copy from timeline/status events — not chat-shaped. Also the render path for `senderType=system`.

### 7.9 `HandoffBriefing` (`C-INBOX-18`)

Renders `handoffContext` from conversation detail (`06`, `13` §3.3): reason, priority, required action, summary. **All roles.** Decision traces: `GET .../decision-traces` behind `ai.traces.read` (Owner/Admin). Employee: briefing only (FR-OBS-003).

### 7.10 `CustomerCard` (`C-INBOX-14`)

Name, phone, `[📞 Appeler le client]` as `tel:` + `aria-label="Appeler le client"`. Instagram handle from `customer.identities[]` (`platform`, `platformUserId`) if present — do not invent a handle field. Click-to-call does **not** POST an audit route; timeline/audit are server-written (`17`). Address if captured. Missing phone: show the field empty; do not block the pane.

### 7.11 `LeadScoreBlock` (`C-INBOX-15`)

Gauge 0–100 tabular + `TemperatureBadge`. Popover _Pourquoi ce score ?_ iterates `leadScoreFactors` (`Record<string, number>` from `12` §14.6 / `13` detail). Display signal key → i18n label + points. **Do not hard-code weights** (`14` §10).

### 7.12 `OrderDeskCard` (`C-INBOX-16`)

Show when `pendingOrder` is non-null. Line items from **`GET /api/v1/orders/:id`** (`13` §8, `inbox.read`) — list DTO has totals only. If `pendingOrderAmbiguous`, disable one-click confirm and require `PATCH /orders/:id/status` on a chosen id (`13` §3.3 / §6.2).

```
Items from GET order DTO · MoneyText per line · TOTAL À ENCAISSER
[ ] Paiement encaissé     ← optional; FR-ORD-006
[ ✓ Confirmer la commande ]   [ Annuler ]
```

Confirm: pending on button; `POST /conversations/:id/confirm-order` **or** `PATCH /orders/:id/status` `{ status: "CONFIRMED" }`. **No** `POST /orders/:id/confirm`. If _Paiement encaissé_ is checked, include `{ "paymentStatus": "COMPLETED" }` on that same call (`13` §6.2 / §8). Unchecked: omit `paymentStatus` (COD remains pending — staff can complete later via `PATCH` status). Success: refresh thread + pane from REST.

Cancel: `ConfirmDialog` + reason → `PATCH` `{ status: "CANCELLED" }`.

**No `[Modifier les articles]` in MVP.** `13` §8 has no line-item PATCH. Do not invent `PATCH /orders/:id/items`. Staff cancel and `POST /orders` if the basket is wrong. Failed confirm recovery is **`[Réessayer]` only** (`22` §16.3) — not an item editor.

Copy: _en attente de confirmation_, never _en attente de paiement_.

### 7.13 `TimelineList` (`C-INBOX-17`)

`GET .../timeline`. Projection only — no new table. `caption` timestamps in business timezone.

### 7.14 `InternalNote` (`C-INBOX-19`)

`GET .../notes` to render; `POST .../notes` to add. Visually distinct from `MessageBubble`. Never outbound. Author + timestamp (`02` US-D-09).

### 7.15 `AssignControl` (`C-INBOX-20`)

`Select` of active members from `GET /api/v1/businesses/:id/members` (`13` §5). Submit: `POST /api/v1/conversations/:id/assign` `{ userId }` (`inbox.write`). Target must be an active member. Show current `assignedUser` from thread detail. **No unassign route** in MVP — do not invent `userId: null`. Filter-by-assignee stays on `InboxFilterPopover` (`13` §6.1).

### 7.16 `CloseThreadButton` (`C-INBOX-21`)

Label `[Clôturer]`. `ConfirmDialog` then `POST /api/v1/conversations/:id/close` → `RESOLVED` (`13` §6.2). **409** if a pending order exists: keep the thread open, `ErrorBanner` (confirm or cancel the order first). Hidden from _À traiter_ after success (`22` §6.1). Not snooze.

### 7.17 `MessageFeedback` (`C-INBOX-22`)

Thumbs on **AI sent** bubbles only (`senderType=ai`, `deliveryStatus` in `queued|sent|delivered`). Not on drafts, human, customer, or system.

`POST /api/v1/messages/:id/feedback` (`inbox.write`, FR-OBS-006). Body as `13` §11: `{ rating: "positive" | "negative", reason?, comment? }`. Negative **requires** `reason` from `12` `FeedbackReason` — `Select` before submit. Positive: omit `reason`. Optional `comment`. One row per `(messageId, userId)` — disable thumbs after success. Do **not** mount a feedback inbox or call `GET /ai/feedback` here (`ai.configure` list is Settings/debug, not Pane 2).

---
