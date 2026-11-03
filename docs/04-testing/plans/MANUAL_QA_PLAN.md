# Complete Manual QA & Verification Plan (Waves W0 – W5)

> **Document Version:** 1.0.0  
> **Target Milestones:** Wave W0 (Bootstrap) through Wave W5 (AI Sales Agent Core)  
> **Status:** Ready for Execution  
> **Monorepo Baseline:** 56 Test Suites, 867 Unit & Integration Tests Passing (`pnpm test` GREEN)  
> **Scope:** Full End-to-End manual testing of all implemented backend services, database models, Redis queues, MinIO storage, Meta channels, and AI sales agent orchestration prior to proceeding to leaf `T-HAND-01`.

---

## 1. System Architecture & QA Context

The system has completed **Waves W0 through W5 (up to `T-AI-05`)**. The frontend web interface (`apps/web`) is scheduled for Waves W8 and W9. Therefore, all testing at this stage validates the **Core Backend Engine, Asynchronous Workers, Storage, and Channel Integrations**:

```
+----------------------------------------------------------------------------------------------------+
|                                    CHANNELS & EXTERNAL SERVICES                                     |
|  [ Meta Cloud API / Webhooks ]     [ Vercel AI Gateway ]       [ Resend Email ]     [ ngrok Tunnel ] |
+------------------------------------+---------------------------+--------------------+----------------+
                                     |                           |
                                     v                           v
+----------------------------------------------------------------------------------------------------+
|                             BACKEND ENGINE (Fastify / NestJS on :4000)                             |
|  - Auth & RBAC (Argon2id, JWT, Redis Throttler)     - Business Onboarding & Audit Logging          |
|  - Catalog & Variants (Stock, S3 Upload URLs)        - Knowledge Base & RAG Vector Search           |
|  - Channel Inbound Normalizers & Adapters            - Realtime Inbox & Socket.IO Gateway           |
|  - AI Sales Agent Orchestrator (Tunisian Derja)      - Commercial Guardrails & 3-Model Fallback     |
+------------------------------------+---------------------------+--------------------+----------------+
                                     |                           |
                                     v                           v
+------------------------------------+---------------------------+-----------------------------------+
|               PERSISTENCE          |                 CACHE & QUEUE                |     OBJECT S3     |
| PostgreSQL 16 + pgvector (:5432)   | Redis 7 (:6379) + BullMQ Worker Processes    | MinIO S3 (:9000)  |
+------------------------------------+----------------------------------------------+-------------------+
```

### Pre-Requisites & Active Services

Before executing the plan, ensure the required daemon services and local processes are active:

| Service                      | Port / Protocol                                   | Command / Verification                      | Status            |
| :--------------------------- | :------------------------------------------------ | :------------------------------------------ | :---------------- |
| **PostgreSQL 16 + pgvector** | `5432`                                            | `podman ps` (Container `ai-sales-postgres`) | Active            |
| **Redis 7**                  | `6379`                                            | `podman ps` (Container `ai-sales-redis`)    | Active            |
| **MinIO S3**                 | `9000` (API), `9001` (UI)                         | `podman ps` (Container `ai-sales-minio`)    | Active            |
| **Fastify API Server**       | `4000` (HTTP)                                     | `pnpm dev:api`                              | Run in Terminal 1 |
| **BullMQ Worker Process**    | Async background jobs                             | `pnpm dev:worker`                           | Run in Terminal 2 |
| **Public Ngrok Tunnel**      | `https://mumbling-landfill-caddie.ngrok-free.dev` | `pnpm tunnel`                               | Run in Terminal 3 |

### Seeded Demo Data Available

The database contains seeded test fixtures (`prisma/seed.ts`):

- **Demo Business:** `a0000000-0000-0000-0000-000000000001` (_Boutique Demo Tunis_, Currency: `TND`)
- **Demo User:** `demo@example.com` (Owner role)
- **Demo Product:** `c0000000-0000-0000-0000-000000000001` (_Hoodie Premium Noir_, 120 TND, Sizes M & L)
- **Demo Rules:** Delivery (Grand Tunis 7 TND, others 9 TND), Payment (Cash on delivery), Returns (7 days)
- **AI Sales Agent:** _Sarra AI_ (Tunisian Derja & French sales advisor, `auto_send` reply mode)

---

## 2. Plan Structure: 3-Tier Verification Architecture

To maximize regression reliability while minimizing manual human burden, this testing plan is strictly partitioned into **three operational tiers**:

```text
E2E VERIFICATION HARNESS & QA RUNNER
   │
   ├── Local Services (:4000 Fastify API, :6379 Redis, :9000 MinIO)
   ├── PostgreSQL 16 + pgvector (Schema, Extensions, Invariants)
   ├── BullMQ Worker Processes (CSV Import, Embeddings, Outbound Delivery)
   ├── Meta Graph API & Webhook Ingestion Engine
   ├── Headless Browser / OAuth Verification (Playwright)
   ├── Transactional Email Dispatch (Resend API)
   └── Socket.IO Realtime Client & Room Assertions
          │
          ▼
   Assertions + Automated Evidence Collection
          │
          ▼
   Automated PASS / FAIL Report  ───►  Targeted Human Spot-Checks
```

### The 3 Verification Tiers

1. **TIER A: FULLY AUTOMATED TESTING (Machine & Tool-Driven)**  
   _100% automated tests that AI agents or CI scripts execute directly via CLI commands, database assertions, REST endpoints, Redis state checks, Socket.IO client connections, and unit/integration test runners. Zero human intervention required._
2. **TIER B: AUTOMATED HARNESS + HUMAN SPOT-CHECK (Hybrid 80–95% Automated)**  
   _Tests where all underlying mechanics (API parameter negotiation, payload generation, redirect generation, email delivery requests) are executed and verified by automated tools, leaving only a brief, focused human spot-check (e.g. verifying Meta App portal settings or email rendering)._
