# Meta App Review — production submission checklist

Goal: Advanced Access for Instagram Direct + Messenger so design-partner merchants can go live.

> **Rule:** Do not invent Meta App Review case IDs or approval dates. Fill blanks only after Meta responds.

Related: [`META_BUSINESS_VERIFICATION_CHECKLIST.md`](./META_BUSINESS_VERIFICATION_CHECKLIST.md), [`META_LIVE_LOOP.md`](./META_LIVE_LOOP.md), [`docs/50_legal/`](../50_legal/).

---

## 1. Permissions to request

| Permission                  | Why reviewers must approve it                 |
| --------------------------- | --------------------------------------------- |
| `instagram_manage_messages` | Ingest IG DMs, reply, thread management       |
| `pages_manage_metadata`     | Subscribe webhooks on merchant Facebook Pages |
| `pages_messaging`           | Messenger customer interaction                |

Also keep standard connect scopes already in OAuth (`pages_show_list`, `instagram_basic`) as Meta’s UI requires.

---

## 2. Compliance URLs (App Dashboard → Settings → Basic)

Paste **HTTPS production** URLs (replace `<apex>`):

| Field                    | URL                                                                                  |
| ------------------------ | ------------------------------------------------------------------------------------ |
| Privacy Policy URL       | `https://<apex>/privacy`                                                             |
| Terms of Service URL     | `https://<apex>/terms`                                                               |
| User Data Deletion       | `https://hooks.<apex>/api/v1/webhooks/meta/data-deletion` **or** API host equivalent |
| Deauthorize Callback URL | `https://hooks.<apex>/api/v1/webhooks/meta/deauthorize`                              |

Status page returned by deletion callback: `https://<apex>/data-deletion?code=<confirmation_code>`.

Verify locally / staging:

```bash
pnpm meta:verify-webhook
pnpm meta:verify-webhook-hmac
pnpm meta:verify-data-deletion
```

---

## 3. Webhook configuration

| Setting           | Value                                                                                           |
| ----------------- | ----------------------------------------------------------------------------------------------- |
| Callback URL      | `https://hooks.<apex>/api/v1/webhooks/meta`                                                     |
| Verify Token      | Production `META_WEBHOOK_SECRET`                                                                |
| HMAC secret       | Production `META_APP_SECRET` (X-Hub-Signature-256)                                              |
| Subscribed fields | `messages`, `messaging_postbacks`, `message_deliveries` (+ IG message fields for Graph version) |

Hardening already in code:

- `MetaHmacGuard` rejects missing/invalid signatures with **401** (no DB write).
- Persist `integration_events` + enqueue BullMQ, then **200** (ADR-010). Map/LLM stay off the hot path (p95 target &lt; 500ms).

---

## 4. Screencast demo script (record before Submit)

Record **one continuous** screen capture (browser + phone/IG/Messenger) covering:

1. Open Meta App → show requested permissions list.
2. Merchant connects Instagram + Messenger via in-app OAuth (show consent screen).
3. Shopper sends IG DM with product question → assistant reply (grounded price/stock).
4. Shopper says “agent” / “humain” → human handoff appears in inbox.
5. Shopper provides +216 phone + address → pending COD order appears.
6. Staff confirms order.
7. Open `/privacy`, `/terms`, and a sample `/data-deletion?code=…` status page.
8. (Optional) Show `pnpm meta:verify-webhook-hmac` output with p95 &lt; 500ms.

Store the recording under `docs/meta-app-review/` (git-lfs or linked drive). Do **not** commit secrets.

---

## 5. Submission status (fill after Meta)

| Field                       | Value                            |
| --------------------------- | -------------------------------- |
| App ID                      |                                  |
| Submitted on                | _YYYY-MM-DD_                     |
| Review case / ticket        | _leave blank until Meta assigns_ |
| `instagram_manage_messages` | pending / approved               |
| `pages_manage_metadata`     | pending / approved               |
| `pages_messaging`           | pending / approved               |
| Notes from reviewer         |                                  |

---

## 6. Engineering acceptance (repo)

- [x] HMAC enforced on `POST /webhooks/meta`
- [x] Hub verify challenge (`META_WEBHOOK_SECRET`)
- [x] Deauthorize callback
- [x] Data Deletion callback + status page
- [x] Privacy / Terms public routes
- [ ] Screencast uploaded to Meta
- [ ] App Review submitted in Developer Console
- [ ] All three permissions **Approved** (Advanced Access)
