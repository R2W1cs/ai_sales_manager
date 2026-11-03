## 4. FR-AUTH — Authentication and identity

| ID          | Requirement                                                                                                                                                                       | Priority | Verify |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------ |
| FR-AUTH-001 | A visitor can register with email and password, creating a `users` row.                                                                                                           | M        | AT     |
| FR-AUTH-002 | Passwords are stored only as a salted hash; plaintext is never logged, returned, or persisted.                                                                                    | M        | AT, IN |
| FR-AUTH-003 | A registered user can log in and receive a short-lived access token plus a refresh token.                                                                                         | M        | AT     |
| FR-AUTH-004 | A user can refresh an expired access token without re-entering credentials, until the refresh token expires or is revoked.                                                        | M        | AT     |
| FR-AUTH-005 | A user can log out, invalidating the refresh token for that session.                                                                                                              | M        | AT     |
| FR-AUTH-006 | A user can sign in with an OAuth provider (Google) and be linked to an existing `users` row by verified email.                                                                    | S        | AT     |
| FR-AUTH-007 | A user belonging to multiple businesses can select the active business; every API call resolves tenant scope from the token or an explicit business header.                       | M        | AT     |
| FR-AUTH-008 | A user can request a password reset by email and set a new password with a single-use, time-limited token.                                                                        | S        | AT     |
| FR-AUTH-009 | Failed login attempts are rate-limited per email and per IP.                                                                                                                      | M        | AT, OB |
| FR-AUTH-010 | Email addresses are unique and case-insensitive across the platform.                                                                                                              | M        | AT     |
| FR-AUTH-011 | An invited user can accept an invitation and join an existing business with the role assigned by the inviter.                                                                     | M        | AT     |
| FR-AUTH-012 | Multi-factor authentication.                                                                                                                                                      | W        | —      |
| FR-AUTH-013 | A public landing page at `/` presents the commercial value proposition, bilingual (Derja/French) sales agent preview, 4-KPI ROI, and navigation CTAs to `/login` and `/register`. | M        | AT, MT |

Token lifetimes, algorithms, and revocation storage: `17_SECURITY_DESIGN.md`. Endpoints: `13_API_DESIGN.md`.

---

## 5. FR-BIZ — Business workspace, members, onboarding

### 5.1 Workspace

| ID         | Requirement                                                                                                                                                                                                         | Priority | Verify |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------ |
| FR-BIZ-001 | An authenticated user can create a business, becoming its Owner.                                                                                                                                                    | M        | AT     |
| FR-BIZ-002 | A business captures name, industry (default `fashion`), country (default `TN`), default language (`fr` or `ar`), timezone, and currency (default `TND`).                                                            | M        | AT     |
| FR-BIZ-003 | Creating a business seeds: one default `ai_agent`, default `ai_settings`, platform default `ai_prompts` references, and a starter `business_rules` set (delivery, payment, returns) marked as unconfirmed defaults. | M        | AT     |
| FR-BIZ-004 | Owner and Admin can update business profile fields.                                                                                                                                                                 | M        | AT     |
| FR-BIZ-005 | Only the Owner can delete a business; deletion is soft (30-day recovery window) and immediately disables AI and channel processing.                                                                                 | S        | AT     |
| FR-BIZ-006 | All tenant data access is scoped by `business_id`; no endpoint may return data belonging to another business.                                                                                                       | M        | AT, IN |
| FR-BIZ-007 | Ownership transfer between users.                                                                                                                                                                                   | W        | —      |

### 5.2 Members and roles

| ID         | Requirement                                                                                                                              | Priority | Verify |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------ |
| FR-BIZ-010 | Owner and Admin can invite a user by email with a role of Admin or Employee (merchant UI may label Employee as **Agent**).               | M        | AT     |
| FR-BIZ-011 | Owner and Admin can remove a member; removal revokes access immediately and releases that user's active conversation assignments.        | M        | AT     |
| FR-BIZ-012 | Owner and Admin can change a member's role, except that only the Owner may grant Owner-equivalent capability (Phase 1: no second Owner). | M        | AT     |
| FR-BIZ-013 | The member list shows name, email, role, invite status, and last active timestamp.                                                       | S        | MT     |
| FR-BIZ-014 | Seat count is enforced against the plan limit; inviting beyond the limit returns a quota error with an upgrade CTA.                      | M        | AT     |
| FR-BIZ-015 | Custom roles with granular permission selection.                                                                                         | W        | —      |