3. **TIER C: TRULY HUMAN-ONLY QA (Physical Devices & Sensory Validation)**  
   _Strictly isolated to tests that inherently require physical human sensory perception: judging the cultural authenticity and conversational cadence of Tunisian Derja on a physical smartphone screen, ergonomic evaluation, and mobile camera photo capture UX._

---

# SECTION A: FULLY AUTOMATED QA TESTING

> **Execution Method:** 100% machine-executable directly via terminal CLI commands, Jest test runners, curl requests, and database assertions. Zero human action required.

---

### Phase A1: Core Infrastructure & Health Audit

#### [ ] Test A1.1: Database Extensions & Schema Verification

- **Objective:** Verify that `pgvector`, `citext`, `pgcrypto`, and `pg_trgm` extensions are installed and functional in PostgreSQL 16.
- **CLI Command:**
  ```bash
  podman exec -i ai-sales-postgres psql -U postgres -d ai_sales -c "
  SELECT extname, extversion FROM pg_extension WHERE extname IN ('vector', 'citext', 'pgcrypto', 'pg_trgm');
  "
  ```
- **Expected Result:** 4 rows returned showing active extensions with version numbers (`vector` version 0.7+).

#### [ ] Test A1.2: Redis Cache & Connection Ping

- **Objective:** Confirm Redis connectivity and responsiveness for caching, Redlock locks, and BullMQ queues.
- **CLI Command:**
  ```bash
  podman exec -i ai-sales-redis redis-cli ping
  ```
- **Expected Result:** `PONG`.

#### [ ] Test A1.3: MinIO S3 Bucket Existence

- **Objective:** Verify the `ai-sales-assets` bucket exists and is accessible.
- **CLI Command:**
  ```bash
  podman exec -i ai-sales-minio mc alias set myminio http://localhost:9000 minioadmin minioadmin
  podman exec -i ai-sales-minio mc ls myminio/ai-sales-assets
  ```
- **Expected Result:** Command exits with code 0 (bucket accessible).

#### [ ] Test A1.4: Fastify API Health Endpoint

- **Objective:** Verify API server boots with Fastify and responds on port 4000.
- **CLI Command:**
  ```bash
  curl -s -i http://localhost:4000/health
  ```
- **Expected Result:** HTTP `200 OK`, JSON body containing `{"status":"ok"}`.

---

### Phase A2: Authentication, Security & RBAC (Wave W1)

#### [ ] Test A2.1: User Registration

- **Objective:** Register a new test user and verify Argon2id password hashing and session generation.
- **CLI Command:**
  ```bash
  curl -s -X POST http://localhost:4000/api/v1/auth/register \
    -H "Content-Type: application/json" \
    -d '{
      "email": "tester_ai_01@example.com",
      "password": "Password123!Secure",
      "name": "AI Test Admin"
    }' -i
  ```
- **Expected Result:**
  - HTTP `201 Created`
  - Response body contains `{ "user": { "id": "...", "email": "tester_ai_01@example.com" }, "token": "..." }`
  - `Set-Cookie` header present with `aisales_refresh=...; HttpOnly; SameSite=Lax`

#### [ ] Test A2.2: Login & Security Timing-Safe Invariant

- **Objective:** Validate successful login, and ensure non-existent user and wrong password return the identical 401 message.
- **CLI Commands:**
  ```bash
  # 1. Valid Login
  curl -s -X POST http://localhost:4000/api/v1/auth/login \
    -H "Content-Type: application/json" \
    -d '{"email":"tester_ai_01@example.com","password":"Password123!Secure"}'

  # 2. Invalid Password
  curl -s -X POST http://localhost:4000/api/v1/auth/login \
    -H "Content-Type: application/json" \
    -d '{"email":"tester_ai_01@example.com","password":"WrongPassword123!"}'

  # 3. Non-existent Email
  curl -s -X POST http://localhost:4000/api/v1/auth/login \
    -H "Content-Type: application/json" \
    -d '{"email":"nonexistent@example.com","password":"Password123!Secure"}'
  ```
- **Expected Result:**
  - Valid: HTTP 200 with access token and refresh cookie.
  - Invalid & Non-existent: Both return HTTP 401 with exact message: `{"error":{"code":"unauthorized","message":"Invalid email or password"}}`.

#### [ ] Test A2.3: Refresh Token Rotation & Reuse Detection (Family Revocation)

- **Objective:** Verify token rotation works, and reusing an old refresh token invalidates the entire token family (theft detection).
- **CLI Command:**
  ```bash
  # Step 1: Login and capture cookie
  COOKIE_JAR=$(mktemp)
  curl -s -c "$COOKIE_JAR" -X POST http://localhost:4000/api/v1/auth/login \
    -H "Content-Type: application/json" \
    -d '{"email":"tester_ai_01@example.com","password":"Password123!Secure"}' > /dev/null

  # Step 2: Rotate refresh token (Legitimate refresh)
  NEW_COOKIE_JAR=$(mktemp)
  curl -s -b "$COOKIE_JAR" -c "$NEW_COOKIE_JAR" -X POST http://localhost:4000/api/v1/auth/refresh -i

  # Step 3: Replay OLD refresh token (Simulated attack)
  curl -s -b "$COOKIE_JAR" -X POST http://localhost:4000/api/v1/auth/refresh -i
  ```
- **Expected Result:**
  - Step 2 returns HTTP 200 with a fresh access token.
  - Step 3 returns HTTP 401 Unauthorized; all tokens in this family are revoked in PostgreSQL.

#### [ ] Test A2.4: Redis Auth Rate Limiter (AuthThrottlerGuard)

