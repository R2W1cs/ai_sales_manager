# Wave W3 Testing Specification — Channels & Meta Integration

| Field       | Value                                                                                      |
| ----------- | ------------------------------------------------------------------------------------------ |
| Wave ID     | `W3`                                                                                       |
| Wave Title  | Channels & Meta Integration                                                                |
| Cards       | `T-INT-01` through `T-INT-07` (13 leaves)                                                  |
| Status      | Canonical AI Testing Guide for Wave W3 Completion Gate                                     |
| Focus Areas | Meta OAuth, Webhooks, HMAC SHA256, BullMQ Outbound, DLQ, Backoff, WhatsApp stub validation |

---

## 1. Automated Verification Suites

```bash
# 1. Integrations & OAuth Suite
pnpm --filter api test -- src/integrations

# 2. Webhook Ingestion & Worker Suites
pnpm --filter api test -- src/webhooks

# 3. Monorepo Quality Gate
pnpm check:full
```

---

## 2. Invariant & Edge Case Testing Matrix

### A. Webhook HMAC Verification (`16_INTEGRATION_DESIGN.md`)

- **Signature Invariant**:
  - `POST /api/v1/webhooks/meta` computes `crypto.createHmac('sha256', META_APP_SECRET).update(rawBody).digest('hex')`.
  - Compares with `X-Hub-Signature-256` using timing-safe buffer comparison.
  - Invalid signature returns `401 unauthorized` immediately; drops payload (zero database writes, zero queue pushes).
  - Webhook verification endpoint `GET /api/v1/webhooks/meta` responds with `hub.challenge` when `hub.verify_token` matches.

### B. Async Ingest Fast Path (<500ms SLA)

- **Response Deadline**:
  - Inbound webhook handler must write raw event to `integration_events` table and enqueue BullMQ job `retry_webhook_processing`.
  - Returns `200 OK` in p95 < 500ms.
  - LLM calls and complex business logic MUST NOT execute inside the HTTP webhook cycle.

### C. Idempotency & Deduplication

- **Event Deduplication**:
  - Duplicate Meta `mid` (message ID) payload processed idempotently without generating double inbound message rows.

### D. BullMQ Outbound Delivery & DLQ (`14_SYSTEM_DESIGN.md` §3)

- **Exponential Backoff**:
  - Worker job `deliver_outbound` retries 3 times with exponential backoff on transient Meta API errors (5xx/429).
  - Moves to Dead Letter Queue (DLQ) upon reaching max retries; marks message as `deliveryStatus = 'failed'`.
- **Prohibited WhatsApp Addons**:
  - WhatsApp integration uses official Cloud API stubs; third-party scraping libraries (`baileys`, `whatsapp-web.js`) strictly forbidden.

---

## 3. CLI Smoke & Integration Simulation

```bash
# 1. Simulate Meta Webhook Hub Verify Challenge (GET)
curl -s "http://localhost:3001/api/v1/webhooks/meta?hub.mode=subscribe&hub.verify_token=local-meta-verify-token&hub.challenge=CHALLENGE_ACCEPTED"
# Expected response: CHALLENGE_ACCEPTED

# 2. Simulate Inbound Webhook with Valid HMAC (POST)
PAYLOAD='{"object":"instagram","entry":[{"id":"123","messaging":[{"sender":{"id":"user_1"},"recipient":{"id":"page_1"},"message":{"mid":"m_1","text":"Hi"}}]}]}'
SECRET="local-meta-app-secret"
SIG="sha256=$(echo -n "$PAYLOAD" | openssl dgst -sha256 -hmac "$SECRET" | awk '{print $2}')"

curl -i -s -X POST http://localhost:3001/api/v1/webhooks/meta \
  -H "Content-Type: application/json" \
  -H "X-Hub-Signature-256: $SIG" \
  -d "$PAYLOAD"
# Expected: HTTP/1.1 200 OK
```

---

## 4. Wave W3 Completion Gate Checklist

- [ ] All 13 leaves (`T-INT-01/a` through `T-INT-07`) marked `status: done`.
- [ ] Webhook HMAC unit tests prove invalid signatures are rejected with 401.
- [ ] Ingestion queue deduplication unit tests pass.
- [ ] `pnpm check:full` exits 0.