### 5.3 Onboarding

Onboarding is a **guided, resumable checklist** persisted on the business, not a linear wizard the user can be trapped in. Merchant-facing sequence: create business → connect Instagram → import products → configure AI personality (includes minimum policies) → test in playground → activate. Screen-level design: `docs/20_design/22_UX_FLOWS.md`.

| ID         | Requirement                                                                                                                                                                                                                    | Priority | Verify |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------- | ------ |
| FR-BIZ-020 | The system tracks per-step completion flags for: business created, channel connected, products imported, AI personality + minimum policies configured, AI playground test passed, handoff workflow acknowledged, AI activated. | M        | AT     |
| FR-BIZ-021 | The user can leave and resume onboarding at any point without data loss; the checklist state is server-side, not client-side.                                                                                                  | M        | AT     |
| FR-BIZ-022 | The user can skip optional steps and return to them from Settings.                                                                                                                                                             | M        | MT     |
| FR-BIZ-023 | The checklist displays remaining blocking items and links directly to each.                                                                                                                                                    | M        | MT     |
| FR-BIZ-024 | The system computes `ai_activation_ready` from the gates in §14 and exposes it to the UI.                                                                                                                                      | M        | AT     |
| FR-BIZ-025 | Attempting to set AI live while `ai_activation_ready` is false is rejected by the API, not only by the UI.                                                                                                                     | M        | AT     |
| FR-BIZ-026 | An AI Playground lets Owner/Admin simulate conversations (price question, angry customer, buying intent, product recommendation) without a connected channel; passing it satisfies the "AI test" gate.                         | M        | AT, MT |

---

## 6. FR-CAT — Product catalog

The catalog is **variant-first**: price and stock live on `product_variants`, never on `products`. Single-SKU products carry exactly one `is_default` variant. Fashion uses `size` and `color` as variant attributes. The AI searches **variants**, not parent products alone. Schema: `12_DATABASE_DESIGN.md`.

### 6.1 Products, categories, variants, images

| ID         | Requirement                                                                                                                                            | Priority | Verify |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | -------- | ------ |
| FR-CAT-001 | Owner/Admin can create, read, update, and archive products with name, description, category, status (`draft` / `active`), and currency override.       | M        | AT     |
| FR-CAT-002 | Only `active` products with at least one in-stock variant are visible to AI product search.                                                            | M        | AT, EV |
| FR-CAT-003 | Owner/Admin can manage a category tree (`parent_id`, `sort_order`) scoped to the business.                                                             | M        | AT     |
| FR-CAT-004 | Owner/Admin can create variants with SKU, barcode, attributes (JSONB, e.g. `{"color":"Black","size":"M"}`), price, optional discount price, and stock. | M        | AT     |
| FR-CAT-005 | SKU is unique per business when provided; blank SKUs are permitted and auto-generated.                                                                 | M        | AT     |
| FR-CAT-006 | Price must be non-negative; discount price, when set, must be less than price.                                                                         | M        | AT     |
| FR-CAT-007 | Stock is a non-negative integer; the system exposes `available_stock = stock − active reservations`.                                                   | M        | AT     |
| FR-CAT-008 | Owner/Admin can upload images to a product or to a specific variant, with alt text, sort order, and one primary flag per scope.                        | M        | AT     |
| FR-CAT-009 | Images are stored in object storage; the database stores URLs, never binary blobs.                                                                     | M        | IN     |
| FR-CAT-010 | Optional AI merchandising fields (`benefits`, `selling_points`, `objections`, `faqs`) can be set per product and are included in retrieval context.    | S        | AT, EV |
| FR-CAT-011 | Editing price, stock, name, description, or merchandising fields enqueues a re-embedding job for the affected records.                                 | M        | AT     |
| FR-CAT-012 | Deleting a product that appears on an order is blocked; the product must be archived instead.                                                          | M        | AT     |
| FR-CAT-013 | `search_products` (and equivalent retrieval) returns sellable **variants** (SKU, size, color, price, available stock), never an unpriced parent row.   | M        | AT, EV |
| FR-CAT-015 | Bulk edit of price or stock across selected variants.                                                                                                  | C        | AT     |
| FR-CAT-014 | Inventory movement history (`inventory_movements`) recording every stock delta with a reason.                                                          | S        | AT     |