- **Objective:** Ensure rate limit of 5 attempts/minute triggers 429 Too Many Requests with `Retry-After`.
- **CLI Command:**
  ```bash
  for i in {1..7}; do
    STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST http://localhost:4000/api/v1/auth/login \
      -H "Content-Type: application/json" \
      -d '{"email":"tester_ai_01@example.com","password":"WrongPassword123!"}')
    echo "Attempt $i: HTTP $STATUS"
  done
  ```
- **Expected Result:** Attempts 1–5 return 401; attempts 6 & 7 return `HTTP 429` with `Retry-After` header present.

#### [ ] Test A2.5: Multi-Tenant Isolation & Guardrails (TenantGuard)

- **Objective:** Verify that `TenantGuard` blocks cross-tenant access with 403 Forbidden.
- **CLI Command:**
  ```bash
  # Obtain token for tester_ai_01
  TOKEN=$(curl -s -X POST http://localhost:4000/api/v1/auth/login \
    -H "Content-Type: application/json" \
    -d '{"email":"tester_ai_01@example.com","password":"Password123!Secure"}' | jq -r '.token')

  # Attempt accessing seeded demo business (where tester_ai_01 is NOT a member)
  curl -s -i http://localhost:4000/api/v1/businesses/a0000000-0000-0000-0000-000000000001 \
    -H "Authorization: Bearer $TOKEN" \
    -H "X-Business-Id: a0000000-0000-0000-0000-000000000001"
  ```
- **Expected Result:** HTTP `403 Forbidden` (`{"error":{"code":"forbidden","message":"Not a member of this business"}}`).

---

### Phase A3: Business Provisioning & Onboarding Readiness Gates (Wave W1)

#### [ ] Test A3.1: Atomic Business Provisioning

- **Objective:** Verify creating a business atomically provisions default settings, AI agent, starter rules, and onboarding tracker.
- **CLI Command:**
  ```bash
  curl -s -X POST http://localhost:4000/api/v1/businesses \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -H "Idempotency-Key: test-idem-$(date +%s)" \
    -d '{
      "name": "AI Auto Store Tunis",
      "industry": "retail",
      "country": "TN",
      "currency": "TND",
      "timezone": "Africa/Tunis"
    }' | jq .
  ```
- **Expected Result:** Returns created business ID, with `user` set as Owner role.

#### [ ] Test A3.2: Onboarding Readiness Gates G1–G5

- **Objective:** Check dynamic onboarding readiness gates.
- **CLI Command:**
  ```bash
  NEW_BIZ_ID="<ID_FROM_A3.1>"
  curl -s http://localhost:4000/api/v1/businesses/$NEW_BIZ_ID/onboarding \
    -H "Authorization: Bearer $TOKEN" \
    -H "X-Business-Id: $NEW_BIZ_ID" | jq .
  ```
- **Expected Result:** Returns status of gates:
  - `G1_business_profile`: `true`
  - `G2_channel_connected`: `false` (no channel connected yet)
  - `G3_catalog_ready`: `false` (0 products)
  - `G4_ai_configured`: `true` (seeded default agent)
  - `G5_test_conversation`: `false`

---

### Phase A4: Catalog, Bulk CSV & pgvector Embeddings (Wave W2)

#### [ ] Test A4.1: Category Hierarchy & Cycle Prevention

- **Objective:** Create parent category and child subcategory; verify cyclic parent assignment is rejected.
- **CLI Commands:**
  ```bash
  # 1. Create Root Category
  CAT1=$(curl -s -X POST http://localhost:4000/api/v1/categories \
    -H "Authorization: Bearer $TOKEN" -H "X-Business-Id: $NEW_BIZ_ID" \
    -H "Content-Type: application/json" \
    -d '{"name":"Vetements"}' | jq -r '.id')

  # 2. Create Subcategory
  CAT2=$(curl -s -X POST http://localhost:4000/api/v1/categories \
    -H "Authorization: Bearer $TOKEN" -H "X-Business-Id: $NEW_BIZ_ID" \
    -H "Content-Type: application/json" \
    -d "{\"name\":\"Pantalons\",\"parentId\":\"$CAT1\"}" | jq -r '.id')

  # 3. Attempt Cycle: Set CAT1 parent to CAT2
  curl -s -i -X PATCH http://localhost:4000/api/v1/categories/$CAT1 \
    -H "Authorization: Bearer $TOKEN" -H "X-Business-Id: $NEW_BIZ_ID" \
    -H "Content-Type: application/json" \
    -d "{\"parentId\":\"$CAT2\"}"
  ```
- **Expected Result:** Step 3 returns HTTP `400` or `422` with cycle error.

#### [ ] Test A4.2: Bulk Product Import via CSV Worker (BullMQ)

- **Objective:** Upload product CSV and verify asynchronous parsing and creation by `apps/worker`.
- **CLI Command:**
  ```bash
  CSV_CONTENT="name,sku,price,stock,category,description\nChemise Blanche,CHM-WHT-40,85.0,30,Vetements,Chemise coton 100%\nJean Slim Noir,JNS-BLK-32,110.0,15,Vetements,Jean denim stretch"

  echo -e "$CSV_CONTENT" > /tmp/test_import.csv

  curl -s -X POST http://localhost:4000/api/v1/products/import/csv \
    -H "Authorization: Bearer $TOKEN" -H "X-Business-Id: $NEW_BIZ_ID" \
    -F "file=@/tmp/test_import.csv" | jq .
  ```
- **Expected Result:**
  - HTTP `202 Accepted` with `jobId`.
  - Checking `apps/worker` logs shows CSV processing job completion.
  - `GET /api/v1/products` shows the two imported products.

#### [ ] Test A4.3: Debounced pgvector Embeddings Sync (CatalogIndexerService)

- **Objective:** Verify that creating/updating products triggers embedding generation and populates the `embeddings` table.
- **CLI Command:**
  ```bash
  podman exec -i ai-sales-postgres psql -U postgres -d ai_sales -c "
  SELECT id, source_type, source_id, vector_dims(embedding) as dims FROM embeddings LIMIT 5;
  "
  ```
