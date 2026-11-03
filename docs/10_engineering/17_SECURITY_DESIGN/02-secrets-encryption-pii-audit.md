## 6. Secrets (NFR-SEC-03)

| Secret                                                      | Where                                                                                      | Not                                    |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------ | -------------------------------------- |
| `JWT_*`, LLM keys, `META_APP_SECRET`, `META_WEBHOOK_SECRET` | SM `aisales/{env}/…` (`18` §9)                                                             | Images, Terraform plaintext, git       |
| Page / IG access tokens                                     | SM `aisales/{env}/channel/{channelAccountId}/page-token`; DB `credentials_ref` only (`16`) | `channel_accounts` columns, logs, REST |
| OAuth **user** token (Meta/Google)                          | Redis TTL 10 min (`16`)                                                                    | Postgres, JWT                          |
| Refresh / invite / reset                                    | sha256 in Postgres                                                                         | Raw token after the Set-Cookie / email |
| Local                                                       | `.env` gitignored                                                                          |                                        |

Envelope-encrypted ciphertext columns = OQ-68 **later**, not now. `webhook_secret_ref` unused (`16`).

Never log: Authorization, cookies, SM values, HMAC header + body together, password fields.

---

## 7. Encryption

| Layer                  | Pin                                                                                                                                            |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| In transit             | TLS 1.2+ at Cloudflare / ALB (`18`). NFR-SEC-01                                                                                                |
| RDS                    | Storage encryption on. `pgcrypto` is for DB features, **not** app-level column cipher                                                          |
| S3                     | Default bucket encryption. **Block public access.** Inbox/media = **signed GET, 5 min** after a tenant+permission check. No bucket CORS (`18`) |
| Redis                  | In-transit TLS in staging/prod                                                                                                                 |
| Messages / PII columns | **Plaintext in Postgres.** Search and inbox require it. Do not add AES columns in MVP (OQ-71)                                                  |
| Backups                | RDS snapshots encrypted (NFR-REL-05)                                                                                                           |

---

## 8. PII

### 8.1 Logs and traces

Redact at info: phone, address, email, message **body**, PSID/IGSID next to text (`16` §9), tokens.

OK at info: `business_id`, `user_id`, `conversation_id`, `request_id`, Graph HTTP status.

`audit_logs.payload` / `ai_actions.input`: ids + non-secret fields. No webhook bodies, no hashes of passwords.

### 8.2 Prompts (NFR-SEC-06)

Prompt-injection rules stay in `15`. This file pins **what PII may enter a model call**:

- Classifier: inbound **text** only. No phone, address, or identity table dump.
- Generator: include phone / address / name **only** when a collect- or order-related tool already ran this turn (or staff suggest on a thread that has them). Do not attach the full `customers` row to every turn.
- RAG / knowledge: merchant-authored; still untrusted instructions (`15`).

### 8.3 Erasure (NFR-SEC-10)

`POST /api/v1/customers/:id/erase` (`customers.erase`). Idempotent if `erased_at` already set.

1. Set `customers.erased_at=now()`, `name='Deleted customer'`, `phone`/`email`/`address`/`preferences` null.
2. **Delete** `customer_identities` (next inbound from the same IGSID/PSID creates a **new** customer — that is correct).
3. Delete `customer_notes` and `customer_tags`.
4. `messages.content` → `[redacted]`; delete `message_attachments` + S3 objects; notes on those threads → `[redacted]`.
5. Strip PII from `orders.customer_snapshot` and `orders.delivery_address`. **Keep** order rows and money (accounting).
6. Skip this customer on list/export/KPI names. AI must not load erased PII.
7. Audit `customer.erase` with ids only.

Do **not** hard-delete conversations or orders. No automatic 24-month PII sweeper in MVP (`12` keeps messages; OQ-04 timed purge is post-MVP / legal).

Export (`GET /customers/export`): CSV stream, Owner/Admin, skip erased, no identities’ provider tokens (there are none).

---

## 9. Audit (FR-AUD-001)

Table: `12` §13.2. Human/security/money only — not `ai_actions`.

**Must write:** `member.invite`, `member.remove`, `member.role_change`, `customer.merge`, `customer.erase`, `order.confirm`, `order.cancel`, `business.delete`, `channel.connect`, `channel.disconnect`, `ai.activate`, `customers.export`.

Login success/fail is **not** a tenant `audit_logs` row (no `business_id` yet). Throttler + pino are enough.

Retention 365 days (`12` §2.12). `GET /audit-logs` is Should (`audit.read`).