### 6.2 CSV import

| ID         | Requirement                                                                                                                               | Priority | Verify                           |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------- | -------- | -------------------------------- |
| FR-CAT-020 | Owner/Admin can upload a CSV of products; required columns are name, price, stock; SKU, category, attributes, and image URL are optional. | M        | AT                               |
| FR-CAT-021 | The system validates the file and returns a **row-level error report** before any data is written.                                        | M        | AT                               |
| FR-CAT-022 | The user previews the parsed result and explicitly confirms before import executes.                                                       | M        | MT                               |
| FR-CAT-023 | Confirmed import runs asynchronously and upserts categories, products, variants, and image rows.                                          | M        | AT                               |
| FR-CAT-024 | Import runs are recorded with status, row counts, and a downloadable error file.                                                          | M        | AT                               |
| FR-CAT-025 | Successful import enqueues embedding reindex for affected records and marks the catalog onboarding step complete.                         | M        | AT                               |
| FR-CAT-026 | Re-importing the same file is idempotent by SKU: existing variants update rather than duplicate.                                          | M        | AT                               |
| FR-CAT-027 | A downloadable CSV template with correct headers and one example row is provided.                                                         | M        | MT                               |
| FR-CAT-028 | Google Sheets import; Shopify / WooCommerce sync.                                                                                         | W        | — (Phase 2, see `04_ROADMAP.md`) |

---

## 7. FR-KNOW — Knowledge base and business rules

Two distinct stores, deliberately separated:

- **`business_rules`** — structured, authoritative, versioned operational facts. Read by tools and the policy engine. _Never_ paraphrased by the LLM.
- **`knowledge_documents`** — unstructured text (FAQs, policy prose, brand info) chunked and embedded for retrieval.

| ID          | Requirement                                                                                                                             | Priority | Verify |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------ |
| FR-KNOW-001 | Owner/Admin can define delivery rules: zones with fee and estimated duration.                                                           | M        | AT     |
| FR-KNOW-002 | Owner/Admin can define accepted payment methods (e.g. cash on delivery, bank transfer).                                                 | M        | AT     |
| FR-KNOW-003 | Owner/Admin can define the return/exchange policy: window in days and conditions.                                                       | M        | AT     |
| FR-KNOW-004 | Owner/Admin can define working hours, used when the AI promises human follow-up timing.                                                 | M        | AT     |
| FR-KNOW-005 | Owner/Admin can define discount policy; the default is that the AI may offer **no** discounts.                                          | M        | AT, EV |
| FR-KNOW-006 | Owner/Admin can define minimum order value and free-shipping threshold.                                                                 | S        | AT     |
| FR-KNOW-007 | Rules carry `priority`, `enabled`, `effective_from`, and `effective_to`; the AI resolves rules effective at the conversation timestamp. | M        | AT     |
| FR-KNOW-008 | Editing a rule creates a new effective version rather than destroying history.                                                          | M        | AT     |
| FR-KNOW-009 | Delivery fees and payment answers are computed from `business_rules`, never inferred by the model.                                      | M        | AT, EV |
| FR-KNOW-010 | When two enabled rules conflict for the same question, the system does not guess: it escalates with reason `policy_conflict`.           | M        | AT, EV |
| FR-KNOW-011 | Owner/Admin can create, edit, and delete knowledge documents (title, source type, raw text).                                            | M        | AT     |
| FR-KNOW-012 | Saving a document chunks and embeds it asynchronously; the UI shows indexing status.                                                    | M        | AT     |
| FR-KNOW-013 | Re-saving unchanged content does not re-embed (content-hash check).                                                                     | S        | AT     |
| FR-KNOW-014 | Owner/Admin can trigger a full reindex for the business.                                                                                | M        | AT     |
| FR-KNOW-015 | File upload (PDF/DOCX) knowledge ingestion.                                                                                             | C        | AT     |
| FR-KNOW-016 | Website crawl ingestion.                                                                                                                | W        | —      |

---