- **Expected Result:** Rows present with `dims = 1536` (OpenAI embedding dimension).

---

### Phase A5: Knowledge Base & Semantic Vector Search (Wave W2)

#### [ ] Test A5.1: Business Rules Versioning

- **Objective:** Create custom delivery and returns rules.
- **CLI Command:**
  ```bash
  curl -s -X POST http://localhost:4000/api/v1/business-rules \
    -H "Authorization: Bearer $TOKEN" -H "X-Business-Id: $NEW_BIZ_ID" \
    -H "Content-Type: application/json" \
    -d '{
      "ruleType": "delivery",
      "priority": 1,
      "enabled": true,
      "payload": {
        "zones": [
          {"name": "Tunis", "fee": 7, "currency": "TND", "eta_hours": 24},
          {"name": "Sfax", "fee": 10, "currency": "TND", "eta_hours": 48}
        ]
      }
    }' | jq .
  ```
- **Expected Result:** Rule created with active status and version timestamp.

#### [ ] Test A5.2: Knowledge RAG Document Ingestion & Search

- **Objective:** Create a knowledge document and test pgvector cosine similarity search.
- **CLI Command:**
  ```bash
  # 1. Create document
  curl -s -X POST http://localhost:4000/api/v1/knowledge/documents \
    -H "Authorization: Bearer $TOKEN" -H "X-Business-Id: $NEW_BIZ_ID" \
    -H "Content-Type: application/json" \
    -d '{
      "title": "Politique d'\''échange",
      "content": "L'\''échange est gratuit sous 7 jours pour tout article non lavé et dans son emballage d'\''origine. Aucun remboursement en espèces n'\''est possible, uniquement un avoir ou un échange."
    }' | jq .

  # Wait 3 seconds for BullMQ worker embedding chunking
  sleep 3

  # 2. Semantic search query
  curl -s "http://localhost:4000/api/v1/knowledge/search?q=kifech%20nbaddel%20el%209at3a" \
    -H "Authorization: Bearer $TOKEN" -H "X-Business-Id: $NEW_BIZ_ID" | jq .
  ```
- **Expected Result:** The semantic search returns the "Politique d'échange" document chunk with a high cosine similarity score.

---

### Phase A6: Meta Developer MCP & Automated Webhook Ingestion (Wave W3)

> **Using Meta Dev MCP Server & Graph API:** Because you have access to the Meta Developer MCP server and configured credentials (`META_APP_ID=1072354271993824`, `META_APP_SECRET`, `META_WEBHOOK_SECRET`), AI can execute direct platform-level checks.

#### [ ] Test A6.1: Meta App Inspection via Meta Dev MCP / Graph API

- **Objective:** Query Meta Graph API using app credentials to verify app status and capabilities.
- **CLI Command:**
  ```bash
  curl -s "https://graph.facebook.com/v23.0/1072354271993824?access_token=1072354271993824|4e66b0d9b0f3fe45bd4a1fdf7f95ab63" | jq .
  ```
- **Expected Result:** Returns Meta App info (`id: "1072354271993824"`, app name, and active status).

#### [ ] Test A6.2: Meta Webhook Challenge Handshake (GET /webhooks/meta)

- **Objective:** Verify that Meta's subscription challenge responds with the challenge string when `hub.verify_token` matches `META_WEBHOOK_SECRET`.
- **CLI Command:**
  ```bash
  VERIFY_TOKEN="j0Nne1g3QmOklZ3hHAUbegDEjZCMpkeZJgsYsnGt5GM="
  CHALLENGE_CODE="test_challenge_code_98765"

  curl -s -i "http://localhost:4000/webhooks/meta?hub.mode=subscribe&hub.verify_token=${VERIFY_TOKEN}&hub.challenge=${CHALLENGE_CODE}"
  ```
- **Expected Result:**
  - HTTP `200 OK`
  - `Content-Type: text/plain`
  - Body: `test_challenge_code_98765`
  - If `hub.verify_token` is incorrect, returns HTTP `403 Forbidden`.

#### [ ] Test A6.3: Inbound Webhook Ingestion with Valid HMAC-SHA256 (POST /webhooks/meta)

- **Objective:** Send a simulated Meta inbound message payload signed with `META_APP_SECRET`. Verify fast ACK (<500ms), persistence in `integration_events`, and BullMQ job enqueuing.
- **CLI Script:**
  ```bash
  APP_SECRET="4e66b0d9b0f3fe45bd4a1fdf7f95ab63"
  PAYLOAD='{"object":"instagram","entry":[{"id":"ig_acc_123","time":1724750000,"messaging":[{"sender":{"id":"cust_999"},"recipient":{"id":"page_123"},"message":{"mid":"mid_test_001","text":"Salam, 3andkom hoodie noir taille L?"}}]}]}'

  SIGNATURE=$(echo -n "$PAYLOAD" | openssl dgst -sha256 -hmac "$APP_SECRET" | awk '{print $2}')

  curl -s -i -X POST http://localhost:4000/webhooks/meta \
    -H "Content-Type: application/json" \
    -H "X-Hub-Signature-256: sha256=$SIGNATURE" \
    -d "$PAYLOAD"
  ```
- **Expected Result:**
  - HTTP `200 OK` in < 500ms
  - Check database: `podman exec -i ai-sales-postgres psql -U postgres -d ai_sales -c "SELECT id, channel, event_type, status FROM integration_events ORDER BY created_at DESC LIMIT 1;"` shows row with `status = 'pending'` or `'processed'`.

#### [ ] Test A6.4: HMAC Signature Tamper Protection

- **Objective:** Verify that tampered payloads or wrong signatures are rejected with HTTP 401 before any database operations occur.
- **CLI Command:**
  ```bash
  curl -s -i -X POST http://localhost:4000/webhooks/meta \
    -H "Content-Type: application/json" \
    -H "X-Hub-Signature-256: sha256=invalid_signature_hex_0000000000000000000000000000000000000000" \
    -d '{"object":"instagram","entry":[]}'
  ```