---

## 10. Transport and abuse

| Control            | Pin                                                                                                                                                                                                                    |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CORS               | Allowlist `https://app.<apex>` + local `http://localhost:3000`. `credentials: true`. No `*` (`13`, `18`)                                                                                                               |
| `@fastify/helmet`  | Default headers on the API. Do not invent a CSP for JSON (`contentSecurityPolicy: false`)                                                                                                                              |
| Swagger UI         | Local + staging only (`11`)                                                                                                                                                                                            |
| Auth flood         | `13` §2.9. `AuthThrottlerGuard` keys on `request.ip`, which Fastify resolves from `X-Forwarded-For` under `trustProxy`. Never key on the raw header — it is client-controlled                                          |
| AI / channel flood | `14` §9 — do not copy numbers here                                                                                                                                                                                     |
| Webhook HMAC       | `16` — 401, no row                                                                                                                                                                                                     |
| SSRF               | Worker `fetch_inbound_media` (and any server-side GET of a provider URL): **https only**; no redirects to private / loopback / link-local / `169.254.169.254`; fail closed. Do not fetch merchant-supplied URLs in MVP |
| Worker HTTP        | **None** (`18`)                                                                                                                                                                                                        |

---

## 11. How coding agents must use this

1. Guards: JWT → tenant → permission code from `13` §2.11. Do not invent parallel role checks (`if role === 'admin'`).
2. Do not put `business_id` or roles in the access JWT.
3. Do not add `security_version` or an access denylist. Residual 15 min is accepted; nuclear = rotate access secret.
4. Do not enable RLS in MVP.
5. Do not store raw refresh / invite / reset tokens. sha256 (or argon2 for passwords).
6. Refresh cookie: host-only, `Path=/api/v1/auth`, never JSON.
7. Reuse of a revoked refresh in an active family revokes the **family**.
8. Page tokens: SM + `credentials_ref` only (`16`). No ciphertext columns (OQ-68).
9. Do not AES-encrypt message or customer columns.
10. Do not log PII or secrets. Classifier prompts do not get the address book.
11. Erase is `customers.erase`, not a silent `DELETE FROM customers`.
12. Socket `thread:open` must match handshake tenant. Clients never `join`.
13. Worker: no JWT; still `businessId` on the job and a matching row.
14. No MFA, no custom roles, no platform-admin user.

---

## 12. Open questions

| #             | Question                                | Working answer                                                                                      | Owner           | Revisit                      |
| ------------- | --------------------------------------- | --------------------------------------------------------------------------------------------------- | --------------- | ---------------------------- |
| OQ-54 / OQ-70 | Postgres RLS in prod?                   | **No in MVP.** App `business_id` filter is the control. Revisit after a Sev-1 cross-tenant incident | Engineering     | First Sev-1                  |
| OQ-57         | `business_id` in access JWT?            | **No** — `13` / this file                                                                           | Engineering     | Decided                      |
| OQ-58         | Access denylist / `security_version`?   | **No in MVP.** Membership + Better Auth session revoke. Nuclear: rotate `BETTER_AUTH_SECRET`        | Engineering     | Decided                      |
| OQ-68         | Tenant tokens in SM vs envelope column? | **SM in MVP** (`16`)                                                                                | Engineering     | Secret-count pain            |
| OQ-71         | App-level field encryption for PII?     | **No in MVP.** RDS/S3 at rest + TLS                                                                 | Engineering     | Compliance demand            |
| OQ-72         | Automatic 24-month PII purge (OQ-04)?   | **Not in MVP.** Targeted erasure only. Timed purge needs legal + `12`/`14` sweeper                  | Founder / Legal | Before first paying customer |

Do not reopen OQ-42 (outbox), unofficial WhatsApp, `/realtime`, or MFA.

---

## 13. References

- `docs/AI_Sales_Agent_Brain_Dump.md` → `# Security`, `# User Permission Matrix`
- `docs/00_product/01_PRODUCT_REQUIREMENTS.md` FR-AUTH, FR-AUD, NFR-SEC
- `docs/10_engineering/13_API_DESIGN.md` §2.2–2.4, §2.11
- `docs/10_engineering/12_DATABASE_DESIGN.md` §2.2, §5, §13.2
- `docs/10_engineering/16_INTEGRATION_DESIGN.md` HMAC, SM page tokens
- `docs/10_engineering/18_DEPLOYMENT.md` §6, §9, §10
- `docs/10_engineering/15_AI_ARCHITECTURE.md` prompt injection
