# Meta live loop — Instagram / Messenger production

Prove the launch-gate chain on a real thread before scaling pilots.

## Prerequisites

- Public HTTPS API (`PUBLIC_API_URL`, `WEBHOOK_PUBLIC_URL`)
- Meta app with Instagram + Messenger products
- `META_APP_ID`, `META_APP_SECRET`, `META_WEBHOOK_SECRET` set in production
- Business Page + Instagram professional account linked

## Webhook setup

1. Callback URL: `https://<API_DOMAIN>/api/v1/webhooks/meta`
2. Verify token: same as `META_WEBHOOK_SECRET`
3. Subscribe: `messages`, `messaging_postbacks`, `message_deliveries`, `message_reads` (as available)
4. Run: `node scripts/meta/verify-webhook.mjs` against staging/prod

## E2E proof (must complete once personally)

1. Customer sends IG DM in Derja asking size/price of a real SKU
2. AI answers from catalog tools only (no invented price)
3. Customer expresses buy intent + shares name / phone / address
4. System creates **pending order** + stock reservation + staff briefing
5. Staff opens Inbox → Order drawer → **Confirm**
6. Conversation shows confirmed state; KPI counters move

Do this **without** manual DB edits. Scripted smoke: `node scripts/meta/e2e-handoff-smoke.mjs`.

## Runbooks (minimum)

| Incident             | First action                                                        |
| -------------------- | ------------------------------------------------------------------- |
| Channel disconnected | Re-run Meta OAuth from Settings → Channels; check token expiry logs |
| Model outage         | Confirm fallback provider keys; AI pauses, humans still reply       |
| Stuck queue          | Check worker container health + Redis; replay DLQ per ops docs      |
| Duplicate webhooks   | Confirm idempotent message id handling; no duplicate orders         |

## Exit

You have a screen recording of one live IG purchase handoff → confirmed order.