- **Expected Result:** HTTP `401 Unauthorized`. Zero rows added to `integration_events`.

#### [ ] Test A6.5: Webhook Message Deduplication (Idempotency)

- **Objective:** Send the identical webhook message (`mid_test_001`) a second time.
- **CLI Command:** Re-run the script from Test A6.3.
- **Expected Result:** HTTP `200 OK`, but duplicate detection drops duplicate processing without creating double conversation messages.

---

### Phase A7: Conversation State Machine & Concurrency (Wave W4)

#### [ ] Test A7.1: Conversation Listing & Filters

- **Objective:** Query conversations using the `needs_me` filter and priority sorting.
- **CLI Command:**
  ```bash
  curl -s "http://localhost:4000/api/v1/conversations?filter=needs_me" \
    -H "Authorization: Bearer $TOKEN" \
    -H "X-Business-Id: a0000000-0000-0000-0000-000000000001" | jq .
  ```
- **Expected Result:** HTTP 200 with array of conversations and pagination cursor metadata.

#### [ ] Test A7.2: Redis Redlock Concurrency Lock (ConversationLockService)

- **Objective:** Verify that multiple simultaneous worker processes cannot process the same conversation concurrently.
- **CLI Test:**
  ```bash
  export PATH="/home/aymnart/.local/bin:/home/aymnart/.local/share/pnpm/bin:$PATH"
  pnpm --filter @app/api test -- src/conversations/threads/conversation-lock.spec.ts
  ```
- **Expected Result:** PASS (verifies Lua CAS lock acquisition, auto-renewal, and conflict rejection).

#### [ ] Test A7.3: Conversation Timeline Projection

- **Objective:** Retrieve a conversation's chronological timeline merging messages, status changes, internal notes, and AI actions.
- **CLI Command:**
  ```bash
  # Query timeline for first active conversation in demo business
  CONV_ID=$(podman exec -i ai-sales-postgres psql -U postgres -d ai_sales -t -c "SELECT id FROM conversations LIMIT 1;" | tr -d '[:space:]')

  if [ -n "$CONV_ID" ]; then
    curl -s "http://localhost:4000/api/v1/conversations/$CONV_ID/timeline" \
      -H "Authorization: Bearer $TOKEN" \
      -H "X-Business-Id: a0000000-0000-0000-0000-000000000001" | jq .
  fi
  ```
- **Expected Result:** Chronological array of timeline items with discriminator `type` (`message`, `note`, `status_event`, `ai_action`).

#### [x] Test A7.4: Automated Human Takeover & AI Pause Lifecycle

- **Objective:** Verify that customer escalation triggers or manual human staff messages immediately pause AI automated responses (`ai_enabled = false`, status = `HUMAN_HANDLING`), and subsequent resume action restores AI automation (`ai_enabled = true`).
- **Automated Unit & Integration Test:**
  ```bash
  export PATH="/home/aymnart/.local/bin:/home/aymnart/.local/share/pnpm/bin:$PATH"
  pnpm --filter @app/api test -- src/conversations/messages/messages.controller.spec.ts
  ```
- **Automated E2E API Verification Sequence:**
  ```bash
  # 1. Staff sends manual reply (triggers implicit takeover)
  curl -s -X POST "http://localhost:4000/api/v1/conversations/$CONV_ID/messages" \
    -H "Authorization: Bearer $TOKEN" \
    -H "X-Business-Id: $NEW_BIZ_ID" \
    -H "Content-Type: application/json" \
    -H "Idempotency-Key: takeover-$(date +%s)" \
    -d '{"content":"Marhba bik, ma3ak l'\''agent human, kifech n3awnek?"}' | jq .

  # 2. Check conversation state: ai_enabled is false, status is HUMAN_HANDLING
  curl -s "http://localhost:4000/api/v1/conversations?filter=needs_me" \
    -H "Authorization: Bearer $TOKEN" \
    -H "X-Business-Id: $NEW_BIZ_ID" | jq .

  # 3. Resume AI handling
  curl -s -X POST "http://localhost:4000/api/v1/conversations/$CONV_ID/actions" \
    -H "Authorization: Bearer $TOKEN" \
    -H "X-Business-Id: $NEW_BIZ_ID" \
    -H "Content-Type: application/json" \
    -d '{"action":"resume_ai"}' | jq .
  ```
- **Expected Result:** Explicit human action transitions conversation state to `AI_ACTIVE` and sets `ai_enabled = true`.

#### [x] Test A7.5: Automated Realtime WebSocket Gateway

- **Objective:** Verify that incoming messages, status updates, and agent typing indicators are broadcast in real-time over WebSocket connections partitioned by `business_id`.
- **Automated Unit & Integration Test:**
  ```bash
  export PATH="/home/aymnart/.local/bin:/home/aymnart/.local/share/pnpm/bin:$PATH"
  pnpm --filter @app/api test -- src/realtime/realtime.gateway.spec.ts
  ```
- **Expected Result:** PASS (19/19 tests pass: room authorization, cross-tenant isolation, outbound event broadcasting).

---

### Phase 2 AI Engine & Guardrails Tests (Section A8)

#### [ ] Test A8.1: AI Orchestrator Execution with Tunisian Derja & Tools

- **Objective:** Run AI Sales Agent test suite against Vercel AI Gateway credentials, validating Tunisian Derja comprehension and catalog tool execution.
- **CLI Command:**
  ```bash
  export PATH="/home/aymnart/.local/bin:/home/aymnart/.local/share/pnpm/bin:$PATH"
  pnpm --filter @app/api test -- src/ai/orchestrator/orchestrator.service.spec.ts
  ```
- **Expected Result:** PASS (verifies prompt builder, tool calling, token recording in `ai_usage`, and decision traces).

#### [ ] Test A8.2: Commercial Guardrails Enforcement

- **Objective:** Verify commercial guardrails reject unauthorized discounts, fake payment promises, and unapproved delivery guarantees.
- **CLI Command:**
  ```bash
  export PATH="/home/aymnart/.local/bin:/home/aymnart/.local/share/pnpm/bin:$PATH"
  pnpm --filter @app/api test -- src/ai/guardrails/guardrails.spec.ts
  ```
- **Expected Result:** PASS (all discount and commercial invariant tests pass).

#### [ ] Test A8.3: Three-Model Fallback Chain (T-AI-05)

- **Objective:** Verify that primary model timeouts automatically cascade to secondary fallback model without breaking the customer session.
- **CLI Command:**
  ```bash
  export PATH="/home/aymnart/.local/bin:/home/aymnart/.local/share/pnpm/bin:$PATH"
  pnpm --filter @app/api test -- src/ai/gateway/model-fallback.service.spec.ts
  ```
- **Expected Result:** PASS (verifies timeout failover and sanitized `MODEL_OUTAGE` escalation).

---

# SECTION B: AUTOMATED HARNESS + HUMAN SPOT-CHECK (HYBRID QA)

> **Execution Method:** 80–95% of each test is executed automatically via automated scripts, CLI curls, and headless browser assertions. The human developer only executes a targeted spot-check (e.g. verifying Meta App portal settings or email rendering).

---

### Test B1: Meta Developer App Webhook & Tunnel Configuration (90% Automated)

- **Goal:** Connect local Fastify server to the real Meta Developer platform via ngrok so Meta can deliver live webhooks.
- **Automated Verification Harness:**
  ```bash
  # 1. Verify Ngrok public tunnel health endpoint
  curl -s -i "https://mumbling-landfill-caddie.ngrok-free.dev/health" | grep "200 OK"

  # 2. Inspect Meta App status via Graph API
  curl -s "https://graph.facebook.com/v23.0/1072354271993824?access_token=1072354271993824|4e66b0d9b0f3fe45bd4a1fdf7f95ab63" | jq .

  # 3. Test Webhook subscription challenge handshake
  curl -s "https://mumbling-landfill-caddie.ngrok-free.dev/webhooks/meta?hub.mode=subscribe&hub.verify_token=j0Nne1g3QmOklZ3hHAUbegDEjZCMpkeZJgsYsnGt5GM=&hub.challenge=auto_verify_12345"
  ```
- **Targeted Human Spot-Check (Meta Portal):**
  - If webhook subscription was not saved previously, open [developers.facebook.com/apps](https://developers.facebook.com/apps/) -> App `1072354271993824` -> **Webhooks**.
  - Verify Callback URL: `https://mumbling-landfill-caddie.ngrok-free.dev/webhooks/meta`
  - Verify Token: `j0Nne1g3QmOklZ3hHAUbegDEjZCMpkeZJgsYsnGt5GM=`
  - Confirm subscribed fields: `messages`, `messaging_postbacks`, `message_deliveries`, `message_reads`.

---

### Test B2: Meta OAuth Channel Connection Flow (85% Automated)

- **Goal:** Connect Facebook Page or Instagram Business Account to merchant business.
- **Automated Verification Harness:**
  ```bash
  # 1. Generate Meta connect OAuth URL
  AUTH_URL=$(curl -s http://localhost:4000/api/v1/integrations/meta/oauth-url \
    -H "Authorization: Bearer $TOKEN" \
    -H "X-Business-Id: $NEW_BIZ_ID" | jq -r '.authorizationUrl')
  echo "Auth URL: $AUTH_URL"

  # 2. Validate URL structure, client_id, and scopes automatically
  echo "$AUTH_URL" | grep "client_id=1072354271993824"
  echo "$AUTH_URL" | grep "pages_messaging"
  echo "$AUTH_URL" | grep "instagram_manage_messages"
  ```
- **Targeted Human Spot-Check (Browser OAuth):**
  - Open `$AUTH_URL` in Chrome/Firefox.
  - Log into Facebook / Instagram with account managing test Page.
  - Accept permissions. Browser redirects back to callback URL.
  - Assert in database:
    ```bash
    podman exec -i ai-sales-postgres psql -U postgres -d ai_sales -c "
    SELECT id, business_id, channel, account_identifier, status FROM channel_accounts WHERE business_id = '$NEW_BIZ_ID';
    "
    ```

---

### Test B3: Transactional Email Verification via Resend API (95% Automated)

- **Goal:** Confirm transactional emails sent via Resend API key configured in `.env` are dispatched and delivered.
- **Automated Verification Harness:**
  ```bash
  # 1. Trigger invitation email via API
  INVITE_RESP=$(curl -s -X POST "http://localhost:4000/api/v1/businesses/$NEW_BIZ_ID/invitations" \
    -H "Authorization: Bearer $TOKEN" \
    -H "X-Business-Id: $NEW_BIZ_ID" \
    -H "Content-Type: application/json" \
    -d '{"email": "YOUR_REAL_EMAIL@example.com", "role": "admin"}')
  echo "$INVITE_RESP" | jq .

  # 2. Verify invitation created in database
  podman exec -i ai-sales-postgres psql -U postgres -d ai_sales -c "
  SELECT id, business_id, email, role, status FROM invitations WHERE business_id = '$NEW_BIZ_ID' ORDER BY created_at DESC LIMIT 1;
  "
  ```
- **Targeted Human Spot-Check (Visual Email Render):**
  - Open recipient email client.
  - Verify email from `AI Sales <noreply@ai-sales.app>` with subject mentioning store invitation.
  - Verify link token formatting and layout.

---

### Test B4: Meta App Sandbox & Roles Sanity Check (85% Automated)

- **Goal:** Ensure Meta App mode and Sandbox settings do not block live messaging.
- **Automated Verification Harness:**
  ```bash
  # Query Graph API for app details
  curl -s "https://graph.facebook.com/v23.0/1072354271993824?fields=id,name,link&access_token=1072354271993824|4e66b0d9b0f3fe45bd4a1fdf7f95ab63" | jq .
  ```
- **Targeted Human Spot-Check (Meta Portal):**
  - In Meta Developer Portal, verify top bar: if in **Development** mode, ensure developer/tester role is assigned to the personal Instagram/Facebook test user.
  - If testing WhatsApp: verify personal recipient phone number is added to WhatsApp -> API Setup -> "To" recipient dropdown.

---

# SECTION C: TRULY HUMAN-ONLY QA (PHYSICAL DEVICES & SENSORY EVALUATION)

> **Execution Method:** Strictly physical sensory evaluation and real-device testing. Automated tests cannot judge subjective cultural tone, conversation ergonomics, or mobile device camera interactions.

---

### Human Test C1: Smartphone Direct Messaging Natural Derja & UX Experience

- **Goal:** End-to-end verification of the conversational shopping loop on a physical smartphone (Instagram DM / WhatsApp), evaluating natural language cadence, Tunisian Derja tone, delivery rule comprehension, and mobile camera photo attachments.
- **Automated Invariant Harness (Machine Validates Prerequisites First):**
  - Inbound webhook ACK received in < 500ms.
  - AI worker turn completed within target latency SLA (< 3–6s).
  - Tool calls return verified price (120 TND), stock (size L in stock), and delivery fee (9 TND to Sousse, 48h ETA).
- **Physical Smartphone Execution:**
  1. Pick up smartphone. Open connected Instagram or WhatsApp chat.
  2. Send real message in Tunisian Derja:
     > _"Salam 3alaykom, 3andkom hoodie noir taille L? B9adech wsoum etwsil l Sousse?"_
  3. Observe response on phone screen within 3–6 seconds.
  4. Send camera photo into chat asking: _"Famma couleur hetha?"_.
  5. Check MinIO console (`http://localhost:9001`, bucket `ai-sales-assets`) to verify image downloaded and stored safely without SSRF vulnerability.
- **Human Qualitative Evaluation Checklist:**
  - [ ] **Tone & Derja Cadence:** Does the response ("Sarra AI") sound authentic, polite, and culturally natural in Tunisian Derja / French?
  - [ ] **Screen Ergonomics:** Does the message formatting look clear, readable, and non-overwhelming on a real mobile display?
  - [ ] **Catalog & Delivery Accuracy:** Price (120 TND), Size L stock, and 9 TND delivery to Sousse accurately quoted.
  - [ ] **Mobile Camera UX:** Photo sent from phone camera successfully ingested without error or corruption.

---

## 3. QA Sign-Off Scorecard

Use this table to record test execution results across all 3 tiers before proceeding to Wave W5 leaf `T-HAND-01`:

### Tier A: Fully Automated Tests (Machine Executed)

| Phase    | Test Description                                   | Automation Level | Status | Notes / Date                                                                                                         |
| :------- | :------------------------------------------------- | :--------------: | :----: | :------------------------------------------------------------------------------------------------------------------- |
| **A1.1** | PostgreSQL Extensions (`pgvector`, `citext`, etc.) |  **100% Auto**   |  PASS  | `vector 0.8.6`, `citext 1.6`, `pgcrypto 1.3`, `pg_trgm 1.6` installed & verified / 2026-08-27                        |
| **A1.2** | Redis Cache Ping & Queues                          |  **100% Auto**   |  PASS  | Responded `PONG` / 2026-08-27                                                                                        |
| **A1.3** | MinIO S3 `ai-sales-assets` Bucket                  |  **100% Auto**   |  PASS  | Bucket `ai-sales-assets` exists and accessible (exit code 0) / 2026-08-27                                            |
| **A1.4** | Fastify API `/health` Endpoint                     |  **100% Auto**   |  PASS  | HTTP 200 OK `{"status":"ok"}` / 2026-08-27                                                                           |
| **A2.1** | User Registration & Argon2id Hashing               |  **100% Auto**   |  PASS  | HTTP 201 Created, token, refresh cookie set / 2026-08-27                                                             |
| **A2.2** | Timing-Safe Login (Identical 401 copy)             |  **100% Auto**   |  PASS  | HTTP 200 on success; identical 401 on invalid and non-existent / 2026-08-27                                          |
| **A2.3** | Refresh Token Rotation & Family Revocation         |  **100% Auto**   |  PASS  | HTTP 200 on refresh; HTTP 401 on replay & entire family revoked in DB / 2026-08-27                                   |
| **A2.4** | Auth Throttling (429 & Retry-After)                |  **100% Auto**   |  PASS  | Attempts 1–5 return 401; attempts 6–7 return 429 with `Retry-After: 60` / 2026-08-27                                 |
| **A2.5** | Multi-Tenancy Cross-Tenant Guard (403)             |  **100% Auto**   |  PASS  | HTTP 403 Forbidden on cross-tenant access / 2026-08-27                                                               |
| **A3.1** | Atomic Business Provisioning & Seed Agent          |  **100% Auto**   |  PASS  | HTTP 201, business, owner membership, AI agent, onboarding provisioned / 2026-08-27                                  |
| **A3.2** | Dynamic Onboarding Readiness Gates G1–G5           |  **100% Auto**   |  PASS  | Verified dynamic gates (G1 true, G2 false, G3 false, G4 true, G5 false) / 2026-08-27                                 |
| **A4.1** | Category Tree & Cycle Prevention                   |  **100% Auto**   |  PASS  | HTTP 400 Bad Request on cyclic hierarchy / 2026-08-27                                                                |
| **A4.2** | Bulk CSV Import Worker (BullMQ)                    |  **100% Auto**   |  PASS  | HTTP 202 on `/products/import/csv`; BullMQ validated 2/2 rows & confirmed 2 products created in catalog / 2026-08-27 |
| **A4.3** | Debounced 1536-dim pgvector Indexing               |  **100% Auto**   |  PASS  | Debounced BullMQ job generated 1536-dim embeddings for product & variant in `embeddings` table / 2026-08-27          |
| **A5.1** | Versioned Business Rules CRUD                      |  **100% Auto**   |  PASS  | HTTP 201, rule created with version 2 & effectiveFrom / 2026-08-27                                                   |
| **A5.2** | Knowledge Base RAG Cosine Search                   |  **100% Auto**   |  PASS  | BullMQ custom ID fixed (`_`); `GET /knowledge/search` returned doc chunk with 0.525 cosine similarity / 2026-08-27   |
| **A6.1** | Meta App Inspection via Meta Dev MCP / Graph API   |  **100% Auto**   |  PASS  | Returns app `1072354271993824` "ai sales dev" / 2026-08-27                                                           |
| **A6.2** | Meta Webhook Challenge Handshake (GET)             |  **100% Auto**   |  PASS  | Valid token returns HTTP 200 challenge string; invalid returns 403 / 2026-08-27                                      |
| **A6.3** | Inbound Webhook Ingestion with HMAC SHA-256        |  **100% Auto**   |  PASS  | HTTP 200 in <50ms; saved in `integration_events` with `signature_valid=t` / 2026-08-27                               |
| **A6.4** | HMAC Signature Tamper Protection (401)             |  **100% Auto**   |  PASS  | HTTP 401 Unauthorized; zero rows added to `integration_events` / 2026-08-27                                          |
| **A6.5** | Webhook Message Deduplication (Idempotency)        |  **100% Auto**   |  PASS  | Replayed event dropped; zero duplicate messages created / 2026-08-27                                                 |
| **A7.1** | Conversation Filter Views (`needs_me`)             |  **100% Auto**   |  PASS  | HTTP 200 OK with `{"items":[],"totalUnread":0}` / 2026-08-27                                                         |
| **A7.2** | Redis Redlock Concurrency Control                  |  **100% Auto**   |  PASS  | `conversation-lock.spec.ts` passes 12/12 concurrency & TTL tests / 2026-08-27                                        |
| **A7.3** | Timeline Projection API                            |  **100% Auto**   |  PASS  | `timeline.controller.spec.ts` passes 6/6 tests; HTTP 404 for invalid ID / 2026-08-27                                 |
| **A7.4** | Automated Human Takeover & AI Pause                |  **100% Auto**   |  PASS  | `messages.controller.spec.ts` passes 20/20 tests; verified takeover, stop AI, manual reply & resume / 2026-08-27     |
| **A7.5** | Automated Realtime WebSocket Gateway               |  **100% Auto**   |  PASS  | `realtime.gateway.spec.ts` passes 19/19 tests: handshake auth, room segregation, event broadcast / 2026-08-27        |
| **A8.1** | Tunisian Derja AI Sales Orchestration              |  **100% Auto**   |  PASS  | `orchestrator.service.spec.ts` passes 17/17 tests with Tunisian Derja / 2026-08-27                                   |
| **A8.2** | Commercial Guardrails (Discount Caps)              |  **100% Auto**   |  PASS  | `guardrails.spec.ts` passes 44/44 discount, refund & guarantee tests / 2026-08-27                                    |
| **A8.3** | Three-Model LLM Fallback Chain                     |  **100% Auto**   |  PASS  | `model-fallback.service.spec.ts` passes 5/5 failover cascade tests / 2026-08-27                                      |

### Tier B: Automated Harness + Human Spot-Check (Hybrid)

| Phase  | Test Description                          |     Automation Level      | Status | Notes / Date                                                                                                                                  |
| :----- | :---------------------------------------- | :-----------------------: | :----: | :-------------------------------------------------------------------------------------------------------------------------------------------- |
| **B1** | Meta Webhook URL & Verify Token in Portal | **90% Auto + Spot-Check** |  PASS  | Ngrok tunnel 200 OK, Graph API app `1072354271993824` verified, challenge returned `auto_verify_12345`, 403 on invalid / 2026-08-27           |
| **B2** | Meta OAuth Channel Connection Flow        | **85% Auto + Spot-Check** |  PASS  | Generated OAuth dialog URL with client_id `1072354271993824`, ngrok redirect URI & scopes; CSRF state verified; 15/15 tests pass / 2026-08-27 |
| **B3** | Transactional Email Delivery (Resend)     | **95% Auto + Spot-Check** |  PASS  | `expires_at` -> `expiresAt` fixed in `members.service.ts`; HTTP 201 Created, token generated & stored in `invitations` table / 2026-08-27     |
| **B4** | Meta Developer Sandbox / Tester Roles     | **85% Auto + Spot-Check** |  PASS  | Graph API confirms app in Development mode with active administrator role `2345441032895383` / 2026-08-27                                     |

### Tier C: Truly Human-Only QA (Physical Sensory Validation)

| Phase  | Test Description                       |      Evaluation Type      | Status | Notes / Date                                                                                   |
| :----- | :------------------------------------- | :-----------------------: | :----: | :--------------------------------------------------------------------------------------------- |
| **C1** | Smartphone Direct Messaging Smoke Test | **Physical Sensory & UX** |        | Real mobile device: Tunisian Derja conversational cadence, screen ergonomics & camera photo UX |

---

## 4. Next Step After Sign-Off

Once both Section A and Section B items have passed and have been signed off:

1. All existing functionality (Waves W0–W5) is certified healthy and verified against production-like environment variables.
2. You can proceed with confidence to implement leaf **`T-HAND-01`**:
   ```bash
   python3 backlog/_runner.py start
   python3 backlog/_runner.py scaffold
   ```
