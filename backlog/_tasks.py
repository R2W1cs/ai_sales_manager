"""Master task register for Phase 1 MVP."""

TASKS = [ { 'depends': [],
    'fs': ['FS-OPS-01'],
    'id': 'T-BOOT-01',
    'leaves': [ { 'cmd': 'test -d apps/api && test -d apps/web && test -f pnpm-workspace.yaml',
                  'do': [ 'Scaffold TypeScript Better Fullstack with pins in `11` §2.1: Next + Nest 11 + Prisma 7 + '
                          'pnpm + Compose + GHA + tanstack-query + eslint + prettier.',
                          'Use `--no-install`. Do not hand-roll a second starter.'],
                  'done': 'Repo has `apps/api`, `apps/web`, `packages/shared` (or BFS equivalent) matching `11` §2.1.',
                  'dont': [ 'Do not pass `--install`. Not Biome, Storybook, Radix, Zustand, Vitest, Stripe, `backend: '
                            'self`.'],
                  'files': [ 'package.json',
                             'pnpm-workspace.yaml',
                             'apps/api',
                             'apps/web',
                             'packages/shared',
                             'packages/config'],
                  'letter': 'a',
                  'read': [ 'docs/10_engineering/11_TECH_STACK/01-scaffold-pins-layout.md',
                            'docs/10_engineering/10_ARCHITECTURE/01-modular-monolith-domains.md',
                            '.agents/skills/better-fullstack/SKILL.md'],
                  'title': 'BFS scaffold (no install)'},
                { 'cmd': 'test -d apps/worker',
                  'do': [ 'Add `apps/worker` (or equivalent entry) that uses the **same** Nest image as `apps/api` '
                          '(`18` §1, `11`). Different entrypoint only.',
                          'Workspace packages: `apps/api`, `apps/web`, `apps/worker`, `packages/shared`, '
                          '`packages/config`.'],
                  'done': 'Worker package exists; Dockerfile/image name shared with API; no fourth app.',
                  'dont': ['Do not create a separate image for `apps/worker`.'],
                  'files': ['apps/worker', 'apps/api/Dockerfile', 'pnpm-workspace.yaml', 'package.json'],
                  'letter': 'b',
                  'read': [ 'docs/10_engineering/18_DEPLOYMENT/01-infrastructure-topology-ecs.md',
                            'docs/10_engineering/11_TECH_STACK/01-scaffold-pins-layout.md'],
                  'title': 'Lockfile + worker entrypoint'},
                { 'cmd': 'node scripts/check-forbidden-addons.mjs && pnpm exec tsc --noEmit && pnpm exec eslint . '
                         '--max-warnings 0',
                  'do': [ 'Generate `pnpm-lock.yaml` from the scaffold (install locally, not via MCP).',
                          'Confirm workspace package.json files have no direct Storybook, Radix UI addon, Biome, '
                          'Zustand, Vitest, MSW, or Stripe deps (scripts/check-forbidden-addons.mjs).',
                          'ESLint + Prettier only (11 §2.1).'],
                  'done': '`apps/api` and `apps/web` compile cleanly with no type or lint errors.',
                  'dont': [],
                  'files': [ 'pnpm-lock.yaml',
                             'package.json',
                             'eslint.config.js',
                             'prettier.config.js',
                             '.editorconfig',
                             '.prettierignore',
                             '.vscode/settings.json',
                             'scripts/check-forbidden-addons.mjs'],
                  'letter': 'c',
                  'read': [ 'docs/10_engineering/11_TECH_STACK/01-scaffold-pins-layout.md',
                            'docs/30_execution/30_TASKS.md'],
                  'title': 'Build verification'}],
    'parent_done': 'Apps `api` / `web` / `worker` same Nest image; no Storybook/Radix/Biome.',
    'size': 'L',
    'title': 'Scaffold monorepo from `11` §2.1',
    'wave': 'W0'},
  { 'depends': ['T-BOOT-01'],
    'fs': ['FS-OPS-01'],
    'id': 'T-BOOT-02',
    'leaves': [ { 'cmd': 'pnpm exec tsc --noEmit && pnpm --filter api test',
                  'do': [ 'Export `ErrorEnvelope`, `PaginationCursor`, `Money`, `DateTimeIso` from `packages/shared`.',
                          'Export all JSONB schema validators per `12` §14.'],
                  'done': 'Shared types and Zod schemas tested and imported by `apps/api`.',
                  'dont': ['Do not duplicate schemas in `apps/api`.'],
                  'files': [ 'packages/shared/src/error.ts',
                             'packages/shared/src/pagination.ts',
                             'packages/shared/src/money.ts',
                             'packages/shared/src/index.ts',
                             'packages/shared/src/error.spec.ts'],
                  'letter': '',
                  'read': [ 'docs/10_engineering/13_API_DESIGN/01-conventions-dto-contracts.md',
                            'docs/10_engineering/12_DATABASE_DESIGN/06-jsonb-migrations-seeds.md'],
                  'title': 'Shared Zod schemas and kernel'}],
    'parent_done': 'API and web import the same types',
    'size': 'M',
    'title': '`packages/shared`: Zod JSONB + error envelope + pagination cursor',
    'wave': 'W0'},
  { 'depends': ['T-BOOT-02'],
    'fs': ['FS-OPS-01'],
    'id': 'T-BOOT-03',
    'leaves': [ { 'cmd': 'pnpm --filter api exec prisma validate',
                  'do': ['Define all domain enums in `schema.prisma` matching `12` §3.'],
                  'done': 'All enums from `12` §3 present and validated.',
                  'dont': ['Do not invent enums.'],
                  'files': ['apps/api/prisma/schema.prisma', 'packages/shared/src/enums.ts'],
                  'letter': 'a',
                  'read': [ 'docs/10_engineering/12_DATABASE_DESIGN/01-rules-enums-er.md',
                            'docs/00_product/06_AI_HUMAN_HANDOFF_RULES/01-triggers-briefing.md'],
                  'title': 'Domain enums in schema.prisma'},
                { 'cmd': 'pnpm --filter api exec prisma validate',
                  'do': [ 'Implement `users`, `refresh_tokens`, `businesses`, `memberships`, `business_onboarding`, '
                          '`business_rules`, `invitations`, `idempotency_keys`.'],
                  'done': 'Identity models match `12` §5.',
                  'dont': [],
                  'files': ['apps/api/prisma/schema.prisma'],
                  'letter': 'b',
                  'read': [ 'docs/10_engineering/12_DATABASE_DESIGN/02-identity-catalog-inventory.md',
                            'docs/10_engineering/17_SECURITY_DESIGN/01-auth-tenancy-rbac.md'],
                  'title': 'Identity & workspace tables'},
                { 'cmd': 'pnpm --filter api exec prisma validate',
                  'do': [ 'Implement `categories`, `products`, `product_variants`, `product_images`, '
                          '`stock_reservations`, `catalog_import_runs`, `customers`, `customer_identities`, '
                          '`customer_tags`, `customer_notes`.'],
                  'done': 'Catalog models match `12` §6–7.',
                  'dont': [],
                  'files': ['apps/api/prisma/schema.prisma'],
                  'letter': 'c',
                  'read': [ 'docs/10_engineering/12_DATABASE_DESIGN/02-identity-catalog-inventory.md',
                            'docs/10_engineering/12_DATABASE_DESIGN/03-customers-messaging-integrations.md'],
                  'title': 'Catalog & customers tables'},
                { 'cmd': 'pnpm --filter api exec prisma validate',
                  'do': [ 'Implement `channel_accounts`, `message_templates`, `integration_events`, `conversations`, '
                          '`conversation_status_events`, `messages`, `message_attachments`, `internal_notes`, '
                          '`conversation_assignments`.'],
                  'done': 'Messaging models match `12` §8.',
                  'dont': [],
                  'files': ['apps/api/prisma/schema.prisma'],
                  'letter': 'd',
                  'read': ['docs/10_engineering/12_DATABASE_DESIGN/03-customers-messaging-integrations.md'],
                  'title': 'Channels & conversations tables'},
                { 'cmd': 'pnpm --filter api exec prisma validate',
                  'do': ['Implement `orders`, `order_items`, `knowledge_documents`, `embeddings` with pgvector(1536).'],
                  'done': 'Order and knowledge models match `12` §9–10.',
                  'dont': [],
                  'files': ['apps/api/prisma/schema.prisma'],
                  'letter': 'e',
                  'read': ['docs/10_engineering/12_DATABASE_DESIGN/04-orders-knowledge-ai-schema.md'],
                  'title': 'Orders, knowledge & embeddings'},
                { 'cmd': 'pnpm --filter api exec prisma validate',
                  'do': [ 'Implement `ai_agents`, `ai_settings`, `ai_prompts`, `ai_actions`, `ai_decision_traces`, '
                          '`ai_usage`, `ai_feedback`, `ai_evaluations`, `plans`, `subscriptions`, `usage_events`, '
                          '`usage_aggregates`, `analytics_daily`, `feature_flags`.'],
                  'done': 'AI and billing models match `12` §11–12.',
                  'dont': ['No fifth KPI column.'],
                  'files': ['apps/api/prisma/schema.prisma'],
                  'letter': 'f',
                  'read': [ 'docs/10_engineering/12_DATABASE_DESIGN/04-orders-knowledge-ai-schema.md',
                            'docs/10_engineering/12_DATABASE_DESIGN/05-billing-notifications-audit.md'],
                  'title': 'AI config, observability & billing'},
                { 'cmd': 'pnpm --filter api exec prisma validate',
                  'do': ['Implement `notifications` and `audit_logs`.'],
                  'done': 'Models match `12` §13.',
                  'dont': [],
                  'files': ['apps/api/prisma/schema.prisma', 'packages/shared/src/jsonb.ts'],
                  'letter': 'g',
                  'read': ['docs/10_engineering/12_DATABASE_DESIGN/06-jsonb-migrations-seeds.md'],
                  'title': 'Notifications & audit logs'},
                { 'cmd': 'pnpm --filter api exec prisma migrate diff --from-empty --to-schema prisma/schema.prisma '
                         '--script',
                  'do': [ 'Generate and apply initial migration with vector, citext, pgcrypto extensions and HNSW '
                          'index.'],
                  'done': 'Migration applied cleanly to local Postgres.',
                  'dont': [],
                  'files': ['apps/api/prisma/schema.prisma', 'apps/api/prisma/migrations'],
                  'letter': 'h',
                  'read': [ 'docs/10_engineering/12_DATABASE_DESIGN/01-rules-enums-er.md',
                            'docs/10_engineering/12_DATABASE_DESIGN/06-jsonb-migrations-seeds.md'],
                  'title': 'Initial forward-only migration'}],
    'parent_done': '`prisma migrate` local; no invented tables',
    'size': 'XL',
    'title': 'Prisma schema from `12` (enums, `business_id`, indexes). First forward-only migration',
    'wave': 'W0'},
  { 'depends': ['T-BOOT-03'],
    'fs': ['FS-OPS-01'],
    'id': 'T-BOOT-04',
    'leaves': [ { 'cmd': 'docker compose config',
                  'do': ['Configure docker-compose.yml with services and create seed.ts for demo business in Tunisia.'],
                  'done': 'Docker compose runs all services and seed populates demo tenant.',
                  'dont': [],
                  'files': ['docker-compose.yml', 'apps/api/prisma/seed.ts', '.env.example'],
                  'letter': '',
                  'read': [ 'docs/10_engineering/18_DEPLOYMENT/02-storage-env-ci-ops.md',
                            'docs/10_engineering/11_TECH_STACK/02-backend-db-realtime.md',
                            'docs/10_engineering/12_DATABASE_DESIGN/06-jsonb-migrations-seeds.md'],
                  'title': 'Docker Compose and seed script'}],
    'parent_done': 'One command up; playground/`is_test` rows excluded from KPIs (`12` §2.6)',
    'size': 'M',
    'title': 'Compose: Postgres+pgvector, Redis, MinIO, api, worker, web. Seed demo business',
    'wave': 'W0'},
  { 'depends': ['T-BOOT-01'],
    'fs': ['FS-OPS-01'],
    'id': 'T-BOOT-05',
    'leaves': [ { 'cmd': 'test -f .github/workflows/ci.yml',
                  'do': ['Create CI workflow running lint, typecheck, Jest, Playwright, and security scan.'],
                  'done': 'CI workflow active on pull requests.',
                  'dont': [],
                  'files': ['.github/workflows/ci.yml'],
                  'letter': '',
                  'read': [ 'docs/10_engineering/11_TECH_STACK/01-scaffold-pins-layout.md',
                            'docs/10_engineering/18_DEPLOYMENT/02-storage-env-ci-ops.md',
                            'docs/10_engineering/10_ARCHITECTURE/01-modular-monolith-domains.md'],
                  'title': 'GitHub Actions CI workflow'}],
    'parent_done': 'PR blocked on typecheck + lint',
    'size': 'M',
    'title': 'CI: ESLint, `tsc --noEmit`, Jest, Playwright install, vuln scan',
    'wave': 'W0'},
  { 'depends': ['T-BOOT-03'],
    'fs': ['FS-OPS-01'],
    'id': 'T-BOOT-06',
    'leaves': [ { 'cmd': 'pnpm exec tsc --noEmit',
                  'do': ['Create 12 NestJS domain module shells with boundary architecture tests.'],
                  'done': '12 module shells created and architecture boundary test passing.',
                  'dont': ['No cross-module direct Prisma queries.'],
                  'files': [ 'apps/api/src/auth/auth.module.ts',
                             'apps/api/src/businesses/businesses.module.ts',
                             'apps/api/src/products/products.module.ts',
                             'apps/api/src/conversations/conversations.module.ts',
                             'apps/api/src/ai/ai.module.ts',
                             'apps/api/src/integrations/integrations.module.ts',
                             'apps/api/src/platform/platform.module.ts',
                             'apps/api/src/app.module.ts'],
                  'letter': '',
                  'read': [ 'docs/10_engineering/10_ARCHITECTURE/01-modular-monolith-domains.md',
                            'docs/10_engineering/13_API_DESIGN/01-conventions-dto-contracts.md',
                            'docs/10_engineering/17_SECURITY_DESIGN/01-auth-tenancy-rbac.md'],
                  'title': '12 NestJS module shells'}],
    'parent_done': 'Reviewer can fail a cross-entity import',
    'size': 'M',
    'title': 'Nest module shells per `10` §4. No cross-module Prisma imports',
    'wave': 'W0'},
  { 'depends': ['T-BOOT-06'],
    'fs': ['FS-AUTH-01'],
    'id': 'T-AUTH-01',
    'leaves': [ { 'cmd': 'pnpm --filter api test',
                  'do': ['Implement POST /auth/register and POST /auth/login with Argon2id and JWTs.'],
                  'done': 'Register and login endpoints functioning.',
                  'dont': [],
                  'files': [ 'apps/api/src/auth/core/auth.controller.ts',
                             'apps/api/src/auth/core/auth.service.ts',
                             'apps/api/src/auth/auth.module.ts',
                             'packages/shared/src/auth/index.ts'],
                  'letter': 'a',
                  'read': [ 'docs/10_engineering/13_API_DESIGN/02-auth-workspace-inbox.md',
                            'docs/10_engineering/17_SECURITY_DESIGN/01-auth-tenancy-rbac.md',
                            'docs/30_execution/32_FEATURE_SPECIFICATIONS.md'],
                  'title': 'Register + login'},
                { 'cmd': 'pnpm --filter api test',
                  'do': ['Implement POST /auth/refresh with token rotation, POST /auth/logout, and GET /auth/me.'],
                  'done': 'Session refresh, logout, and me endpoints working.',
                  'dont': [],
                  'files': [ 'apps/api/src/auth/core/auth.controller.ts',
                             'apps/api/src/auth/core/auth.service.ts',
                             'apps/api/src/auth/core/refresh.ts'],
                  'letter': 'b',
                  'read': [ 'docs/10_engineering/13_API_DESIGN/02-auth-workspace-inbox.md',
                            'docs/10_engineering/17_SECURITY_DESIGN/01-auth-tenancy-rbac.md'],
                  'title': 'Refresh + logout + me'},
                { 'cmd': 'pnpm --filter api test',
                  'do': ['Test duplicate email 409, generic login 401, password validation rules.'],
                  'done': 'Auth tests passing.',
                  'dont': [],
                  'files': ['apps/api/src/auth/core/auth.controller.spec.ts'],
                  'letter': 'c',
                  'read': ['docs/10_engineering/17_SECURITY_DESIGN/01-auth-tenancy-rbac.md'],
                  'title': 'Auth invariant tests'}],
    'parent_done': 'Duplicate email 409; login 401 same copy; min password 10',
    'size': 'L',
    'title': 'Register / login / refresh / logout / me',
    'wave': 'W1'},
  { 'depends': ['T-AUTH-01'],
    'fs': ['FS-AUTH-01'],
    'id': 'T-AUTH-02',
    'leaves': [ { 'cmd': 'pnpm --filter api test',
                  'do': ['Implement TenantGuard for X-Business-Id resolution and active membership verification.'],
                  'done': 'TenantGuard implemented.',
                  'dont': [],
                  'files': ['apps/api/src/platform/security/tenant.guard.ts', 'apps/api/src/auth/auth.module.ts'],
                  'letter': 'a',
                  'read': [ 'docs/10_engineering/17_SECURITY_DESIGN/01-auth-tenancy-rbac.md',
                            'docs/10_engineering/10_ARCHITECTURE/02-flow-tenancy-topology.md'],
                  'title': 'TenantGuard'},
                { 'cmd': 'pnpm --filter api test',
                  'do': [ 'Implement PermissionsGuard with the 22 closed permission codes and RequirePermission '
                          'decorator.'],
                  'done': 'PermissionsGuard implemented.',
                  'dont': [],
                  'files': ['apps/api/src/platform/security/permissions.guard.ts', 'apps/api/src/platform/security/permissions.ts'],
                  'letter': 'b',
                  'read': ['docs/10_engineering/17_SECURITY_DESIGN/01-auth-tenancy-rbac.md'],
                  'title': 'PermissionsGuard + decorator'},
                { 'cmd': 'pnpm --filter api test -- src/platform',
                  'do': [ '1. Author `tenant.guard.spec.ts`: test missing header (400), user without membership (403), '
                          'inactive membership (403), valid tenant (passes).',
                          '2. Author `permissions.guard.spec.ts`: test unauthenticated (401), missing tenant context '
                          '(403), Owner role (passes all 22).',
                          '3. Test Manager role on allowed permissions (e.g. `catalog.write`, `inbox.write`) vs '
                          'forbidden (e.g. `business.delete`).',
                          '4. Test Employee role on allowed permissions (e.g. `inbox.read`, `orders.write`) vs '
                          'forbidden (e.g. `catalog.write`, `ai.configure`).',
                          '5. Verify all tests pass with `pnpm --filter api test -- src/platform`.'],
                  'done': 'Jest tests verify wrong tenant 403 and missing perm 403 per NFR-SEC-04-05.',
                  'dont': ['Do not mock Prisma globally; test the guard logic with mock ExecutionContext.'],
                  'files': [ 'apps/api/src/platform/security/tenant.guard.spec.ts',
                             'apps/api/src/platform/security/permissions.guard.spec.ts'],
                  'gold': { 'acceptance_test_scenarios': [ '[ ] **Happy Path**: Valid tenant member with required '
                                                           'permission passes guard check.',
                                                           '[ ] **Missing Header (400)**: Request without '
                                                           '`X-Business-Id` throws 400 Bad Request.',
                                                           '[ ] **Cross-Tenant Access (403)**: Accessing tenant '
                                                           'without active membership throws 403 Forbidden.',
                                                           '[ ] **Permission Escalation (403)**: Employee attempting '
                                                           '`ai.configure` or `business.write` receives 403 Forbidden.',
                                                           '[ ] **Coverage**: All 22 closed permission codes have '
                                                           'explicit test coverage.'],
                            'cmd': 'pnpm --filter api test -- src/platform',
                            'depends': ['T-AUTH-02/b'],
                            'dont_modify_scope': [ 'apps/api/src/platform/security/tenant.guard.ts',
                                                   'apps/api/src/platform/security/permissions.guard.ts',
                                                   'apps/web/'],
                            'expected_deliverables': 'Comprehensive, passing unit test suite in '
                                                     '`apps/api/src/platform/**/*.spec.ts`.',
                            'files': [ 'apps/api/src/platform/security/tenant.guard.spec.ts',
                                       'apps/api/src/platform/security/permissions.guard.spec.ts'],
                            'fs': ['FS-AUTH-01'],
                            'human_contribution': [ '**🔑 Environment variables**: None (uses in-memory test mocks).',
                                                    '**🧪 Manual QA & Verification**: Run `pnpm --filter api test -- '
                                                    'src/platform` and verify 100% test pass rate.',
                                                    '**👁️ Review & Sign-off**: Verify role-to-permission mapping '
                                                    'strictly adheres to `13_API_DESIGN.md` §2.11.'],
                            'id': 'T-AUTH-02',
                            'implementation_steps': [ '1. Author `tenant.guard.spec.ts`: test missing header (400), '
                                                      'user without membership (403), inactive membership (403), valid '
                                                      'tenant (passes).',
                                                      '2. Author `permissions.guard.spec.ts`: test unauthenticated '
                                                      '(401), missing tenant context (403), Owner role (passes all '
                                                      '22).',
                                                      '3. Test Manager role on allowed permissions (e.g. '
                                                      '`catalog.write`, `inbox.write`) vs forbidden (e.g. '
                                                      '`business.delete`).',
                                                      '4. Test Employee role on allowed permissions (e.g. '
                                                      '`inbox.read`, `orders.write`) vs forbidden (e.g. '
                                                      '`catalog.write`, `ai.configure`).',
                                                      '5. Verify all tests pass with `pnpm --filter api test -- '
                                                      'src/platform`.'],
                            'leaf_id': 'T-AUTH-02/c',
                            'leaf_title': 'Tenancy & RBAC automated test suite',
                            'modify_scope': [ 'apps/api/src/platform/security/tenant.guard.spec.ts',
                                              'apps/api/src/platform/security/permissions.guard.spec.ts'],
                            'objective_value': 'Exhaustive Jest unit test suite mathematically proving multi-tenant '
                                               'isolation and RBAC permission enforcement on TenantGuard and '
                                               'PermissionsGuard per NFR-SEC-04 and NFR-SEC-05.',
                            'read': [ 'docs/10_engineering/13_API_DESIGN.md',
                                      'docs/10_engineering/17_SECURITY_DESIGN.md'],
                            'security_invariants': [ '🔒 **Tenancy Isolation**: Any request missing `X-Business-Id` or '
                                                     'attempting cross-tenant access must be rejected with 400/403.',
                                                     '🛡️ **RBAC Rigor**: `OWNER` has superuser bypass for all 22 '
                                                     'permissions. `MANAGER` and `EMPLOYEE` are strictly limited to '
                                                     'their documented permissions.',
                                                     '🚫 **Negative Invariants**: Never mock Prisma globally; construct '
                                                     'realistic ExecutionContext mocks.'],
                            'size': 'L',
                            'technical_contract': [ '`TenantGuard.canActivate(context)`: Extracts `X-Business-Id` '
                                                    'header, resolves active membership from JWT user context, '
                                                    'attaches `req.tenantId` and `req.membership`.',
                                                    '`PermissionsGuard.canActivate(context)`: Reads '
                                                    '`@RequirePermission()` metadata, verifies caller membership role '
                                                    'against the 22 closed permissions list.'],
                            'title': 'Tenant resolution + RBAC guards',
                            'wave': 'W1',
                            'why': 'Security invariants require absolute proof that cross-tenant access, missing '
                                   'headers, and privilege escalations are strictly blocked at the guard layer before '
                                   'reaching business logic.'},
                  'letter': 'c',
                  'read': ['docs/10_engineering/17_SECURITY_DESIGN/01-auth-tenancy-rbac.md'],
                  'title': 'Tenancy + RBAC Jest'}],
    'parent_done': 'Wrong tenant 403; missing perm 403',
    'size': 'L',
    'title': 'Tenant resolution + RBAC guards',
    'wave': 'W1'},
  { 'depends': ['T-AUTH-02'],
    'fs': ['FS-AUTH-01'],
    'gold': { 'acceptance_test_scenarios': [ '[ ] **Happy Path**: Valid invitation token creates active membership and '
                                             'returns updated session JWT.',
                                             '[ ] **Expired Token (404)**: Expired token returns 404 error envelope.',
                                             '[ ] **Duplicate Acceptance (409)**: Already accepted invitation returns '
                                             '409 Conflict.',
                                             '[ ] **New User Onboarding**: Unregistered email creates password and '
                                             'user account upon accept.'],
              'cmd': 'pnpm --filter api test -- src/auth',
              'depends': ['T-AUTH-02'],
              'dont_modify_scope': ['apps/web/', 'apps/api/src/businesses/'],
              'expected_deliverables': 'Invitation acceptance endpoint, DTOs, and unit test suite in '
                                       '`apps/api/src/auth`.',
              'files': [ 'apps/api/src/auth/core/auth.controller.ts',
                         'apps/api/src/auth/core/auth.service.ts',
                         'apps/api/src/auth/dto/accept-invitation.dto.ts'],
              'fs': ['FS-AUTH-01'],
              'human_contribution': [ '**🔑 Environment variables**: None.',
                                      '**🧪 Manual QA & Smoke test**: Use Swagger at `http://localhost:3001/api/docs` '
                                      'to test `POST /auth/invitations/accept` with a seed invitation token.',
                                      '**👁️ Review & Sign-off**: Verify invitation status transitions to `ACCEPTED` '
                                      'and cannot be re-used.'],
              'id': 'T-AUTH-03',
              'implementation_steps': [ '1. Create `AcceptInvitationDto` in shared and api with Zod validation.',
                                        '2. Implement `AuthService.acceptInvitation(dto)` with Prisma transaction: '
                                        'lookup invitation, check expiry/status, create/link User, insert Membership, '
                                        'update invitation status=ACCEPTED.',
                                        '3. Add `POST /auth/invitations/accept` in `AuthController` with rate '
                                        'limiting.',
                                        '4. Write unit tests covering valid acceptance, expired tokens, duplicate '
                                        'acceptance, and new vs existing user join.'],
              'modify_scope': [ 'apps/api/src/auth/core/auth.controller.ts',
                                'apps/api/src/auth/core/auth.service.ts',
                                'apps/api/src/auth/dto/accept-invitation.dto.ts',
                                'packages/shared/src/auth/'],
              'objective_value': 'Implement invitation acceptance endpoint allowing invited teammates to join a '
                                 'business workspace securely via token.',
              'read': ['docs/10_engineering/13_API_DESIGN.md', 'docs/10_engineering/17_SECURITY_DESIGN.md'],
              'security_invariants': [ '🔒 **Token Expiration**: Invitations expire after 7 days and cannot be reused '
                                       'after acceptance.',
                                       '🛡️ **Role Integrity**: User membership role is strictly assigned from the '
                                       'invitation record (caller cannot choose role).',
                                       '🚫 **Negative Invariants**: Never allow accepting revoked or already-consumed '
                                       'invitation tokens.'],
              'size': 'M',
              'technical_contract': [ '`POST /auth/invitations/accept` (200 OK)',
                                      'Request Body: `{ token: string, name?: string, password?: string }`',
                                      'Response: `{ user: UserSessionDto, business: BusinessSummaryDto, token: string '
                                      '}`',
                                      'Error Codes: 400 (Invalid token format), 404 (Token not found/expired), 409 '
                                      '(Invitation already accepted)'],
              'title': 'Accept invitation API (`POST /auth/invitations/accept`)',
              'wave': 'W1',
              'why': 'Store owners must be able to invite managers and staff into their workspace with predefined '
                     'roles without manual database provisioning.'},
    'id': 'T-AUTH-03',
    'leaves': [ { 'cmd': 'pnpm --filter api test -- src/auth',
                  'do': [ '1. Create `AcceptInvitationDto` in shared and api with Zod validation.',
                          '2. Implement `AuthService.acceptInvitation(dto)` with Prisma transaction: lookup '
                          'invitation, check expiry/status, create/link User, insert Membership, update invitation '
                          'status=ACCEPTED.',
                          '3. Add `POST /auth/invitations/accept` in `AuthController` with rate limiting.',
                          '4. Write unit tests covering valid acceptance, expired tokens, duplicate acceptance, and '
                          'new vs existing user join.'],
                  'done': 'Valid invitation token creates active membership and returns updated session JWT.',
                  'dont': [ '🚫 **Negative Invariants**: Never allow accepting revoked or already-consumed invitation '
                            'tokens.'],
                  'files': [ 'apps/api/src/auth/core/auth.controller.ts',
                             'apps/api/src/auth/core/auth.service.ts',
                             'apps/api/src/auth/dto/accept-invitation.dto.ts'],
                  'gold': { 'acceptance_test_scenarios': [ '[ ] **Happy Path**: Valid invitation token creates active '
                                                           'membership and returns updated session JWT.',
                                                           '[ ] **Expired Token (404)**: Expired token returns 404 '
                                                           'error envelope.',
                                                           '[ ] **Duplicate Acceptance (409)**: Already accepted '
                                                           'invitation returns 409 Conflict.',
                                                           '[ ] **New User Onboarding**: Unregistered email creates '
                                                           'password and user account upon accept.'],
                            'cmd': 'pnpm --filter api test -- src/auth',
                            'depends': ['T-AUTH-02'],
                            'dont_modify_scope': ['apps/web/', 'apps/api/src/businesses/'],
                            'expected_deliverables': 'Invitation acceptance endpoint, DTOs, and unit test suite in '
                                                     '`apps/api/src/auth`.',
                            'files': [ 'apps/api/src/auth/core/auth.controller.ts',
                                       'apps/api/src/auth/core/auth.service.ts',
                                       'apps/api/src/auth/dto/accept-invitation.dto.ts'],
                            'fs': ['FS-AUTH-01'],
                            'human_contribution': [ '**🔑 Environment variables**: None.',
                                                    '**🧪 Manual QA & Smoke test**: Use Swagger at '
                                                    '`http://localhost:3001/api/docs` to test `POST '
                                                    '/auth/invitations/accept` with a seed invitation token.',
                                                    '**👁️ Review & Sign-off**: Verify invitation status transitions to '
                                                    '`ACCEPTED` and cannot be re-used.'],
                            'id': 'T-AUTH-03',
                            'implementation_steps': [ '1. Create `AcceptInvitationDto` in shared and api with Zod '
                                                      'validation.',
                                                      '2. Implement `AuthService.acceptInvitation(dto)` with Prisma '
                                                      'transaction: lookup invitation, check expiry/status, '
                                                      'create/link User, insert Membership, update invitation '
                                                      'status=ACCEPTED.',
                                                      '3. Add `POST /auth/invitations/accept` in `AuthController` with '
                                                      'rate limiting.',
                                                      '4. Write unit tests covering valid acceptance, expired tokens, '
                                                      'duplicate acceptance, and new vs existing user join.'],
                            'modify_scope': [ 'apps/api/src/auth/core/auth.controller.ts',
                                              'apps/api/src/auth/core/auth.service.ts',
                                              'apps/api/src/auth/dto/accept-invitation.dto.ts',
                                              'packages/shared/src/auth/'],
                            'objective_value': 'Implement invitation acceptance endpoint allowing invited teammates to '
                                               'join a business workspace securely via token.',
                            'read': [ 'docs/10_engineering/13_API_DESIGN.md',
                                      'docs/10_engineering/17_SECURITY_DESIGN.md'],
                            'security_invariants': [ '🔒 **Token Expiration**: Invitations expire after 7 days and '
                                                     'cannot be reused after acceptance.',
                                                     '🛡️ **Role Integrity**: User membership role is strictly assigned '
                                                     'from the invitation record (caller cannot choose role).',
                                                     '🚫 **Negative Invariants**: Never allow accepting revoked or '
                                                     'already-consumed invitation tokens.'],
                            'size': 'M',
                            'technical_contract': [ '`POST /auth/invitations/accept` (200 OK)',
                                                    'Request Body: `{ token: string, name?: string, password?: string '
                                                    '}`',
                                                    'Response: `{ user: UserSessionDto, business: BusinessSummaryDto, '
                                                    'token: string }`',
                                                    'Error Codes: 400 (Invalid token format), 404 (Token not '
                                                    'found/expired), 409 (Invitation already accepted)'],
                            'title': 'Accept invitation API (`POST /auth/invitations/accept`)',
                            'wave': 'W1',
                            'why': 'Store owners must be able to invite managers and staff into their workspace with '
                                   'predefined roles without manual database provisioning.'},
                  'letter': '',
                  'read': [ 'docs/10_engineering/13_API_DESIGN/02-auth-workspace-inbox.md',
                            'docs/10_engineering/17_SECURITY_DESIGN/01-auth-tenancy-rbac.md',
                            'docs/30_execution/32_FEATURE_SPECIFICATIONS.md'],
                  'title': 'Accept invitation API (`POST /auth/invitations/accept`)'}],
    'parent_done': 'Valid invitation token creates active membership and returns updated session JWT.',
    'size': 'M',
    'title': 'Accept invitation API (`POST /auth/invitations/accept`)',
    'wave': 'W1'},
  { 'depends': ['T-AUTH-01'],
    'fs': ['FS-AUTH-01'],
    'gold': { 'acceptance_test_scenarios': [ '[ ] **Normal Traffic**: 5 requests within 1 minute succeed normally.',
                                             '[ ] **Rate Limit Breach (429)**: 6th request returns 429 Too Many '
                                             'Requests.',
                                             '[ ] **Header Invariant**: Response includes `Retry-After` integer header '
                                             'indicating remaining seconds.'],
              'cmd': 'pnpm --filter api test -- src/auth',
              'depends': ['T-AUTH-01'],
              'dont_modify_scope': ['apps/web/', 'apps/api/src/platform/'],
              'expected_deliverables': 'Redis-backed auth rate limiter guard and unit tests in `apps/api/src/auth`.',
              'files': ['apps/api/src/auth/guards/auth-throttler.guard.ts', 'apps/api/src/auth/auth.module.ts'],
              'fs': ['FS-AUTH-01'],
              'human_contribution': [ '**🔑 Environment variables**: Ensure Redis connection URL is set in `.env` '
                                      '(`REDIS_URL`).',
                                      '**🧪 Manual QA & Smoke test**: Send 6 rapid curl requests to `/auth/login` and '
                                      'observe 429 response on 6th attempt.',
                                      '**👁️ Review & Sign-off**: Verify other non-auth endpoints are unaffected by the '
                                      '5/min limit.'],
              'id': 'T-AUTH-04',
              'implementation_steps': [ '1. Configure NestJS `ThrottlerModule` with Redis storage driver.',
                                        '2. Implement `AuthThrottlerGuard` with custom error envelope and '
                                        '`Retry-After` header.',
                                        '3. Apply guard to `/auth/login`, `/auth/register`, and `/auth/forgot` routes.',
                                        '4. Author unit/integration tests verifying 429 response on 6th request within '
                                        'window.'],
              'modify_scope': ['apps/api/src/auth/guards/auth-throttler.guard.ts', 'apps/api/src/auth/auth.module.ts'],
              'objective_value': 'Implement Redis-backed rate limiting on authentication routes (5 requests/min per '
                                 'IP) to prevent credential stuffing.',
              'read': ['docs/10_engineering/13_API_DESIGN.md', 'docs/10_engineering/17_SECURITY_DESIGN.md'],
              'security_invariants': [ '🔒 **Redis State**: Rate limit counters are stored in Redis with TTL to avoid '
                                       'memory leaks.',
                                       '🛡️ **Fail Safe**: If Redis is temporarily unreachable, fail open with warning '
                                       'log rather than dropping valid auth traffic.'],
              'size': 'S',
              'technical_contract': [ 'Rate Limit: 5 requests per 60 seconds per client IP on `/auth/login`, '
                                      '`/auth/register`, `/auth/forgot`.',
                                      'Breach Response: HTTP 429 Too Many Requests with `Retry-After: <seconds>` '
                                      "header and error envelope `{ error: { code: 'RATE_LIMIT_EXCEEDED' } }`."],
              'title': 'Auth rate limiting / throttles 5/min',
              'wave': 'W1',
              'why': 'Protect public authentication endpoints from automated brute-force attacks and credential '
                     'stuffing per NFR-SEC-09.'},
    'id': 'T-AUTH-04',
    'leaves': [ { 'cmd': 'pnpm --filter api test -- src/auth',
                  'do': [ '1. Configure NestJS `ThrottlerModule` with Redis storage driver.',
                          '2. Implement `AuthThrottlerGuard` with custom error envelope and `Retry-After` header.',
                          '3. Apply guard to `/auth/login`, `/auth/register`, and `/auth/forgot` routes.',
                          '4. Author unit/integration tests verifying 429 response on 6th request within window.'],
                  'done': '**Normal Traffic**: 5 requests within 1 minute succeed normally.',
                  'dont': [],
                  'files': ['apps/api/src/auth/guards/auth-throttler.guard.ts', 'apps/api/src/auth/auth.module.ts'],
                  'gold': { 'acceptance_test_scenarios': [ '[ ] **Normal Traffic**: 5 requests within 1 minute succeed '
                                                           'normally.',
                                                           '[ ] **Rate Limit Breach (429)**: 6th request returns 429 '
                                                           'Too Many Requests.',
                                                           '[ ] **Header Invariant**: Response includes `Retry-After` '
                                                           'integer header indicating remaining seconds.'],
                            'cmd': 'pnpm --filter api test -- src/auth',
                            'depends': ['T-AUTH-01'],
                            'dont_modify_scope': ['apps/web/', 'apps/api/src/platform/'],
                            'expected_deliverables': 'Redis-backed auth rate limiter guard and unit tests in '
                                                     '`apps/api/src/auth`.',
                            'files': [ 'apps/api/src/auth/guards/auth-throttler.guard.ts',
                                       'apps/api/src/auth/auth.module.ts'],
                            'fs': ['FS-AUTH-01'],
                            'human_contribution': [ '**🔑 Environment variables**: Ensure Redis connection URL is set '
                                                    'in `.env` (`REDIS_URL`).',
                                                    '**🧪 Manual QA & Smoke test**: Send 6 rapid curl requests to '
                                                    '`/auth/login` and observe 429 response on 6th attempt.',
                                                    '**👁️ Review & Sign-off**: Verify other non-auth endpoints are '
                                                    'unaffected by the 5/min limit.'],
                            'id': 'T-AUTH-04',
                            'implementation_steps': [ '1. Configure NestJS `ThrottlerModule` with Redis storage '
                                                      'driver.',
                                                      '2. Implement `AuthThrottlerGuard` with custom error envelope '
                                                      'and `Retry-After` header.',
                                                      '3. Apply guard to `/auth/login`, `/auth/register`, and '
                                                      '`/auth/forgot` routes.',
                                                      '4. Author unit/integration tests verifying 429 response on 6th '
                                                      'request within window.'],
                            'modify_scope': [ 'apps/api/src/auth/guards/auth-throttler.guard.ts',
                                              'apps/api/src/auth/auth.module.ts'],
                            'objective_value': 'Implement Redis-backed rate limiting on authentication routes (5 '
                                               'requests/min per IP) to prevent credential stuffing.',
                            'read': [ 'docs/10_engineering/13_API_DESIGN.md',
                                      'docs/10_engineering/17_SECURITY_DESIGN.md'],
                            'security_invariants': [ '🔒 **Redis State**: Rate limit counters are stored in Redis with '
                                                     'TTL to avoid memory leaks.',
                                                     '🛡️ **Fail Safe**: If Redis is temporarily unreachable, fail open '
                                                     'with warning log rather than dropping valid auth traffic.'],
                            'size': 'S',
                            'technical_contract': [ 'Rate Limit: 5 requests per 60 seconds per client IP on '
                                                    '`/auth/login`, `/auth/register`, `/auth/forgot`.',
                                                    'Breach Response: HTTP 429 Too Many Requests with `Retry-After: '
                                                    '<seconds>` header and error envelope `{ error: { code: '
                                                    "'RATE_LIMIT_EXCEEDED' } }`."],
                            'title': 'Auth rate limiting / throttles 5/min',
                            'wave': 'W1',
                            'why': 'Protect public authentication endpoints from automated brute-force attacks and '
                                   'credential stuffing per NFR-SEC-09.'},
                  'letter': '',
                  'read': [ 'docs/10_engineering/13_API_DESIGN/02-auth-workspace-inbox.md',
                            'docs/10_engineering/14_SYSTEM_DESIGN/02-locks-jobs-events-scoring.md',
                            'docs/30_execution/32_FEATURE_SPECIFICATIONS.md'],
                  'title': 'Auth rate limiting / throttles 5/min'}],
    'parent_done': '**Normal Traffic**: 5 requests within 1 minute succeed normally.',
    'size': 'S',
    'title': 'Auth rate limiting / throttles 5/min',
    'wave': 'W1'},
  { 'depends': ['T-AUTH-01'],
    'fs': ['FS-AUTH-01'],
    'gold': { 'acceptance_test_scenarios': [ '[ ] **Forgot (204)**: Returns 204 for both existing and non-existing '
                                             'email.',
                                             '[ ] **Reset (200)**: Valid reset token updates password and revokes '
                                             'previous sessions.'],
              'cmd': 'pnpm --filter api test -- src/auth',
              'depends': ['T-AUTH-01'],
              'dont_modify_scope': ['apps/web/'],
              'expected_deliverables': 'Password recovery endpoints in auth module.',
              'files': ['apps/api/src/auth/core/auth.controller.ts', 'apps/api/src/auth/core/auth.service.ts'],
              'fs': ['FS-AUTH-01'],
              'human_contribution': [ '**🔑 Environment variables**: Optional SMTP credentials in `.env`.',
                                      '**🧪 Manual QA**: Test forgot password flow in Swagger.',
                                      '**👁️ Review & Sign-off**: Verify zero email enumeration leakage.'],
              'id': 'T-AUTH-05',
              'implementation_steps': [ '1. Implement `POST /auth/forgot` generating 1-hour secure crypto token.',
                                        '2. Implement `POST /auth/reset` updating password hash and deleting active '
                                        'sessions.',
                                        '3. Author unit tests covering forgot 204 invariant and reset token '
                                        'validation.'],
              'modify_scope': ['apps/api/src/auth/'],
              'objective_value': 'Implement password recovery and reset flow with enumeration-safe endpoints.',
              'optional': True,
              'read': ['docs/10_engineering/13_API_DESIGN.md', 'docs/10_engineering/17_SECURITY_DESIGN.md'],
              'security_invariants': [ '🔒 **No Enumeration**: Never disclose whether an email is registered in '
                                       '`/auth/forgot` response.',
                                       '🛡️ **Session Invalidation**: Resetting password immediately revokes all active '
                                       'refresh tokens for the user.'],
              'size': 'M',
              'technical_contract': [ '`POST /auth/forgot` (204 No Content) -> Always returns 204 regardless of email '
                                      'presence.',
                                      '`POST /auth/reset` (200 OK) -> Body `{ token: string, newPassword: string }` '
                                      'updates Argon2id password hash.'],
              'title': 'Forgot / reset password flow (Should)',
              'wave': 'W1',
              'why': 'Allow users to recover account access securely without leaking registered user email addresses.'},
    'id': 'T-AUTH-05',
    'leaves': [ { 'cmd': 'pnpm --filter api test -- src/auth',
                  'do': [ '1. Implement `POST /auth/forgot` generating 1-hour secure crypto token.',
                          '2. Implement `POST /auth/reset` updating password hash and deleting active sessions.',
                          '3. Author unit tests covering forgot 204 invariant and reset token validation.'],
                  'done': '**Forgot (204)**: Returns 204 for both existing and non-existing email.',
                  'dont': [],
                  'files': ['apps/api/src/auth/core/auth.controller.ts', 'apps/api/src/auth/core/auth.service.ts'],
                  'gold': { 'acceptance_test_scenarios': [ '[ ] **Forgot (204)**: Returns 204 for both existing and '
                                                           'non-existing email.',
                                                           '[ ] **Reset (200)**: Valid reset token updates password '
                                                           'and revokes previous sessions.'],
                            'cmd': 'pnpm --filter api test -- src/auth',
                            'depends': ['T-AUTH-01'],
                            'dont_modify_scope': ['apps/web/'],
                            'expected_deliverables': 'Password recovery endpoints in auth module.',
                            'files': ['apps/api/src/auth/core/auth.controller.ts', 'apps/api/src/auth/core/auth.service.ts'],
                            'fs': ['FS-AUTH-01'],
                            'human_contribution': [ '**🔑 Environment variables**: Optional SMTP credentials in `.env`.',
                                                    '**🧪 Manual QA**: Test forgot password flow in Swagger.',
                                                    '**👁️ Review & Sign-off**: Verify zero email enumeration leakage.'],
                            'id': 'T-AUTH-05',
                            'implementation_steps': [ '1. Implement `POST /auth/forgot` generating 1-hour secure '
                                                      'crypto token.',
                                                      '2. Implement `POST /auth/reset` updating password hash and '
                                                      'deleting active sessions.',
                                                      '3. Author unit tests covering forgot 204 invariant and reset '
                                                      'token validation.'],
                            'modify_scope': ['apps/api/src/auth/'],
                            'objective_value': 'Implement password recovery and reset flow with enumeration-safe '
                                               'endpoints.',
                            'optional': True,
                            'read': [ 'docs/10_engineering/13_API_DESIGN.md',
                                      'docs/10_engineering/17_SECURITY_DESIGN.md'],
                            'security_invariants': [ '🔒 **No Enumeration**: Never disclose whether an email is '
                                                     'registered in `/auth/forgot` response.',
                                                     '🛡️ **Session Invalidation**: Resetting password immediately '
                                                     'revokes all active refresh tokens for the user.'],
                            'size': 'M',
                            'technical_contract': [ '`POST /auth/forgot` (204 No Content) -> Always returns 204 '
                                                    'regardless of email presence.',
                                                    '`POST /auth/reset` (200 OK) -> Body `{ token: string, '
                                                    'newPassword: string }` updates Argon2id password hash.'],
                            'title': 'Forgot / reset password flow (Should)',
                            'wave': 'W1',
                            'why': 'Allow users to recover account access securely without leaking registered user '
                                   'email addresses.'},
                  'letter': '',
                  'read': [ 'docs/10_engineering/13_API_DESIGN/02-auth-workspace-inbox.md',
                            'docs/10_engineering/17_SECURITY_DESIGN/01-auth-tenancy-rbac.md',
                            'docs/30_execution/32_FEATURE_SPECIFICATIONS.md'],
                  'title': 'Forgot / reset password flow (Should)'}],
    'optional': True,
    'parent_done': '**Forgot (204)**: Returns 204 for both existing and non-existing email.',
    'size': 'M',
    'title': 'Forgot / reset password flow (Should)',
    'wave': 'W1'},
  { 'depends': ['T-AUTH-01'],
    'fs': ['FS-AUTH-01'],
    'gold': { 'acceptance_test_scenarios': ['[ ] **OAuth Login**: Valid Google ID token logs in and returns session.'],
              'cmd': 'pnpm --filter api test -- src/auth',
              'depends': ['T-AUTH-01'],
              'dont_modify_scope': ['apps/web/'],
              'expected_deliverables': 'Google OAuth strategy and callback endpoint in auth module.',
              'files': [ 'apps/api/src/auth/core/auth.controller.ts',
                         'apps/api/src/auth/core/auth.service.ts',
                         'apps/api/src/auth/strategies/google.strategy.ts'],
              'fs': ['FS-AUTH-01'],
              'human_contribution': [ '**🔑 Environment variables**: Set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` '
                                      'in `.env`.',
                                      '**🌐 External setup**: Configure OAuth credentials in Google Cloud Console.',
                                      '**🧪 Manual QA**: Test Google sign-in redirect in browser.'],
              'id': 'T-AUTH-06',
              'implementation_steps': [ '1. Create Passport Google strategy in `google.strategy.ts`.',
                                        '2. Implement callback route linking or creating user account.',
                                        '3. Author unit tests covering token exchange and account linking.'],
              'modify_scope': ['apps/api/src/auth/'],
              'objective_value': 'Implement Google OAuth sign-in and account linking via verified email.',
              'optional': True,
              'read': ['docs/10_engineering/13_API_DESIGN.md', 'docs/10_engineering/17_SECURITY_DESIGN.md'],
              'security_invariants': [ '🔒 **Verified Email**: Auto-link accounts only when Google returns '
                                       '`email_verified: true`.'],
              'size': 'M',
              'technical_contract': [ '`GET /auth/google` (302 Redirect) -> Google OAuth authorization URL',
                                      '`POST /auth/google/callback` (200 OK) -> Session JWT and user profile'],
              'title': 'Google OAuth authentication (Should)',
              'wave': 'W1',
              'why': 'Provide seamless one-click sign in for merchants.'},
    'id': 'T-AUTH-06',
    'leaves': [ { 'cmd': 'pnpm --filter api test -- src/auth',
                  'do': [ '1. Create Passport Google strategy in `google.strategy.ts`.',
                          '2. Implement callback route linking or creating user account.',
                          '3. Author unit tests covering token exchange and account linking.'],
                  'done': '**OAuth Login**: Valid Google ID token logs in and returns session.',
                  'dont': [],
                  'files': [ 'apps/api/src/auth/core/auth.controller.ts',
                             'apps/api/src/auth/core/auth.service.ts',
                             'apps/api/src/auth/strategies/google.strategy.ts'],
                  'gold': { 'acceptance_test_scenarios': [ '[ ] **OAuth Login**: Valid Google ID token logs in and '
                                                           'returns session.'],
                            'cmd': 'pnpm --filter api test -- src/auth',
                            'depends': ['T-AUTH-01'],
                            'dont_modify_scope': ['apps/web/'],
                            'expected_deliverables': 'Google OAuth strategy and callback endpoint in auth module.',
                            'files': [ 'apps/api/src/auth/core/auth.controller.ts',
                                       'apps/api/src/auth/core/auth.service.ts',
                                       'apps/api/src/auth/strategies/google.strategy.ts'],
                            'fs': ['FS-AUTH-01'],
                            'human_contribution': [ '**🔑 Environment variables**: Set `GOOGLE_CLIENT_ID` and '
                                                    '`GOOGLE_CLIENT_SECRET` in `.env`.',
                                                    '**🌐 External setup**: Configure OAuth credentials in Google Cloud '
                                                    'Console.',
                                                    '**🧪 Manual QA**: Test Google sign-in redirect in browser.'],
                            'id': 'T-AUTH-06',
                            'implementation_steps': [ '1. Create Passport Google strategy in `google.strategy.ts`.',
                                                      '2. Implement callback route linking or creating user account.',
                                                      '3. Author unit tests covering token exchange and account '
                                                      'linking.'],
                            'modify_scope': ['apps/api/src/auth/'],
                            'objective_value': 'Implement Google OAuth sign-in and account linking via verified email.',
                            'optional': True,
                            'read': [ 'docs/10_engineering/13_API_DESIGN.md',
                                      'docs/10_engineering/17_SECURITY_DESIGN.md'],
                            'security_invariants': [ '🔒 **Verified Email**: Auto-link accounts only when Google '
                                                     'returns `email_verified: true`.'],
                            'size': 'M',
                            'technical_contract': [ '`GET /auth/google` (302 Redirect) -> Google OAuth authorization '
                                                    'URL',
                                                    '`POST /auth/google/callback` (200 OK) -> Session JWT and user '
                                                    'profile'],
                            'title': 'Google OAuth authentication (Should)',
                            'wave': 'W1',
                            'why': 'Provide seamless one-click sign in for merchants.'},
                  'letter': '',
                  'read': [ 'docs/10_engineering/13_API_DESIGN/02-auth-workspace-inbox.md',
                            'docs/10_engineering/17_SECURITY_DESIGN/01-auth-tenancy-rbac.md',
                            'docs/30_execution/32_FEATURE_SPECIFICATIONS.md'],
                  'title': 'Google OAuth authentication (Should)'}],
    'optional': True,
    'parent_done': '**OAuth Login**: Valid Google ID token logs in and returns session.',
    'size': 'M',
    'title': 'Google OAuth authentication (Should)',
    'wave': 'W1'},
  { 'depends': ['T-AUTH-02'],
    'fs': ['FS-BIZ-01'],
    'gold': { 'acceptance_test_scenarios': [ '[ ] **Happy Path (201)**: Creates business and seeds all 6 entities '
                                             'atomically.',
                                             '[ ] **Idempotency Key**: Repeated call with same idempotency key returns '
                                             'cached response without duplicate creation.',
                                             '[ ] **Owner Role**: Authenticated caller is granted OWNER role.',
                                             '[ ] **Transaction Rollback**: Any database error during seeding rolls '
                                             'back the entire business creation.'],
              'cmd': 'pnpm --filter api test -- src/businesses',
              'depends': ['T-AUTH-02'],
              'dont_modify_scope': ['apps/web/', 'apps/api/src/catalog/'],
              'expected_deliverables': 'Business provisioning controller, service, DTOs, and unit tests in '
                                       '`apps/api/src/businesses`.',
              'files': [ 'apps/api/src/businesses/workspace/businesses.controller.ts',
                         'apps/api/src/businesses/workspace/businesses.service.ts',
                         'apps/api/src/businesses/dto/create-business.dto.ts',
                         'apps/api/src/businesses/businesses.module.ts'],
              'fs': ['FS-BIZ-01'],
              'human_contribution': [ '**🔑 Environment variables**: None.',
                                      '**🧪 Manual QA & Smoke test**: Call `POST /businesses` via Swagger with '
                                      '`Idempotency-Key` header; open Prisma Studio (`pnpm --filter api exec prisma '
                                      'studio`) to visually inspect that all 6 entities were created.',
                                      '**👁️ Review & Sign-off**: Verify default `reply_mode` is set to '
                                      '`approval_required` (never auto-send on creation).'],
              'id': 'T-BIZ-01',
              'implementation_steps': [ '1. Create `CreateBusinessDto` in shared and api with name, currency (default '
                                        "'TND'), timezone (default 'Africa/Tunis').",
                                        '2. Implement `BusinessesService.createBusiness(userId, dto, idempotencyKey)` '
                                        'with Prisma transaction.',
                                        "3. Seed default AI Agent ('Sales Assistant'), AI Settings (`reply_mode = "
                                        "'approval_required'`), starter rules, and onboarding step 1.",
                                        '4. Add `POST /businesses` route in `BusinessesController` with JWT guard.',
                                        '5. Author unit/integration tests verifying atomic creation and idempotency '
                                        'duplicate prevention.'],
              'modify_scope': [ 'apps/api/src/businesses/workspace/businesses.controller.ts',
                                'apps/api/src/businesses/workspace/businesses.service.ts',
                                'apps/api/src/businesses/dto/create-business.dto.ts',
                                'apps/api/src/businesses/businesses.module.ts',
                                'packages/shared/src/businesses/'],
              'objective_value': 'Implement atomic business workspace provisioning creating tenant record, owner '
                                 'membership, default AI agent, AI settings, starter business rules, and onboarding '
                                 'tracker in a single database transaction.',
              'read': [ 'docs/10_engineering/13_API_DESIGN.md',
                        'docs/10_engineering/12_DATABASE_DESIGN.md',
                        'docs/30_execution/32_FEATURE_SPECIFICATIONS.md'],
              'security_invariants': [ '🔒 **Atomic Transaction**: All 6 entities (`businesses`, `memberships`, '
                                       '`ai_agents`, `ai_settings`, `business_rules`, `business_onboarding`) must be '
                                       'inserted in a single Prisma `$transaction`.',
                                       '🛡️ **Owner Assignment**: Caller is automatically assigned role `OWNER` with '
                                       'active status.',
                                       '🚫 **Negative Invariants**: Never allow creating orphaned businesses without an '
                                       'Owner membership.'],
              'size': 'L',
              'technical_contract': [ '`POST /businesses` (201 Created)',
                                      'Headers: `Idempotency-Key: <uuid>`',
                                      'Request Body: `{ name: string, currency?: string, timezone?: string, phone?: '
                                      'string }`',
                                      'Response: `{ business: BusinessDto, membership: MembershipDto, aiAgent: '
                                      'AiAgentDto, onboarding: OnboardingDto }`'],
              'title': 'Business workspace creation (`POST /businesses`) + seed agent, ai_settings, rules, onboarding',
              'wave': 'W1',
              'why': 'Every merchant needs a fully initialized store environment immediately upon registration with '
                     'pre-configured AI sales behavior.'},
    'id': 'T-BIZ-01',
    'leaves': [ { 'cmd': 'pnpm --filter api test -- src/businesses',
                  'do': [ "1. Create `CreateBusinessDto` in shared and api with name, currency (default 'TND'), "
                          "timezone (default 'Africa/Tunis').",
                          '2. Implement `BusinessesService.createBusiness(userId, dto, idempotencyKey)` with Prisma '
                          'transaction.',
                          "3. Seed default AI Agent ('Sales Assistant'), AI Settings (`reply_mode = "
                          "'approval_required'`), starter rules, and onboarding step 1.",
                          '4. Add `POST /businesses` route in `BusinessesController` with JWT guard.',
                          '5. Author unit/integration tests verifying atomic creation and idempotency duplicate '
                          'prevention.'],
                  'done': '**Happy Path (201)**: Creates business and seeds all 6 entities atomically.',
                  'dont': [ '🚫 **Negative Invariants**: Never allow creating orphaned businesses without an Owner '
                            'membership.'],
                  'files': [ 'apps/api/src/businesses/workspace/businesses.controller.ts',
                             'apps/api/src/businesses/workspace/businesses.service.ts',
                             'apps/api/src/businesses/dto/create-business.dto.ts',
                             'apps/api/src/businesses/businesses.module.ts'],
                  'gold': { 'acceptance_test_scenarios': [ '[ ] **Happy Path (201)**: Creates business and seeds all 6 '
                                                           'entities atomically.',
                                                           '[ ] **Idempotency Key**: Repeated call with same '
                                                           'idempotency key returns cached response without duplicate '
                                                           'creation.',
                                                           '[ ] **Owner Role**: Authenticated caller is granted OWNER '
                                                           'role.',
                                                           '[ ] **Transaction Rollback**: Any database error during '
                                                           'seeding rolls back the entire business creation.'],
                            'cmd': 'pnpm --filter api test -- src/businesses',
                            'depends': ['T-AUTH-02'],
                            'dont_modify_scope': ['apps/web/', 'apps/api/src/catalog/'],
                            'expected_deliverables': 'Business provisioning controller, service, DTOs, and unit tests '
                                                     'in `apps/api/src/businesses`.',
                            'files': [ 'apps/api/src/businesses/workspace/businesses.controller.ts',
                                       'apps/api/src/businesses/workspace/businesses.service.ts',
                                       'apps/api/src/businesses/dto/create-business.dto.ts',
                                       'apps/api/src/businesses/businesses.module.ts'],
                            'fs': ['FS-BIZ-01'],
                            'human_contribution': [ '**🔑 Environment variables**: None.',
                                                    '**🧪 Manual QA & Smoke test**: Call `POST /businesses` via Swagger '
                                                    'with `Idempotency-Key` header; open Prisma Studio (`pnpm --filter '
                                                    'api exec prisma studio`) to visually inspect that all 6 entities '
                                                    'were created.',
                                                    '**👁️ Review & Sign-off**: Verify default `reply_mode` is set to '
                                                    '`approval_required` (never auto-send on creation).'],
                            'id': 'T-BIZ-01',
                            'implementation_steps': [ '1. Create `CreateBusinessDto` in shared and api with name, '
                                                      "currency (default 'TND'), timezone (default 'Africa/Tunis').",
                                                      '2. Implement `BusinessesService.createBusiness(userId, dto, '
                                                      'idempotencyKey)` with Prisma transaction.',
                                                      "3. Seed default AI Agent ('Sales Assistant'), AI Settings "
                                                      "(`reply_mode = 'approval_required'`), starter rules, and "
                                                      'onboarding step 1.',
                                                      '4. Add `POST /businesses` route in `BusinessesController` with '
                                                      'JWT guard.',
                                                      '5. Author unit/integration tests verifying atomic creation and '
                                                      'idempotency duplicate prevention.'],
                            'modify_scope': [ 'apps/api/src/businesses/workspace/businesses.controller.ts',
                                              'apps/api/src/businesses/workspace/businesses.service.ts',
                                              'apps/api/src/businesses/dto/create-business.dto.ts',
                                              'apps/api/src/businesses/businesses.module.ts',
                                              'packages/shared/src/businesses/'],
                            'objective_value': 'Implement atomic business workspace provisioning creating tenant '
                                               'record, owner membership, default AI agent, AI settings, starter '
                                               'business rules, and onboarding tracker in a single database '
                                               'transaction.',
                            'read': [ 'docs/10_engineering/13_API_DESIGN.md',
                                      'docs/10_engineering/12_DATABASE_DESIGN.md',
                                      'docs/30_execution/32_FEATURE_SPECIFICATIONS.md'],
                            'security_invariants': [ '🔒 **Atomic Transaction**: All 6 entities (`businesses`, '
                                                     '`memberships`, `ai_agents`, `ai_settings`, `business_rules`, '
                                                     '`business_onboarding`) must be inserted in a single Prisma '
                                                     '`$transaction`.',
                                                     '🛡️ **Owner Assignment**: Caller is automatically assigned role '
                                                     '`OWNER` with active status.',
                                                     '🚫 **Negative Invariants**: Never allow creating orphaned '
                                                     'businesses without an Owner membership.'],
                            'size': 'L',
                            'technical_contract': [ '`POST /businesses` (201 Created)',
                                                    'Headers: `Idempotency-Key: <uuid>`',
                                                    'Request Body: `{ name: string, currency?: string, timezone?: '
                                                    'string, phone?: string }`',
                                                    'Response: `{ business: BusinessDto, membership: MembershipDto, '
                                                    'aiAgent: AiAgentDto, onboarding: OnboardingDto }`'],
                            'title': 'Business workspace creation (`POST /businesses`) + seed agent, ai_settings, '
                                     'rules, onboarding',
                            'wave': 'W1',
                            'why': 'Every merchant needs a fully initialized store environment immediately upon '
                                   'registration with pre-configured AI sales behavior.'},
                  'letter': '',
                  'read': [ 'docs/10_engineering/13_API_DESIGN/02-auth-workspace-inbox.md',
                            'docs/10_engineering/12_DATABASE_DESIGN/02-identity-catalog-inventory.md',
                            'docs/30_execution/32_FEATURE_SPECIFICATIONS.md'],
                  'title': 'Business workspace creation (`POST /businesses`) + seed agent, ai_settings, rules, '
                           'onboarding'}],
    'parent_done': '**Happy Path (201)**: Creates business and seeds all 6 entities atomically.',
    'size': 'L',
    'title': 'Business workspace creation (`POST /businesses`) + seed agent, ai_settings, rules, onboarding',
    'wave': 'W1'},
  { 'depends': ['T-BIZ-01'],
    'fs': ['FS-AI-04'],
    'gold': { 'acceptance_test_scenarios': [ '[ ] **Happy Path**: Owner/Manager updates agent personality and reply '
                                             'mode.',
                                             '[ ] **Invalid Model (400)**: Passing unrecognized model string returns '
                                             '400 Bad Request.',
                                             '[ ] **Employee Access (403)**: Employee role receives 403 Forbidden.'],
              'cmd': 'pnpm --filter api test -- src/ai',
              'depends': ['T-BIZ-01'],
              'dont_modify_scope': ['apps/web/', 'apps/api/src/conversations/'],
              'expected_deliverables': 'AI configuration controller, service, DTOs, and unit tests in '
                                       '`apps/api/src/ai`.',
              'files': [ 'apps/api/src/ai/config/ai-config.controller.ts',
                         'apps/api/src/ai/config/ai-config.service.ts',
                         'apps/api/src/ai/dto/update-ai-settings.dto.ts',
                         'apps/api/src/ai/dto/update-ai-agent.dto.ts'],
              'fs': ['FS-AI-04'],
              'human_contribution': [ '**🔑 Environment variables**: None.',
                                      "**🧪 Manual QA**: Test updating agent tone to 'Friendly Tunisian' via Swagger "
                                      'and verify immediate DB update.',
                                      '**👁️ Review & Sign-off**: Verify model ID list matches allowed pins in '
                                      '`11_TECH_STACK.md` §9.3.'],
              'id': 'T-AI-10',
              'implementation_steps': [ '1. Define `UpdateAiAgentDto` and `UpdateAiSettingsDto` with model ID '
                                        'validation enum.',
                                        '2. Implement `AiConfigService` and `AiConfigController` with tenant and '
                                        'permission guards.',
                                        '3. Author unit tests covering CRUD, permission checks, and invalid model '
                                        'rejection.'],
              'modify_scope': [ 'apps/api/src/ai/config/ai-config.controller.ts',
                                'apps/api/src/ai/config/ai-config.service.ts',
                                'apps/api/src/ai/dto/update-ai-settings.dto.ts',
                                'apps/api/src/ai/dto/update-ai-agent.dto.ts',
                                'packages/shared/src/ai/'],
              'objective_value': 'Implement AI agent personality and settings configuration endpoints with dynamic '
                                 'model ID validation.',
              'read': [ 'docs/10_engineering/13_API_DESIGN.md',
                        'docs/10_engineering/15_AI_ARCHITECTURE.md',
                        'docs/30_execution/32_FEATURE_SPECIFICATIONS.md'],
              'security_invariants': [ "🔒 **Tenancy Scope**: Agent and settings updates must match caller's "
                                       '`business_id`.',
                                       "🛡️ **RBAC Permission**: Requires `@RequirePermission('ai.configure')` "
                                       '(Owner/Manager only).',
                                       '🚫 **Negative Invariants**: Reject unpinned or arbitrary model ID strings with '
                                       '400 Bad Request.'],
              'size': 'L',
              'technical_contract': [ '`GET /ai/agents/:id` (200 OK) -> Retrieve agent configuration (name, '
                                      'personality, tone, model_id)',
                                      '`PATCH /ai/agents/:id` (200 OK) -> Update agent attributes (reject unknown '
                                      'model IDs with 400)',
                                      '`GET /ai/settings` (200 OK) -> Retrieve tenant AI settings (reply_mode, '
                                      'confidence_threshold)',
                                      '`PATCH /ai/settings` (200 OK) -> Update AI reply mode and thresholds'],
              'title': 'AI Agent configuration & settings CRUD (`/ai/agents/:id`, `/ai/settings`)',
              'wave': 'W1',
              'why': 'Merchants must customize agent tone, language, model selection, and reply mode '
                     '(approval-required vs auto-send) dynamically without server restarts.'},
    'id': 'T-AI-10',
    'leaves': [ { 'cmd': 'pnpm --filter api test -- src/ai',
                  'do': [ '1. Define `UpdateAiAgentDto` and `UpdateAiSettingsDto` with model ID validation enum.',
                          '2. Implement `AiConfigService` and `AiConfigController` with tenant and permission guards.',
                          '3. Author unit tests covering CRUD, permission checks, and invalid model rejection.'],
                  'done': 'Owner/Manager updates agent personality and reply mode.',
                  'dont': [ '🚫 **Negative Invariants**: Reject unpinned or arbitrary model ID strings with 400 Bad '
                            'Request.'],
                  'files': [ 'apps/api/src/ai/config/ai-config.controller.ts',
                             'apps/api/src/ai/config/ai-config.service.ts',
                             'apps/api/src/ai/dto/update-ai-settings.dto.ts',
                             'apps/api/src/ai/dto/update-ai-agent.dto.ts'],
                  'gold': { 'acceptance_test_scenarios': [ '[ ] **Happy Path**: Owner/Manager updates agent '
                                                           'personality and reply mode.',
                                                           '[ ] **Invalid Model (400)**: Passing unrecognized model '
                                                           'string returns 400 Bad Request.',
                                                           '[ ] **Employee Access (403)**: Employee role receives 403 '
                                                           'Forbidden.'],
                            'cmd': 'pnpm --filter api test -- src/ai',
                            'depends': ['T-BIZ-01'],
                            'dont_modify_scope': ['apps/web/', 'apps/api/src/conversations/'],
                            'expected_deliverables': 'AI configuration controller, service, DTOs, and unit tests in '
                                                     '`apps/api/src/ai`.',
                            'files': [ 'apps/api/src/ai/config/ai-config.controller.ts',
                                       'apps/api/src/ai/config/ai-config.service.ts',
                                       'apps/api/src/ai/dto/update-ai-settings.dto.ts',
                                       'apps/api/src/ai/dto/update-ai-agent.dto.ts'],
                            'fs': ['FS-AI-04'],
                            'human_contribution': [ '**🔑 Environment variables**: None.',
                                                    "**🧪 Manual QA**: Test updating agent tone to 'Friendly Tunisian' "
                                                    'via Swagger and verify immediate DB update.',
                                                    '**👁️ Review & Sign-off**: Verify model ID list matches allowed '
                                                    'pins in `11_TECH_STACK.md` §9.3.'],
                            'id': 'T-AI-10',
                            'implementation_steps': [ '1. Define `UpdateAiAgentDto` and `UpdateAiSettingsDto` with '
                                                      'model ID validation enum.',
                                                      '2. Implement `AiConfigService` and `AiConfigController` with '
                                                      'tenant and permission guards.',
                                                      '3. Author unit tests covering CRUD, permission checks, and '
                                                      'invalid model rejection.'],
                            'modify_scope': [ 'apps/api/src/ai/config/ai-config.controller.ts',
                                              'apps/api/src/ai/config/ai-config.service.ts',
                                              'apps/api/src/ai/dto/update-ai-settings.dto.ts',
                                              'apps/api/src/ai/dto/update-ai-agent.dto.ts',
                                              'packages/shared/src/ai/'],
                            'objective_value': 'Implement AI agent personality and settings configuration endpoints '
                                               'with dynamic model ID validation.',
                            'read': [ 'docs/10_engineering/13_API_DESIGN.md',
                                      'docs/10_engineering/15_AI_ARCHITECTURE.md',
                                      'docs/30_execution/32_FEATURE_SPECIFICATIONS.md'],
                            'security_invariants': [ '🔒 **Tenancy Scope**: Agent and settings updates must match '
                                                     "caller's `business_id`.",
                                                     '🛡️ **RBAC Permission**: Requires '
                                                     "`@RequirePermission('ai.configure')` (Owner/Manager only).",
                                                     '🚫 **Negative Invariants**: Reject unpinned or arbitrary model ID '
                                                     'strings with 400 Bad Request.'],
                            'size': 'L',
                            'technical_contract': [ '`GET /ai/agents/:id` (200 OK) -> Retrieve agent configuration '
                                                    '(name, personality, tone, model_id)',
                                                    '`PATCH /ai/agents/:id` (200 OK) -> Update agent attributes '
                                                    '(reject unknown model IDs with 400)',
                                                    '`GET /ai/settings` (200 OK) -> Retrieve tenant AI settings '
                                                    '(reply_mode, confidence_threshold)',
                                                    '`PATCH /ai/settings` (200 OK) -> Update AI reply mode and '
                                                    'thresholds'],
                            'title': 'AI Agent configuration & settings CRUD (`/ai/agents/:id`, `/ai/settings`)',
                            'wave': 'W1',
                            'why': 'Merchants must customize agent tone, language, model selection, and reply mode '
                                   '(approval-required vs auto-send) dynamically without server restarts.'},
                  'letter': '',
                  'read': [ 'docs/10_engineering/13_API_DESIGN/04-integrations-ai-admin-catalog.md',
                            'docs/10_engineering/12_DATABASE_DESIGN/04-orders-knowledge-ai-schema.md',
                            'docs/30_execution/32_FEATURE_SPECIFICATIONS.md'],
                  'title': 'AI Agent configuration & settings CRUD (`/ai/agents/:id`, `/ai/settings`)'}],
    'parent_done': 'Owner/Manager updates agent personality and reply mode.',
    'size': 'L',
    'title': 'AI Agent configuration & settings CRUD (`/ai/agents/:id`, `/ai/settings`)',
    'wave': 'W1'},
  { 'depends': ['T-BIZ-01'],
    'fs': ['FS-BIZ-01'],
    'gold': { 'acceptance_test_scenarios': [ '[ ] **Profile Update**: Authorized role updates name and timezone.',
                                             '[ ] **Cross-Tenant Block**: Accessing other business ID returns 403 '
                                             'Forbidden.'],
              'cmd': 'pnpm --filter api test -- src/businesses',
              'depends': ['T-BIZ-01'],
              'dont_modify_scope': ['apps/web/'],
              'expected_deliverables': 'Business profile endpoints and tests.',
              'files': [ 'apps/api/src/businesses/workspace/businesses.controller.ts',
                         'apps/api/src/businesses/workspace/businesses.service.ts',
                         'apps/api/src/businesses/dto/update-business.dto.ts'],
              'fs': ['FS-BIZ-01'],
              'human_contribution': [ '**🧪 Manual QA**: Call `PATCH /businesses/:id` via Swagger to update store phone '
                                      'number.'],
              'id': 'T-BIZ-02',
              'implementation_steps': [ '1. Implement profile GET and PATCH in `BusinessesController`.',
                                        '2. Author unit tests covering tenant isolation and field validation.'],
              'modify_scope': [ 'apps/api/src/businesses/workspace/businesses.controller.ts',
                                'apps/api/src/businesses/workspace/businesses.service.ts',
                                'apps/api/src/businesses/dto/update-business.dto.ts'],
              'objective_value': 'Implement business profile retrieval and modification endpoints for store metadata.',
              'read': ['docs/10_engineering/13_API_DESIGN.md', 'docs/10_engineering/12_DATABASE_DESIGN.md'],
              'security_invariants': [ '🔒 **Tenancy Scope**: Caller can only view/update their own workspace.',
                                       "🛡️ **RBAC Permission**: PATCH requires `@RequirePermission('business.write')` "
                                       '(Owner/Manager).',
                                       '🚫 **Negative Invariants**: Forbid modifying onboarding status flags on this '
                                       'endpoint.'],
              'size': 'S',
              'technical_contract': [ '`GET /businesses/:id` (200 OK) -> Business profile details',
                                      '`PATCH /businesses/:id` (200 OK) -> Body `{ name?: string, timezone?: string, '
                                      'currency?: string, phone?: string }`'],
              'title': 'Business profile management API (`GET/PATCH /businesses/:id`)',
              'wave': 'W1',
              'why': 'Allow store owners to view and update store name, contact details, timezone, and currency.'},
    'id': 'T-BIZ-02',
    'leaves': [ { 'cmd': 'pnpm --filter api test -- src/businesses',
                  'do': [ '1. Implement profile GET and PATCH in `BusinessesController`.',
                          '2. Author unit tests covering tenant isolation and field validation.'],
                  'done': '**Profile Update**: Authorized role updates name and timezone.',
                  'dont': ['🚫 **Negative Invariants**: Forbid modifying onboarding status flags on this endpoint.'],
                  'files': [ 'apps/api/src/businesses/workspace/businesses.controller.ts',
                             'apps/api/src/businesses/workspace/businesses.service.ts',
                             'apps/api/src/businesses/dto/update-business.dto.ts'],
                  'gold': { 'acceptance_test_scenarios': [ '[ ] **Profile Update**: Authorized role updates name and '
                                                           'timezone.',
                                                           '[ ] **Cross-Tenant Block**: Accessing other business ID '
                                                           'returns 403 Forbidden.'],
                            'cmd': 'pnpm --filter api test -- src/businesses',
                            'depends': ['T-BIZ-01'],
                            'dont_modify_scope': ['apps/web/'],
                            'expected_deliverables': 'Business profile endpoints and tests.',
                            'files': [ 'apps/api/src/businesses/workspace/businesses.controller.ts',
                                       'apps/api/src/businesses/workspace/businesses.service.ts',
                                       'apps/api/src/businesses/dto/update-business.dto.ts'],
                            'fs': ['FS-BIZ-01'],
                            'human_contribution': [ '**🧪 Manual QA**: Call `PATCH /businesses/:id` via Swagger to '
                                                    'update store phone number.'],
                            'id': 'T-BIZ-02',
                            'implementation_steps': [ '1. Implement profile GET and PATCH in `BusinessesController`.',
                                                      '2. Author unit tests covering tenant isolation and field '
                                                      'validation.'],
                            'modify_scope': [ 'apps/api/src/businesses/workspace/businesses.controller.ts',
                                              'apps/api/src/businesses/workspace/businesses.service.ts',
                                              'apps/api/src/businesses/dto/update-business.dto.ts'],
                            'objective_value': 'Implement business profile retrieval and modification endpoints for '
                                               'store metadata.',
                            'read': [ 'docs/10_engineering/13_API_DESIGN.md',
                                      'docs/10_engineering/12_DATABASE_DESIGN.md'],
                            'security_invariants': [ '🔒 **Tenancy Scope**: Caller can only view/update their own '
                                                     'workspace.',
                                                     '🛡️ **RBAC Permission**: PATCH requires '
                                                     "`@RequirePermission('business.write')` (Owner/Manager).",
                                                     '🚫 **Negative Invariants**: Forbid modifying onboarding status '
                                                     'flags on this endpoint.'],
                            'size': 'S',
                            'technical_contract': [ '`GET /businesses/:id` (200 OK) -> Business profile details',
                                                    '`PATCH /businesses/:id` (200 OK) -> Body `{ name?: string, '
                                                    'timezone?: string, currency?: string, phone?: string }`'],
                            'title': 'Business profile management API (`GET/PATCH /businesses/:id`)',
                            'wave': 'W1',
                            'why': 'Allow store owners to view and update store name, contact details, timezone, and '
                                   'currency.'},
                  'letter': '',
                  'read': [ 'docs/10_engineering/13_API_DESIGN/02-auth-workspace-inbox.md',
                            'docs/10_engineering/12_DATABASE_DESIGN/02-identity-catalog-inventory.md',
                            'docs/30_execution/32_FEATURE_SPECIFICATIONS.md'],
                  'title': 'Business profile management API (`GET/PATCH /businesses/:id`)'}],
    'parent_done': '**Profile Update**: Authorized role updates name and timezone.',
    'size': 'S',
    'title': 'Business profile management API (`GET/PATCH /businesses/:id`)',
    'wave': 'W1'},
  { 'depends': ['T-BIZ-01'],
    'fs': ['FS-BIZ-02'],
    'gold': { 'acceptance_test_scenarios': [ '[ ] **Team Invite**: Owner invites Manager; returns invitation token.',
                                             '[ ] **Forbid Owner Invite (400)**: Attempting to invite role `OWNER` '
                                             'returns 400 Bad Request.',
                                             '[ ] **Sole Owner Protection (409)**: Demoting or removing sole Owner '
                                             'returns 409 Conflict.',
                                             '[ ] **Quota Enforcement (403)**: Exceeding plan seat limit returns 403 '
                                             'quota_exceeded.'],
              'cmd': 'pnpm --filter api test -- src/businesses',
              'depends': ['T-BIZ-01'],
              'dont_modify_scope': ['apps/web/'],
              'expected_deliverables': 'Team management controller, service, DTOs, and unit tests.',
              'files': [ 'apps/api/src/businesses/members/members.controller.ts',
                         'apps/api/src/businesses/members/members.service.ts',
                         'apps/api/src/businesses/dto/invite-member.dto.ts',
                         'apps/api/src/businesses/dto/update-member-role.dto.ts'],
              'fs': ['FS-BIZ-02'],
              'human_contribution': [ '**🧪 Manual QA & Smoke test**: Invite a test employee via Swagger; attempt to '
                                      'invite an Owner role to verify 400 rejection.',
                                      '**👁️ Review & Sign-off**: Confirm workspace always maintains >= 1 active '
                                      'Owner.'],
              'id': 'T-BIZ-03',
              'implementation_steps': [ '1. Implement `MembersService` with seat count verification and owner count '
                                        'checks.',
                                        "2. Implement `MembersController` with `@RequirePermission('members.manage')` "
                                        '.',
                                        '3. Author unit tests covering seat quota breach, sole owner demote block, and '
                                        'invite creation.'],
              'modify_scope': [ 'apps/api/src/businesses/members/members.controller.ts',
                                'apps/api/src/businesses/members/members.service.ts',
                                'apps/api/src/businesses/dto/invite-member.dto.ts',
                                'apps/api/src/businesses/dto/update-member-role.dto.ts'],
              'objective_value': 'Implement team membership management, role updates, member removal, and tokenized '
                                 'invitations with subscription seat limit enforcement.',
              'read': [ 'docs/10_engineering/13_API_DESIGN.md',
                        'docs/10_engineering/12_DATABASE_DESIGN.md',
                        'docs/30_execution/32_FEATURE_SPECIFICATIONS.md'],
              'security_invariants': [ '🔒 **Sole Owner Protection**: Demoting or deleting the last active OWNER '
                                       'returns 409 Conflict.',
                                       '🛡️ **Invite Role Constraint**: Forbid inviting role `OWNER` (returns 400 Bad '
                                       'Request).',
                                       '📊 **Seat Limit**: Check subscription plan seat quota before creating new '
                                       'invite (returns 403 quota_exceeded if breached).'],
              'size': 'L',
              'technical_contract': [ '`GET /businesses/:id/members` (200 OK) -> List active team members and roles',
                                      '`POST /businesses/:id/invitations` (201 Created) -> `{ email: string, role: '
                                      "'MANAGER' | 'EMPLOYEE' }`",
                                      '`DELETE /businesses/:id/invitations/:inviteId` (204 No Content) -> Revoke '
                                      'pending invite',
                                      '`PATCH /businesses/:id/members/:userId/role` (200 OK) -> Update role',
                                      '`DELETE /businesses/:id/members/:userId` (204 No Content) -> Remove member'],
              'title': 'Members + invitations management (`/businesses/:id/members`, `/invitations`)',
              'wave': 'W1',
              'why': 'Allow merchants to collaborate with managers and sales reps while maintaining sole-owner safety '
                     'invariants and subscription tier seat quotas.'},
    'id': 'T-BIZ-03',
    'leaves': [ { 'cmd': 'pnpm --filter api test -- src/businesses',
                  'do': [ '1. Implement `MembersService` with seat count verification and owner count checks.',
                          "2. Implement `MembersController` with `@RequirePermission('members.manage')`.",
                          '3. Author unit tests covering seat quota breach, sole owner demote block, and invite '
                          'creation.'],
                  'done': '**Team Invite**: Owner invites Manager; returns invitation token.',
                  'dont': [],
                  'files': [ 'apps/api/src/businesses/members/members.controller.ts',
                             'apps/api/src/businesses/members/members.service.ts',
                             'apps/api/src/businesses/dto/invite-member.dto.ts',
                             'apps/api/src/businesses/dto/update-member-role.dto.ts'],
                  'gold': { 'acceptance_test_scenarios': [ '[ ] **Team Invite**: Owner invites Manager; returns '
                                                           'invitation token.',
                                                           '[ ] **Forbid Owner Invite (400)**: Attempting to invite '
                                                           'role `OWNER` returns 400 Bad Request.',
                                                           '[ ] **Sole Owner Protection (409)**: Demoting or removing '
                                                           'sole Owner returns 409 Conflict.',
                                                           '[ ] **Quota Enforcement (403)**: Exceeding plan seat limit '
                                                           'returns 403 quota_exceeded.'],
                            'cmd': 'pnpm --filter api test -- src/businesses',
                            'depends': ['T-BIZ-01'],
                            'dont_modify_scope': ['apps/web/'],
                            'expected_deliverables': 'Team management controller, service, DTOs, and unit tests.',
                            'files': [ 'apps/api/src/businesses/members/members.controller.ts',
                                       'apps/api/src/businesses/members/members.service.ts',
                                       'apps/api/src/businesses/dto/invite-member.dto.ts',
                                       'apps/api/src/businesses/dto/update-member-role.dto.ts'],
                            'fs': ['FS-BIZ-02'],
                            'human_contribution': [ '**🧪 Manual QA & Smoke test**: Invite a test employee via Swagger; '
                                                    'attempt to invite an Owner role to verify 400 rejection.',
                                                    '**👁️ Review & Sign-off**: Confirm workspace always maintains >= 1 '
                                                    'active Owner.'],
                            'id': 'T-BIZ-03',
                            'implementation_steps': [ '1. Implement `MembersService` with seat count verification and '
                                                      'owner count checks.',
                                                      '2. Implement `MembersController` with '
                                                      "`@RequirePermission('members.manage')`.",
                                                      '3. Author unit tests covering seat quota breach, sole owner '
                                                      'demote block, and invite creation.'],
                            'modify_scope': [ 'apps/api/src/businesses/members/members.controller.ts',
                                              'apps/api/src/businesses/members/members.service.ts',
                                              'apps/api/src/businesses/dto/invite-member.dto.ts',
                                              'apps/api/src/businesses/dto/update-member-role.dto.ts'],
                            'objective_value': 'Implement team membership management, role updates, member removal, '
                                               'and tokenized invitations with subscription seat limit enforcement.',
                            'read': [ 'docs/10_engineering/13_API_DESIGN.md',
                                      'docs/10_engineering/12_DATABASE_DESIGN.md',
                                      'docs/30_execution/32_FEATURE_SPECIFICATIONS.md'],
                            'security_invariants': [ '🔒 **Sole Owner Protection**: Demoting or deleting the last '
                                                     'active OWNER returns 409 Conflict.',
                                                     '🛡️ **Invite Role Constraint**: Forbid inviting role `OWNER` '
                                                     '(returns 400 Bad Request).',
                                                     '📊 **Seat Limit**: Check subscription plan seat quota before '
                                                     'creating new invite (returns 403 quota_exceeded if breached).'],
                            'size': 'L',
                            'technical_contract': [ '`GET /businesses/:id/members` (200 OK) -> List active team '
                                                    'members and roles',
                                                    '`POST /businesses/:id/invitations` (201 Created) -> `{ email: '
                                                    "string, role: 'MANAGER' | 'EMPLOYEE' }`",
                                                    '`DELETE /businesses/:id/invitations/:inviteId` (204 No Content) '
                                                    '-> Revoke pending invite',
                                                    '`PATCH /businesses/:id/members/:userId/role` (200 OK) -> Update '
                                                    'role',
                                                    '`DELETE /businesses/:id/members/:userId` (204 No Content) -> '
                                                    'Remove member'],
                            'title': 'Members + invitations management (`/businesses/:id/members`, `/invitations`)',
                            'wave': 'W1',
                            'why': 'Allow merchants to collaborate with managers and sales reps while maintaining '
                                   'sole-owner safety invariants and subscription tier seat quotas.'},
                  'letter': '',
                  'read': [ 'docs/10_engineering/13_API_DESIGN/02-auth-workspace-inbox.md',
                            'docs/10_engineering/17_SECURITY_DESIGN/01-auth-tenancy-rbac.md',
                            'docs/30_execution/32_FEATURE_SPECIFICATIONS.md'],
                  'title': 'Members + invitations management (`/businesses/:id/members`, `/invitations`)'}],
    'parent_done': '**Team Invite**: Owner invites Manager; returns invitation token.',
    'size': 'L',
    'title': 'Members + invitations management (`/businesses/:id/members`, `/invitations`)',
    'wave': 'W1'},
  { 'depends': ['T-BIZ-01'],
    'fs': ['FS-BIZ-03'],
    'gold': { 'acceptance_test_scenarios': [ '[ ] **Gate Calculation**: Correctly lists unmet gates when store is '
                                             'incomplete.',
                                             '[ ] **Acknowledgment**: Client can record handoff policy acknowledgment.',
                                             '[ ] **Anti-Tamper**: Client cannot artificially mark gates complete via '
                                             'PATCH.'],
              'cmd': 'pnpm --filter api test -- src/businesses',
              'depends': ['T-BIZ-01'],
              'dont_modify_scope': ['apps/web/'],
              'expected_deliverables': 'Onboarding state controller, service, and tests.',
              'files': [ 'apps/api/src/businesses/onboarding/onboarding.controller.ts',
                         'apps/api/src/businesses/onboarding/onboarding.service.ts',
                         'apps/api/src/businesses/dto/update-onboarding.dto.ts'],
              'fs': ['FS-BIZ-03'],
              'human_contribution': [ '**🧪 Manual QA**: Call `GET /businesses/:id/onboarding` via Swagger and verify '
                                      'unmetGates matches DB state.'],
              'id': 'T-BIZ-04',
              'implementation_steps': [ '1. Implement `OnboardingService.getOnboardingState(businessId)` querying '
                                        'channels, products, rules, and test sessions.',
                                        '2. Add `GET` and `PATCH` routes in `OnboardingController`.',
                                        '3. Author unit tests verifying accurate unmet gate reporting.'],
              'modify_scope': [ 'apps/api/src/businesses/onboarding/onboarding.controller.ts',
                                'apps/api/src/businesses/onboarding/onboarding.service.ts',
                                'apps/api/src/businesses/dto/update-onboarding.dto.ts'],
              'objective_value': 'Implement onboarding step tracking and dynamic computation of readiness gates G1–G5.',
              'read': [ 'docs/10_engineering/13_API_DESIGN.md',
                        'docs/10_engineering/12_DATABASE_DESIGN.md',
                        'docs/30_execution/32_FEATURE_SPECIFICATIONS.md'],
              'security_invariants': [ '🔒 **Computed Gates**: Gates G1 (channels), G2 (catalog), G3 (rules), G4 '
                                       '(playground), G5 (handoff policy) must be computed server-side, never trusted '
                                       'from client flags.',
                                       '🚫 **Negative Invariants**: Reject client attempts to PATCH `{ aiActivated: '
                                       'true }` directly.'],
              'size': 'M',
              'technical_contract': [ '`GET /businesses/:id/onboarding` (200 OK) -> `{ currentStep: number, '
                                      'completedSteps: string[], isReadyForLive: boolean, unmetGates: string[] }`',
                                      '`PATCH /businesses/:id/onboarding` (200 OK) -> Body `{ handoffAcknowledged?: '
                                      'boolean, currentStep?: number }`'],
              'title': 'Onboarding completion & state management (`/businesses/:id/onboarding`)',
              'wave': 'W1',
              'why': 'Guide merchants step-by-step through onboarding and verify all prerequisite setup tasks are '
                     'satisfied before live activation.'},
    'id': 'T-BIZ-04',
    'leaves': [ { 'cmd': 'pnpm --filter api test -- src/businesses',
                  'do': [ '1. Implement `OnboardingService.getOnboardingState(businessId)` querying channels, '
                          'products, rules, and test sessions.',
                          '2. Add `GET` and `PATCH` routes in `OnboardingController`.',
                          '3. Author unit tests verifying accurate unmet gate reporting.'],
                  'done': '**Gate Calculation**: Correctly lists unmet gates when store is incomplete.',
                  'dont': [ '🚫 **Negative Invariants**: Reject client attempts to PATCH `{ aiActivated: true }` '
                            'directly.'],
                  'files': [ 'apps/api/src/businesses/onboarding/onboarding.controller.ts',
                             'apps/api/src/businesses/onboarding/onboarding.service.ts',
                             'apps/api/src/businesses/dto/update-onboarding.dto.ts'],
                  'gold': { 'acceptance_test_scenarios': [ '[ ] **Gate Calculation**: Correctly lists unmet gates when '
                                                           'store is incomplete.',
                                                           '[ ] **Acknowledgment**: Client can record handoff policy '
                                                           'acknowledgment.',
                                                           '[ ] **Anti-Tamper**: Client cannot artificially mark gates '
                                                           'complete via PATCH.'],
                            'cmd': 'pnpm --filter api test -- src/businesses',
                            'depends': ['T-BIZ-01'],
                            'dont_modify_scope': ['apps/web/'],
                            'expected_deliverables': 'Onboarding state controller, service, and tests.',
                            'files': [ 'apps/api/src/businesses/onboarding/onboarding.controller.ts',
                                       'apps/api/src/businesses/onboarding/onboarding.service.ts',
                                       'apps/api/src/businesses/dto/update-onboarding.dto.ts'],
                            'fs': ['FS-BIZ-03'],
                            'human_contribution': [ '**🧪 Manual QA**: Call `GET /businesses/:id/onboarding` via '
                                                    'Swagger and verify unmetGates matches DB state.'],
                            'id': 'T-BIZ-04',
                            'implementation_steps': [ '1. Implement `OnboardingService.getOnboardingState(businessId)` '
                                                      'querying channels, products, rules, and test sessions.',
                                                      '2. Add `GET` and `PATCH` routes in `OnboardingController`.',
                                                      '3. Author unit tests verifying accurate unmet gate reporting.'],
                            'modify_scope': [ 'apps/api/src/businesses/onboarding/onboarding.controller.ts',
                                              'apps/api/src/businesses/onboarding/onboarding.service.ts',
                                              'apps/api/src/businesses/dto/update-onboarding.dto.ts'],
                            'objective_value': 'Implement onboarding step tracking and dynamic computation of '
                                               'readiness gates G1–G5.',
                            'read': [ 'docs/10_engineering/13_API_DESIGN.md',
                                      'docs/10_engineering/12_DATABASE_DESIGN.md',
                                      'docs/30_execution/32_FEATURE_SPECIFICATIONS.md'],
                            'security_invariants': [ '🔒 **Computed Gates**: Gates G1 (channels), G2 (catalog), G3 '
                                                     '(rules), G4 (playground), G5 (handoff policy) must be computed '
                                                     'server-side, never trusted from client flags.',
                                                     '🚫 **Negative Invariants**: Reject client attempts to PATCH `{ '
                                                     'aiActivated: true }` directly.'],
                            'size': 'M',
                            'technical_contract': [ '`GET /businesses/:id/onboarding` (200 OK) -> `{ currentStep: '
                                                    'number, completedSteps: string[], isReadyForLive: boolean, '
                                                    'unmetGates: string[] }`',
                                                    '`PATCH /businesses/:id/onboarding` (200 OK) -> Body `{ '
                                                    'handoffAcknowledged?: boolean, currentStep?: number }`'],
                            'title': 'Onboarding completion & state management (`/businesses/:id/onboarding`)',
                            'wave': 'W1',
                            'why': 'Guide merchants step-by-step through onboarding and verify all prerequisite setup '
                                   'tasks are satisfied before live activation.'},
                  'letter': '',
                  'read': [ 'docs/10_engineering/13_API_DESIGN/02-auth-workspace-inbox.md',
                            'docs/10_engineering/12_DATABASE_DESIGN/02-identity-catalog-inventory.md',
                            'docs/30_execution/32_FEATURE_SPECIFICATIONS.md'],
                  'title': 'Onboarding completion & state management (`/businesses/:id/onboarding`)'}],
    'parent_done': '**Gate Calculation**: Correctly lists unmet gates when store is incomplete.',
    'size': 'M',
    'title': 'Onboarding completion & state management (`/businesses/:id/onboarding`)',
    'wave': 'W1'},
  { 'depends': ['T-AUTH-02'],
    'fs': ['FS-FLAG-01'],
    'gold': { 'acceptance_test_scenarios': [ '[ ] **Toggle Flag**: Owner enables `whatsapp_enabled` flag.',
                                             '[ ] **Unknown Key (400)**: Passing unrecognized flag key returns 400 Bad '
                                             'Request.'],
              'cmd': 'pnpm --filter api test -- src/businesses',
              'depends': ['T-AUTH-02'],
              'dont_modify_scope': ['apps/web/'],
              'expected_deliverables': 'Feature flags controller and service.',
              'files': ['apps/api/src/businesses/flags/flags.controller.ts', 'apps/api/src/businesses/flags/flags.service.ts'],
              'fs': ['FS-FLAG-01'],
              'human_contribution': ['**🧪 Manual QA**: Toggle feature flag via Swagger.'],
              'id': 'T-BIZ-06',
              'implementation_steps': [ '1. Implement `FlagsService` and `FlagsController`.',
                                        '2. Author unit tests verifying flag updates and rejection of unknown keys.'],
              'modify_scope': [ 'apps/api/src/businesses/flags/flags.controller.ts',
                                'apps/api/src/businesses/flags/flags.service.ts'],
              'objective_value': 'Implement per-tenant feature flags management with strict closed key validation.',
              'read': ['docs/10_engineering/13_API_DESIGN.md', 'docs/10_engineering/12_DATABASE_DESIGN.md'],
              'security_invariants': [ '🔒 **Closed Enum**: Validate flag keys against approved `DomainFeatureFlag` '
                                       'enum (reject arbitrary strings with 400).',
                                       "🛡️ **RBAC Permission**: Requires `@RequirePermission('business.write')`."],
              'size': 'S',
              'technical_contract': [ '`GET /businesses/:id/flags` (200 OK) -> `{ flags: Record<string, boolean> }`',
                                      '`PATCH /businesses/:id/flags` (200 OK) -> Body `{ key: string, enabled: boolean '
                                      '}`'],
              'title': 'Feature flags API (`GET/PATCH /businesses/:id/flags`)',
              'wave': 'W1',
              'why': 'Allow safe, progressive rollout of advanced capabilities (e.g. WhatsApp beta, advanced '
                     'analytics) on a per-merchant basis.'},
    'id': 'T-BIZ-06',
    'leaves': [ { 'cmd': 'pnpm --filter api test -- src/businesses',
                  'do': [ '1. Implement `FlagsService` and `FlagsController`.',
                          '2. Author unit tests verifying flag updates and rejection of unknown keys.'],
                  'done': '**Toggle Flag**: Owner enables `whatsapp_enabled` flag.',
                  'dont': [],
                  'files': ['apps/api/src/businesses/flags/flags.controller.ts', 'apps/api/src/businesses/flags/flags.service.ts'],
                  'gold': { 'acceptance_test_scenarios': [ '[ ] **Toggle Flag**: Owner enables `whatsapp_enabled` '
                                                           'flag.',
                                                           '[ ] **Unknown Key (400)**: Passing unrecognized flag key '
                                                           'returns 400 Bad Request.'],
                            'cmd': 'pnpm --filter api test -- src/businesses',
                            'depends': ['T-AUTH-02'],
                            'dont_modify_scope': ['apps/web/'],
                            'expected_deliverables': 'Feature flags controller and service.',
                            'files': [ 'apps/api/src/businesses/flags/flags.controller.ts',
                                       'apps/api/src/businesses/flags/flags.service.ts'],
                            'fs': ['FS-FLAG-01'],
                            'human_contribution': ['**🧪 Manual QA**: Toggle feature flag via Swagger.'],
                            'id': 'T-BIZ-06',
                            'implementation_steps': [ '1. Implement `FlagsService` and `FlagsController`.',
                                                      '2. Author unit tests verifying flag updates and rejection of '
                                                      'unknown keys.'],
                            'modify_scope': [ 'apps/api/src/businesses/flags/flags.controller.ts',
                                              'apps/api/src/businesses/flags/flags.service.ts'],
                            'objective_value': 'Implement per-tenant feature flags management with strict closed key '
                                               'validation.',
                            'read': [ 'docs/10_engineering/13_API_DESIGN.md',
                                      'docs/10_engineering/12_DATABASE_DESIGN.md'],
                            'security_invariants': [ '🔒 **Closed Enum**: Validate flag keys against approved '
                                                     '`DomainFeatureFlag` enum (reject arbitrary strings with 400).',
                                                     '🛡️ **RBAC Permission**: Requires '
                                                     "`@RequirePermission('business.write')`."],
                            'size': 'S',
                            'technical_contract': [ '`GET /businesses/:id/flags` (200 OK) -> `{ flags: Record<string, '
                                                    'boolean> }`',
                                                    '`PATCH /businesses/:id/flags` (200 OK) -> Body `{ key: string, '
                                                    'enabled: boolean }`'],
                            'title': 'Feature flags API (`GET/PATCH /businesses/:id/flags`)',
                            'wave': 'W1',
                            'why': 'Allow safe, progressive rollout of advanced capabilities (e.g. WhatsApp beta, '
                                   'advanced analytics) on a per-merchant basis.'},
                  'letter': '',
                  'read': [ 'docs/10_engineering/13_API_DESIGN/05-realtime-platform-governance.md',
                            'docs/10_engineering/12_DATABASE_DESIGN/05-billing-notifications-audit.md',
                            'docs/30_execution/32_FEATURE_SPECIFICATIONS.md'],
                  'title': 'Feature flags API (`GET/PATCH /businesses/:id/flags`)'}],
    'parent_done': '**Toggle Flag**: Owner enables `whatsapp_enabled` flag.',
    'size': 'S',
    'title': 'Feature flags API (`GET/PATCH /businesses/:id/flags`)',
    'wave': 'W1'},
  { 'depends': ['T-AUTH-02'],
    'fs': ['FS-AUTH-01'],
    'gold': { 'acceptance_test_scenarios': [ '[ ] **Audit Record**: Sensitive action creates immutable log entry with '
                                             'actor IP.',
                                             '[ ] **Employee Access (403)**: Employee role receives 403 Forbidden.'],
              'cmd': 'pnpm --filter api test -- src/businesses',
              'depends': ['T-AUTH-02'],
              'dont_modify_scope': ['apps/web/'],
              'expected_deliverables': 'Audit logging service, controller, and tests.',
              'files': ['apps/api/src/businesses/audit/audit.controller.ts', 'apps/api/src/businesses/audit/audit.service.ts'],
              'fs': ['FS-AUTH-01'],
              'human_contribution': [ '**🧪 Manual QA**: Trigger team role update and verify audit log entry in '
                                      'Swagger.',
                                      '**👁️ Review & Sign-off**: Verify audit log table has no update/delete methods.'],
              'id': 'T-BIZ-07',
              'implementation_steps': [ '1. Implement `AuditService.record(event)` with async execution.',
                                        '2. Implement `AuditController` with cursor pagination and date filtering.',
                                        '3. Author unit tests covering log creation, pagination, and employee 403 '
                                        'block.'],
              'modify_scope': [ 'apps/api/src/businesses/audit/audit.controller.ts',
                                'apps/api/src/businesses/audit/audit.service.ts'],
              'objective_value': 'Implement immutable tenant audit logging service for recording human, security, and '
                                 'financial actions.',
              'read': [ 'docs/10_engineering/13_API_DESIGN.md',
                        'docs/10_engineering/12_DATABASE_DESIGN.md',
                        'docs/10_engineering/17_SECURITY_DESIGN.md'],
              'security_invariants': [ '🔒 **Immutability**: Audit logs are append-only; no UPDATE or DELETE queries '
                                       'are permitted.',
                                       '🛡️ **Separation of Concerns**: AI autonomous actions must never be written to '
                                       '`audit_logs` (they belong in `ai_actions`).',
                                       "🛡️ **RBAC Permission**: GET requires `@RequirePermission('business.write')` "
                                       '(Owner/Manager).'],
              'size': 'M',
              'technical_contract': [ '`GET /businesses/:id/audit-logs` (200 OK) -> Paginated audit event records with '
                                      'filters (`actorId`, `action`, `dateRange`)',
                                      '`AuditService.record(event)`: Internal method recording immutable audit row '
                                      'asynchronously.'],
              'title': 'Audit logging service & events repository (`/businesses/:id/audit-logs`)',
              'wave': 'W1',
              'why': 'Ensure compliance and security traceability for sensitive merchant actions (role updates, '
                     'invites, order cancellations) per BAC-9.'},
    'id': 'T-BIZ-07',
    'leaves': [ { 'cmd': 'pnpm --filter api test -- src/businesses',
                  'do': [ '1. Implement `AuditService.record(event)` with async execution.',
                          '2. Implement `AuditController` with cursor pagination and date filtering.',
                          '3. Author unit tests covering log creation, pagination, and employee 403 block.'],
                  'done': '**Audit Record**: Sensitive action creates immutable log entry with actor IP.',
                  'dont': [],
                  'files': ['apps/api/src/businesses/audit/audit.controller.ts', 'apps/api/src/businesses/audit/audit.service.ts'],
                  'gold': { 'acceptance_test_scenarios': [ '[ ] **Audit Record**: Sensitive action creates immutable '
                                                           'log entry with actor IP.',
                                                           '[ ] **Employee Access (403)**: Employee role receives 403 '
                                                           'Forbidden.'],
                            'cmd': 'pnpm --filter api test -- src/businesses',
                            'depends': ['T-AUTH-02'],
                            'dont_modify_scope': ['apps/web/'],
                            'expected_deliverables': 'Audit logging service, controller, and tests.',
                            'files': [ 'apps/api/src/businesses/audit/audit.controller.ts',
                                       'apps/api/src/businesses/audit/audit.service.ts'],
                            'fs': ['FS-AUTH-01'],
                            'human_contribution': [ '**🧪 Manual QA**: Trigger team role update and verify audit log '
                                                    'entry in Swagger.',
                                                    '**👁️ Review & Sign-off**: Verify audit log table has no '
                                                    'update/delete methods.'],
                            'id': 'T-BIZ-07',
                            'implementation_steps': [ '1. Implement `AuditService.record(event)` with async execution.',
                                                      '2. Implement `AuditController` with cursor pagination and date '
                                                      'filtering.',
                                                      '3. Author unit tests covering log creation, pagination, and '
                                                      'employee 403 block.'],
                            'modify_scope': [ 'apps/api/src/businesses/audit/audit.controller.ts',
                                              'apps/api/src/businesses/audit/audit.service.ts'],
                            'objective_value': 'Implement immutable tenant audit logging service for recording human, '
                                               'security, and financial actions.',
                            'read': [ 'docs/10_engineering/13_API_DESIGN.md',
                                      'docs/10_engineering/12_DATABASE_DESIGN.md',
                                      'docs/10_engineering/17_SECURITY_DESIGN.md'],
                            'security_invariants': [ '🔒 **Immutability**: Audit logs are append-only; no UPDATE or '
                                                     'DELETE queries are permitted.',
                                                     '🛡️ **Separation of Concerns**: AI autonomous actions must never '
                                                     'be written to `audit_logs` (they belong in `ai_actions`).',
                                                     '🛡️ **RBAC Permission**: GET requires '
                                                     "`@RequirePermission('business.write')` (Owner/Manager)."],
                            'size': 'M',
                            'technical_contract': [ '`GET /businesses/:id/audit-logs` (200 OK) -> Paginated audit '
                                                    'event records with filters (`actorId`, `action`, `dateRange`)',
                                                    '`AuditService.record(event)`: Internal method recording immutable '
                                                    'audit row asynchronously.'],
                            'title': 'Audit logging service & events repository (`/businesses/:id/audit-logs`)',
                            'wave': 'W1',
                            'why': 'Ensure compliance and security traceability for sensitive merchant actions (role '
                                   'updates, invites, order cancellations) per BAC-9.'},
                  'letter': '',
                  'read': [ 'docs/10_engineering/17_SECURITY_DESIGN/02-secrets-encryption-pii-audit.md',
                            'docs/10_engineering/12_DATABASE_DESIGN/05-billing-notifications-audit.md',
                            'docs/30_execution/32_FEATURE_SPECIFICATIONS.md'],
                  'title': 'Audit logging service & events repository (`/businesses/:id/audit-logs`)'}],
    'parent_done': '**Audit Record**: Sensitive action creates immutable log entry with actor IP.',
    'size': 'M',
    'title': 'Audit logging service & events repository (`/businesses/:id/audit-logs`)',
    'wave': 'W1'},
  { 'depends': ['T-BIZ-01'],
    'fs': ['FS-BIZ-01'],
    'gold': { 'acceptance_test_scenarios': [ '[ ] **Soft Delete**: Deactivated business returns 404 on subsequent '
                                             'requests.'],
              'cmd': 'pnpm --filter api test -- src/businesses',
              'depends': ['T-BIZ-01'],
              'dont_modify_scope': ['apps/web/'],
              'expected_deliverables': 'Soft delete endpoint in businesses module.',
              'files': [ 'apps/api/src/businesses/workspace/businesses.controller.ts',
                         'apps/api/src/businesses/workspace/businesses.service.ts'],
              'fs': ['FS-BIZ-01'],
              'human_contribution': ['**🧪 Manual QA**: Test soft deletion endpoint in Swagger.'],
              'id': 'T-BIZ-08',
              'implementation_steps': [ '1. Implement soft delete method setting `deleted_at` and disabling channels.',
                                        '2. Author unit tests verifying password check and deactivation.'],
              'modify_scope': ['apps/api/src/businesses/'],
              'objective_value': 'Implement business workspace soft-deletion and immediate channel/AI deactivation.',
              'optional': True,
              'read': ['docs/10_engineering/13_API_DESIGN.md', 'docs/10_engineering/12_DATABASE_DESIGN.md'],
              'security_invariants': ['🔒 **Owner Only**: Strict Owner password confirmation required.'],
              'size': 'M',
              'technical_contract': [ '`DELETE /businesses/:id` (200 OK) -> Body `{ confirmationPassword: string }` '
                                      'sets `deleted_at = NOW()` and halts webhooks/AI.'],
              'title': 'Soft-delete business workspace (Should)',
              'wave': 'W1',
              'why': 'Allow store owners to close their accounts safely without data corruption.'},
    'id': 'T-BIZ-08',
    'leaves': [ { 'cmd': 'pnpm --filter api test -- src/businesses',
                  'do': [ '1. Implement soft delete method setting `deleted_at` and disabling channels.',
                          '2. Author unit tests verifying password check and deactivation.'],
                  'done': '**Soft Delete**: Deactivated business returns 404 on subsequent requests.',
                  'dont': [],
                  'files': [ 'apps/api/src/businesses/workspace/businesses.controller.ts',
                             'apps/api/src/businesses/workspace/businesses.service.ts'],
                  'gold': { 'acceptance_test_scenarios': [ '[ ] **Soft Delete**: Deactivated business returns 404 on '
                                                           'subsequent requests.'],
                            'cmd': 'pnpm --filter api test -- src/businesses',
                            'depends': ['T-BIZ-01'],
                            'dont_modify_scope': ['apps/web/'],
                            'expected_deliverables': 'Soft delete endpoint in businesses module.',
                            'files': [ 'apps/api/src/businesses/workspace/businesses.controller.ts',
                                       'apps/api/src/businesses/workspace/businesses.service.ts'],
                            'fs': ['FS-BIZ-01'],
                            'human_contribution': ['**🧪 Manual QA**: Test soft deletion endpoint in Swagger.'],
                            'id': 'T-BIZ-08',
                            'implementation_steps': [ '1. Implement soft delete method setting `deleted_at` and '
                                                      'disabling channels.',
                                                      '2. Author unit tests verifying password check and '
                                                      'deactivation.'],
                            'modify_scope': ['apps/api/src/businesses/'],
                            'objective_value': 'Implement business workspace soft-deletion and immediate channel/AI '
                                               'deactivation.',
                            'optional': True,
                            'read': [ 'docs/10_engineering/13_API_DESIGN.md',
                                      'docs/10_engineering/12_DATABASE_DESIGN.md'],
                            'security_invariants': ['🔒 **Owner Only**: Strict Owner password confirmation required.'],
                            'size': 'M',
                            'technical_contract': [ '`DELETE /businesses/:id` (200 OK) -> Body `{ '
                                                    'confirmationPassword: string }` sets `deleted_at = NOW()` and '
                                                    'halts webhooks/AI.'],
                            'title': 'Soft-delete business workspace (Should)',
                            'wave': 'W1',
                            'why': 'Allow store owners to close their accounts safely without data corruption.'},
                  'letter': '',
                  'read': [ 'docs/10_engineering/13_API_DESIGN/02-auth-workspace-inbox.md',
                            'docs/10_engineering/12_DATABASE_DESIGN/01-rules-enums-er.md',
                            'docs/30_execution/32_FEATURE_SPECIFICATIONS.md'],
                  'title': 'Soft-delete business workspace (Should)'}],
    'optional': True,
    'parent_done': '**Soft Delete**: Deactivated business returns 404 on subsequent requests.',
    'size': 'M',
    'title': 'Soft-delete business workspace (Should)',
    'wave': 'W1'},
  { 'depends': ['T-BIZ-01'],
    'fs': ['FS-CAT-01'],
    'gold': { 'acceptance_test_scenarios': [ '[ ] **Create & List**: Parent and child categories create and return '
                                             'hierarchical tree.',
                                             '[ ] **Unique Slug**: Duplicate category name within same tenant '
                                             'generates unique slug or 409.',
                                             '[ ] **Employee (403)**: Employee role receives 403 Forbidden on '
                                             'create/update/delete.'],
              'cmd': 'pnpm --filter api test -- src/catalog',
              'depends': ['T-BIZ-01'],
              'dont_modify_scope': ['apps/web/', 'apps/api/src/orders/'],
              'expected_deliverables': 'Categories controller, service, DTOs, and unit tests in '
                                       '`apps/api/src/catalog`.',
              'files': [ 'apps/api/src/catalog/categories/categories.controller.ts',
                         'apps/api/src/catalog/categories/categories.service.ts',
                         'apps/api/src/catalog/dto/create-category.dto.ts',
                         'apps/api/src/catalog/dto/update-category.dto.ts'],
              'fs': ['FS-CAT-01'],
              'human_contribution': [ "**🧪 Manual QA & Smoke test**: Create parent category ('Vêtements') and child "
                                      "category ('Robes') in Swagger at `http://localhost:3001/api/docs`.",
                                      '**👁️ Review & Sign-off**: Verify category query filters by `business_id`.'],
              'id': 'T-CAT-01',
              'implementation_steps': [ '1. Define DTOs with Zod validation in `packages/shared` and `apps/api`.',
                                        '2. Implement `CategoriesService` with tree builder and slug uniqueness per '
                                        'tenant.',
                                        '3. Implement `CategoriesController` with tenant and permissions guards.',
                                        '4. Author unit tests covering category CRUD, hierarchy, and tenant '
                                        'isolation.'],
              'modify_scope': ['apps/api/src/catalog/categories.*', 'apps/api/src/catalog/dto/*category*'],
              'objective_value': 'Implement category hierarchy management API with slug generation and tree retrieval.',
              'read': [ 'docs/10_engineering/13_API_DESIGN.md',
                        'docs/10_engineering/12_DATABASE_DESIGN.md',
                        'docs/30_execution/32_FEATURE_SPECIFICATIONS.md'],
              'security_invariants': [ '🔒 **Tenancy Isolation**: Every category is strictly scoped to `business_id`.',
                                       "🛡️ **RBAC Permission**: Writes require `@RequirePermission('catalog.write')`.",
                                       '🚫 **Negative Invariants**: Forbid cyclic parent-child category relationships.'],
              'size': 'M',
              'technical_contract': [ '`GET /categories` (200 OK) -> Nested category tree or flat list with parent IDs',
                                      '`POST /categories` (201 Created) -> Body `{ name: string, parentId?: string, '
                                      'description?: string }`',
                                      '`PATCH /categories/:id` (200 OK) -> Update category name/parent',
                                      '`DELETE /categories/:id` (204 No Content) -> Delete category (checks for child '
                                      'products)'],
              'title': 'Categories CRUD API (`/categories`)',
              'wave': 'W2',
              'why': 'Organize merchant products into structured categories for catalog navigation and AI context '
                     'filtering.'},
    'id': 'T-CAT-01',
    'leaves': [ { 'cmd': 'pnpm --filter api test -- src/catalog',
                  'do': [ '1. Define DTOs with Zod validation in `packages/shared` and `apps/api`.',
                          '2. Implement `CategoriesService` with tree builder and slug uniqueness per tenant.',
                          '3. Implement `CategoriesController` with tenant and permissions guards.',
                          '4. Author unit tests covering category CRUD, hierarchy, and tenant isolation.'],
                  'done': '**Create & List**: Parent and child categories create and return hierarchical tree.',
                  'dont': ['🚫 **Negative Invariants**: Forbid cyclic parent-child category relationships.'],
                  'files': [ 'apps/api/src/catalog/categories/categories.controller.ts',
                             'apps/api/src/catalog/categories/categories.service.ts',
                             'apps/api/src/catalog/dto/create-category.dto.ts',
                             'apps/api/src/catalog/dto/update-category.dto.ts'],
                  'gold': { 'acceptance_test_scenarios': [ '[ ] **Create & List**: Parent and child categories create '
                                                           'and return hierarchical tree.',
                                                           '[ ] **Unique Slug**: Duplicate category name within same '
                                                           'tenant generates unique slug or 409.',
                                                           '[ ] **Employee (403)**: Employee role receives 403 '
                                                           'Forbidden on create/update/delete.'],
                            'cmd': 'pnpm --filter api test -- src/catalog',
                            'depends': ['T-BIZ-01'],
                            'dont_modify_scope': ['apps/web/', 'apps/api/src/orders/'],
                            'expected_deliverables': 'Categories controller, service, DTOs, and unit tests in '
                                                     '`apps/api/src/catalog`.',
                            'files': [ 'apps/api/src/catalog/categories/categories.controller.ts',
                                       'apps/api/src/catalog/categories/categories.service.ts',
                                       'apps/api/src/catalog/dto/create-category.dto.ts',
                                       'apps/api/src/catalog/dto/update-category.dto.ts'],
                            'fs': ['FS-CAT-01'],
                            'human_contribution': [ '**🧪 Manual QA & Smoke test**: Create parent category '
                                                    "('Vêtements') and child category ('Robes') in Swagger at "
                                                    '`http://localhost:3001/api/docs`.',
                                                    '**👁️ Review & Sign-off**: Verify category query filters by '
                                                    '`business_id`.'],
                            'id': 'T-CAT-01',
                            'implementation_steps': [ '1. Define DTOs with Zod validation in `packages/shared` and '
                                                      '`apps/api`.',
                                                      '2. Implement `CategoriesService` with tree builder and slug '
                                                      'uniqueness per tenant.',
                                                      '3. Implement `CategoriesController` with tenant and permissions '
                                                      'guards.',
                                                      '4. Author unit tests covering category CRUD, hierarchy, and '
                                                      'tenant isolation.'],
                            'modify_scope': [ 'apps/api/src/catalog/categories.*',
                                              'apps/api/src/catalog/dto/*category*'],
                            'objective_value': 'Implement category hierarchy management API with slug generation and '
                                               'tree retrieval.',
                            'read': [ 'docs/10_engineering/13_API_DESIGN.md',
                                      'docs/10_engineering/12_DATABASE_DESIGN.md',
                                      'docs/30_execution/32_FEATURE_SPECIFICATIONS.md'],
                            'security_invariants': [ '🔒 **Tenancy Isolation**: Every category is strictly scoped to '
                                                     '`business_id`.',
                                                     '🛡️ **RBAC Permission**: Writes require '
                                                     "`@RequirePermission('catalog.write')`.",
                                                     '🚫 **Negative Invariants**: Forbid cyclic parent-child category '
                                                     'relationships.'],
                            'size': 'M',
                            'technical_contract': [ '`GET /categories` (200 OK) -> Nested category tree or flat list '
                                                    'with parent IDs',
                                                    '`POST /categories` (201 Created) -> Body `{ name: string, '
                                                    'parentId?: string, description?: string }`',
                                                    '`PATCH /categories/:id` (200 OK) -> Update category name/parent',
                                                    '`DELETE /categories/:id` (204 No Content) -> Delete category '
                                                    '(checks for child products)'],
                            'title': 'Categories CRUD API (`/categories`)',
                            'wave': 'W2',
                            'why': 'Organize merchant products into structured categories for catalog navigation and '
                                   'AI context filtering.'},
                  'letter': '',
                  'read': [ 'docs/10_engineering/13_API_DESIGN/04-integrations-ai-admin-catalog.md',
                            'docs/10_engineering/12_DATABASE_DESIGN/02-identity-catalog-inventory.md',
                            'docs/30_execution/32_FEATURE_SPECIFICATIONS.md'],
                  'title': 'Categories CRUD API (`/categories`)'}],
    'parent_done': '**Create & List**: Parent and child categories create and return hierarchical tree.',
    'size': 'M',
    'title': 'Categories CRUD API (`/categories`)',
    'wave': 'W2'},
  { 'depends': ['T-CAT-01'],
    'fs': ['FS-CAT-01'],
    'gold': { 'acceptance_test_scenarios': [ '[ ] **Happy Path**: Product with 2 variants and images creates '
                                             'successfully.',
                                             '[ ] **Dynamic Available Stock**: Active reservations deduct from '
                                             '`availableStock` in real time.',
                                             '[ ] **Archival Safety**: Product with historical orders is archived on '
                                             'delete instead of hard-deleted.',
                                             "[ ] **Tenancy (403)**: Accessing another tenant's product returns 403 "
                                             'Forbidden.',
                                             '[ ] **Employee (403)**: Employee role receives 403 Forbidden on write '
                                             'operations.'],
              'cmd': 'pnpm --filter api test -- src/catalog',
              'depends': ['T-CAT-01'],
              'dont_modify_scope': ['apps/web/', 'apps/api/src/orders/', 'apps/api/src/conversations/'],
              'expected_deliverables': 'Complete, tested Catalog domain module in `apps/api/src/catalog` with >90% '
                                       'test coverage.',
              'files': [ 'apps/api/src/catalog/products/products.controller.ts',
                         'apps/api/src/catalog/products/products.service.ts',
                         'apps/api/src/catalog/products/variants.service.ts',
                         'apps/api/src/catalog/products/images.service.ts',
                         'apps/api/src/catalog/dto/create-product.dto.ts',
                         'apps/api/src/catalog/dto/update-product.dto.ts',
                         'apps/api/src/catalog/dto/create-variant.dto.ts',
                         'apps/api/src/catalog/catalog.module.ts'],
              'fs': ['FS-CAT-01'],
              'human_contribution': [ '**🔑 Environment variables**: Ensure MinIO / S3 credentials (`S3_ENDPOINT`, '
                                      '`S3_BUCKET`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`) are set in `.env`.',
                                      '**🌐 External setup**: Verify local MinIO bucket `catalog-images` is accessible.',
                                      '**🧪 Manual QA & Smoke test**: Create a product with 2 variants in Swagger at '
                                      '`http://localhost:3001/api/docs`; open Prisma Studio (`pnpm --filter api exec '
                                      'prisma studio`) to verify DB records.',
                                      '**👁️ Review & Sign-off**: Confirm price/stock exist strictly on variant records '
                                      'and `availableStock` is never client-writable.'],
              'id': 'T-CAT-02',
              'implementation_steps': [ '1. Author Zod schemas and DTOs for products, variants, and image metadata in '
                                        'shared.',
                                        '2. Implement `ProductsService` and `VariantsService` with atomic '
                                        'transactions.',
                                        '3. Implement dynamic `availableStock` calculator (`physical_stock - '
                                        'active_reservations`).',
                                        '4. Implement `ImagesService` with S3 signed upload URL generation.',
                                        '5. Implement `ProductsController` with tenant and permissions guards.',
                                        '6. Author exhaustive unit and integration tests covering CRUD, stock math, '
                                        'and archival safety.'],
              'modify_scope': ['apps/api/src/catalog/', 'packages/shared/src/catalog/'],
              'objective_value': 'Implement full products and multi-attribute variants domain layer with variant-level '
                                 'pricing/stock, dynamic availableStock calculation, and S3 image attachments.',
              'read': [ 'docs/10_engineering/13_API_DESIGN.md',
                        'docs/10_engineering/12_DATABASE_DESIGN.md',
                        'docs/30_execution/32_FEATURE_SPECIFICATIONS.md'],
              'security_invariants': [ '🔒 **Tenancy Isolation**: Every database query must filter by `business_id`.',
                                       "🛡️ **RBAC Permission**: Writes require `@RequirePermission('catalog.write')`.",
                                       '🚫 **Negative Invariants**: Never store price or physical stock on parent '
                                       'product (variants only). Never allow direct client PATCH to `availableStock`.'],
              'size': 'XL',
              'technical_contract': [ '`POST /products` (201 Created) -> Body `{ title: string, description?: string, '
                                      'categoryId?: string, variants: CreateVariantDto[], images?: string[] }`',
                                      '`GET /products` (200 OK) -> Paginated product list with search, category, '
                                      'status filters',
                                      '`GET /products/:id` (200 OK) -> Product detail with all variants and calculated '
                                      'availableStock',
                                      '`PATCH /products/:id` (200 OK) -> Update title, description, status',
                                      "`DELETE /products/:id` (200 OK) -> Archive product (`status = 'ARCHIVED'`) if "
                                      'referenced in orders',
                                      '`POST /products/:id/variants` (201 Created) -> Add variant (sku, price, stock, '
                                      'options)'],
              'title': 'Products & variants domain layer (`/products`, `/variants`, S3 images, pricing/stock)',
              'wave': 'W2',
              'why': 'The AI Sales Agent and merchant web dashboard require an accurate product catalog to look up '
                     'prices, check real-time stock availability, and display product media in conversation threads.'},
    'id': 'T-CAT-02',
    'leaves': [ { 'cmd': 'pnpm --filter api test -- src/catalog',
                  'do': [ '1. Author Zod schemas and DTOs for products, variants, and image metadata in shared.',
                          '2. Implement `ProductsService` and `VariantsService` with atomic transactions.',
                          '3. Implement dynamic `availableStock` calculator (`physical_stock - active_reservations`).',
                          '4. Implement `ImagesService` with S3 signed upload URL generation.',
                          '5. Implement `ProductsController` with tenant and permissions guards.',
                          '6. Author exhaustive unit and integration tests covering CRUD, stock math, and archival '
                          'safety.'],
                  'done': 'Product with 2 variants and images creates successfully.',
                  'dont': [ '🚫 **Negative Invariants**: Never store price or physical stock on parent product '
                            '(variants only). Never allow direct client PATCH to `availableStock`.'],
                  'files': [ 'apps/api/src/catalog/products/products.controller.ts',
                             'apps/api/src/catalog/products/products.service.ts',
                             'apps/api/src/catalog/products/variants.service.ts',
                             'apps/api/src/catalog/products/images.service.ts',
                             'apps/api/src/catalog/dto/create-product.dto.ts',
                             'apps/api/src/catalog/dto/update-product.dto.ts',
                             'apps/api/src/catalog/dto/create-variant.dto.ts',
                             'apps/api/src/catalog/catalog.module.ts'],
                  'gold': { 'acceptance_test_scenarios': [ '[ ] **Happy Path**: Product with 2 variants and images '
                                                           'creates successfully.',
                                                           '[ ] **Dynamic Available Stock**: Active reservations '
                                                           'deduct from `availableStock` in real time.',
                                                           '[ ] **Archival Safety**: Product with historical orders is '
                                                           'archived on delete instead of hard-deleted.',
                                                           "[ ] **Tenancy (403)**: Accessing another tenant's product "
                                                           'returns 403 Forbidden.',
                                                           '[ ] **Employee (403)**: Employee role receives 403 '
                                                           'Forbidden on write operations.'],
                            'cmd': 'pnpm --filter api test -- src/catalog',
                            'depends': ['T-CAT-01'],
                            'dont_modify_scope': ['apps/web/', 'apps/api/src/orders/', 'apps/api/src/conversations/'],
                            'expected_deliverables': 'Complete, tested Catalog domain module in `apps/api/src/catalog` '
                                                     'with >90% test coverage.',
                            'files': [ 'apps/api/src/catalog/products/products.controller.ts',
                                       'apps/api/src/catalog/products/products.service.ts',
                                       'apps/api/src/catalog/products/variants.service.ts',
                                       'apps/api/src/catalog/products/images.service.ts',
                                       'apps/api/src/catalog/dto/create-product.dto.ts',
                                       'apps/api/src/catalog/dto/update-product.dto.ts',
                                       'apps/api/src/catalog/dto/create-variant.dto.ts',
                                       'apps/api/src/catalog/catalog.module.ts'],
                            'fs': ['FS-CAT-01'],
                            'human_contribution': [ '**🔑 Environment variables**: Ensure MinIO / S3 credentials '
                                                    '(`S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`) '
                                                    'are set in `.env`.',
                                                    '**🌐 External setup**: Verify local MinIO bucket `catalog-images` '
                                                    'is accessible.',
                                                    '**🧪 Manual QA & Smoke test**: Create a product with 2 variants in '
                                                    'Swagger at `http://localhost:3001/api/docs`; open Prisma Studio '
                                                    '(`pnpm --filter api exec prisma studio`) to verify DB records.',
                                                    '**👁️ Review & Sign-off**: Confirm price/stock exist strictly on '
                                                    'variant records and `availableStock` is never client-writable.'],
                            'id': 'T-CAT-02',
                            'implementation_steps': [ '1. Author Zod schemas and DTOs for products, variants, and '
                                                      'image metadata in shared.',
                                                      '2. Implement `ProductsService` and `VariantsService` with '
                                                      'atomic transactions.',
                                                      '3. Implement dynamic `availableStock` calculator '
                                                      '(`physical_stock - active_reservations`).',
                                                      '4. Implement `ImagesService` with S3 signed upload URL '
                                                      'generation.',
                                                      '5. Implement `ProductsController` with tenant and permissions '
                                                      'guards.',
                                                      '6. Author exhaustive unit and integration tests covering CRUD, '
                                                      'stock math, and archival safety.'],
                            'modify_scope': ['apps/api/src/catalog/', 'packages/shared/src/catalog/'],
                            'objective_value': 'Implement full products and multi-attribute variants domain layer with '
                                               'variant-level pricing/stock, dynamic availableStock calculation, and '
                                               'S3 image attachments.',
                            'read': [ 'docs/10_engineering/13_API_DESIGN.md',
                                      'docs/10_engineering/12_DATABASE_DESIGN.md',
                                      'docs/30_execution/32_FEATURE_SPECIFICATIONS.md'],
                            'security_invariants': [ '🔒 **Tenancy Isolation**: Every database query must filter by '
                                                     '`business_id`.',
                                                     '🛡️ **RBAC Permission**: Writes require '
                                                     "`@RequirePermission('catalog.write')`.",
                                                     '🚫 **Negative Invariants**: Never store price or physical stock '
                                                     'on parent product (variants only). Never allow direct client '
                                                     'PATCH to `availableStock`.'],
                            'size': 'XL',
                            'technical_contract': [ '`POST /products` (201 Created) -> Body `{ title: string, '
                                                    'description?: string, categoryId?: string, variants: '
                                                    'CreateVariantDto[], images?: string[] }`',
                                                    '`GET /products` (200 OK) -> Paginated product list with search, '
                                                    'category, status filters',
                                                    '`GET /products/:id` (200 OK) -> Product detail with all variants '
                                                    'and calculated availableStock',
                                                    '`PATCH /products/:id` (200 OK) -> Update title, description, '
                                                    'status',
                                                    '`DELETE /products/:id` (200 OK) -> Archive product (`status = '
                                                    "'ARCHIVED'`) if referenced in orders",
                                                    '`POST /products/:id/variants` (201 Created) -> Add variant (sku, '
                                                    'price, stock, options)'],
                            'title': 'Products & variants domain layer (`/products`, `/variants`, S3 images, '
                                     'pricing/stock)',
                            'wave': 'W2',
                            'why': 'The AI Sales Agent and merchant web dashboard require an accurate product catalog '
                                   'to look up prices, check real-time stock availability, and display product media '
                                   'in conversation threads.'},
                  'letter': '',
                  'read': [ 'docs/10_engineering/13_API_DESIGN/04-integrations-ai-admin-catalog.md',
                            'docs/10_engineering/12_DATABASE_DESIGN/02-identity-catalog-inventory.md',
                            'docs/10_engineering/18_DEPLOYMENT/02-storage-env-ci-ops.md'],
                  'title': 'Products & variants domain layer (`/products`, `/variants`, S3 images, pricing/stock)'}],
    'parent_done': 'Product with 2 variants and images creates successfully.',
    'size': 'XL',
    'title': 'Products & variants domain layer (`/products`, `/variants`, S3 images, pricing/stock)',
    'wave': 'W2'},
  { 'depends': ['T-CAT-02'],
    'fs': ['FS-CAT-02'],
    'gold': { 'acceptance_test_scenarios': [ '[ ] **Template**: Returns valid CSV template headers.',
                                             '[ ] **Row Validation**: Invalid rows report exact error messages and '
                                             'line numbers.',
                                             '[ ] **Confirmed Import**: Confirmed import creates products, categories, '
                                             'and variants in DB.',
                                             '[ ] **Export**: Generates valid CSV matching full catalog.'],
              'cmd': 'pnpm --filter api test -- src/catalog',
              'depends': ['T-CAT-02'],
              'dont_modify_scope': ['apps/web/'],
              'expected_deliverables': 'CSV import/export controller, service, BullMQ processor, and tests in '
                                       '`apps/api/src/catalog`.',
              'files': [ 'apps/api/src/catalog/csv-import/csv-import.controller.ts',
                         'apps/api/src/catalog/csv-import/csv-import.service.ts',
                         'apps/api/src/catalog/csv-import/csv-import.processor.ts'],
              'fs': ['FS-CAT-02'],
              'human_contribution': [ '**🧪 Manual QA**: Download template from `GET /products/import/template`, add '
                                      'sample rows with 1 intentional error, upload and test preview.',
                                      '**👁️ Review & Sign-off**: Verify no catalog rows are created before calling '
                                      '`/confirm`.'],
              'id': 'T-CAT-03',
              'implementation_steps': [ '1. Implement CSV parser validating columns: title, category, sku, price, '
                                        'stock, options.',
                                        '2. Implement BullMQ `csv-import` processor validating rows and saving error '
                                        'report in `catalog_import_runs`.',
                                        '3. Implement confirm action executing SKU upserts in chunked transactions.',
                                        '4. Implement CSV streaming export endpoint.',
                                        '5. Author unit tests covering CSV parsing, error reporting, and commit '
                                        'transactions.'],
              'modify_scope': ['apps/api/src/catalog/csv-import.*', 'apps/api/src/catalog/dto/*import*'],
              'objective_value': 'Implement two-phase bulk CSV catalog import (validate -> preview -> confirm) and '
                                 'inventory CSV export pipeline via BullMQ worker.',
              'read': [ 'docs/10_engineering/13_API_DESIGN.md',
                        'docs/10_engineering/12_DATABASE_DESIGN.md',
                        'docs/30_execution/32_FEATURE_SPECIFICATIONS.md'],
              'security_invariants': [ '🔒 **Two-Phase Commit**: Never write records to catalog tables before explicit '
                                       'merchant confirmation.',
                                       "🛡️ **RBAC Permission**: Requires `@RequirePermission('catalog.write')`."],
              'size': 'L',
              'technical_contract': [ '`GET /products/import/template` (200 OK) -> Returns canonical CSV template '
                                      'header',
                                      '`POST /products/import` (202 Accepted) -> Uploads CSV, creates '
                                      '`catalog_import_runs` row, enqueues parse job',
                                      '`GET /products/import/:jobId` (200 OK) -> Poll status, row error summary, and '
                                      'parsed item preview',
                                      '`POST /products/import/:jobId/confirm` (202 Accepted) -> Commits valid items '
                                      '(SKU upsert in transaction)',
                                      '`GET /products/export` (200 OK) -> Streams CSV file of all active products and '
                                      'variants'],
              'title': 'Catalog CSV bulk import/export worker & API (`/products/import`, `/products/export`)',
              'wave': 'W2',
              'why': 'Allow merchants to bulk onboard hundreds of products and variants with detailed row-level error '
                     'validation before committing data.'},
    'id': 'T-CAT-03',
    'leaves': [ { 'cmd': 'pnpm --filter api test -- src/catalog',
                  'do': [ '1. Implement CSV parser validating columns: title, category, sku, price, stock, options.',
                          '2. Implement BullMQ `csv-import` processor validating rows and saving error report in '
                          '`catalog_import_runs`.',
                          '3. Implement confirm action executing SKU upserts in chunked transactions.',
                          '4. Implement CSV streaming export endpoint.',
                          '5. Author unit tests covering CSV parsing, error reporting, and commit transactions.'],
                  'done': '**Template**: Returns valid CSV template headers.',
                  'dont': [],
                  'files': [ 'apps/api/src/catalog/csv-import/csv-import.controller.ts',
                             'apps/api/src/catalog/csv-import/csv-import.service.ts',
                             'apps/api/src/catalog/csv-import/csv-import.processor.ts'],
                  'gold': { 'acceptance_test_scenarios': [ '[ ] **Template**: Returns valid CSV template headers.',
                                                           '[ ] **Row Validation**: Invalid rows report exact error '
                                                           'messages and line numbers.',
                                                           '[ ] **Confirmed Import**: Confirmed import creates '
                                                           'products, categories, and variants in DB.',
                                                           '[ ] **Export**: Generates valid CSV matching full '
                                                           'catalog.'],
                            'cmd': 'pnpm --filter api test -- src/catalog',
                            'depends': ['T-CAT-02'],
                            'dont_modify_scope': ['apps/web/'],
                            'expected_deliverables': 'CSV import/export controller, service, BullMQ processor, and '
                                                     'tests in `apps/api/src/catalog`.',
                            'files': [ 'apps/api/src/catalog/csv-import/csv-import.controller.ts',
                                       'apps/api/src/catalog/csv-import/csv-import.service.ts',
                                       'apps/api/src/catalog/csv-import/csv-import.processor.ts'],
                            'fs': ['FS-CAT-02'],
                            'human_contribution': [ '**🧪 Manual QA**: Download template from `GET '
                                                    '/products/import/template`, add sample rows with 1 intentional '
                                                    'error, upload and test preview.',
                                                    '**👁️ Review & Sign-off**: Verify no catalog rows are created '
                                                    'before calling `/confirm`.'],
                            'id': 'T-CAT-03',
                            'implementation_steps': [ '1. Implement CSV parser validating columns: title, category, '
                                                      'sku, price, stock, options.',
                                                      '2. Implement BullMQ `csv-import` processor validating rows and '
                                                      'saving error report in `catalog_import_runs`.',
                                                      '3. Implement confirm action executing SKU upserts in chunked '
                                                      'transactions.',
                                                      '4. Implement CSV streaming export endpoint.',
                                                      '5. Author unit tests covering CSV parsing, error reporting, and '
                                                      'commit transactions.'],
                            'modify_scope': ['apps/api/src/catalog/csv-import.*', 'apps/api/src/catalog/dto/*import*'],
                            'objective_value': 'Implement two-phase bulk CSV catalog import (validate -> preview -> '
                                               'confirm) and inventory CSV export pipeline via BullMQ worker.',
                            'read': [ 'docs/10_engineering/13_API_DESIGN.md',
                                      'docs/10_engineering/12_DATABASE_DESIGN.md',
                                      'docs/30_execution/32_FEATURE_SPECIFICATIONS.md'],
                            'security_invariants': [ '🔒 **Two-Phase Commit**: Never write records to catalog tables '
                                                     'before explicit merchant confirmation.',
                                                     '🛡️ **RBAC Permission**: Requires '
                                                     "`@RequirePermission('catalog.write')`."],
                            'size': 'L',
                            'technical_contract': [ '`GET /products/import/template` (200 OK) -> Returns canonical CSV '
                                                    'template header',
                                                    '`POST /products/import` (202 Accepted) -> Uploads CSV, creates '
                                                    '`catalog_import_runs` row, enqueues parse job',
                                                    '`GET /products/import/:jobId` (200 OK) -> Poll status, row error '
                                                    'summary, and parsed item preview',
                                                    '`POST /products/import/:jobId/confirm` (202 Accepted) -> Commits '
                                                    'valid items (SKU upsert in transaction)',
                                                    '`GET /products/export` (200 OK) -> Streams CSV file of all active '
                                                    'products and variants'],
                            'title': 'Catalog CSV bulk import/export worker & API (`/products/import`, '
                                     '`/products/export`)',
                            'wave': 'W2',
                            'why': 'Allow merchants to bulk onboard hundreds of products and variants with detailed '
                                   'row-level error validation before committing data.'},
                  'letter': '',
                  'read': [ 'docs/10_engineering/13_API_DESIGN/04-integrations-ai-admin-catalog.md',
                            'docs/10_engineering/14_SYSTEM_DESIGN/02-locks-jobs-events-scoring.md',
                            'docs/30_execution/32_FEATURE_SPECIFICATIONS.md'],
                  'title': 'Catalog CSV bulk import/export worker & API (`/products/import`, `/products/export`)'}],
    'parent_done': '**Template**: Returns valid CSV template headers.',
    'size': 'L',
    'title': 'Catalog CSV bulk import/export worker & API (`/products/import`, `/products/export`)',
    'wave': 'W2'},
  { 'depends': ['T-CAT-02'],
    'fs': ['FS-CAT-01'],
    'gold': { 'acceptance_test_scenarios': [ '[ ] **Job Enqueue**: Modifying product enqueues re-index job in BullMQ.',
                                             '[ ] **Debounce**: Rapid successive edits result in a single embedding '
                                             'refresh.'],
              'cmd': 'pnpm --filter api test -- src/catalog',
              'depends': ['T-CAT-02'],
              'dont_modify_scope': ['apps/web/'],
              'expected_deliverables': 'Catalog indexer service and background worker in `apps/api/src/catalog`.',
              'files': [ 'apps/api/src/catalog/indexer/catalog-indexer.service.ts',
                         'apps/api/src/catalog/indexer/catalog-indexer.processor.ts'],
              'fs': ['FS-CAT-01'],
              'human_contribution': [ '**🧪 Manual QA**: Edit product title in Swagger and verify job in Redis BullMQ '
                                      'queue.'],
              'id': 'T-CAT-04',
              'implementation_steps': [ '1. Implement `CatalogIndexerService` publishing event on product changes.',
                                        '2. Implement BullMQ processor with Redis debouncing window (5 seconds).',
                                        '3. Author unit tests verifying event emission and queue dispatch.'],
              'modify_scope': ['apps/api/src/catalog/catalog-indexer.*'],
              'objective_value': 'Implement background worker to enqueue and debounce vector re-embedding jobs '
                                 'whenever product titles, descriptions, options, or prices are modified.',
              'read': ['docs/10_engineering/13_API_DESIGN.md', 'docs/10_engineering/15_AI_ARCHITECTURE.md'],
              'security_invariants': [ '🔒 **Asynchronous Execution**: Never execute embedding API calls synchronously '
                                       'inside the HTTP handler.'],
              'size': 'M',
              'technical_contract': [ 'Event: `catalog.product.updated` published on product/variant mutations.',
                                      'Queue: BullMQ `sync-product-embedding` with Redis debouncing key.'],
              'title': 'Catalog re-indexing & search sync worker',
              'wave': 'W2',
              'why': 'Keep RAG vector database synchronized with latest catalog merchandising data without blocking '
                     'HTTP request threads.'},
    'id': 'T-CAT-04',
    'leaves': [ { 'cmd': 'pnpm --filter api test -- src/catalog',
                  'do': [ '1. Implement `CatalogIndexerService` publishing event on product changes.',
                          '2. Implement BullMQ processor with Redis debouncing window (5 seconds).',
                          '3. Author unit tests verifying event emission and queue dispatch.'],
                  'done': '**Job Enqueue**: Modifying product enqueues re-index job in BullMQ.',
                  'dont': [],
                  'files': [ 'apps/api/src/catalog/indexer/catalog-indexer.service.ts',
                             'apps/api/src/catalog/indexer/catalog-indexer.processor.ts'],
                  'gold': { 'acceptance_test_scenarios': [ '[ ] **Job Enqueue**: Modifying product enqueues re-index '
                                                           'job in BullMQ.',
                                                           '[ ] **Debounce**: Rapid successive edits result in a '
                                                           'single embedding refresh.'],
                            'cmd': 'pnpm --filter api test -- src/catalog',
                            'depends': ['T-CAT-02'],
                            'dont_modify_scope': ['apps/web/'],
                            'expected_deliverables': 'Catalog indexer service and background worker in '
                                                     '`apps/api/src/catalog`.',
                            'files': [ 'apps/api/src/catalog/indexer/catalog-indexer.service.ts',
                                       'apps/api/src/catalog/indexer/catalog-indexer.processor.ts'],
                            'fs': ['FS-CAT-01'],
                            'human_contribution': [ '**🧪 Manual QA**: Edit product title in Swagger and verify job in '
                                                    'Redis BullMQ queue.'],
                            'id': 'T-CAT-04',
                            'implementation_steps': [ '1. Implement `CatalogIndexerService` publishing event on '
                                                      'product changes.',
                                                      '2. Implement BullMQ processor with Redis debouncing window (5 '
                                                      'seconds).',
                                                      '3. Author unit tests verifying event emission and queue '
                                                      'dispatch.'],
                            'modify_scope': ['apps/api/src/catalog/catalog-indexer.*'],
                            'objective_value': 'Implement background worker to enqueue and debounce vector '
                                               're-embedding jobs whenever product titles, descriptions, options, or '
                                               'prices are modified.',
                            'read': [ 'docs/10_engineering/13_API_DESIGN.md',
                                      'docs/10_engineering/15_AI_ARCHITECTURE.md'],
                            'security_invariants': [ '🔒 **Asynchronous Execution**: Never execute embedding API calls '
                                                     'synchronously inside the HTTP handler.'],
                            'size': 'M',
                            'technical_contract': [ 'Event: `catalog.product.updated` published on product/variant '
                                                    'mutations.',
                                                    'Queue: BullMQ `sync-product-embedding` with Redis debouncing '
                                                    'key.'],
                            'title': 'Catalog re-indexing & search sync worker',
                            'wave': 'W2',
                            'why': 'Keep RAG vector database synchronized with latest catalog merchandising data '
                                   'without blocking HTTP request threads.'},
                  'letter': '',
                  'read': [ 'docs/10_engineering/14_SYSTEM_DESIGN/02-locks-jobs-events-scoring.md',
                            'docs/10_engineering/15_AI_ARCHITECTURE/02-rag-prompts-evaluation.md',
                            'docs/30_execution/32_FEATURE_SPECIFICATIONS.md'],
                  'title': 'Catalog re-indexing & search sync worker'}],
    'parent_done': '**Job Enqueue**: Modifying product enqueues re-index job in BullMQ.',
    'size': 'M',
    'title': 'Catalog re-indexing & search sync worker',
    'wave': 'W2'},
  { 'depends': ['T-BIZ-01'],
    'fs': ['FS-KNOW-01'],
    'gold': { 'acceptance_test_scenarios': [ '[ ] **Versioning**: Updating rule creates version 2 and sets '
                                             '`effective_to` on version 1.',
                                             '[ ] **Schema Validation (400)**: Invalid JSONB payload (e.g. negative '
                                             'shipping fee) returns 400 Bad Request.',
                                             '[ ] **Active Rules Fetch**: Service resolves active rules as of a given '
                                             'timestamp.'],
              'cmd': 'pnpm --filter api test -- src/knowledge',
              'depends': ['T-BIZ-01'],
              'dont_modify_scope': ['apps/web/'],
              'expected_deliverables': 'Business rules controller, service, Zod schemas, and unit tests in '
                                       '`apps/api/src/knowledge`.',
              'files': [ 'apps/api/src/knowledge/rules/business-rules.controller.ts',
                         'apps/api/src/knowledge/rules/business-rules.service.ts',
                         'apps/api/src/knowledge/dto/create-business-rule.dto.ts',
                         'apps/api/src/knowledge/knowledge.module.ts'],
              'fs': ['FS-KNOW-01'],
              'human_contribution': [ '**🧪 Manual QA**: Create a return policy rule (14 days) via Swagger; update '
                                      'return window to 7 days and verify version 2 row in DB.',
                                      '**👁️ Review & Sign-off**: Verify old rule rows are never modified in place.'],
              'id': 'T-KNOW-01',
              'implementation_steps': [ '1. Define Zod schemas for delivery zones, return policies, payment terms in '
                                        'shared.',
                                        '2. Implement `BusinessRulesService.createRuleVersion()` with version '
                                        'increments.',
                                        '3. Implement `BusinessRulesController` with tenant and permissions guards.',
                                        '4. Author unit tests covering rule creation, versioning, JSONB validation, '
                                        'and active rule resolution.'],
              'modify_scope': [ 'apps/api/src/knowledge/business-rules.*',
                                'apps/api/src/knowledge/dto/*rule*',
                                'packages/shared/src/knowledge/'],
              'objective_value': 'Implement immutable versioned business rules management (shipping fees, return '
                                 'window, cash on delivery terms, discounts) with strict Zod JSONB validation.',
              'read': [ 'docs/10_engineering/13_API_DESIGN.md',
                        'docs/10_engineering/12_DATABASE_DESIGN.md',
                        'docs/30_execution/32_FEATURE_SPECIFICATIONS.md'],
              'security_invariants': [ '🔒 **Immutable History**: Updating a rule content creates a new row with '
                                       'incremented version and marks previous version `effective_to = NOW()`.',
                                       '🛡️ **JSONB Validation**: Validate payload schemas against strict Zod '
                                       'definitions in `12_DATABASE_DESIGN.md` §14.8.',
                                       "🛡️ **RBAC Permission**: Requires `@RequirePermission('ai.configure')`."],
              'size': 'L',
              'technical_contract': [ '`GET /business-rules` (200 OK) -> List active rules grouped by type '
                                      '(`DELIVERY`, `PAYMENT`, `RETURN_POLICY`, `DISCOUNT`, `FAQ`)',
                                      '`POST /business-rules` (201 Created) -> Creates a new rule version (increments '
                                      '`version_number`, sets `effective_from = NOW()`)',
                                      '`PATCH /business-rules/:id` (200 OK) -> Modify `is_enabled` or `effective_to` '
                                      'only (never overwrite rule content in-place)'],
              'title': 'Business rules versioning & validation API (`/business-rules`)',
              'wave': 'W2',
              'why': 'The AI Sales Agent must follow merchant-defined commercial rules with immutable version history '
                     'for decision auditability.'},
    'id': 'T-KNOW-01',
    'leaves': [ { 'cmd': 'pnpm --filter api test -- src/knowledge',
                  'do': [ '1. Define Zod schemas for delivery zones, return policies, payment terms in shared.',
                          '2. Implement `BusinessRulesService.createRuleVersion()` with version increments.',
                          '3. Implement `BusinessRulesController` with tenant and permissions guards.',
                          '4. Author unit tests covering rule creation, versioning, JSONB validation, and active rule '
                          'resolution.'],
                  'done': '**Versioning**: Updating rule creates version 2 and sets `effective_to` on version 1.',
                  'dont': [],
                  'files': [ 'apps/api/src/knowledge/rules/business-rules.controller.ts',
                             'apps/api/src/knowledge/rules/business-rules.service.ts',
                             'apps/api/src/knowledge/dto/create-business-rule.dto.ts',
                             'apps/api/src/knowledge/knowledge.module.ts'],
                  'gold': { 'acceptance_test_scenarios': [ '[ ] **Versioning**: Updating rule creates version 2 and '
                                                           'sets `effective_to` on version 1.',
                                                           '[ ] **Schema Validation (400)**: Invalid JSONB payload '
                                                           '(e.g. negative shipping fee) returns 400 Bad Request.',
                                                           '[ ] **Active Rules Fetch**: Service resolves active rules '
                                                           'as of a given timestamp.'],
                            'cmd': 'pnpm --filter api test -- src/knowledge',
                            'depends': ['T-BIZ-01'],
                            'dont_modify_scope': ['apps/web/'],
                            'expected_deliverables': 'Business rules controller, service, Zod schemas, and unit tests '
                                                     'in `apps/api/src/knowledge`.',
                            'files': [ 'apps/api/src/knowledge/rules/business-rules.controller.ts',
                                       'apps/api/src/knowledge/rules/business-rules.service.ts',
                                       'apps/api/src/knowledge/dto/create-business-rule.dto.ts',
                                       'apps/api/src/knowledge/knowledge.module.ts'],
                            'fs': ['FS-KNOW-01'],
                            'human_contribution': [ '**🧪 Manual QA**: Create a return policy rule (14 days) via '
                                                    'Swagger; update return window to 7 days and verify version 2 row '
                                                    'in DB.',
                                                    '**👁️ Review & Sign-off**: Verify old rule rows are never modified '
                                                    'in place.'],
                            'id': 'T-KNOW-01',
                            'implementation_steps': [ '1. Define Zod schemas for delivery zones, return policies, '
                                                      'payment terms in shared.',
                                                      '2. Implement `BusinessRulesService.createRuleVersion()` with '
                                                      'version increments.',
                                                      '3. Implement `BusinessRulesController` with tenant and '
                                                      'permissions guards.',
                                                      '4. Author unit tests covering rule creation, versioning, JSONB '
                                                      'validation, and active rule resolution.'],
                            'modify_scope': [ 'apps/api/src/knowledge/business-rules.*',
                                              'apps/api/src/knowledge/dto/*rule*',
                                              'packages/shared/src/knowledge/'],
                            'objective_value': 'Implement immutable versioned business rules management (shipping '
                                               'fees, return window, cash on delivery terms, discounts) with strict '
                                               'Zod JSONB validation.',
                            'read': [ 'docs/10_engineering/13_API_DESIGN.md',
                                      'docs/10_engineering/12_DATABASE_DESIGN.md',
                                      'docs/30_execution/32_FEATURE_SPECIFICATIONS.md'],
                            'security_invariants': [ '🔒 **Immutable History**: Updating a rule content creates a new '
                                                     'row with incremented version and marks previous version '
                                                     '`effective_to = NOW()`.',
                                                     '🛡️ **JSONB Validation**: Validate payload schemas against strict '
                                                     'Zod definitions in `12_DATABASE_DESIGN.md` §14.8.',
                                                     '🛡️ **RBAC Permission**: Requires '
                                                     "`@RequirePermission('ai.configure')`."],
                            'size': 'L',
                            'technical_contract': [ '`GET /business-rules` (200 OK) -> List active rules grouped by '
                                                    'type (`DELIVERY`, `PAYMENT`, `RETURN_POLICY`, `DISCOUNT`, `FAQ`)',
                                                    '`POST /business-rules` (201 Created) -> Creates a new rule '
                                                    'version (increments `version_number`, sets `effective_from = '
                                                    'NOW()`)',
                                                    '`PATCH /business-rules/:id` (200 OK) -> Modify `is_enabled` or '
                                                    '`effective_to` only (never overwrite rule content in-place)'],
                            'title': 'Business rules versioning & validation API (`/business-rules`)',
                            'wave': 'W2',
                            'why': 'The AI Sales Agent must follow merchant-defined commercial rules with immutable '
                                   'version history for decision auditability.'},
                  'letter': '',
                  'read': [ 'docs/10_engineering/13_API_DESIGN/04-integrations-ai-admin-catalog.md',
                            'docs/10_engineering/12_DATABASE_DESIGN/04-orders-knowledge-ai-schema.md',
                            'docs/30_execution/32_FEATURE_SPECIFICATIONS.md'],
                  'title': 'Business rules versioning & validation API (`/business-rules`)'}],
    'parent_done': '**Versioning**: Updating rule creates version 2 and sets `effective_to` on version 1.',
    'size': 'L',
    'title': 'Business rules versioning & validation API (`/business-rules`)',
    'wave': 'W2'},
  { 'depends': ['T-BIZ-01'],
    'fs': ['FS-KNOW-02'],
    'gold': { 'acceptance_test_scenarios': [ "[ ] **Document Create**: Creates document with `status = 'PENDING'` and "
                                             'queues indexing.',
                                             '[ ] **Cascade Clean**: Deleting document deletes related vector '
                                             'embeddings.'],
              'cmd': 'pnpm --filter api test -- src/knowledge',
              'depends': ['T-BIZ-01'],
              'dont_modify_scope': ['apps/web/'],
              'expected_deliverables': 'Knowledge documents controller, service, and tests in '
                                       '`apps/api/src/knowledge`.',
              'files': [ 'apps/api/src/knowledge/documents/documents.controller.ts',
                         'apps/api/src/knowledge/documents/documents.service.ts',
                         'apps/api/src/knowledge/dto/create-document.dto.ts'],
              'fs': ['FS-KNOW-02'],
              'human_contribution': [ '**🧪 Manual QA**: Upload store FAQ text document in Swagger and verify status is '
                                      'PENDING.'],
              'id': 'T-KNOW-02',
              'implementation_steps': [ '1. Implement `DocumentsService` and `DocumentsController`.',
                                        '2. Trigger BullMQ job `index_knowledge_document` on document create/reindex.',
                                        '3. Author unit tests covering CRUD, cascade delete, and queue triggers.'],
              'modify_scope': ['apps/api/src/knowledge/documents.*', 'apps/api/src/knowledge/dto/*doc*'],
              'objective_value': 'Implement knowledge document storage and ingestion triggers for RAG semantic search.',
              'read': ['docs/10_engineering/13_API_DESIGN.md', 'docs/10_engineering/12_DATABASE_DESIGN.md'],
              'security_invariants': [ "🔒 **Tenancy Scope**: Documents and embeddings belong strictly to caller's "
                                       '`business_id`.',
                                       '🛡️ **Cascade Deletion**: Deleting a document removes its associated vector '
                                       'rows from `embeddings` table.'],
              'size': 'M',
              'technical_contract': [ '`GET /knowledge/documents` (200 OK) -> List store knowledge documents with '
                                      'indexing status',
                                      '`POST /knowledge/documents` (201 Created) -> `{ title: string, content: string, '
                                      'category?: string }` (sets `indexingStatus: pending`)',
                                      '`DELETE /knowledge/documents/:id` (204 No Content) -> Removes document and '
                                      'deletes associated embeddings',
                                      '`POST /knowledge/documents/:id/reindex` (202 Accepted) -> Triggers re-chunking '
                                      'and re-embedding'],
              'title': 'Knowledge documents management & indexing trigger (`/knowledge/documents`)',
              'wave': 'W2',
              'why': 'Allow merchants to upload FAQ documents, product manuals, and store policies for semantic AI '
                     'retrieval.'},
    'id': 'T-KNOW-02',
    'leaves': [ { 'cmd': 'pnpm --filter api test -- src/knowledge',
                  'do': [ '1. Implement `DocumentsService` and `DocumentsController`.',
                          '2. Trigger BullMQ job `index_knowledge_document` on document create/reindex.',
                          '3. Author unit tests covering CRUD, cascade delete, and queue triggers.'],
                  'done': "**Document Create**: Creates document with `status = 'PENDING'` and queues indexing.",
                  'dont': [],
                  'files': [ 'apps/api/src/knowledge/documents/documents.controller.ts',
                             'apps/api/src/knowledge/documents/documents.service.ts',
                             'apps/api/src/knowledge/dto/create-document.dto.ts'],
                  'gold': { 'acceptance_test_scenarios': [ '[ ] **Document Create**: Creates document with `status = '
                                                           "'PENDING'` and queues indexing.",
                                                           '[ ] **Cascade Clean**: Deleting document deletes related '
                                                           'vector embeddings.'],
                            'cmd': 'pnpm --filter api test -- src/knowledge',
                            'depends': ['T-BIZ-01'],
                            'dont_modify_scope': ['apps/web/'],
                            'expected_deliverables': 'Knowledge documents controller, service, and tests in '
                                                     '`apps/api/src/knowledge`.',
                            'files': [ 'apps/api/src/knowledge/documents/documents.controller.ts',
                                       'apps/api/src/knowledge/documents/documents.service.ts',
                                       'apps/api/src/knowledge/dto/create-document.dto.ts'],
                            'fs': ['FS-KNOW-02'],
                            'human_contribution': [ '**🧪 Manual QA**: Upload store FAQ text document in Swagger and '
                                                    'verify status is PENDING.'],
                            'id': 'T-KNOW-02',
                            'implementation_steps': [ '1. Implement `DocumentsService` and `DocumentsController`.',
                                                      '2. Trigger BullMQ job `index_knowledge_document` on document '
                                                      'create/reindex.',
                                                      '3. Author unit tests covering CRUD, cascade delete, and queue '
                                                      'triggers.'],
                            'modify_scope': ['apps/api/src/knowledge/documents.*', 'apps/api/src/knowledge/dto/*doc*'],
                            'objective_value': 'Implement knowledge document storage and ingestion triggers for RAG '
                                               'semantic search.',
                            'read': [ 'docs/10_engineering/13_API_DESIGN.md',
                                      'docs/10_engineering/12_DATABASE_DESIGN.md'],
                            'security_invariants': [ '🔒 **Tenancy Scope**: Documents and embeddings belong strictly to '
                                                     "caller's `business_id`.",
                                                     '🛡️ **Cascade Deletion**: Deleting a document removes its '
                                                     'associated vector rows from `embeddings` table.'],
                            'size': 'M',
                            'technical_contract': [ '`GET /knowledge/documents` (200 OK) -> List store knowledge '
                                                    'documents with indexing status',
                                                    '`POST /knowledge/documents` (201 Created) -> `{ title: string, '
                                                    'content: string, category?: string }` (sets `indexingStatus: '
                                                    'pending`)',
                                                    '`DELETE /knowledge/documents/:id` (204 No Content) -> Removes '
                                                    'document and deletes associated embeddings',
                                                    '`POST /knowledge/documents/:id/reindex` (202 Accepted) -> '
                                                    'Triggers re-chunking and re-embedding'],
                            'title': 'Knowledge documents management & indexing trigger (`/knowledge/documents`)',
                            'wave': 'W2',
                            'why': 'Allow merchants to upload FAQ documents, product manuals, and store policies for '
                                   'semantic AI retrieval.'},
                  'letter': '',
                  'read': [ 'docs/10_engineering/13_API_DESIGN/04-integrations-ai-admin-catalog.md',
                            'docs/10_engineering/12_DATABASE_DESIGN/04-orders-knowledge-ai-schema.md',
                            'docs/30_execution/32_FEATURE_SPECIFICATIONS.md'],
                  'title': 'Knowledge documents management & indexing trigger (`/knowledge/documents`)'}],
    'parent_done': "**Document Create**: Creates document with `status = 'PENDING'` and queues indexing.",
    'size': 'M',
    'title': 'Knowledge documents management & indexing trigger (`/knowledge/documents`)',
    'wave': 'W2'},
  { 'depends': ['T-KNOW-02', 'T-CAT-04'],
    'fs': ['FS-KNOW-02'],
    'gold': { 'acceptance_test_scenarios': [ '[ ] **Semantic Retrieval**: Query returns relevant policy/product chunks '
                                             'sorted by similarity.',
                                             '[ ] **Tenancy Isolation**: Vectors belonging to Tenant A are never '
                                             'returned to Tenant B.',
                                             '[ ] **Score Filtering**: Low-relevance chunks (<0.72) are excluded.'],
              'cmd': 'pnpm --filter api test -- src/knowledge',
              'depends': ['T-KNOW-02', 'T-CAT-04'],
              'dont_modify_scope': ['apps/web/'],
              'expected_deliverables': 'Embedding processor, vector search service, and tests in '
                                       '`apps/api/src/knowledge`.',
              'files': [ 'apps/api/src/knowledge/search/embedding.processor.ts',
                         'apps/api/src/knowledge/search/embedding.service.ts',
                         'apps/api/src/knowledge/search/vector-search.service.ts'],
              'fs': ['FS-KNOW-02'],
              'human_contribution': [ '**🔑 Environment variables**: Provide `AI_GATEWAY_API_KEY` in `.env`.',
              '**🧪 Manual QA & Smoke test**: Run worker and test semantic query via test '
                                      'script; verify top matching chunk returns score > 0.72.',
                                      '**👁️ Review & Sign-off**: Verify `WHERE business_id = ...` is present in vector '
                                      'search SQL query.'],
              'id': 'T-KNOW-03',
              'implementation_steps': [ '1. Implement sliding window chunking utility.',
                                        '2. Implement BullMQ embedding processor writing to `embeddings` table with '
                                        'pgvector type.',
                                        '3. Implement `VectorSearchService` executing raw SQL query with cosine '
                                        'distance operator `<=>`.',
                                        '4. Author unit/integration tests verifying chunking, vector storage, and '
                                        'tenant isolation.'],
              'modify_scope': ['apps/api/src/knowledge/embedding.*', 'apps/api/src/knowledge/vector-search.*'],
              'objective_value': 'Implement text chunking, OpenAI 1536-dim embedding generation worker, and pgvector '
                                 'cosine similarity search service.',
              'read': [ 'docs/10_engineering/15_AI_ARCHITECTURE.md',
                        'docs/10_engineering/12_DATABASE_DESIGN.md',
                        'docs/30_execution/32_FEATURE_SPECIFICATIONS.md'],
              'security_invariants': [ '🔒 **Tenancy Boundary**: Every vector search query must include `WHERE '
                                       'business_id = $1` (cross-tenant similarity search is strictly forbidden).',
                                       '🛡️ **Score Threshold**: Filter out results below minimum similarity threshold '
                                       '(0.72).'],
              'size': 'L',
              'technical_contract': [ 'Processor: BullMQ `generate-embeddings` consumes document and product texts, '
                                      'chunks (500 tokens / 50 overlap), calls OpenAI `text-embedding-3-small`.',
                                      '`VectorSearchService.similaritySearch(businessId, queryText, topK, minScore)` '
                                      '-> Returns chunks ordered by cosine similarity `<=>`.'],
              'title': 'RAG chunking, pgvector embedding generation & vector search worker',
              'wave': 'W2',
              'why': 'Provide high-precision semantic RAG retrieval so the AI Sales Agent can ground responses in '
                     'store policies and product details.'},
    'id': 'T-KNOW-03',
    'leaves': [ { 'cmd': 'pnpm --filter api test -- src/knowledge',
                  'do': [ '1. Implement sliding window chunking utility.',
                          '2. Implement BullMQ embedding processor writing to `embeddings` table with pgvector type.',
                          '3. Implement `VectorSearchService` executing raw SQL query with cosine distance operator '
                          '`<=>`.',
                          '4. Author unit/integration tests verifying chunking, vector storage, and tenant isolation.'],
                  'done': '**Semantic Retrieval**: Query returns relevant policy/product chunks sorted by similarity.',
                  'dont': [],
                  'files': [ 'apps/api/src/knowledge/search/embedding.processor.ts',
                             'apps/api/src/knowledge/search/embedding.service.ts',
                             'apps/api/src/knowledge/search/vector-search.service.ts'],
                  'gold': { 'acceptance_test_scenarios': [ '[ ] **Semantic Retrieval**: Query returns relevant '
                                                           'policy/product chunks sorted by similarity.',
                                                           '[ ] **Tenancy Isolation**: Vectors belonging to Tenant A '
                                                           'are never returned to Tenant B.',
                                                           '[ ] **Score Filtering**: Low-relevance chunks (<0.72) are '
                                                           'excluded.'],
                            'cmd': 'pnpm --filter api test -- src/knowledge',
                            'depends': ['T-KNOW-02', 'T-CAT-04'],
                            'dont_modify_scope': ['apps/web/'],
                            'expected_deliverables': 'Embedding processor, vector search service, and tests in '
                                                     '`apps/api/src/knowledge`.',
                            'files': [ 'apps/api/src/knowledge/search/embedding.processor.ts',
                                       'apps/api/src/knowledge/search/embedding.service.ts',
                                       'apps/api/src/knowledge/search/vector-search.service.ts'],
                            'fs': ['FS-KNOW-02'],
                            'human_contribution': [ '**🔑 Environment variables**: Provide `AI_GATEWAY_API_KEY` in `.env`.',
                            '**🧪 Manual QA & Smoke test**: Run worker and test semantic query '
                                                    'via test script; verify top matching chunk returns score > 0.72.',
                                                    '**👁️ Review & Sign-off**: Verify `WHERE business_id = ...` is '
                                                    'present in vector search SQL query.'],
                            'id': 'T-KNOW-03',
                            'implementation_steps': [ '1. Implement sliding window chunking utility.',
                                                      '2. Implement BullMQ embedding processor writing to `embeddings` '
                                                      'table with pgvector type.',
                                                      '3. Implement `VectorSearchService` executing raw SQL query with '
                                                      'cosine distance operator `<=>`.',
                                                      '4. Author unit/integration tests verifying chunking, vector '
                                                      'storage, and tenant isolation.'],
                            'modify_scope': [ 'apps/api/src/knowledge/embedding.*',
                                              'apps/api/src/knowledge/vector-search.*'],
                            'objective_value': 'Implement text chunking, OpenAI 1536-dim embedding generation worker, '
                                               'and pgvector cosine similarity search service.',
                            'read': [ 'docs/10_engineering/15_AI_ARCHITECTURE.md',
                                      'docs/10_engineering/12_DATABASE_DESIGN.md',
                                      'docs/30_execution/32_FEATURE_SPECIFICATIONS.md'],
                            'security_invariants': [ '🔒 **Tenancy Boundary**: Every vector search query must include '
                                                     '`WHERE business_id = $1` (cross-tenant similarity search is '
                                                     'strictly forbidden).',
                                                     '🛡️ **Score Threshold**: Filter out results below minimum '
                                                     'similarity threshold (0.72).'],
                            'size': 'L',
                            'technical_contract': [ 'Processor: BullMQ `generate-embeddings` consumes document and '
                                                    'product texts, chunks (500 tokens / 50 overlap), calls OpenAI '
                                                    '`text-embedding-3-small`.',
                                                    '`VectorSearchService.similaritySearch(businessId, queryText, '
                                                    'topK, minScore)` -> Returns chunks ordered by cosine similarity '
                                                    '`<=>`.'],
                            'title': 'RAG chunking, pgvector embedding generation & vector search worker',
                            'wave': 'W2',
                            'why': 'Provide high-precision semantic RAG retrieval so the AI Sales Agent can ground '
                                   'responses in store policies and product details.'},
                  'letter': '',
                  'read': [ 'docs/10_engineering/15_AI_ARCHITECTURE/02-rag-prompts-evaluation.md',
                            'docs/10_engineering/12_DATABASE_DESIGN/04-orders-knowledge-ai-schema.md',
                            'docs/30_execution/32_FEATURE_SPECIFICATIONS.md'],
                  'title': 'RAG chunking, pgvector embedding generation & vector search worker'}],
    'parent_done': '**Semantic Retrieval**: Query returns relevant policy/product chunks sorted by similarity.',
    'size': 'L',
    'title': 'RAG chunking, pgvector embedding generation & vector search worker',
    'wave': 'W2'},
  { 'depends': ['T-BIZ-01', 'T-BIZ-06'],
    'fs': ['FS-INT-01'],
    'gold': { 'acceptance_test_scenarios': [ '[ ] **Connect Channel**: Meta OAuth exchange saves encrypted channel '
                                             'account.',
                                             '[ ] **Quota Enforcement (403)**: Attempting to connect channels beyond '
                                             'plan quota returns 403 quota_exceeded.',
                                             '[ ] **WhatsApp Gate**: WhatsApp connection is blocked if feature flag is '
                                             'disabled.'],
              'cmd': 'pnpm --filter api test -- src/integrations',
              'depends': ['T-BIZ-01', 'T-BIZ-06'],
              'dont_modify_scope': ['apps/web/', 'apps/api/src/conversations/'],
              'expected_deliverables': 'Meta OAuth service, channels controller, encryption helper, and tests in '
                                       '`apps/api/src/integrations`.',
              'files': [ 'apps/api/src/integrations/channels/channels.controller.ts',
                         'apps/api/src/integrations/channels/channels.service.ts',
                         'apps/api/src/integrations/meta/meta-oauth.service.ts',
                         'apps/api/src/integrations/integrations.module.ts'],
              'fs': ['FS-INT-01'],
              'human_contribution': [ '**🔑 Environment variables**: Configure `META_APP_ID`, `META_APP_SECRET`, '
                                      '`META_WEBHOOK_VERIFY_TOKEN`, and `ENCRYPTION_KEY` in `.env`.',
                                      '**🌐 External setup**: Configure OAuth redirect URL in Meta App Dashboard.',
                                      '**🧪 Manual QA**: Initiate OAuth URL in browser, authorize test Instagram '
                                      'account, and verify encrypted token in DB.',
                                      '**👁️ Review & Sign-off**: Verify raw tokens are never stored in plaintext in '
                                      'the database.'],
              'id': 'T-INT-01',
              'implementation_steps': [ '1. Implement `MetaOAuthService` generating OAuth URLs and exchanging auth '
                                        'codes.',
                                        '2. Implement AES-256-GCM encryption/decryption utility using '
                                        '`ENCRYPTION_KEY`.',
                                        '3. Implement `ChannelsController` and `ChannelsService` with plan quota '
                                        'checks.',
                                        '4. Author unit tests covering OAuth callback, token encryption, and quota '
                                        'enforcement.'],
              'modify_scope': [ 'apps/api/src/integrations/channels.*',
                                'apps/api/src/integrations/meta-oauth.*',
                                'apps/api/src/integrations/dto/*',
                                'packages/shared/src/integrations/'],
              'objective_value': 'Implement Meta OAuth integration flow and channel accounts management with '
                                 'AES-256-GCM token encryption and plan quota enforcement.',
              'read': [ 'docs/10_engineering/13_API_DESIGN.md',
                        'docs/10_engineering/16_INTEGRATION_DESIGN.md',
                        'docs/30_execution/32_FEATURE_SPECIFICATIONS.md'],
              'security_invariants': [ '🔒 **Encryption**: Access tokens must be encrypted with AES-256-GCM before '
                                       'saving to database.',
                                       '🛡️ **Plan Quota**: Validate channel count against subscription plan allowance '
                                       '(returns 403 quota_exceeded if breached).',
                                       '🛡️ **WhatsApp Gate**: WhatsApp account connection is blocked unless '
                                       '`whatsapp_enabled` flag is true.'],
              'size': 'L',
              'technical_contract': [ '`GET /integrations/channels` (200 OK) -> List connected channel accounts and '
                                      'health status',
                                      '`GET /integrations/meta/oauth-url` (200 OK) -> Generate Meta authorization URL '
                                      'with signed state token',
                                      '`POST /integrations/meta/callback` (200 OK) -> Exchange code, encrypt token '
                                      'with AES-256-GCM, save `channel_accounts` row'],
              'title': 'Meta OAuth & Channel accounts management (WhatsApp / Instagram / Messenger)',
              'wave': 'W3',
              'why': 'Allow merchants to connect their official Instagram Business, Facebook Messenger, and WhatsApp '
                     'accounts to receive and send messages.'},
    'id': 'T-INT-01',
    'leaves': [ { 'cmd': 'pnpm --filter api test -- src/integrations',
                  'do': [ '1. Implement `MetaOAuthService` generating OAuth URLs and exchanging auth codes.',
                          '2. Implement AES-256-GCM encryption/decryption utility using `ENCRYPTION_KEY`.',
                          '3. Implement `ChannelsController` and `ChannelsService` with plan quota checks.',
                          '4. Author unit tests covering OAuth callback, token encryption, and quota enforcement.'],
                  'done': '**Connect Channel**: Meta OAuth exchange saves encrypted channel account.',
                  'dont': [],
                  'files': [ 'apps/api/src/integrations/channels/channels.controller.ts',
                             'apps/api/src/integrations/channels/channels.service.ts',
                             'apps/api/src/integrations/meta/meta-oauth.service.ts',
                             'apps/api/src/integrations/integrations.module.ts'],
                  'gold': { 'acceptance_test_scenarios': [ '[ ] **Connect Channel**: Meta OAuth exchange saves '
                                                           'encrypted channel account.',
                                                           '[ ] **Quota Enforcement (403)**: Attempting to connect '
                                                           'channels beyond plan quota returns 403 quota_exceeded.',
                                                           '[ ] **WhatsApp Gate**: WhatsApp connection is blocked if '
                                                           'feature flag is disabled.'],
                            'cmd': 'pnpm --filter api test -- src/integrations',
                            'depends': ['T-BIZ-01', 'T-BIZ-06'],
                            'dont_modify_scope': ['apps/web/', 'apps/api/src/conversations/'],
                            'expected_deliverables': 'Meta OAuth service, channels controller, encryption helper, and '
                                                     'tests in `apps/api/src/integrations`.',
                            'files': [ 'apps/api/src/integrations/channels/channels.controller.ts',
                                       'apps/api/src/integrations/channels/channels.service.ts',
                                       'apps/api/src/integrations/meta/meta-oauth.service.ts',
                                       'apps/api/src/integrations/integrations.module.ts'],
                            'fs': ['FS-INT-01'],
                            'human_contribution': [ '**🔑 Environment variables**: Configure `META_APP_ID`, '
                                                    '`META_APP_SECRET`, `META_WEBHOOK_VERIFY_TOKEN`, and '
                                                    '`ENCRYPTION_KEY` in `.env`.',
                                                    '**🌐 External setup**: Configure OAuth redirect URL in Meta App '
                                                    'Dashboard.',
                                                    '**🧪 Manual QA**: Initiate OAuth URL in browser, authorize test '
                                                    'Instagram account, and verify encrypted token in DB.',
                                                    '**👁️ Review & Sign-off**: Verify raw tokens are never stored in '
                                                    'plaintext in the database.'],
                            'id': 'T-INT-01',
                            'implementation_steps': [ '1. Implement `MetaOAuthService` generating OAuth URLs and '
                                                      'exchanging auth codes.',
                                                      '2. Implement AES-256-GCM encryption/decryption utility using '
                                                      '`ENCRYPTION_KEY`.',
                                                      '3. Implement `ChannelsController` and `ChannelsService` with '
                                                      'plan quota checks.',
                                                      '4. Author unit tests covering OAuth callback, token encryption, '
                                                      'and quota enforcement.'],
                            'modify_scope': [ 'apps/api/src/integrations/channels.*',
                                              'apps/api/src/integrations/meta-oauth.*',
                                              'apps/api/src/integrations/dto/*',
                                              'packages/shared/src/integrations/'],
                            'objective_value': 'Implement Meta OAuth integration flow and channel accounts management '
                                               'with AES-256-GCM token encryption and plan quota enforcement.',
                            'read': [ 'docs/10_engineering/13_API_DESIGN.md',
                                      'docs/10_engineering/16_INTEGRATION_DESIGN.md',
                                      'docs/30_execution/32_FEATURE_SPECIFICATIONS.md'],
                            'security_invariants': [ '🔒 **Encryption**: Access tokens must be encrypted with '
                                                     'AES-256-GCM before saving to database.',
                                                     '🛡️ **Plan Quota**: Validate channel count against subscription '
                                                     'plan allowance (returns 403 quota_exceeded if breached).',
                                                     '🛡️ **WhatsApp Gate**: WhatsApp account connection is blocked '
                                                     'unless `whatsapp_enabled` flag is true.'],
                            'size': 'L',
                            'technical_contract': [ '`GET /integrations/channels` (200 OK) -> List connected channel '
                                                    'accounts and health status',
                                                    '`GET /integrations/meta/oauth-url` (200 OK) -> Generate Meta '
                                                    'authorization URL with signed state token',
                                                    '`POST /integrations/meta/callback` (200 OK) -> Exchange code, '
                                                    'encrypt token with AES-256-GCM, save `channel_accounts` row'],
                            'title': 'Meta OAuth & Channel accounts management (WhatsApp / Instagram / Messenger)',
                            'wave': 'W3',
                            'why': 'Allow merchants to connect their official Instagram Business, Facebook Messenger, '
                                   'and WhatsApp accounts to receive and send messages.'},
                  'letter': '',
                  'read': [ 'docs/10_engineering/16_INTEGRATION_DESIGN/02-oauth-graph-client-ops.md',
                            'docs/10_engineering/13_API_DESIGN/04-integrations-ai-admin-catalog.md',
                            'docs/30_execution/32_FEATURE_SPECIFICATIONS.md'],
                  'title': 'Meta OAuth & Channel accounts management (WhatsApp / Instagram / Messenger)'}],
    'parent_done': '**Connect Channel**: Meta OAuth exchange saves encrypted channel account.',
    'size': 'L',
    'title': 'Meta OAuth & Channel accounts management (WhatsApp / Instagram / Messenger)',
    'wave': 'W3'},
  { 'depends': ['T-INT-01'],
    'fs': ['FS-INT-01'],
    'gold': { 'acceptance_test_scenarios': [ '[ ] **Challenge**: GET returns `hub.challenge` matching verify token.',
                                             '[ ] **HMAC Check**: Invalid HMAC returns 401 Unauthorized without '
                                             'persisting data.',
                                             '[ ] **Fast 200**: Valid webhook persists raw event and returns 200 OK '
                                             'immediately.',
                                             '[ ] **Duplicate Idempotency**: Duplicate external message IDs are '
                                             'deduplicated safely.'],
              'cmd': 'pnpm --filter api test -- src/integrations',
              'depends': ['T-INT-01'],
              'dont_modify_scope': ['apps/web/'],
              'expected_deliverables': 'Webhook controller, HMAC guard, persistence service, and tests in '
                                       '`apps/api/src/integrations`.',
              'files': [ 'apps/api/src/integrations/webhooks/webhooks.controller.ts',
                         'apps/api/src/integrations/webhooks/webhooks.service.ts',
                         'apps/api/src/integrations/guards/meta-hmac.guard.ts'],
              'fs': ['FS-INT-01'],
              'human_contribution': [ '**🌐 External setup**: Configure webhook callback URL '
                                      '(`https://<tunnel>/webhooks/meta`) in Meta Developer App dashboard.',
                                      '**🧪 Manual QA**: Send test payload from Meta Graph API Explorer and verify 200 '
                                      'response under 500ms.'],
              'id': 'T-INT-02',
              'implementation_steps': [ '1. Implement `MetaHmacGuard` verifying HMAC SHA-256 signature.',
                                        '2. Implement `WebhooksController.handleWebhook()` saving raw payload to '
                                        '`integration_events` and enqueuing BullMQ job.',
                                        '3. Author unit tests covering GET challenge, valid HMAC, invalid HMAC (401), '
                                        'and duplicate event deduplication.'],
              'modify_scope': [ 'apps/api/src/integrations/webhooks.*',
                                'apps/api/src/integrations/guards/meta-hmac.guard.*'],
              'objective_value': 'Implement Meta webhook verification challenge and high-performance webhook receiver '
                                 'with HMAC validation, immediate 200 OK ACK, and raw payload persistence.',
              'read': [ 'docs/10_engineering/13_API_DESIGN.md',
                        'docs/10_engineering/16_INTEGRATION_DESIGN.md',
                        'docs/30_execution/32_FEATURE_SPECIFICATIONS.md'],
              'security_invariants': [ '🔒 **HMAC Verification**: Validate `X-Hub-Signature-256` header against '
                                       '`META_APP_SECRET` using timing-safe comparison.',
                                       '🛡️ **Idempotency**: Use `external_event_id` unique constraint to deduplicate '
                                       'repeated webhooks silently.',
                                       '🚫 **Negative Invariants**: Never execute AI turns or synchronous external '
                                       'calls in the webhook receiver thread.'],
              'size': 'L',
              'technical_contract': [ '`GET /webhooks/meta` (200 OK) -> Webhook verification challenge (returns '
                                      '`hub.challenge` string)',
                                      "`POST /webhooks/meta` (200 OK) -> Body `{ object: 'instagram' | 'page' | "
                                      "'whatsapp_business_account', entry: [] }` (persists to `integration_events`, "
                                      'responds 200 immediately, queues BullMQ processing)'],
              'title': 'Meta Webhooks ingestion & raw payload persistence',
              'wave': 'W3',
              'why': 'Meta requires webhook endpoints to respond within 3-5 seconds and cryptographically verify '
                     'signatures to prevent webhook spoofing.'},
    'id': 'T-INT-02',
    'leaves': [ { 'cmd': 'pnpm --filter api test -- src/integrations',
                  'do': [ '1. Implement `MetaHmacGuard` verifying HMAC SHA-256 signature.',
                          '2. Implement `WebhooksController.handleWebhook()` saving raw payload to '
                          '`integration_events` and enqueuing BullMQ job.',
                          '3. Author unit tests covering GET challenge, valid HMAC, invalid HMAC (401), and duplicate '
                          'event deduplication.'],
                  'done': '**Challenge**: GET returns `hub.challenge` matching verify token.',
                  'dont': [ '🚫 **Negative Invariants**: Never execute AI turns or synchronous external calls in the '
                            'webhook receiver thread.'],
                  'files': [ 'apps/api/src/integrations/webhooks/webhooks.controller.ts',
                             'apps/api/src/integrations/webhooks/webhooks.service.ts',
                             'apps/api/src/integrations/guards/meta-hmac.guard.ts'],
                  'gold': { 'acceptance_test_scenarios': [ '[ ] **Challenge**: GET returns `hub.challenge` matching '
                                                           'verify token.',
                                                           '[ ] **HMAC Check**: Invalid HMAC returns 401 Unauthorized '
                                                           'without persisting data.',
                                                           '[ ] **Fast 200**: Valid webhook persists raw event and '
                                                           'returns 200 OK immediately.',
                                                           '[ ] **Duplicate Idempotency**: Duplicate external message '
                                                           'IDs are deduplicated safely.'],
                            'cmd': 'pnpm --filter api test -- src/integrations',
                            'depends': ['T-INT-01'],
                            'dont_modify_scope': ['apps/web/'],
                            'expected_deliverables': 'Webhook controller, HMAC guard, persistence service, and tests '
                                                     'in `apps/api/src/integrations`.',
                            'files': [ 'apps/api/src/integrations/webhooks/webhooks.controller.ts',
                                       'apps/api/src/integrations/webhooks/webhooks.service.ts',
                                       'apps/api/src/integrations/guards/meta-hmac.guard.ts'],
                            'fs': ['FS-INT-01'],
                            'human_contribution': [ '**🌐 External setup**: Configure webhook callback URL '
                                                    '(`https://<tunnel>/webhooks/meta`) in Meta Developer App '
                                                    'dashboard.',
                                                    '**🧪 Manual QA**: Send test payload from Meta Graph API Explorer '
                                                    'and verify 200 response under 500ms.'],
                            'id': 'T-INT-02',
                            'implementation_steps': [ '1. Implement `MetaHmacGuard` verifying HMAC SHA-256 signature.',
                                                      '2. Implement `WebhooksController.handleWebhook()` saving raw '
                                                      'payload to `integration_events` and enqueuing BullMQ job.',
                                                      '3. Author unit tests covering GET challenge, valid HMAC, '
                                                      'invalid HMAC (401), and duplicate event deduplication.'],
                            'modify_scope': [ 'apps/api/src/integrations/webhooks.*',
                                              'apps/api/src/integrations/guards/meta-hmac.guard.*'],
                            'objective_value': 'Implement Meta webhook verification challenge and high-performance '
                                               'webhook receiver with HMAC validation, immediate 200 OK ACK, and raw '
                                               'payload persistence.',
                            'read': [ 'docs/10_engineering/13_API_DESIGN.md',
                                      'docs/10_engineering/16_INTEGRATION_DESIGN.md',
                                      'docs/30_execution/32_FEATURE_SPECIFICATIONS.md'],
                            'security_invariants': [ '🔒 **HMAC Verification**: Validate `X-Hub-Signature-256` header '
                                                     'against `META_APP_SECRET` using timing-safe comparison.',
                                                     '🛡️ **Idempotency**: Use `external_event_id` unique constraint to '
                                                     'deduplicate repeated webhooks silently.',
                                                     '🚫 **Negative Invariants**: Never execute AI turns or synchronous '
                                                     'external calls in the webhook receiver thread.'],
                            'size': 'L',
                            'technical_contract': [ '`GET /webhooks/meta` (200 OK) -> Webhook verification challenge '
                                                    '(returns `hub.challenge` string)',
                                                    "`POST /webhooks/meta` (200 OK) -> Body `{ object: 'instagram' | "
                                                    "'page' | 'whatsapp_business_account', entry: [] }` (persists to "
                                                    '`integration_events`, responds 200 immediately, queues BullMQ '
                                                    'processing)'],
                            'title': 'Meta Webhooks ingestion & raw payload persistence',
                            'wave': 'W3',
                            'why': 'Meta requires webhook endpoints to respond within 3-5 seconds and '
                                   'cryptographically verify signatures to prevent webhook spoofing.'},
                  'letter': '',
                  'read': [ 'docs/10_engineering/16_INTEGRATION_DESIGN/01-adapters-webhooks.md',
                            'docs/10_engineering/13_API_DESIGN/04-integrations-ai-admin-catalog.md',
                            'docs/30_execution/32_FEATURE_SPECIFICATIONS.md'],
                  'title': 'Meta Webhooks ingestion & raw payload persistence'}],
    'parent_done': '**Challenge**: GET returns `hub.challenge` matching verify token.',
    'size': 'L',
    'title': 'Meta Webhooks ingestion & raw payload persistence',
    'wave': 'W3'},
  { 'depends': ['T-INT-02'],
    'fs': ['FS-INT-01'],
    'gold': { 'acceptance_test_scenarios': [ '[ ] **Normalization**: Instagram, Messenger, and WhatsApp payloads map '
                                             'into identical CanonicalMessage interface.',
                                             '[ ] **Malformed Resilience**: Malformed provider JSON is flagged without '
                                             'crashing background worker.'],
              'cmd': 'pnpm --filter api test -- src/integrations',
              'depends': ['T-INT-02'],
              'dont_modify_scope': ['apps/web/'],
              'expected_deliverables': 'Platform adapters and normalization service in `apps/api/src/integrations`.',
              'files': [ 'apps/api/src/integrations/adapters/meta-whatsapp.adapter.ts',
                         'apps/api/src/integrations/adapters/meta-instagram.adapter.ts',
                         'apps/api/src/integrations/adapters/meta-messenger.adapter.ts',
                         'apps/api/src/integrations/normalizer/normalizer.service.ts'],
              'fs': ['FS-INT-01'],
              'human_contribution': [ '**🧪 Manual QA**: Send text and image messages from customer Instagram and '
                                      'verify normalized format in worker logs.'],
              'id': 'T-INT-03',
              'implementation_steps': [ '1. Implement adapters for Instagram Graph API, Messenger, and WhatsApp Cloud '
                                        'API.',
                                        '2. Implement `NormalizerService` routing raw events to appropriate adapter.',
                                        '3. Author unit tests covering text, image attachments, quick replies, and '
                                        'malformed payload resilience.'],
              'modify_scope': [ 'apps/api/src/integrations/adapters/',
                                'apps/api/src/integrations/normalizer/normalizer.service.ts',
                                'packages/shared/src/integrations/'],
              'objective_value': 'Implement platform-specific adapters to normalize inbound raw webhook payloads into '
                                 'the unified `CanonicalMessage` domain interface.',
              'read': ['docs/10_engineering/10_ARCHITECTURE.md', 'docs/10_engineering/16_INTEGRATION_DESIGN.md'],
              'security_invariants': [ '🔒 **Module Boundary**: No provider-specific JSON fields leak beyond the '
                                       '`integrations` module boundary.'],
              'size': 'M',
              'technical_contract': [ '`NormalizerService.normalize(rawPayload): CanonicalMessage`',
                                      '`CanonicalMessage`: `{ externalMessageId, channelType, channelAccountId, '
                                      'externalSenderId, text, attachments, timestamp }`'],
              'title': 'Messaging adapters & canonical message normalization',
              'wave': 'W3',
              'why': 'Decouple core conversations and AI systems from provider-specific JSON quirks across Meta '
                     'platforms.'},
    'id': 'T-INT-03',
    'leaves': [ { 'cmd': 'pnpm --filter api test -- src/integrations',
                  'do': [ '1. Implement adapters for Instagram Graph API, Messenger, and WhatsApp Cloud API.',
                          '2. Implement `NormalizerService` routing raw events to appropriate adapter.',
                          '3. Author unit tests covering text, image attachments, quick replies, and malformed payload '
                          'resilience.'],
                  'done': '**Normalization**: Instagram, Messenger, and WhatsApp payloads map into identical '
                          'CanonicalMessage interface.',
                  'dont': [],
                  'files': [ 'apps/api/src/integrations/adapters/meta-whatsapp.adapter.ts',
                             'apps/api/src/integrations/adapters/meta-instagram.adapter.ts',
                             'apps/api/src/integrations/adapters/meta-messenger.adapter.ts',
                             'apps/api/src/integrations/normalizer/normalizer.service.ts'],
                  'gold': { 'acceptance_test_scenarios': [ '[ ] **Normalization**: Instagram, Messenger, and WhatsApp '
                                                           'payloads map into identical CanonicalMessage interface.',
                                                           '[ ] **Malformed Resilience**: Malformed provider JSON is '
                                                           'flagged without crashing background worker.'],
                            'cmd': 'pnpm --filter api test -- src/integrations',
                            'depends': ['T-INT-02'],
                            'dont_modify_scope': ['apps/web/'],
                            'expected_deliverables': 'Platform adapters and normalization service in '
                                                     '`apps/api/src/integrations`.',
                            'files': [ 'apps/api/src/integrations/adapters/meta-whatsapp.adapter.ts',
                                       'apps/api/src/integrations/adapters/meta-instagram.adapter.ts',
                                       'apps/api/src/integrations/adapters/meta-messenger.adapter.ts',
                                       'apps/api/src/integrations/normalizer/normalizer.service.ts'],
                            'fs': ['FS-INT-01'],
                            'human_contribution': [ '**🧪 Manual QA**: Send text and image messages from customer '
                                                    'Instagram and verify normalized format in worker logs.'],
                            'id': 'T-INT-03',
                            'implementation_steps': [ '1. Implement adapters for Instagram Graph API, Messenger, and '
                                                      'WhatsApp Cloud API.',
                                                      '2. Implement `NormalizerService` routing raw events to '
                                                      'appropriate adapter.',
                                                      '3. Author unit tests covering text, image attachments, quick '
                                                      'replies, and malformed payload resilience.'],
                            'modify_scope': [ 'apps/api/src/integrations/adapters/',
                                              'apps/api/src/integrations/normalizer/normalizer.service.ts',
                                              'packages/shared/src/integrations/'],
                            'objective_value': 'Implement platform-specific adapters to normalize inbound raw webhook '
                                               'payloads into the unified `CanonicalMessage` domain interface.',
                            'read': [ 'docs/10_engineering/10_ARCHITECTURE.md',
                                      'docs/10_engineering/16_INTEGRATION_DESIGN.md'],
                            'security_invariants': [ '🔒 **Module Boundary**: No provider-specific JSON fields leak '
                                                     'beyond the `integrations` module boundary.'],
                            'size': 'M',
                            'technical_contract': [ '`NormalizerService.normalize(rawPayload): CanonicalMessage`',
                                                    '`CanonicalMessage`: `{ externalMessageId, channelType, '
                                                    'channelAccountId, externalSenderId, text, attachments, timestamp '
                                                    '}`'],
                            'title': 'Messaging adapters & canonical message normalization',
                            'wave': 'W3',
                            'why': 'Decouple core conversations and AI systems from provider-specific JSON quirks '
                                   'across Meta platforms.'},
                  'letter': '',
                  'read': [ 'docs/10_engineering/16_INTEGRATION_DESIGN/01-adapters-webhooks.md',
                            'docs/10_engineering/14_SYSTEM_DESIGN/01-state-machine-message-pipeline.md',
                            'docs/30_execution/32_FEATURE_SPECIFICATIONS.md'],
                  'title': 'Messaging adapters & canonical message normalization'}],
    'parent_done': '**Normalization**: Instagram, Messenger, and WhatsApp payloads map into identical CanonicalMessage '
                   'interface.',
    'size': 'M',
    'title': 'Messaging adapters & canonical message normalization',
    'wave': 'W3'},
  { 'depends': ['T-INT-03'],
    'fs': ['FS-INT-01'],
    'gold': { 'acceptance_test_scenarios': [ '[ ] **Outbound Delivery**: Message dispatches to Meta API and updates '
                                             'delivery status to SENT.',
                                             '[ ] **Exponential Retries**: Transient 500 errors trigger retries with '
                                             'backoff.',
                                             '[ ] **DLQ Handling**: Fatal errors mark message FAILED and move to DLQ '
                                             'without crashing.'],
              'cmd': 'pnpm --filter api test -- src/integrations',
              'depends': ['T-INT-03'],
              'dont_modify_scope': ['apps/web/'],
              'expected_deliverables': 'Outbound delivery service, Meta API client, BullMQ worker, and tests in '
                                       '`apps/api/src/integrations`.',
              'files': [ 'apps/api/src/integrations/outbound/outbound.service.ts',
                         'apps/api/src/integrations/outbound/outbound.processor.ts',
                         'apps/api/src/integrations/meta/meta-api.client.ts'],
              'fs': ['FS-INT-01'],
              'human_contribution': [ '**🧪 Manual QA**: Send outbound test reply; verify message reaches customer test '
                                      'user on Instagram.',
                                      '**👁️ Review & Sign-off**: Verify message delivery failures update '
                                      "`deliveryStatus = 'FAILED'` in database."],
              'id': 'T-INT-04',
              'implementation_steps': [ '1. Implement `MetaApiClient` for WhatsApp Cloud API and Instagram Graph API.',
                                        '2. Implement BullMQ `outbound.processor.ts` with exponential retry policy and '
                                        'rate limiting.',
                                        '3. Author unit tests covering successful send, transient 5xx retry, and fatal '
                                        '4xx DLQ routing.'],
              'modify_scope': ['apps/api/src/integrations/outbound.*', 'apps/api/src/integrations/meta/meta-api.client.ts'],
              'objective_value': 'Implement outbound message delivery pipeline via BullMQ with exponential backoff '
                                 'retries, Dead Letter Queue (DLQ), and per-channel rate limiters.',
              'read': [ 'docs/10_engineering/16_INTEGRATION_DESIGN.md',
                        'docs/10_engineering/14_SYSTEM_DESIGN.md',
                        'docs/30_execution/32_FEATURE_SPECIFICATIONS.md'],
              'security_invariants': [ '🔒 **Token Decryption**: Decrypt access token in worker memory just prior to '
                                       'HTTP dispatch.',
                                       '🛡️ **Backoff & DLQ**: 3 retries (2s, 8s, 32s) before moving to Dead Letter '
                                       'Queue.'],
              'size': 'L',
              'technical_contract': [ '`OutboundService.queueMessage(messageId)` pushes to BullMQ `deliver_outbound` '
                                      'queue.',
                                      'Worker decrypts token, calls Meta API, updates message `deliveryStatus = '
                                      "'SENT'` or `'FAILED'` on exhausted retries."],
              'title': 'Outbound message delivery pipeline, rate limiting & retry queue',
              'wave': 'W3',
              'why': 'Ensure reliable message delivery to customers across Meta channels while handling network '
                     'transient errors and platform rate limits.'},
    'id': 'T-INT-04',
    'leaves': [ { 'cmd': 'pnpm --filter api test -- src/integrations',
                  'do': [ '1. Implement `MetaApiClient` for WhatsApp Cloud API and Instagram Graph API.',
                          '2. Implement BullMQ `outbound.processor.ts` with exponential retry policy and rate '
                          'limiting.',
                          '3. Author unit tests covering successful send, transient 5xx retry, and fatal 4xx DLQ '
                          'routing.'],
                  'done': '**Outbound Delivery**: Message dispatches to Meta API and updates delivery status to SENT.',
                  'dont': [],
                  'files': [ 'apps/api/src/integrations/outbound/outbound.service.ts',
                             'apps/api/src/integrations/outbound/outbound.processor.ts',
                             'apps/api/src/integrations/meta/meta-api.client.ts'],
                  'gold': { 'acceptance_test_scenarios': [ '[ ] **Outbound Delivery**: Message dispatches to Meta API '
                                                           'and updates delivery status to SENT.',
                                                           '[ ] **Exponential Retries**: Transient 500 errors trigger '
                                                           'retries with backoff.',
                                                           '[ ] **DLQ Handling**: Fatal errors mark message FAILED and '
                                                           'move to DLQ without crashing.'],
                            'cmd': 'pnpm --filter api test -- src/integrations',
                            'depends': ['T-INT-03'],
                            'dont_modify_scope': ['apps/web/'],
                            'expected_deliverables': 'Outbound delivery service, Meta API client, BullMQ worker, and '
                                                     'tests in `apps/api/src/integrations`.',
                            'files': [ 'apps/api/src/integrations/outbound/outbound.service.ts',
                                       'apps/api/src/integrations/outbound/outbound.processor.ts',
                                       'apps/api/src/integrations/meta/meta-api.client.ts'],
                            'fs': ['FS-INT-01'],
                            'human_contribution': [ '**🧪 Manual QA**: Send outbound test reply; verify message reaches '
                                                    'customer test user on Instagram.',
                                                    '**👁️ Review & Sign-off**: Verify message delivery failures update '
                                                    "`deliveryStatus = 'FAILED'` in database."],
                            'id': 'T-INT-04',
                            'implementation_steps': [ '1. Implement `MetaApiClient` for WhatsApp Cloud API and '
                                                      'Instagram Graph API.',
                                                      '2. Implement BullMQ `outbound.processor.ts` with exponential '
                                                      'retry policy and rate limiting.',
                                                      '3. Author unit tests covering successful send, transient 5xx '
                                                      'retry, and fatal 4xx DLQ routing.'],
                            'modify_scope': [ 'apps/api/src/integrations/outbound.*',
                                              'apps/api/src/integrations/meta/meta-api.client.ts'],
                            'objective_value': 'Implement outbound message delivery pipeline via BullMQ with '
                                               'exponential backoff retries, Dead Letter Queue (DLQ), and per-channel '
                                               'rate limiters.',
                            'read': [ 'docs/10_engineering/16_INTEGRATION_DESIGN.md',
                                      'docs/10_engineering/14_SYSTEM_DESIGN.md',
                                      'docs/30_execution/32_FEATURE_SPECIFICATIONS.md'],
                            'security_invariants': [ '🔒 **Token Decryption**: Decrypt access token in worker memory '
                                                     'just prior to HTTP dispatch.',
                                                     '🛡️ **Backoff & DLQ**: 3 retries (2s, 8s, 32s) before moving to '
                                                     'Dead Letter Queue.'],
                            'size': 'L',
                            'technical_contract': [ '`OutboundService.queueMessage(messageId)` pushes to BullMQ '
                                                    '`deliver_outbound` queue.',
                                                    'Worker decrypts token, calls Meta API, updates message '
                                                    "`deliveryStatus = 'SENT'` or `'FAILED'` on exhausted retries."],
                            'title': 'Outbound message delivery pipeline, rate limiting & retry queue',
                            'wave': 'W3',
                            'why': 'Ensure reliable message delivery to customers across Meta channels while handling '
                                   'network transient errors and platform rate limits.'},
                  'letter': '',
                  'read': [ 'docs/10_engineering/16_INTEGRATION_DESIGN/02-oauth-graph-client-ops.md',
                            'docs/10_engineering/14_SYSTEM_DESIGN/01-state-machine-message-pipeline.md',
                            'docs/30_execution/32_FEATURE_SPECIFICATIONS.md'],
                  'title': 'Outbound message delivery pipeline, rate limiting & retry queue'}],
    'parent_done': '**Outbound Delivery**: Message dispatches to Meta API and updates delivery status to SENT.',
    'size': 'L',
    'title': 'Outbound message delivery pipeline, rate limiting & retry queue',
    'wave': 'W3'},
  { 'depends': ['T-INT-03'],
    'fs': ['FS-INT-01'],
    'gold': { 'acceptance_test_scenarios': [ '[ ] **Media Download**: Customer photo is downloaded to MinIO and linked '
                                             'to message.'],
              'cmd': 'pnpm --filter api test -- src/integrations',
              'depends': ['T-INT-03'],
              'dont_modify_scope': ['apps/web/'],
              'expected_deliverables': 'Media download service and worker in `apps/api/src/integrations`.',
              'files': ['apps/api/src/integrations/media/media.service.ts', 'apps/api/src/integrations/media/media.processor.ts'],
              'fs': ['FS-INT-01'],
              'human_contribution': [ '**🧪 Manual QA**: Send photo from customer Instagram and verify file in MinIO '
                                      'bucket console.'],
              'id': 'T-INT-05',
              'implementation_steps': [ '1. Implement `MediaService` and BullMQ `media.processor.ts`.',
                                        '2. Author unit tests covering download, upload, and metadata linking.'],
              'modify_scope': ['apps/api/src/integrations/media.*'],
              'objective_value': 'Implement inbound customer media attachment download from Meta CDN and permanent '
                                 'tenant-isolated storage in MinIO/S3.',
              'read': ['docs/10_engineering/16_INTEGRATION_DESIGN.md', 'docs/10_engineering/12_DATABASE_DESIGN.md'],
              'security_invariants': [ '🔒 **Tenancy Isolation**: Media files stored under tenant-prefixed S3 keys.',
                                       '🛡️ **Size Limit**: Validate attachment size <= 10MB.'],
              'size': 'M',
              'technical_contract': [ 'Worker downloads media from Meta CDN using channel access token.',
                                      'Uploads to S3 bucket path `{business_id}/attachments/{id}` and inserts '
                                      '`message_attachments` row.'],
              'title': 'Media attachments processing & MinIO storage',
              'wave': 'W3',
              'why': 'Customer images (payment receipts, product photos) must be downloaded from temporary Meta CDN '
                     'URLs and preserved permanently in merchant storage.'},
    'id': 'T-INT-05',
    'leaves': [ { 'cmd': 'pnpm --filter api test -- src/integrations',
                  'do': [ '1. Implement `MediaService` and BullMQ `media.processor.ts`.',
                          '2. Author unit tests covering download, upload, and metadata linking.'],
                  'done': '**Media Download**: Customer photo is downloaded to MinIO and linked to message.',
                  'dont': [],
                  'files': [ 'apps/api/src/integrations/media/media.service.ts',
                             'apps/api/src/integrations/media/media.processor.ts'],
                  'gold': { 'acceptance_test_scenarios': [ '[ ] **Media Download**: Customer photo is downloaded to '
                                                           'MinIO and linked to message.'],
                            'cmd': 'pnpm --filter api test -- src/integrations',
                            'depends': ['T-INT-03'],
                            'dont_modify_scope': ['apps/web/'],
                            'expected_deliverables': 'Media download service and worker in '
                                                     '`apps/api/src/integrations`.',
                            'files': [ 'apps/api/src/integrations/media/media.service.ts',
                                       'apps/api/src/integrations/media/media.processor.ts'],
                            'fs': ['FS-INT-01'],
                            'human_contribution': [ '**🧪 Manual QA**: Send photo from customer Instagram and verify '
                                                    'file in MinIO bucket console.'],
                            'id': 'T-INT-05',
                            'implementation_steps': [ '1. Implement `MediaService` and BullMQ `media.processor.ts`.',
                                                      '2. Author unit tests covering download, upload, and metadata '
                                                      'linking.'],
                            'modify_scope': ['apps/api/src/integrations/media.*'],
                            'objective_value': 'Implement inbound customer media attachment download from Meta CDN and '
                                               'permanent tenant-isolated storage in MinIO/S3.',
                            'read': [ 'docs/10_engineering/16_INTEGRATION_DESIGN.md',
                                      'docs/10_engineering/12_DATABASE_DESIGN.md'],
                            'security_invariants': [ '🔒 **Tenancy Isolation**: Media files stored under '
                                                     'tenant-prefixed S3 keys.',
                                                     '🛡️ **Size Limit**: Validate attachment size <= 10MB.'],
                            'size': 'M',
                            'technical_contract': [ 'Worker downloads media from Meta CDN using channel access token.',
                                                    'Uploads to S3 bucket path `{business_id}/attachments/{id}` and '
                                                    'inserts `message_attachments` row.'],
                            'title': 'Media attachments processing & MinIO storage',
                            'wave': 'W3',
                            'why': 'Customer images (payment receipts, product photos) must be downloaded from '
                                   'temporary Meta CDN URLs and preserved permanently in merchant storage.'},
                  'letter': '',
                  'read': [ 'docs/10_engineering/16_INTEGRATION_DESIGN/02-oauth-graph-client-ops.md',
                            'docs/10_engineering/18_DEPLOYMENT/02-storage-env-ci-ops.md',
                            'docs/30_execution/32_FEATURE_SPECIFICATIONS.md'],
                  'title': 'Media attachments processing & MinIO storage'}],
    'parent_done': '**Media Download**: Customer photo is downloaded to MinIO and linked to message.',
    'size': 'M',
    'title': 'Media attachments processing & MinIO storage',
    'wave': 'W3'},
  { 'depends': ['T-INT-03'],
    'fs': ['FS-INT-01'],
    'gold': { 'acceptance_test_scenarios': [ '[ ] **Clean Dependencies**: Verify zero unofficial WhatsApp dependencies '
                                             'exist in lockfile.'],
              'cmd': 'pnpm --filter api test -- src/integrations',
              'depends': ['T-INT-03'],
              'dont_modify_scope': ['apps/web/'],
              'expected_deliverables': 'WhatsApp adapter stub in `apps/api/src/integrations`.',
              'files': ['apps/api/src/integrations/adapters/whatsapp-cloud.stub.ts'],
              'fs': ['FS-INT-01'],
              'human_contribution': [ '**👁️ Review & Sign-off**: Verify `pnpm-lock.yaml` contains no unapproved '
                                      'scraping dependencies.'],
              'id': 'T-INT-06',
              'implementation_steps': [ '1. Create WhatsApp adapter stub conforming to `ChannelAdapter`.',
                                        '2. Author test verifying feature flag check and lockfile hygiene.'],
              'modify_scope': ['apps/api/src/integrations/adapters/whatsapp*'],
              'objective_value': 'Establish official WhatsApp Cloud API adapter architecture stub and enforce strict '
                                 'feature gating.',
              'read': ['docs/00_product/03_MVP_SCOPE.md', 'docs/10_engineering/16_INTEGRATION_DESIGN.md'],
              'security_invariants': [ '🚫 **Forbidden Packages**: Strictly zero unofficial WhatsApp libraries in '
                                       'package.json or pnpm-lock.yaml.'],
              'size': 'S',
              'technical_contract': [ '`WhatsAppCloudStubAdapter` implements `ChannelAdapter` interface with feature '
                                      'flag check.'],
              'title': 'WhatsApp integration adapter stub & feature gate',
              'wave': 'W3',
              'why': 'Prepare for official WhatsApp Cloud API onboarding in Phase 2 while strictly forbidding '
                     'unofficial WhatsApp scrapers.'},
    'id': 'T-INT-06',
    'leaves': [ { 'cmd': 'pnpm --filter api test -- src/integrations',
                  'do': [ '1. Create WhatsApp adapter stub conforming to `ChannelAdapter`.',
                          '2. Author test verifying feature flag check and lockfile hygiene.'],
                  'done': '**Clean Dependencies**: Verify zero unofficial WhatsApp dependencies exist in lockfile.',
                  'dont': [ '🚫 **Forbidden Packages**: Strictly zero unofficial WhatsApp libraries in package.json or '
                            'pnpm-lock.yaml.'],
                  'files': ['apps/api/src/integrations/adapters/whatsapp-cloud.stub.ts'],
                  'gold': { 'acceptance_test_scenarios': [ '[ ] **Clean Dependencies**: Verify zero unofficial '
                                                           'WhatsApp dependencies exist in lockfile.'],
                            'cmd': 'pnpm --filter api test -- src/integrations',
                            'depends': ['T-INT-03'],
                            'dont_modify_scope': ['apps/web/'],
                            'expected_deliverables': 'WhatsApp adapter stub in `apps/api/src/integrations`.',
                            'files': ['apps/api/src/integrations/adapters/whatsapp-cloud.stub.ts'],
                            'fs': ['FS-INT-01'],
                            'human_contribution': [ '**👁️ Review & Sign-off**: Verify `pnpm-lock.yaml` contains no '
                                                    'unapproved scraping dependencies.'],
                            'id': 'T-INT-06',
                            'implementation_steps': [ '1. Create WhatsApp adapter stub conforming to `ChannelAdapter`.',
                                                      '2. Author test verifying feature flag check and lockfile '
                                                      'hygiene.'],
                            'modify_scope': ['apps/api/src/integrations/adapters/whatsapp*'],
                            'objective_value': 'Establish official WhatsApp Cloud API adapter architecture stub and '
                                               'enforce strict feature gating.',
                            'read': ['docs/00_product/03_MVP_SCOPE.md', 'docs/10_engineering/16_INTEGRATION_DESIGN.md'],
                            'security_invariants': [ '🚫 **Forbidden Packages**: Strictly zero unofficial WhatsApp '
                                                     'libraries in package.json or pnpm-lock.yaml.'],
                            'size': 'S',
                            'technical_contract': [ '`WhatsAppCloudStubAdapter` implements `ChannelAdapter` interface '
                                                    'with feature flag check.'],
                            'title': 'WhatsApp integration adapter stub & feature gate',
                            'wave': 'W3',
                            'why': 'Prepare for official WhatsApp Cloud API onboarding in Phase 2 while strictly '
                                   'forbidding unofficial WhatsApp scrapers.'},
                  'letter': '',
                  'read': [ 'docs/10_engineering/16_INTEGRATION_DESIGN/02-oauth-graph-client-ops.md',
                            'docs/10_engineering/13_API_DESIGN/04-integrations-ai-admin-catalog.md',
                            'docs/30_execution/32_FEATURE_SPECIFICATIONS.md'],
                  'title': 'WhatsApp integration adapter stub & feature gate'}],
    'parent_done': '**Clean Dependencies**: Verify zero unofficial WhatsApp dependencies exist in lockfile.',
    'size': 'S',
    'title': 'WhatsApp integration adapter stub & feature gate',
    'wave': 'W3'},
  { 'depends': ['T-INT-01'],
    'fs': ['FS-INT-01'],
    'gold': { 'acceptance_test_scenarios': [ '[ ] **Health Status**: Reports token status accurately.',
                                             '[ ] **Disconnect**: Invalidate stored credentials on disconnect.'],
              'cmd': 'pnpm --filter api test -- src/integrations',
              'depends': ['T-INT-01'],
              'dont_modify_scope': ['apps/web/'],
              'expected_deliverables': 'Channel health and disconnect endpoints in `apps/api/src/integrations`.',
              'files': [ 'apps/api/src/integrations/channels/channels.controller.ts',
                         'apps/api/src/integrations/channels/channels.service.ts'],
              'fs': ['FS-INT-01'],
              'human_contribution': [ '**🧪 Manual QA**: Invalidate token in developer console and verify DEGRADED '
                                      'status in Swagger.'],
              'id': 'T-INT-07',
              'implementation_steps': [ '1. Implement health check method verifying token expiry against Meta debug '
                                        'API.',
                                        '2. Implement disconnect route revoking stored tokens.',
                                        '3. Author unit tests covering health check and disconnect.'],
              'modify_scope': ['apps/api/src/integrations/channels.*'],
              'objective_value': 'Implement channel token health monitoring, expiration alerts, and graceful channel '
                                 'disconnection.',
              'read': ['docs/10_engineering/13_API_DESIGN.md', 'docs/10_engineering/16_INTEGRATION_DESIGN.md'],
              'security_invariants': [ '🛡️ **RBAC Permission**: Disconnect requires '
                                       "`@RequirePermission('integrations.manage')`."],
              'size': 'M',
              'technical_contract': [ '`GET /integrations/channels/health` (200 OK) -> Health status per channel '
                                      'account (`ACTIVE`, `DEGRADED`, `DISCONNECTED`)',
                                      '`POST /integrations/channels/:id/disconnect` (200 OK) -> Revokes token and '
                                      'marks channel status `DISCONNECTED`'],
              'title': 'Channel account health checks & disconnect flow',
              'wave': 'W3',
              'why': 'Alert merchants when Meta tokens expire and allow clean channel disconnection without orphaned '
                     'webhooks.'},
    'id': 'T-INT-07',
    'leaves': [ { 'cmd': 'pnpm --filter api test -- src/integrations',
                  'do': [ '1. Implement health check method verifying token expiry against Meta debug API.',
                          '2. Implement disconnect route revoking stored tokens.',
                          '3. Author unit tests covering health check and disconnect.'],
                  'done': '**Health Status**: Reports token status accurately.',
                  'dont': [],
                  'files': [ 'apps/api/src/integrations/channels/channels.controller.ts',
                             'apps/api/src/integrations/channels/channels.service.ts'],
                  'gold': { 'acceptance_test_scenarios': [ '[ ] **Health Status**: Reports token status accurately.',
                                                           '[ ] **Disconnect**: Invalidate stored credentials on '
                                                           'disconnect.'],
                            'cmd': 'pnpm --filter api test -- src/integrations',
                            'depends': ['T-INT-01'],
                            'dont_modify_scope': ['apps/web/'],
                            'expected_deliverables': 'Channel health and disconnect endpoints in '
                                                     '`apps/api/src/integrations`.',
                            'files': [ 'apps/api/src/integrations/channels/channels.controller.ts',
                                       'apps/api/src/integrations/channels/channels.service.ts'],
                            'fs': ['FS-INT-01'],
                            'human_contribution': [ '**🧪 Manual QA**: Invalidate token in developer console and verify '
                                                    'DEGRADED status in Swagger.'],
                            'id': 'T-INT-07',
                            'implementation_steps': [ '1. Implement health check method verifying token expiry against '
                                                      'Meta debug API.',
                                                      '2. Implement disconnect route revoking stored tokens.',
                                                      '3. Author unit tests covering health check and disconnect.'],
                            'modify_scope': ['apps/api/src/integrations/channels.*'],
                            'objective_value': 'Implement channel token health monitoring, expiration alerts, and '
                                               'graceful channel disconnection.',
                            'read': [ 'docs/10_engineering/13_API_DESIGN.md',
                                      'docs/10_engineering/16_INTEGRATION_DESIGN.md'],
                            'security_invariants': [ '🛡️ **RBAC Permission**: Disconnect requires '
                                                     "`@RequirePermission('integrations.manage')`."],
                            'size': 'M',
                            'technical_contract': [ '`GET /integrations/channels/health` (200 OK) -> Health status per '
                                                    'channel account (`ACTIVE`, `DEGRADED`, `DISCONNECTED`)',
                                                    '`POST /integrations/channels/:id/disconnect` (200 OK) -> Revokes '
                                                    'token and marks channel status `DISCONNECTED`'],
                            'title': 'Channel account health checks & disconnect flow',
                            'wave': 'W3',
                            'why': 'Alert merchants when Meta tokens expire and allow clean channel disconnection '
                                   'without orphaned webhooks.'},
                  'letter': '',
                  'read': [ 'docs/10_engineering/16_INTEGRATION_DESIGN/02-oauth-graph-client-ops.md',
                            'docs/10_engineering/13_API_DESIGN/04-integrations-ai-admin-catalog.md',
                            'docs/30_execution/32_FEATURE_SPECIFICATIONS.md'],
                  'title': 'Channel account health checks & disconnect flow'}],
    'parent_done': '**Health Status**: Reports token status accurately.',
    'size': 'M',
    'title': 'Channel account health checks & disconnect flow',
    'wave': 'W3'},
  { 'depends': ['T-INT-03'],
    'fs': ['FS-CONV-01'],
    'gold': { 'acceptance_test_scenarios': [ '[ ] **Priority Sort**: Returns conversations ordered by descending '
                                             '`lead_score`.',
                                             '[ ] **Needs Me View**: Filters to conversations requiring human action.',
                                             '[ ] **Cursor Pagination**: Correctly traverses large datasets using '
                                             'cursor tokens.',
                                             '[ ] **Test Isolation**: Excludes playground test conversations.'],
              'cmd': 'pnpm --filter api test -- src/conversations',
              'depends': ['T-INT-03'],
              'dont_modify_scope': ['apps/web/', 'apps/api/src/ai/'],
              'expected_deliverables': 'Conversations query controller, service, DTOs, and unit tests in '
                                       '`apps/api/src/conversations`.',
              'files': [ 'apps/api/src/conversations/threads/conversations.controller.ts',
                         'apps/api/src/conversations/threads/conversations.service.ts',
                         'apps/api/src/conversations/dto/list-conversations.dto.ts',
                         'apps/api/src/conversations/conversations.module.ts'],
              'fs': ['FS-CONV-01'],
              'human_contribution': [ '**🧪 Manual QA**: Call `GET /conversations?view=needs_me` in Swagger and verify '
                                      'priority order.',
                                      '**👁️ Review & Sign-off**: Verify database indexes support efficient cursor and '
                                      'tenant filtering.'],
              'id': 'T-CONV-01',
              'implementation_steps': [ '1. Define `ListConversationsDto` with Zod validation in shared and api.',
                                        '2. Implement `ConversationsService.listConversations()` with dynamic query '
                                        'builder and cursor pagination.',
                                        '3. Implement `ConversationsController` with '
                                        "`@RequirePermission('inbox.read')`.",
                                        '4. Author unit/integration tests covering views, filters, priority sorting, '
                                        'and cursor pagination.'],
              'modify_scope': [ 'apps/api/src/conversations/threads/conversations.controller.ts',
                                'apps/api/src/conversations/threads/conversations.service.ts',
                                'apps/api/src/conversations/dto/list-conversations.dto.ts',
                                'apps/api/src/conversations/conversations.module.ts',
                                'packages/shared/src/conversations/'],
              'objective_value': 'Implement conversations listing and query API supporting `needs_me` vs `all` views, '
                                 'priority sort, multi-attribute filters, and opaque cursor pagination.',
              'read': [ 'docs/10_engineering/13_API_DESIGN.md',
                        'docs/10_engineering/12_DATABASE_DESIGN.md',
                        'docs/30_execution/32_FEATURE_SPECIFICATIONS.md'],
              'security_invariants': [ '🔒 **Tenancy Boundary**: Query must filter by `business_id`.',
                                       '🛡️ **Playground Isolation**: Exclude `is_test = true` conversations by '
                                       'default.',
                                       '🚫 **Negative Invariants**: Never sort on the client; return strict '
                                       'server-ordered streams.'],
              'size': 'L',
              'technical_contract': [ '`GET /conversations` (200 OK)',
                                      "Query params: `view` ('needs_me' | 'all'), `sort` ('sales_priority' | "
                                      "'recent'), `channel`, `status`, `assigneeId`, `leadTemperature`, `cursor`, "
                                      '`limit`',
                                      'Response: `{ items: ConversationSummaryDto[], nextCursor?: string, totalUnread: '
                                      'number }`'],
              'title': 'Conversations lifecycle, filtering & cursor pagination API (`/conversations`)',
              'wave': 'W4',
              'why': 'Sales reps and managers need an organized inbox view that immediately surfaces high-intent leads '
                     'and conversations requiring urgent human response.'},
    'id': 'T-CONV-01',
    'leaves': [ { 'cmd': 'pnpm --filter api test -- src/conversations',
                  'do': [ '1. Define `ListConversationsDto` with Zod validation in shared and api.',
                          '2. Implement `ConversationsService.listConversations()` with dynamic query builder and '
                          'cursor pagination.',
                          "3. Implement `ConversationsController` with `@RequirePermission('inbox.read')`.",
                          '4. Author unit/integration tests covering views, filters, priority sorting, and cursor '
                          'pagination.'],
                  'done': '**Priority Sort**: Returns conversations ordered by descending `lead_score`.',
                  'dont': [ '🚫 **Negative Invariants**: Never sort on the client; return strict server-ordered '
                            'streams.'],
                  'files': [ 'apps/api/src/conversations/threads/conversations.controller.ts',
                             'apps/api/src/conversations/threads/conversations.service.ts',
                             'apps/api/src/conversations/dto/list-conversations.dto.ts',
                             'apps/api/src/conversations/conversations.module.ts'],
                  'gold': { 'acceptance_test_scenarios': [ '[ ] **Priority Sort**: Returns conversations ordered by '
                                                           'descending `lead_score`.',
                                                           '[ ] **Needs Me View**: Filters to conversations requiring '
                                                           'human action.',
                                                           '[ ] **Cursor Pagination**: Correctly traverses large '
                                                           'datasets using cursor tokens.',
                                                           '[ ] **Test Isolation**: Excludes playground test '
                                                           'conversations.'],
                            'cmd': 'pnpm --filter api test -- src/conversations',
                            'depends': ['T-INT-03'],
                            'dont_modify_scope': ['apps/web/', 'apps/api/src/ai/'],
                            'expected_deliverables': 'Conversations query controller, service, DTOs, and unit tests in '
                                                     '`apps/api/src/conversations`.',
                            'files': [ 'apps/api/src/conversations/threads/conversations.controller.ts',
                                       'apps/api/src/conversations/threads/conversations.service.ts',
                                       'apps/api/src/conversations/dto/list-conversations.dto.ts',
                                       'apps/api/src/conversations/conversations.module.ts'],
                            'fs': ['FS-CONV-01'],
                            'human_contribution': [ '**🧪 Manual QA**: Call `GET /conversations?view=needs_me` in '
                                                    'Swagger and verify priority order.',
                                                    '**👁️ Review & Sign-off**: Verify database indexes support '
                                                    'efficient cursor and tenant filtering.'],
                            'id': 'T-CONV-01',
                            'implementation_steps': [ '1. Define `ListConversationsDto` with Zod validation in shared '
                                                      'and api.',
                                                      '2. Implement `ConversationsService.listConversations()` with '
                                                      'dynamic query builder and cursor pagination.',
                                                      '3. Implement `ConversationsController` with '
                                                      "`@RequirePermission('inbox.read')`.",
                                                      '4. Author unit/integration tests covering views, filters, '
                                                      'priority sorting, and cursor pagination.'],
                            'modify_scope': [ 'apps/api/src/conversations/threads/conversations.controller.ts',
                                              'apps/api/src/conversations/threads/conversations.service.ts',
                                              'apps/api/src/conversations/dto/list-conversations.dto.ts',
                                              'apps/api/src/conversations/conversations.module.ts',
                                              'packages/shared/src/conversations/'],
                            'objective_value': 'Implement conversations listing and query API supporting `needs_me` vs '
                                               '`all` views, priority sort, multi-attribute filters, and opaque cursor '
                                               'pagination.',
                            'read': [ 'docs/10_engineering/13_API_DESIGN.md',
                                      'docs/10_engineering/12_DATABASE_DESIGN.md',
                                      'docs/30_execution/32_FEATURE_SPECIFICATIONS.md'],
                            'security_invariants': [ '🔒 **Tenancy Boundary**: Query must filter by `business_id`.',
                                                     '🛡️ **Playground Isolation**: Exclude `is_test = true` '
                                                     'conversations by default.',
                                                     '🚫 **Negative Invariants**: Never sort on the client; return '
                                                     'strict server-ordered streams.'],
                            'size': 'L',
                            'technical_contract': [ '`GET /conversations` (200 OK)',
                                                    "Query params: `view` ('needs_me' | 'all'), `sort` "
                                                    "('sales_priority' | 'recent'), `channel`, `status`, `assigneeId`, "
                                                    '`leadTemperature`, `cursor`, `limit`',
                                                    'Response: `{ items: ConversationSummaryDto[], nextCursor?: '
                                                    'string, totalUnread: number }`'],
                            'title': 'Conversations lifecycle, filtering & cursor pagination API (`/conversations`)',
                            'wave': 'W4',
                            'why': 'Sales reps and managers need an organized inbox view that immediately surfaces '
                                   'high-intent leads and conversations requiring urgent human response.'},
                  'letter': '',
                  'read': [ 'docs/10_engineering/13_API_DESIGN/02-auth-workspace-inbox.md',
                            'docs/10_engineering/12_DATABASE_DESIGN/03-customers-messaging-integrations.md',
                            'docs/30_execution/32_FEATURE_SPECIFICATIONS.md'],
                  'title': 'Conversations lifecycle, filtering & cursor pagination API (`/conversations`)'}],
    'parent_done': '**Priority Sort**: Returns conversations ordered by descending `lead_score`.',
    'size': 'L',
    'title': 'Conversations lifecycle, filtering & cursor pagination API (`/conversations`)',
    'wave': 'W4'},
  { 'depends': ['T-CONV-01'],
    'fs': ['FS-CONV-01'],
    'gold': { 'acceptance_test_scenarios': [ '[ ] **Send Human Message**: Sets implicit takeover and stops AI '
                                             'auto-turns.',
                                             '[ ] **Approve Draft**: Marks draft approved and enqueues to outbound '
                                             'worker.',
                                             '[ ] **Pending Order Guard (409)**: Resume and close return 409 when '
                                             'pending order is open.',
                                             '[ ] **Internal Notes**: Internal notes are saved without dispatching to '
                                             'customer.'],
              'cmd': 'pnpm --filter api test -- src/conversations',
              'depends': ['T-CONV-01'],
              'dont_modify_scope': ['apps/web/'],
              'expected_deliverables': 'Messages controller, thread actions service, and test suite in '
                                       '`apps/api/src/conversations`.',
              'files': [ 'apps/api/src/conversations/messages/messages.controller.ts',
                         'apps/api/src/conversations/messages/messages.service.ts',
                         'apps/api/src/conversations/threads/thread-actions.service.ts',
                         'apps/api/src/conversations/dto/send-message.dto.ts',
                         'apps/api/src/conversations/dto/create-internal-note.dto.ts'],
              'fs': ['FS-CONV-01'],
              'human_contribution': [ '**🧪 Manual QA & Smoke test**: Send human message in Swagger; verify `ai_enabled '
                                      '= false` in DB; test approving AI draft.',
                                      '**👁️ Review & Sign-off**: Verify `GET /messages` does not modify `read_at` '
                                      'timestamps.'],
              'id': 'T-CONV-02',
              'implementation_steps': [ '1. Implement `MessagesController` and `MessagesService` with pagination and '
                                        'read markers.',
                                        '2. Implement `ThreadActionsService` with all 10 action endpoints and state '
                                        'checks.',
                                        '3. Enforce 409 conflict checks on active unconfirmed orders.',
                                        '4. Author exhaustive unit tests for every action endpoint and error branch.'],
              'modify_scope': [ 'apps/api/src/conversations/messages.*',
                                'apps/api/src/conversations/thread-actions.*',
                                'apps/api/src/conversations/dto/*'],
              'objective_value': 'Implement complete conversation thread endpoints and human agent management actions '
                                 'suite.',
              'read': [ 'docs/10_engineering/13_API_DESIGN.md',
                        'docs/10_engineering/12_DATABASE_DESIGN.md',
                        'docs/30_execution/32_FEATURE_SPECIFICATIONS.md'],
              'security_invariants': [ '🔒 **Implicit Takeover**: When a human sends a message, `ai_enabled` is '
                                       'automatically set to false.',
                                       '🛡️ **Order Invariant (409)**: Reject resume or close with 409 Conflict if an '
                                       'unconfirmed order draft exists.',
                                       '🚫 **Negative Invariants**: Never mark conversations read on GET request.'],
              'size': 'XL',
              'technical_contract': [ '`GET /conversations/:id/messages` (200 OK) -> Paginated thread messages (GET '
                                      'does NOT mark read)',
                                      '`POST /conversations/:id/read` (200 OK) -> Explicit mark read endpoint',
                                      '`POST /conversations/:id/messages` (201 Created) -> Send human reply (sets '
                                      'implicit takeover, transitions to HUMAN_ACTIVE)',
                                      '`POST /messages/:id/approve` (200 OK) -> Approves AI draft message and enqueues '
                                      'to outbound delivery',
                                      '`POST /messages/:id/retry` (200 OK) -> Retries failed message send',
                                      '`POST /conversations/:id/takeover` (200 OK) -> Human takeover, sets `ai_enabled '
                                      '= false`',
                                      '`POST /conversations/:id/resume` (200 OK) -> Resumes AI (returns 409 if pending '
                                      'order exists)',
                                      '`POST /conversations/:id/assign` (200 OK) -> Assigns conversation to teammate',
                                      '`POST /conversations/:id/close` (200 OK) -> Closes conversation (returns 409 if '
                                      'pending order exists)',
                                      '`POST /conversations/:id/notes` (201 Created) -> Adds internal team note'],
              'title': 'Message thread, sending, actions (approve/retry/takeover/resume/assign/close/notes)',
              'wave': 'W4',
              'why': 'Provide sales reps with all controls required to review message history, send replies, approve '
                     'AI drafts, take over conversations, resume AI control, and collaborate via internal notes.'},
    'id': 'T-CONV-02',
    'leaves': [ { 'cmd': 'pnpm --filter api test -- src/conversations',
                  'do': [ '1. Implement `MessagesController` and `MessagesService` with pagination and read markers.',
                          '2. Implement `ThreadActionsService` with all 10 action endpoints and state checks.',
                          '3. Enforce 409 conflict checks on active unconfirmed orders.',
                          '4. Author exhaustive unit tests for every action endpoint and error branch.'],
                  'done': '**Send Human Message**: Sets implicit takeover and stops AI auto-turns.',
                  'dont': ['🚫 **Negative Invariants**: Never mark conversations read on GET request.'],
                  'files': [ 'apps/api/src/conversations/messages/messages.controller.ts',
                             'apps/api/src/conversations/messages/messages.service.ts',
                             'apps/api/src/conversations/threads/thread-actions.service.ts',
                             'apps/api/src/conversations/dto/send-message.dto.ts',
                             'apps/api/src/conversations/dto/create-internal-note.dto.ts'],
                  'gold': { 'acceptance_test_scenarios': [ '[ ] **Send Human Message**: Sets implicit takeover and '
                                                           'stops AI auto-turns.',
                                                           '[ ] **Approve Draft**: Marks draft approved and enqueues '
                                                           'to outbound worker.',
                                                           '[ ] **Pending Order Guard (409)**: Resume and close return '
                                                           '409 when pending order is open.',
                                                           '[ ] **Internal Notes**: Internal notes are saved without '
                                                           'dispatching to customer.'],
                            'cmd': 'pnpm --filter api test -- src/conversations',
                            'depends': ['T-CONV-01'],
                            'dont_modify_scope': ['apps/web/'],
                            'expected_deliverables': 'Messages controller, thread actions service, and test suite in '
                                                     '`apps/api/src/conversations`.',
                            'files': [ 'apps/api/src/conversations/messages/messages.controller.ts',
                                       'apps/api/src/conversations/messages/messages.service.ts',
                                       'apps/api/src/conversations/threads/thread-actions.service.ts',
                                       'apps/api/src/conversations/dto/send-message.dto.ts',
                                       'apps/api/src/conversations/dto/create-internal-note.dto.ts'],
                            'fs': ['FS-CONV-01'],
                            'human_contribution': [ '**🧪 Manual QA & Smoke test**: Send human message in Swagger; '
                                                    'verify `ai_enabled = false` in DB; test approving AI draft.',
                                                    '**👁️ Review & Sign-off**: Verify `GET /messages` does not modify '
                                                    '`read_at` timestamps.'],
                            'id': 'T-CONV-02',
                            'implementation_steps': [ '1. Implement `MessagesController` and `MessagesService` with '
                                                      'pagination and read markers.',
                                                      '2. Implement `ThreadActionsService` with all 10 action '
                                                      'endpoints and state checks.',
                                                      '3. Enforce 409 conflict checks on active unconfirmed orders.',
                                                      '4. Author exhaustive unit tests for every action endpoint and '
                                                      'error branch.'],
                            'modify_scope': [ 'apps/api/src/conversations/messages.*',
                                              'apps/api/src/conversations/thread-actions.*',
                                              'apps/api/src/conversations/dto/*'],
                            'objective_value': 'Implement complete conversation thread endpoints and human agent '
                                               'management actions suite.',
                            'read': [ 'docs/10_engineering/13_API_DESIGN.md',
                                      'docs/10_engineering/12_DATABASE_DESIGN.md',
                                      'docs/30_execution/32_FEATURE_SPECIFICATIONS.md'],
                            'security_invariants': [ '🔒 **Implicit Takeover**: When a human sends a message, '
                                                     '`ai_enabled` is automatically set to false.',
                                                     '🛡️ **Order Invariant (409)**: Reject resume or close with 409 '
                                                     'Conflict if an unconfirmed order draft exists.',
                                                     '🚫 **Negative Invariants**: Never mark conversations read on GET '
                                                     'request.'],
                            'size': 'XL',
                            'technical_contract': [ '`GET /conversations/:id/messages` (200 OK) -> Paginated thread '
                                                    'messages (GET does NOT mark read)',
                                                    '`POST /conversations/:id/read` (200 OK) -> Explicit mark read '
                                                    'endpoint',
                                                    '`POST /conversations/:id/messages` (201 Created) -> Send human '
                                                    'reply (sets implicit takeover, transitions to HUMAN_ACTIVE)',
                                                    '`POST /messages/:id/approve` (200 OK) -> Approves AI draft '
                                                    'message and enqueues to outbound delivery',
                                                    '`POST /messages/:id/retry` (200 OK) -> Retries failed message '
                                                    'send',
                                                    '`POST /conversations/:id/takeover` (200 OK) -> Human takeover, '
                                                    'sets `ai_enabled = false`',
                                                    '`POST /conversations/:id/resume` (200 OK) -> Resumes AI (returns '
                                                    '409 if pending order exists)',
                                                    '`POST /conversations/:id/assign` (200 OK) -> Assigns conversation '
                                                    'to teammate',
                                                    '`POST /conversations/:id/close` (200 OK) -> Closes conversation '
                                                    '(returns 409 if pending order exists)',
                                                    '`POST /conversations/:id/notes` (201 Created) -> Adds internal '
                                                    'team note'],
                            'title': 'Message thread, sending, actions '
                                     '(approve/retry/takeover/resume/assign/close/notes)',
                            'wave': 'W4',
                            'why': 'Provide sales reps with all controls required to review message history, send '
                                   'replies, approve AI drafts, take over conversations, resume AI control, and '
                                   'collaborate via internal notes.'},
                  'letter': '',
                  'read': [ 'docs/10_engineering/13_API_DESIGN/02-auth-workspace-inbox.md',
                            'docs/10_engineering/12_DATABASE_DESIGN/03-customers-messaging-integrations.md',
                            'docs/30_execution/32_FEATURE_SPECIFICATIONS.md'],
                  'title': 'Message thread, sending, actions (approve/retry/takeover/resume/assign/close/notes)'}],
    'parent_done': '**Send Human Message**: Sets implicit takeover and stops AI auto-turns.',
    'size': 'XL',
    'title': 'Message thread, sending, actions (approve/retry/takeover/resume/assign/close/notes)',
    'wave': 'W4'},
  { 'depends': ['T-CONV-02'],
    'fs': ['FS-CONV-01'],
    'gold': { 'acceptance_test_scenarios': [ '[ ] **Legal Transitions**: All valid state changes succeed and record '
                                             'status events.',
                                             '[ ] **Illegal Transitions (409)**: Illegal state changes throw 409 '
                                             'Conflict.',
                                             '[ ] **Audit Trail**: Every transition records actor (`AI`, `HUMAN`, '
                                             '`SYSTEM`) and reason.'],
              'cmd': 'pnpm --filter api test -- src/conversations',
              'depends': ['T-CONV-02'],
              'dont_modify_scope': ['apps/web/'],
              'expected_deliverables': 'State machine service and exhaustive test suite in '
                                       '`apps/api/src/conversations`.',
              'files': [ 'apps/api/src/conversations/state-machine/state-machine.service.ts',
                         'apps/api/src/conversations/state-machine/state-machine.spec.ts'],
              'fs': ['FS-CONV-01'],
              'human_contribution': [ '**🧪 Manual QA**: Test state machine transitions in Jest test runner.',
                                      '**👁️ Review & Sign-off**: Verify transition matrix matches '
                                      '`14_SYSTEM_DESIGN.md` §4.'],
              'id': 'T-CONV-03',
              'implementation_steps': [ '1. Define formal transition graph matrix in TypeScript.',
                                        '2. Implement `StateMachineService` with database event recording.',
                                        '3. Author exhaustive test matrix verifying every legal edge and every illegal '
                                        'edge.'],
              'modify_scope': ['apps/api/src/conversations/state-machine.*'],
              'objective_value': 'Implement formal conversation lifecycle state machine with legal transition '
                                 'validation matrix and audit logging.',
              'read': [ 'docs/10_engineering/14_SYSTEM_DESIGN.md',
                        'docs/10_engineering/12_DATABASE_DESIGN.md',
                        'docs/30_execution/32_FEATURE_SPECIFICATIONS.md'],
              'security_invariants': [ '🔒 **Strict Transition Matrix**: State changes can only occur through validated '
                                       'legal edges.',
                                       '🛡️ **Status Audit**: Every status change creates an immutable '
                                       '`conversation_status_events` row.'],
              'size': 'L',
              'technical_contract': [ 'States: `AI_ACTIVE`, `AI_DRAFTING`, `HUMAN_REQUIRED`, `HUMAN_ACTIVE`, '
                                      '`ORDER_PENDING`, `CLOSED`, `ARCHIVED`',
                                      '`StateMachineService.transition(conversationId, toState, actor, reason)`: '
                                      'Validates transition matrix, logs to `conversation_status_events`, updates '
                                      'conversation status.',
                                      'Illegal transitions throw `InvalidTransitionException` (HTTP 409 Conflict).'],
              'title': 'Conversation state machine & legal transitions engine',
              'wave': 'W4',
              'why': 'Prevent race conditions and illegal status transitions (e.g. AI responding in closed threads or '
                     'unrecorded takeovers) per `14_SYSTEM_DESIGN.md` §4.'},
    'id': 'T-CONV-03',
    'leaves': [ { 'cmd': 'pnpm --filter api test -- src/conversations',
                  'do': [ '1. Define formal transition graph matrix in TypeScript.',
                          '2. Implement `StateMachineService` with database event recording.',
                          '3. Author exhaustive test matrix verifying every legal edge and every illegal edge.'],
                  'done': '**Legal Transitions**: All valid state changes succeed and record status events.',
                  'dont': [],
                  'files': [ 'apps/api/src/conversations/state-machine/state-machine.service.ts',
                             'apps/api/src/conversations/state-machine/state-machine.spec.ts'],
                  'gold': { 'acceptance_test_scenarios': [ '[ ] **Legal Transitions**: All valid state changes succeed '
                                                           'and record status events.',
                                                           '[ ] **Illegal Transitions (409)**: Illegal state changes '
                                                           'throw 409 Conflict.',
                                                           '[ ] **Audit Trail**: Every transition records actor (`AI`, '
                                                           '`HUMAN`, `SYSTEM`) and reason.'],
                            'cmd': 'pnpm --filter api test -- src/conversations',
                            'depends': ['T-CONV-02'],
                            'dont_modify_scope': ['apps/web/'],
                            'expected_deliverables': 'State machine service and exhaustive test suite in '
                                                     '`apps/api/src/conversations`.',
                            'files': [ 'apps/api/src/conversations/state-machine/state-machine.service.ts',
                                       'apps/api/src/conversations/state-machine/state-machine.spec.ts'],
                            'fs': ['FS-CONV-01'],
                            'human_contribution': [ '**🧪 Manual QA**: Test state machine transitions in Jest test '
                                                    'runner.',
                                                    '**👁️ Review & Sign-off**: Verify transition matrix matches '
                                                    '`14_SYSTEM_DESIGN.md` §4.'],
                            'id': 'T-CONV-03',
                            'implementation_steps': [ '1. Define formal transition graph matrix in TypeScript.',
                                                      '2. Implement `StateMachineService` with database event '
                                                      'recording.',
                                                      '3. Author exhaustive test matrix verifying every legal edge and '
                                                      'every illegal edge.'],
                            'modify_scope': ['apps/api/src/conversations/state-machine.*'],
                            'objective_value': 'Implement formal conversation lifecycle state machine with legal '
                                               'transition validation matrix and audit logging.',
                            'read': [ 'docs/10_engineering/14_SYSTEM_DESIGN.md',
                                      'docs/10_engineering/12_DATABASE_DESIGN.md',
                                      'docs/30_execution/32_FEATURE_SPECIFICATIONS.md'],
                            'security_invariants': [ '🔒 **Strict Transition Matrix**: State changes can only occur '
                                                     'through validated legal edges.',
                                                     '🛡️ **Status Audit**: Every status change creates an immutable '
                                                     '`conversation_status_events` row.'],
                            'size': 'L',
                            'technical_contract': [ 'States: `AI_ACTIVE`, `AI_DRAFTING`, `HUMAN_REQUIRED`, '
                                                    '`HUMAN_ACTIVE`, `ORDER_PENDING`, `CLOSED`, `ARCHIVED`',
                                                    '`StateMachineService.transition(conversationId, toState, actor, '
                                                    'reason)`: Validates transition matrix, logs to '
                                                    '`conversation_status_events`, updates conversation status.',
                                                    'Illegal transitions throw `InvalidTransitionException` (HTTP 409 '
                                                    'Conflict).'],
                            'title': 'Conversation state machine & legal transitions engine',
                            'wave': 'W4',
                            'why': 'Prevent race conditions and illegal status transitions (e.g. AI responding in '
                                   'closed threads or unrecorded takeovers) per `14_SYSTEM_DESIGN.md` §4.'},
                  'letter': '',
                  'read': [ 'docs/10_engineering/14_SYSTEM_DESIGN/01-state-machine-message-pipeline.md',
                            'docs/10_engineering/12_DATABASE_DESIGN/03-customers-messaging-integrations.md',
                            'docs/30_execution/32_FEATURE_SPECIFICATIONS.md'],
                  'title': 'Conversation state machine & legal transitions engine'}],
    'parent_done': '**Legal Transitions**: All valid state changes succeed and record status events.',
    'size': 'L',
    'title': 'Conversation state machine & legal transitions engine',
    'wave': 'W4'},
  { 'depends': ['T-CONV-03'],
    'fs': ['FS-CONV-01'],
    'gold': { 'acceptance_test_scenarios': [ '[ ] **Concurrency Safety**: Concurrent executions on same conversation '
                                             'are serialized.',
                                             '[ ] **TTL Expiration**: Locks auto-expire safely if worker crashes.'],
              'cmd': 'pnpm --filter api test -- src/conversations',
              'depends': ['T-CONV-03'],
              'dont_modify_scope': ['apps/web/'],
              'expected_deliverables': 'Conversation lock service and concurrency tests in '
                                       '`apps/api/src/conversations`.',
              'files': [ 'apps/api/src/conversations/threads/conversation-lock.service.ts',
                         'apps/api/src/conversations/threads/conversation-lock.spec.ts'],
              'fs': ['FS-CONV-01'],
              'human_contribution': ['**🧪 Manual QA**: Run lock unit tests verifying lock acquisition and release.'],
              'id': 'T-CONV-04',
              'implementation_steps': [ '1. Implement Redis Redlock wrapper in `ConversationLockService`.',
                                        '2. Wrap turn executions in lock handler.',
                                        '3. Author concurrency tests verifying serialized execution under load.'],
              'modify_scope': ['apps/api/src/conversations/conversation-lock.*'],
              'objective_value': 'Implement Redis Redlock distributed locking to serialize message processing and '
                                 'prevent concurrent interleaved AI turns.',
              'read': ['docs/10_engineering/14_SYSTEM_DESIGN.md', 'docs/10_engineering/15_AI_ARCHITECTURE.md'],
              'security_invariants': [ '🔒 **Guaranteed Release**: Lock must be released in `finally` block even on '
                                       'unhandled exceptions.',
                                       '🛡️ **No Interleaving**: Concurrent requests wait or queue cleanly without '
                                       'duplicate AI turns.'],
              'size': 'M',
              'technical_contract': [ '`ConversationLockService.withLock(businessId, convId, handler)`',
                                      'Redis Key: `conv:lock:{business_id}:{conversation_id}` (TTL: 20 seconds with '
                                      'automatic renewal)'],
              'title': 'Redis distributed conversation lock for AI/human turns',
              'wave': 'W4',
              'why': 'Prevent two inbound customer messages sent in rapid succession from triggering parallel AI turns '
                     'that output contradictory or duplicate messages.'},
    'id': 'T-CONV-04',
    'leaves': [ { 'cmd': 'pnpm --filter api test -- src/conversations',
                  'do': [ '1. Implement Redis Redlock wrapper in `ConversationLockService`.',
                          '2. Wrap turn executions in lock handler.',
                          '3. Author concurrency tests verifying serialized execution under load.'],
                  'done': '**Concurrency Safety**: Concurrent executions on same conversation are serialized.',
                  'dont': [],
                  'files': [ 'apps/api/src/conversations/threads/conversation-lock.service.ts',
                             'apps/api/src/conversations/threads/conversation-lock.spec.ts'],
                  'gold': { 'acceptance_test_scenarios': [ '[ ] **Concurrency Safety**: Concurrent executions on same '
                                                           'conversation are serialized.',
                                                           '[ ] **TTL Expiration**: Locks auto-expire safely if worker '
                                                           'crashes.'],
                            'cmd': 'pnpm --filter api test -- src/conversations',
                            'depends': ['T-CONV-03'],
                            'dont_modify_scope': ['apps/web/'],
                            'expected_deliverables': 'Conversation lock service and concurrency tests in '
                                                     '`apps/api/src/conversations`.',
                            'files': [ 'apps/api/src/conversations/threads/conversation-lock.service.ts',
                                       'apps/api/src/conversations/threads/conversation-lock.spec.ts'],
                            'fs': ['FS-CONV-01'],
                            'human_contribution': [ '**🧪 Manual QA**: Run lock unit tests verifying lock acquisition '
                                                    'and release.'],
                            'id': 'T-CONV-04',
                            'implementation_steps': [ '1. Implement Redis Redlock wrapper in '
                                                      '`ConversationLockService`.',
                                                      '2. Wrap turn executions in lock handler.',
                                                      '3. Author concurrency tests verifying serialized execution '
                                                      'under load.'],
                            'modify_scope': ['apps/api/src/conversations/conversation-lock.*'],
                            'objective_value': 'Implement Redis Redlock distributed locking to serialize message '
                                               'processing and prevent concurrent interleaved AI turns.',
                            'read': [ 'docs/10_engineering/14_SYSTEM_DESIGN.md',
                                      'docs/10_engineering/15_AI_ARCHITECTURE.md'],
                            'security_invariants': [ '🔒 **Guaranteed Release**: Lock must be released in `finally` '
                                                     'block even on unhandled exceptions.',
                                                     '🛡️ **No Interleaving**: Concurrent requests wait or queue '
                                                     'cleanly without duplicate AI turns.'],
                            'size': 'M',
                            'technical_contract': [ '`ConversationLockService.withLock(businessId, convId, handler)`',
                                                    'Redis Key: `conv:lock:{business_id}:{conversation_id}` (TTL: 20 '
                                                    'seconds with automatic renewal)'],
                            'title': 'Redis distributed conversation lock for AI/human turns',
                            'wave': 'W4',
                            'why': 'Prevent two inbound customer messages sent in rapid succession from triggering '
                                   'parallel AI turns that output contradictory or duplicate messages.'},
                  'letter': '',
                  'read': [ 'docs/10_engineering/14_SYSTEM_DESIGN/02-locks-jobs-events-scoring.md',
                            'docs/10_engineering/14_SYSTEM_DESIGN/01-state-machine-message-pipeline.md',
                            'docs/30_execution/32_FEATURE_SPECIFICATIONS.md'],
                  'title': 'Redis distributed conversation lock for AI/human turns'}],
    'parent_done': '**Concurrency Safety**: Concurrent executions on same conversation are serialized.',
    'size': 'M',
    'title': 'Redis distributed conversation lock for AI/human turns',
    'wave': 'W4'},
  { 'depends': ['T-CONV-02'],
    'fs': ['FS-CONV-01'],
    'gold': { 'acceptance_test_scenarios': ['[ ] **Timeline Stream**: Returns chronological interleaved event items.'],
              'cmd': 'pnpm --filter api test -- src/conversations',
              'depends': ['T-CONV-02'],
              'dont_modify_scope': ['apps/web/'],
              'expected_deliverables': 'Timeline projection controller and service in `apps/api/src/conversations`.',
              'files': [ 'apps/api/src/conversations/timeline/timeline.controller.ts',
                         'apps/api/src/conversations/timeline/timeline.service.ts'],
              'fs': ['FS-CONV-01'],
              'human_contribution': [ '**🧪 Manual QA**: Call `GET /timeline` via Swagger and verify chronological '
                                      'sorting.'],
              'id': 'T-CONV-05',
              'implementation_steps': [ '1. Implement `TimelineService` querying messages, status events, and notes '
                                        'with common timestamp sort.',
                                        '2. Implement `TimelineController`.',
                                        '3. Author unit tests covering merged chronological projection.'],
              'modify_scope': ['apps/api/src/conversations/timeline.*'],
              'objective_value': 'Implement on-demand unified conversation activity timeline projection.',
              'read': ['docs/10_engineering/13_API_DESIGN.md', 'docs/10_engineering/12_DATABASE_DESIGN.md'],
              'security_invariants': [ '🚫 **Projection Only**: Compute projection dynamically from source tables; do '
                                       'NOT create a timeline database table.'],
              'size': 'S',
              'technical_contract': [ '`GET /conversations/:id/timeline` (200 OK) -> Merged chronological stream of '
                                      '`TimelineItem` (`MESSAGE`, `STATUS_CHANGE`, `HANDOFF`, `NOTE`, `ORDER`)'],
              'title': 'Conversation timeline projection API (`GET /conversations/:id/timeline`)',
              'wave': 'W4',
              'why': 'Provide merchant UI with a single chronological activity stream of messages, status transitions, '
                     'handoff events, and internal notes.'},
    'id': 'T-CONV-05',
    'leaves': [ { 'cmd': 'pnpm --filter api test -- src/conversations',
                  'do': [ '1. Implement `TimelineService` querying messages, status events, and notes with common '
                          'timestamp sort.',
                          '2. Implement `TimelineController`.',
                          '3. Author unit tests covering merged chronological projection.'],
                  'done': '**Timeline Stream**: Returns chronological interleaved event items.',
                  'dont': [ '🚫 **Projection Only**: Compute projection dynamically from source tables; do NOT create a '
                            'timeline database table.'],
                  'files': [ 'apps/api/src/conversations/timeline/timeline.controller.ts',
                             'apps/api/src/conversations/timeline/timeline.service.ts'],
                  'gold': { 'acceptance_test_scenarios': [ '[ ] **Timeline Stream**: Returns chronological interleaved '
                                                           'event items.'],
                            'cmd': 'pnpm --filter api test -- src/conversations',
                            'depends': ['T-CONV-02'],
                            'dont_modify_scope': ['apps/web/'],
                            'expected_deliverables': 'Timeline projection controller and service in '
                                                     '`apps/api/src/conversations`.',
                            'files': [ 'apps/api/src/conversations/timeline/timeline.controller.ts',
                                       'apps/api/src/conversations/timeline/timeline.service.ts'],
                            'fs': ['FS-CONV-01'],
                            'human_contribution': [ '**🧪 Manual QA**: Call `GET /timeline` via Swagger and verify '
                                                    'chronological sorting.'],
                            'id': 'T-CONV-05',
                            'implementation_steps': [ '1. Implement `TimelineService` querying messages, status '
                                                      'events, and notes with common timestamp sort.',
                                                      '2. Implement `TimelineController`.',
                                                      '3. Author unit tests covering merged chronological projection.'],
                            'modify_scope': ['apps/api/src/conversations/timeline.*'],
                            'objective_value': 'Implement on-demand unified conversation activity timeline projection.',
                            'read': [ 'docs/10_engineering/13_API_DESIGN.md',
                                      'docs/10_engineering/12_DATABASE_DESIGN.md'],
                            'security_invariants': [ '🚫 **Projection Only**: Compute projection dynamically from '
                                                     'source tables; do NOT create a timeline database table.'],
                            'size': 'S',
                            'technical_contract': [ '`GET /conversations/:id/timeline` (200 OK) -> Merged '
                                                    'chronological stream of `TimelineItem` (`MESSAGE`, '
                                                    '`STATUS_CHANGE`, `HANDOFF`, `NOTE`, `ORDER`)'],
                            'title': 'Conversation timeline projection API (`GET /conversations/:id/timeline`)',
                            'wave': 'W4',
                            'why': 'Provide merchant UI with a single chronological activity stream of messages, '
                                   'status transitions, handoff events, and internal notes.'},
                  'letter': '',
                  'read': [ 'docs/10_engineering/13_API_DESIGN/02-auth-workspace-inbox.md',
                            'docs/10_engineering/12_DATABASE_DESIGN/03-customers-messaging-integrations.md',
                            'docs/30_execution/32_FEATURE_SPECIFICATIONS.md'],
                  'title': 'Conversation timeline projection API (`GET /conversations/:id/timeline`)'}],
    'parent_done': '**Timeline Stream**: Returns chronological interleaved event items.',
    'size': 'S',
    'title': 'Conversation timeline projection API (`GET /conversations/:id/timeline`)',
    'wave': 'W4'},
  { 'depends': ['T-CONV-02', 'T-AUTH-02'],
    'fs': ['FS-CONV-01'],
    'gold': { 'acceptance_test_scenarios': [ '[ ] **Authenticated Connection**: Valid JWT establishes WebSocket '
                                             'connection.',
                                             '[ ] **Tenant Room**: Events broadcast strictly within tenant room.',
                                             '[ ] **Unauthenticated Reject (401)**: Invalid token rejects connection '
                                             'handshake.'],
              'cmd': 'pnpm --filter api test -- src/realtime',
              'depends': ['T-CONV-02', 'T-AUTH-02'],
              'dont_modify_scope': ['apps/web/'],
              'expected_deliverables': 'WebSocket gateway, realtime module, and tests in `apps/api/src/realtime`.',
              'files': [ 'apps/api/src/realtime/realtime.gateway.ts',
                         'apps/api/src/realtime/realtime.service.ts',
                         'apps/api/src/realtime/realtime.module.ts',
                         'packages/shared/src/realtime.ts'],
              'fs': ['FS-CONV-01'],
              'human_contribution': [ '**🧪 Manual QA & Smoke test**: Connect Socket.IO client with JWT and test '
                                      'receiving `message.new` event.',
                                      '**👁️ Review & Sign-off**: Verify no cross-tenant room subscriptions are '
                                      'possible.'],
              'id': 'T-CONV-06',
              'implementation_steps': [ '1. Implement `RealtimeGateway` with JWT authentication and room joining.',
                                        '2. Implement `RealtimeService` providing event dispatch helpers.',
                                        '3. Author unit tests covering authentication, room isolation, and event '
                                        'emission.'],
              'modify_scope': ['apps/api/src/realtime/', 'packages/shared/src/realtime.ts'],
              'objective_value': 'Implement Socket.IO WebSocket gateway with JWT handshake authentication, tenant room '
                                 'isolation, and live inbox event dispatchers.',
              'read': [ 'docs/10_engineering/13_API_DESIGN.md',
                        'docs/10_engineering/14_SYSTEM_DESIGN.md',
                        'docs/30_execution/32_FEATURE_SPECIFICATIONS.md'],
              'security_invariants': [ '🔒 **Tenant Isolation**: Sockets can only join rooms belonging to their '
                                       'authenticated `business_id`.',
                                       '🛡️ **REST Source of Truth**: WebSocket is strictly an event delivery channel; '
                                       'all state mutations occur via REST.'],
              'size': 'L',
              'technical_contract': [ 'Handshake: JWT token in auth payload -> Joins room `tenant:{business_id}` and '
                                      '`conv:{conversation_id}`',
                                      'Events Emitted: `message.new`, `message.updated`, '
                                      '`conversation.status_changed`, `conversation.assigned`, `lead.score_updated`'],
              'title': 'Realtime WebSocket gateway & rooms (Socket.IO)',
              'wave': 'W4',
              'why': 'Sales reps must receive live messages, typing indicators, AI drafts, and lead score updates in '
                     'real time without polling.'},
    'id': 'T-CONV-06',
    'leaves': [ { 'cmd': 'pnpm --filter api test -- src/realtime',
                  'do': [ '1. Implement `RealtimeGateway` with JWT authentication and room joining.',
                          '2. Implement `RealtimeService` providing event dispatch helpers.',
                          '3. Author unit tests covering authentication, room isolation, and event emission.'],
                  'done': '**Authenticated Connection**: Valid JWT establishes WebSocket connection.',
                  'dont': [],
                  'files': [ 'apps/api/src/realtime/realtime.gateway.ts',
                             'apps/api/src/realtime/realtime.service.ts',
                             'apps/api/src/realtime/realtime.module.ts',
                             'packages/shared/src/realtime.ts'],
                  'gold': { 'acceptance_test_scenarios': [ '[ ] **Authenticated Connection**: Valid JWT establishes '
                                                           'WebSocket connection.',
                                                           '[ ] **Tenant Room**: Events broadcast strictly within '
                                                           'tenant room.',
                                                           '[ ] **Unauthenticated Reject (401)**: Invalid token '
                                                           'rejects connection handshake.'],
                            'cmd': 'pnpm --filter api test -- src/realtime',
                            'depends': ['T-CONV-02', 'T-AUTH-02'],
                            'dont_modify_scope': ['apps/web/'],
                            'expected_deliverables': 'WebSocket gateway, realtime module, and tests in '
                                                     '`apps/api/src/realtime`.',
                            'files': [ 'apps/api/src/realtime/realtime.gateway.ts',
                                       'apps/api/src/realtime/realtime.service.ts',
                                       'apps/api/src/realtime/realtime.module.ts',
                                       'packages/shared/src/realtime.ts'],
                            'fs': ['FS-CONV-01'],
                            'human_contribution': [ '**🧪 Manual QA & Smoke test**: Connect Socket.IO client with JWT '
                                                    'and test receiving `message.new` event.',
                                                    '**👁️ Review & Sign-off**: Verify no cross-tenant room '
                                                    'subscriptions are possible.'],
                            'id': 'T-CONV-06',
                            'implementation_steps': [ '1. Implement `RealtimeGateway` with JWT authentication and room '
                                                      'joining.',
                                                      '2. Implement `RealtimeService` providing event dispatch '
                                                      'helpers.',
                                                      '3. Author unit tests covering authentication, room isolation, '
                                                      'and event emission.'],
                            'modify_scope': ['apps/api/src/realtime/', 'packages/shared/src/realtime.ts'],
                            'objective_value': 'Implement Socket.IO WebSocket gateway with JWT handshake '
                                               'authentication, tenant room isolation, and live inbox event '
                                               'dispatchers.',
                            'read': [ 'docs/10_engineering/13_API_DESIGN.md',
                                      'docs/10_engineering/14_SYSTEM_DESIGN.md',
                                      'docs/30_execution/32_FEATURE_SPECIFICATIONS.md'],
                            'security_invariants': [ '🔒 **Tenant Isolation**: Sockets can only join rooms belonging to '
                                                     'their authenticated `business_id`.',
                                                     '🛡️ **REST Source of Truth**: WebSocket is strictly an event '
                                                     'delivery channel; all state mutations occur via REST.'],
                            'size': 'L',
                            'technical_contract': [ 'Handshake: JWT token in auth payload -> Joins room '
                                                    '`tenant:{business_id}` and `conv:{conversation_id}`',
                                                    'Events Emitted: `message.new`, `message.updated`, '
                                                    '`conversation.status_changed`, `conversation.assigned`, '
                                                    '`lead.score_updated`'],
                            'title': 'Realtime WebSocket gateway & rooms (Socket.IO)',
                            'wave': 'W4',
                            'why': 'Sales reps must receive live messages, typing indicators, AI drafts, and lead '
                                   'score updates in real time without polling.'},
                  'letter': '',
                  'read': [ 'docs/10_engineering/13_API_DESIGN/05-realtime-platform-governance.md',
                            'docs/10_engineering/14_SYSTEM_DESIGN/02-locks-jobs-events-scoring.md',
                            'docs/30_execution/32_FEATURE_SPECIFICATIONS.md'],
                  'title': 'Realtime WebSocket gateway & rooms (Socket.IO)'}],
    'parent_done': '**Authenticated Connection**: Valid JWT establishes WebSocket connection.',
    'size': 'L',
    'title': 'Realtime WebSocket gateway & rooms (Socket.IO)',
    'wave': 'W4'},
  { 'depends': ['T-CONV-02'],
    'fs': ['FS-LEAD-01'],
    'gold': { 'acceptance_test_scenarios': [ '[ ] **Deterministic Score**: Verified factor inputs produce exact '
                                             'mathematical score.',
                                             '[ ] **Temperature Pill**: Ranges accurately map to HOT, WARM, and COLD.',
                                             '[ ] **Nightly Decay**: Inactive leads decay score by 10 points after '
                                             '24h.'],
              'cmd': 'pnpm --filter api test -- src/conversations',
              'depends': ['T-CONV-02'],
              'dont_modify_scope': ['apps/web/'],
              'expected_deliverables': 'Lead scoring service, decay processor, and tests in '
                                       '`apps/api/src/conversations`.',
              'files': [ 'apps/api/src/conversations/lead-scoring/lead-scoring.service.ts',
                         'apps/api/src/conversations/lead-scoring/lead-scoring.processor.ts',
                         'apps/api/src/conversations/lead-scoring/lead-scoring.spec.ts'],
              'fs': ['FS-LEAD-01'],
              'human_contribution': [ '**🧪 Manual QA**: Send customer messages with pricing and phone inquiries; '
                                      'verify lead score increases to 60+ (WARM/HOT).'],
              'id': 'T-LEAD-01',
              'implementation_steps': [ '1. Implement `LeadScoringService.computeScore()` with factor weights.',
                                        '2. Implement BullMQ nightly decay worker.',
                                        '3. Author unit tests covering scoring factors, temperature thresholds, and '
                                        'decay.'],
              'modify_scope': ['apps/api/src/conversations/lead-scoring.*'],
              'objective_value': 'Implement deterministic lead scoring formula (0–100 score + HOT/WARM/COLD '
                                 'temperature) and nightly decay worker.',
              'read': [ 'docs/10_engineering/14_SYSTEM_DESIGN.md',
                        'docs/10_engineering/12_DATABASE_DESIGN.md',
                        'docs/30_execution/32_FEATURE_SPECIFICATIONS.md'],
              'security_invariants': [ '🚫 **No LLM in Calculation**: Numeric score is computed 100% deterministically '
                                       'from verified intent signals, never hallucinated by LLM.'],
              'size': 'L',
              'technical_contract': [ 'Scoring Formula: Product inquiry (+15), Price question (+20), Phone shared '
                                      '(+25), Cart intent (+35), Negative sentiment (-20)',
                                      'Temperature: HOT (>= 70), WARM (40–69), COLD (< 40)',
                                      'Nightly Decay: -10 points after 24h of customer inactivity.'],
              'title': 'Deterministic lead scoring engine & priority calculation',
              'wave': 'W4',
              'why': 'Automatically prioritize conversations by purchase intent so sales reps focus on hot commercial '
                     'deals first.'},
    'id': 'T-LEAD-01',
    'leaves': [ { 'cmd': 'pnpm --filter api test -- src/conversations',
                  'do': [ '1. Implement `LeadScoringService.computeScore()` with factor weights.',
                          '2. Implement BullMQ nightly decay worker.',
                          '3. Author unit tests covering scoring factors, temperature thresholds, and decay.'],
                  'done': '**Deterministic Score**: Verified factor inputs produce exact mathematical score.',
                  'dont': [ '🚫 **No LLM in Calculation**: Numeric score is computed 100% deterministically from '
                            'verified intent signals, never hallucinated by LLM.'],
                  'files': [ 'apps/api/src/conversations/lead-scoring/lead-scoring.service.ts',
                             'apps/api/src/conversations/lead-scoring/lead-scoring.processor.ts',
                             'apps/api/src/conversations/lead-scoring/lead-scoring.spec.ts'],
                  'gold': { 'acceptance_test_scenarios': [ '[ ] **Deterministic Score**: Verified factor inputs '
                                                           'produce exact mathematical score.',
                                                           '[ ] **Temperature Pill**: Ranges accurately map to HOT, '
                                                           'WARM, and COLD.',
                                                           '[ ] **Nightly Decay**: Inactive leads decay score by 10 '
                                                           'points after 24h.'],
                            'cmd': 'pnpm --filter api test -- src/conversations',
                            'depends': ['T-CONV-02'],
                            'dont_modify_scope': ['apps/web/'],
                            'expected_deliverables': 'Lead scoring service, decay processor, and tests in '
                                                     '`apps/api/src/conversations`.',
                            'files': [ 'apps/api/src/conversations/lead-scoring/lead-scoring.service.ts',
                                       'apps/api/src/conversations/lead-scoring/lead-scoring.processor.ts',
                                       'apps/api/src/conversations/lead-scoring/lead-scoring.spec.ts'],
                            'fs': ['FS-LEAD-01'],
                            'human_contribution': [ '**🧪 Manual QA**: Send customer messages with pricing and phone '
                                                    'inquiries; verify lead score increases to 60+ (WARM/HOT).'],
                            'id': 'T-LEAD-01',
                            'implementation_steps': [ '1. Implement `LeadScoringService.computeScore()` with factor '
                                                      'weights.',
                                                      '2. Implement BullMQ nightly decay worker.',
                                                      '3. Author unit tests covering scoring factors, temperature '
                                                      'thresholds, and decay.'],
                            'modify_scope': ['apps/api/src/conversations/lead-scoring.*'],
                            'objective_value': 'Implement deterministic lead scoring formula (0–100 score + '
                                               'HOT/WARM/COLD temperature) and nightly decay worker.',
                            'read': [ 'docs/10_engineering/14_SYSTEM_DESIGN.md',
                                      'docs/10_engineering/12_DATABASE_DESIGN.md',
                                      'docs/30_execution/32_FEATURE_SPECIFICATIONS.md'],
                            'security_invariants': [ '🚫 **No LLM in Calculation**: Numeric score is computed 100% '
                                                     'deterministically from verified intent signals, never '
                                                     'hallucinated by LLM.'],
                            'size': 'L',
                            'technical_contract': [ 'Scoring Formula: Product inquiry (+15), Price question (+20), '
                                                    'Phone shared (+25), Cart intent (+35), Negative sentiment (-20)',
                                                    'Temperature: HOT (>= 70), WARM (40–69), COLD (< 40)',
                                                    'Nightly Decay: -10 points after 24h of customer inactivity.'],
                            'title': 'Deterministic lead scoring engine & priority calculation',
                            'wave': 'W4',
                            'why': 'Automatically prioritize conversations by purchase intent so sales reps focus on '
                                   'hot commercial deals first.'},
                  'letter': '',
                  'read': [ 'docs/10_engineering/14_SYSTEM_DESIGN/02-locks-jobs-events-scoring.md',
                            'docs/10_engineering/12_DATABASE_DESIGN/03-customers-messaging-integrations.md',
                            'docs/30_execution/32_FEATURE_SPECIFICATIONS.md'],
                  'title': 'Deterministic lead scoring engine & priority calculation'}],
    'parent_done': '**Deterministic Score**: Verified factor inputs produce exact mathematical score.',
    'size': 'L',
    'title': 'Deterministic lead scoring engine & priority calculation',
    'wave': 'W4'},
  { 'depends': ['T-KNOW-03', 'T-CAT-02', 'T-CONV-04'],
    'fs': ['FS-AI-01'],
    'gold': { 'acceptance_test_scenarios': [ '[ ] **Grounded Response**: Product inquiry returns verified catalog '
                                             'price and stock.',
                                             '[ ] **Tool Loop**: Orchestrator calls search and stock tools before '
                                             'outputting answer.',
                                             '[ ] **Token Recording**: Logs token counts and model ID in `ai_usage` '
                                             'table.'],
              'cmd': 'pnpm --filter api test -- src/ai',
              'depends': ['T-KNOW-03', 'T-CAT-02', 'T-CONV-04'],
              'dont_modify_scope': ['apps/web/'],
              'expected_deliverables': 'AI orchestrator service, tool definitions, prompt builder, and unit tests in '
                                       '`apps/api/src/ai`.',
              'files': [ 'apps/api/src/ai/orchestrator/orchestrator.service.ts',
                         'apps/api/src/ai/prompts/prompt-builder.service.ts',
                         'apps/api/src/ai/tools/catalog-search.tool.ts',
                         'apps/api/src/ai/tools/stock-check.tool.ts',
                         'apps/api/src/ai/tools/policy-lookup.tool.ts',
                         'apps/api/src/ai/ai.module.ts'],
              'fs': ['FS-AI-01'],
              'human_contribution': [ '**🔑 Environment variables**: Provide `AI_GATEWAY_API_KEY` in '
                                      '`.env`.',
              "**🧪 Manual QA & Smoke test**: Ask AI in Tunisian Derja ('9addeh el robe "
                                      "noire?'); verify grounded response with correct price and stock.",
                                      '**👁️ Review & Sign-off**: Verify zero tolerance for hallucinated prices or '
                                      'unverified discounts.'],
              'id': 'T-AI-01',
              'implementation_steps': [ '1. Implement `PromptBuilderService` assembling merchant tone, rules, RAG '
                                        'context, and history.',
                                        '2. Implement deterministic tools for catalog search, stock checking, and '
                                        'policy lookups.',
                                        '3. Implement `OrchestratorService` executing AI tool loop and saving '
                                        'generated response.',
                                        '4. Author unit/integration tests mocking AI provider and verifying tool call '
                                        'sequence.'],
              'modify_scope': [ 'apps/api/src/ai/orchestrator.*',
                                'apps/api/src/ai/prompt-builder.*',
                                'apps/api/src/ai/tools/',
                                'apps/api/src/ai/ai.module.ts'],
              'objective_value': 'Implement core AI Sales Agent turn orchestrator with Vercel AI SDK, tool loop agent, '
                                 'Tunisian Derja prompt engineering, and strict catalog grounding.',
              'read': [ 'docs/10_engineering/15_AI_ARCHITECTURE.md',
                        'docs/00_product/05_AI_BEHAVIOR_SPECIFICATION.md',
                        'docs/30_execution/32_FEATURE_SPECIFICATIONS.md'],
              'security_invariants': [ '🔒 **Zero Grounding Violation**: Agent must never invent prices, stock levels, '
                                       'or delivery fees not returned by tools.',
                                       '🛡️ **Token Logging**: Record prompt tokens, completion tokens, and latency in '
                                       '`ai_usage` table for every turn.'],
              'size': 'XL',
              'technical_contract': [ '`OrchestratorService.executeTurn(conversationId, inboundMessage)`',
                                      'Tools Provided: `searchCatalog({ query, category })`, `checkStock({ variantId '
                                      '})`, `getStorePolicy({ type })`, `requestHumanHandoff({ reason, briefing })`',
                                      'Model Pinned: Claude 3.5 Sonnet / GPT-4o with temperature 0.2'],
              'title': 'AI Sales Agent core orchestrator & tool execution pipeline',
              'wave': 'W5',
              'why': 'Deliver autonomous sales conversations that answer product inquiries, check stock, look up '
                     'policies, and guide shoppers toward purchase without hallucinations.'},
    'id': 'T-AI-01',
    'leaves': [ { 'cmd': 'pnpm --filter api test -- src/ai',
                  'do': [ '1. Implement `PromptBuilderService` assembling merchant tone, rules, RAG context, and '
                          'history.',
                          '2. Implement deterministic tools for catalog search, stock checking, and policy lookups.',
                          '3. Implement `OrchestratorService` executing AI tool loop and saving generated response.',
                          '4. Author unit/integration tests mocking AI provider and verifying tool call sequence.'],
                  'done': '**Grounded Response**: Product inquiry returns verified catalog price and stock.',
                  'dont': [],
                  'files': [ 'apps/api/src/ai/orchestrator/orchestrator.service.ts',
                             'apps/api/src/ai/prompts/prompt-builder.service.ts',
                             'apps/api/src/ai/tools/catalog-search.tool.ts',
                             'apps/api/src/ai/tools/stock-check.tool.ts',
                             'apps/api/src/ai/tools/policy-lookup.tool.ts',
                             'apps/api/src/ai/ai.module.ts'],
                  'gold': { 'acceptance_test_scenarios': [ '[ ] **Grounded Response**: Product inquiry returns '
                                                           'verified catalog price and stock.',
                                                           '[ ] **Tool Loop**: Orchestrator calls search and stock '
                                                           'tools before outputting answer.',
                                                           '[ ] **Token Recording**: Logs token counts and model ID in '
                                                           '`ai_usage` table.'],
                            'cmd': 'pnpm --filter api test -- src/ai',
                            'depends': ['T-KNOW-03', 'T-CAT-02', 'T-CONV-04'],
                            'dont_modify_scope': ['apps/web/'],
                            'expected_deliverables': 'AI orchestrator service, tool definitions, prompt builder, and '
                                                     'unit tests in `apps/api/src/ai`.',
                            'files': [ 'apps/api/src/ai/orchestrator/orchestrator.service.ts',
                                       'apps/api/src/ai/prompts/prompt-builder.service.ts',
                                       'apps/api/src/ai/tools/catalog-search.tool.ts',
                                       'apps/api/src/ai/tools/stock-check.tool.ts',
                                       'apps/api/src/ai/tools/policy-lookup.tool.ts',
                                       'apps/api/src/ai/ai.module.ts'],
                            'fs': ['FS-AI-01'],
                            'human_contribution': [ '**🔑 Environment variables**: Provide `AI_GATEWAY_API_KEY` in `.env`.',
                            "**🧪 Manual QA & Smoke test**: Ask AI in Tunisian Derja ('9addeh "
                                                    "el robe noire?'); verify grounded response with correct price and "
                                                    'stock.',
                                                    '**👁️ Review & Sign-off**: Verify zero tolerance for hallucinated '
                                                    'prices or unverified discounts.'],
                            'id': 'T-AI-01',
                            'implementation_steps': [ '1. Implement `PromptBuilderService` assembling merchant tone, '
                                                      'rules, RAG context, and history.',
                                                      '2. Implement deterministic tools for catalog search, stock '
                                                      'checking, and policy lookups.',
                                                      '3. Implement `OrchestratorService` executing AI tool loop and '
                                                      'saving generated response.',
                                                      '4. Author unit/integration tests mocking AI provider and '
                                                      'verifying tool call sequence.'],
                            'modify_scope': [ 'apps/api/src/ai/orchestrator.*',
                                              'apps/api/src/ai/prompt-builder.*',
                                              'apps/api/src/ai/tools/',
                                              'apps/api/src/ai/ai.module.ts'],
                            'objective_value': 'Implement core AI Sales Agent turn orchestrator with Vercel AI SDK, '
                                               'tool loop agent, Tunisian Derja prompt engineering, and strict catalog '
                                               'grounding.',
                            'read': [ 'docs/10_engineering/15_AI_ARCHITECTURE.md',
                                      'docs/00_product/05_AI_BEHAVIOR_SPECIFICATION.md',
                                      'docs/30_execution/32_FEATURE_SPECIFICATIONS.md'],
                            'security_invariants': [ '🔒 **Zero Grounding Violation**: Agent must never invent prices, '
                                                     'stock levels, or delivery fees not returned by tools.',
                                                     '🛡️ **Token Logging**: Record prompt tokens, completion tokens, '
                                                     'and latency in `ai_usage` table for every turn.'],
                            'size': 'XL',
                            'technical_contract': [ '`OrchestratorService.executeTurn(conversationId, inboundMessage)`',
                                                    'Tools Provided: `searchCatalog({ query, category })`, '
                                                    '`checkStock({ variantId })`, `getStorePolicy({ type })`, '
                                                    '`requestHumanHandoff({ reason, briefing })`',
                                                    'Model Pinned: Claude 3.5 Sonnet / GPT-4o with temperature 0.2'],
                            'title': 'AI Sales Agent core orchestrator & tool execution pipeline',
                            'wave': 'W5',
                            'why': 'Deliver autonomous sales conversations that answer product inquiries, check stock, '
                                   'look up policies, and guide shoppers toward purchase without hallucinations.'},
                  'letter': '',
                  'read': [ 'docs/10_engineering/15_AI_ARCHITECTURE/01-orchestrator-intent-tools.md',
                            'docs/00_product/05_AI_BEHAVIOR_SPECIFICATION/01-personality-language-pipeline.md',
                            'docs/30_execution/32_FEATURE_SPECIFICATIONS.md'],
                  'title': 'AI Sales Agent core orchestrator & tool execution pipeline'}],
    'parent_done': '**Grounded Response**: Product inquiry returns verified catalog price and stock.',
    'size': 'XL',
    'title': 'AI Sales Agent core orchestrator & tool execution pipeline',
    'wave': 'W5'},
  { 'depends': ['T-AI-01'],
    'fs': ['FS-AI-01'],
    'gold': { 'acceptance_test_scenarios': [ '[ ] **Discount Intercept**: Blocks unauthorized discount requests.',
                                             '[ ] **Refund Intercept**: Escalates refund inquiries to human agent.',
                                             '[ ] **Complaint Safety**: Suppresses product upselling during customer '
                                             'complaints.'],
              'cmd': 'pnpm --filter api test -- src/ai',
              'depends': ['T-AI-01'],
              'dont_modify_scope': ['apps/web/'],
              'expected_deliverables': 'Guardrails service and validation test suite in `apps/api/src/ai`.',
              'files': ['apps/api/src/ai/guardrails/guardrails.service.ts', 'apps/api/src/ai/guardrails/guardrails.spec.ts'],
              'fs': ['FS-AI-01'],
              'human_contribution': [ '**🧪 Manual QA**: Ask AI for 50% discount in test conversation; verify refusal '
                                      'and handoff.'],
              'id': 'T-AI-02',
              'implementation_steps': [ '1. Implement regex and semantic classification validators.',
                                        '2. Intercept proposed output in orchestrator pipeline.',
                                        '3. Author exhaustive test suite covering all commercial safety rules.'],
              'modify_scope': ['apps/api/src/ai/guardrails.*'],
              'objective_value': 'Implement pre/post-generation commercial guardrails intercepting unauthorized '
                                 'discounts, refund promises, false delivery guarantees, and complaint upselling.',
              'read': [ 'docs/00_product/05_AI_BEHAVIOR_SPECIFICATION.md',
                        'docs/00_product/06_AI_HUMAN_HANDOFF_RULES.md',
                        'docs/30_execution/32_FEATURE_SPECIFICATIONS.md'],
              'security_invariants': [ '🚫 **Forbidden Promises**: Zero tolerance for unauthorized discounts, refunds, '
                                       'or payment promises.'],
              'size': 'L',
              'technical_contract': [ '`GuardrailsService.validateProposedOutput(output, businessRules): '
                                      'GuardrailCheckResult`',
                                      'Violations trigger immediate suppression and escalate to '
                                      '`requestHumanHandoff`.'],
              'title': 'AI guardrails & commercial safety validators (discount, refund, promises)',
              'wave': 'W5',
              'why': 'Protect merchant liability and financial risk from unapproved LLM commercial promises.'},
    'id': 'T-AI-02',
    'leaves': [ { 'cmd': 'pnpm --filter api test -- src/ai',
                  'do': [ '1. Implement regex and semantic classification validators.',
                          '2. Intercept proposed output in orchestrator pipeline.',
                          '3. Author exhaustive test suite covering all commercial safety rules.'],
                  'done': '**Discount Intercept**: Blocks unauthorized discount requests.',
                  'dont': [ '🚫 **Forbidden Promises**: Zero tolerance for unauthorized discounts, refunds, or payment '
                            'promises.'],
                  'files': ['apps/api/src/ai/guardrails/guardrails.service.ts', 'apps/api/src/ai/guardrails/guardrails.spec.ts'],
                  'gold': { 'acceptance_test_scenarios': [ '[ ] **Discount Intercept**: Blocks unauthorized discount '
                                                           'requests.',
                                                           '[ ] **Refund Intercept**: Escalates refund inquiries to '
                                                           'human agent.',
                                                           '[ ] **Complaint Safety**: Suppresses product upselling '
                                                           'during customer complaints.'],
                            'cmd': 'pnpm --filter api test -- src/ai',
                            'depends': ['T-AI-01'],
                            'dont_modify_scope': ['apps/web/'],
                            'expected_deliverables': 'Guardrails service and validation test suite in '
                                                     '`apps/api/src/ai`.',
                            'files': ['apps/api/src/ai/guardrails/guardrails.service.ts', 'apps/api/src/ai/guardrails/guardrails.spec.ts'],
                            'fs': ['FS-AI-01'],
                            'human_contribution': [ '**🧪 Manual QA**: Ask AI for 50% discount in test conversation; '
                                                    'verify refusal and handoff.'],
                            'id': 'T-AI-02',
                            'implementation_steps': [ '1. Implement regex and semantic classification validators.',
                                                      '2. Intercept proposed output in orchestrator pipeline.',
                                                      '3. Author exhaustive test suite covering all commercial safety '
                                                      'rules.'],
                            'modify_scope': ['apps/api/src/ai/guardrails.*'],
                            'objective_value': 'Implement pre/post-generation commercial guardrails intercepting '
                                               'unauthorized discounts, refund promises, false delivery guarantees, '
                                               'and complaint upselling.',
                            'read': [ 'docs/00_product/05_AI_BEHAVIOR_SPECIFICATION.md',
                                      'docs/00_product/06_AI_HUMAN_HANDOFF_RULES.md',
                                      'docs/30_execution/32_FEATURE_SPECIFICATIONS.md'],
                            'security_invariants': [ '🚫 **Forbidden Promises**: Zero tolerance for unauthorized '
                                                     'discounts, refunds, or payment promises.'],
                            'size': 'L',
                            'technical_contract': [ '`GuardrailsService.validateProposedOutput(output, businessRules): '
                                                    'GuardrailCheckResult`',
                                                    'Violations trigger immediate suppression and escalate to '
                                                    '`requestHumanHandoff`.'],
                            'title': 'AI guardrails & commercial safety validators (discount, refund, promises)',
                            'wave': 'W5',
                            'why': 'Protect merchant liability and financial risk from unapproved LLM commercial '
                                   'promises.'},
                  'letter': '',
                  'read': [ 'docs/10_engineering/15_AI_ARCHITECTURE/01-orchestrator-intent-tools.md',
                            'docs/00_product/05_AI_BEHAVIOR_SPECIFICATION/03-runtime-safety-prompts.md',
                            'docs/30_execution/32_FEATURE_SPECIFICATIONS.md'],
                  'title': 'AI guardrails & commercial safety validators (discount, refund, promises)'}],
    'parent_done': '**Discount Intercept**: Blocks unauthorized discount requests.',
    'size': 'L',
    'title': 'AI guardrails & commercial safety validators (discount, refund, promises)',
    'wave': 'W5'},
  { 'depends': ['T-AI-01'],
    'fs': ['FS-AI-01'],
    'gold': { 'acceptance_test_scenarios': [ '[ ] **Traceable Message**: AI messages store exact `prompt_version_id` '
                                             'in database.'],
              'cmd': 'pnpm --filter api test -- src/ai',
              'depends': ['T-AI-01'],
              'dont_modify_scope': ['apps/web/'],
              'expected_deliverables': 'Prompt versioning service and controller in `apps/api/src/ai`.',
              'files': ['apps/api/src/ai/prompts/prompt-versions.service.ts', 'apps/api/src/ai/prompts/prompt-versions.controller.ts'],
              'fs': ['FS-AI-01'],
              'human_contribution': [ '**🧪 Manual QA**: Update prompt template; send message; check DB '
                                      '`messages.prompt_version_id`.'],
              'id': 'T-AI-03',
              'implementation_steps': [ '1. Implement `PromptVersionsService` inserting versioned rows.',
                                        '2. Attach `prompt_version_id` during message creation.',
                                        '3. Author unit tests covering prompt versioning and linking.'],
              'modify_scope': ['apps/api/src/ai/prompt-versions.*'],
              'objective_value': 'Implement immutable prompt versioning and link every generated AI message to the '
                                 'exact prompt version ID used.',
              'read': ['docs/10_engineering/15_AI_ARCHITECTURE.md', 'docs/10_engineering/12_DATABASE_DESIGN.md'],
              'security_invariants': ['🔒 **Immutability**: Never overwrite prompt rows in place.'],
              'size': 'M',
              'technical_contract': [ '`POST /ai/prompts` (201 Created) -> Creates new immutable prompt version',
                                      '`messages.prompt_version_id` foreign key stored on every generated message.'],
              'title': 'AI prompt versions management & audit linking',
              'wave': 'W5',
              'why': 'Maintain full auditability of historical AI outputs for prompt regression analysis.'},
    'id': 'T-AI-03',
    'leaves': [ { 'cmd': 'pnpm --filter api test -- src/ai',
                  'do': [ '1. Implement `PromptVersionsService` inserting versioned rows.',
                          '2. Attach `prompt_version_id` during message creation.',
                          '3. Author unit tests covering prompt versioning and linking.'],
                  'done': '**Traceable Message**: AI messages store exact `prompt_version_id` in database.',
                  'dont': [],
                  'files': [ 'apps/api/src/ai/prompts/prompt-versions.service.ts',
                             'apps/api/src/ai/prompts/prompt-versions.controller.ts'],
                  'gold': { 'acceptance_test_scenarios': [ '[ ] **Traceable Message**: AI messages store exact '
                                                           '`prompt_version_id` in database.'],
                            'cmd': 'pnpm --filter api test -- src/ai',
                            'depends': ['T-AI-01'],
                            'dont_modify_scope': ['apps/web/'],
                            'expected_deliverables': 'Prompt versioning service and controller in `apps/api/src/ai`.',
                            'files': [ 'apps/api/src/ai/prompts/prompt-versions.service.ts',
                                       'apps/api/src/ai/prompts/prompt-versions.controller.ts'],
                            'fs': ['FS-AI-01'],
                            'human_contribution': [ '**🧪 Manual QA**: Update prompt template; send message; check DB '
                                                    '`messages.prompt_version_id`.'],
                            'id': 'T-AI-03',
                            'implementation_steps': [ '1. Implement `PromptVersionsService` inserting versioned rows.',
                                                      '2. Attach `prompt_version_id` during message creation.',
                                                      '3. Author unit tests covering prompt versioning and linking.'],
                            'modify_scope': ['apps/api/src/ai/prompt-versions.*'],
                            'objective_value': 'Implement immutable prompt versioning and link every generated AI '
                                               'message to the exact prompt version ID used.',
                            'read': [ 'docs/10_engineering/15_AI_ARCHITECTURE.md',
                                      'docs/10_engineering/12_DATABASE_DESIGN.md'],
                            'security_invariants': ['🔒 **Immutability**: Never overwrite prompt rows in place.'],
                            'size': 'M',
                            'technical_contract': [ '`POST /ai/prompts` (201 Created) -> Creates new immutable prompt '
                                                    'version',
                                                    '`messages.prompt_version_id` foreign key stored on every '
                                                    'generated message.'],
                            'title': 'AI prompt versions management & audit linking',
                            'wave': 'W5',
                            'why': 'Maintain full auditability of historical AI outputs for prompt regression '
                                   'analysis.'},
                  'letter': '',
                  'read': [ 'docs/10_engineering/15_AI_ARCHITECTURE/02-rag-prompts-evaluation.md',
                            'docs/00_product/05_AI_BEHAVIOR_SPECIFICATION/03-runtime-safety-prompts.md',
                            'docs/30_execution/32_FEATURE_SPECIFICATIONS.md'],
                  'title': 'AI prompt versions management & audit linking'}],
    'parent_done': '**Traceable Message**: AI messages store exact `prompt_version_id` in database.',
    'size': 'M',
    'title': 'AI prompt versions management & audit linking',
    'wave': 'W5'},
  { 'depends': ['T-AI-01', 'T-AI-10'],
    'fs': ['FS-AI-01'],
    'gold': { 'acceptance_test_scenarios': [ '[ ] **Approval Required**: Creates draft message requiring human '
                                             'approval.',
                                             '[ ] **Auto Send**: Dispatches message directly to outbound queue.',
                                             '[ ] **Low Confidence**: Automatically downgrades auto-send to draft on '
                                             'low confidence.'],
              'cmd': 'pnpm --filter api test -- src/ai',
              'depends': ['T-AI-01', 'T-AI-10'],
              'dont_modify_scope': ['apps/web/'],
              'expected_deliverables': 'Reply mode service and tests in `apps/api/src/ai`.',
              'files': ['apps/api/src/ai/reply-mode/reply-mode.service.ts', 'apps/api/src/ai/reply-mode/reply-mode.spec.ts'],
              'fs': ['FS-AI-01'],
              'human_contribution': ['**🧪 Manual QA**: Test both approval_required and auto_send modes in Swagger.'],
              'id': 'T-AI-04',
              'implementation_steps': [ '1. Implement `ReplyModeService` branching logic.',
                                        '2. Enforce confidence threshold fallback.',
                                        '3. Author unit tests covering all 3 modes and low-confidence fallback.'],
              'modify_scope': ['apps/api/src/ai/reply-mode.*'],
              'objective_value': 'Implement AI reply mode dispatcher (`APPROVAL_REQUIRED`, `AUTO_SEND`, `DRAFT_ONLY`) '
                                 'with confidence-based safety downgrades.',
              'read': [ 'docs/00_product/05_AI_BEHAVIOR_SPECIFICATION.md',
                        'docs/10_engineering/15_AI_ARCHITECTURE.md',
                        'docs/30_execution/32_FEATURE_SPECIFICATIONS.md'],
              'security_invariants': [ '🛡️ **Default Draft**: Default reply mode for newly created stores is strictly '
                                       '`APPROVAL_REQUIRED`.'],
              'size': 'L',
              'technical_contract': [ "`APPROVAL_REQUIRED`: Saves message with `status = 'DRAFT'`, emits `message.new` "
                                      'to inbox.',
                                      "`AUTO_SEND`: Saves message with `status = 'SENT'`, enqueues to outbound "
                                      'delivery queue.',
                                      'Confidence Fallback: If AI confidence < threshold, downgrade `AUTO_SEND` to '
                                      '`APPROVAL_REQUIRED`.'],
              'title': 'AI reply modes engine (approval_required, auto_send, draft_only)',
              'wave': 'W5',
              'why': 'Allow merchants to review AI messages as drafts while onboarding, then switch to automated '
                     'sending when confident.'},
    'id': 'T-AI-04',
    'leaves': [ { 'cmd': 'pnpm --filter api test -- src/ai',
                  'do': [ '1. Implement `ReplyModeService` branching logic.',
                          '2. Enforce confidence threshold fallback.',
                          '3. Author unit tests covering all 3 modes and low-confidence fallback.'],
                  'done': '**Approval Required**: Creates draft message requiring human approval.',
                  'dont': [],
                  'files': ['apps/api/src/ai/reply-mode/reply-mode.service.ts', 'apps/api/src/ai/reply-mode/reply-mode.spec.ts'],
                  'gold': { 'acceptance_test_scenarios': [ '[ ] **Approval Required**: Creates draft message requiring '
                                                           'human approval.',
                                                           '[ ] **Auto Send**: Dispatches message directly to outbound '
                                                           'queue.',
                                                           '[ ] **Low Confidence**: Automatically downgrades auto-send '
                                                           'to draft on low confidence.'],
                            'cmd': 'pnpm --filter api test -- src/ai',
                            'depends': ['T-AI-01', 'T-AI-10'],
                            'dont_modify_scope': ['apps/web/'],
                            'expected_deliverables': 'Reply mode service and tests in `apps/api/src/ai`.',
                            'files': ['apps/api/src/ai/reply-mode/reply-mode.service.ts', 'apps/api/src/ai/reply-mode/reply-mode.spec.ts'],
                            'fs': ['FS-AI-01'],
                            'human_contribution': [ '**🧪 Manual QA**: Test both approval_required and auto_send modes '
                                                    'in Swagger.'],
                            'id': 'T-AI-04',
                            'implementation_steps': [ '1. Implement `ReplyModeService` branching logic.',
                                                      '2. Enforce confidence threshold fallback.',
                                                      '3. Author unit tests covering all 3 modes and low-confidence '
                                                      'fallback.'],
                            'modify_scope': ['apps/api/src/ai/reply-mode.*'],
                            'objective_value': 'Implement AI reply mode dispatcher (`APPROVAL_REQUIRED`, `AUTO_SEND`, '
                                               '`DRAFT_ONLY`) with confidence-based safety downgrades.',
                            'read': [ 'docs/00_product/05_AI_BEHAVIOR_SPECIFICATION.md',
                                      'docs/10_engineering/15_AI_ARCHITECTURE.md',
                                      'docs/30_execution/32_FEATURE_SPECIFICATIONS.md'],
                            'security_invariants': [ '🛡️ **Default Draft**: Default reply mode for newly created '
                                                     'stores is strictly `APPROVAL_REQUIRED`.'],
                            'size': 'L',
                            'technical_contract': [ "`APPROVAL_REQUIRED`: Saves message with `status = 'DRAFT'`, emits "
                                                    '`message.new` to inbox.',
                                                    "`AUTO_SEND`: Saves message with `status = 'SENT'`, enqueues to "
                                                    'outbound delivery queue.',
                                                    'Confidence Fallback: If AI confidence < threshold, downgrade '
                                                    '`AUTO_SEND` to `APPROVAL_REQUIRED`.'],
                            'title': 'AI reply modes engine (approval_required, auto_send, draft_only)',
                            'wave': 'W5',
                            'why': 'Allow merchants to review AI messages as drafts while onboarding, then switch to '
                                   'automated sending when confident.'},
                  'letter': '',
                  'read': [ 'docs/10_engineering/14_SYSTEM_DESIGN/01-state-machine-message-pipeline.md',
                            'docs/00_product/05_AI_BEHAVIOR_SPECIFICATION/03-runtime-safety-prompts.md',
                            'docs/30_execution/32_FEATURE_SPECIFICATIONS.md'],
                  'title': 'AI reply modes engine (approval_required, auto_send, draft_only)'}],
    'parent_done': '**Approval Required**: Creates draft message requiring human approval.',
    'size': 'L',
    'title': 'AI reply modes engine (approval_required, auto_send, draft_only)',
    'wave': 'W5'},
  { 'depends': ['T-AI-01'],
    'fs': ['FS-AI-01'],
    'gold': { 'acceptance_test_scenarios': [ '[ ] **Failover**: Switches to backup model on 5xx or rate limit.',
                                             '[ ] **Total Outage**: Triggers handoff with reason MODEL_OUTAGE on total '
                                             'failure.'],
              'cmd': 'pnpm --filter api test -- src/ai',
              'depends': ['T-AI-01'],
              'dont_modify_scope': ['apps/web/'],
              'expected_deliverables': 'Model fallback service in `apps/api/src/ai`.',
              'files': ['apps/api/src/ai/gateway/model-fallback.service.ts'],
              'fs': ['FS-AI-01'],
              'human_contribution': ['**🧪 Manual QA**: Simulate model error and verify automatic fallback.'],
              'id': 'T-AI-05',
              'implementation_steps': [ '1. Implement fallback retry chain with timeout handling.',
                                        '2. Escalate to human handoff if all models fail.',
                                        '3. Author unit tests verifying failover sequence.'],
              'modify_scope': ['apps/api/src/ai/model-fallback.*'],
              'objective_value': 'Implement multi-provider LLM fallback chain and outage escalation.',
              'read': ['docs/10_engineering/15_AI_ARCHITECTURE.md', 'docs/00_product/03_MVP_SCOPE.md'],
              'security_invariants': [ '🚫 **Never Send Degraded**: Never send raw error messages or partial text to '
                                       'customers.'],
              'size': 'M',
              'technical_contract': [ 'Chain: Primary Model (Claude 3.5 Sonnet) -> Secondary Model (GPT-4o) -> '
                                      'Fallback (GPT-4o-mini) -> Handoff (`MODEL_OUTAGE`)'],
              'title': 'LLM fallback routing & graceful degradation handler',
              'wave': 'W5',
              'why': 'Ensure platform continuous uptime even during third-party AI provider outages per NFR-REL-07.'},
    'id': 'T-AI-05',
    'leaves': [ { 'cmd': 'pnpm --filter api test -- src/ai',
                  'do': [ '1. Implement fallback retry chain with timeout handling.',
                          '2. Escalate to human handoff if all models fail.',
                          '3. Author unit tests verifying failover sequence.'],
                  'done': '**Failover**: Switches to backup model on 5xx or rate limit.',
                  'dont': ['🚫 **Never Send Degraded**: Never send raw error messages or partial text to customers.'],
                  'files': ['apps/api/src/ai/gateway/model-fallback.service.ts'],
                  'gold': { 'acceptance_test_scenarios': [ '[ ] **Failover**: Switches to backup model on 5xx or rate '
                                                           'limit.',
                                                           '[ ] **Total Outage**: Triggers handoff with reason '
                                                           'MODEL_OUTAGE on total failure.'],
                            'cmd': 'pnpm --filter api test -- src/ai',
                            'depends': ['T-AI-01'],
                            'dont_modify_scope': ['apps/web/'],
                            'expected_deliverables': 'Model fallback service in `apps/api/src/ai`.',
                            'files': ['apps/api/src/ai/gateway/model-fallback.service.ts'],
                            'fs': ['FS-AI-01'],
                            'human_contribution': [ '**🧪 Manual QA**: Simulate model error and verify automatic '
                                                    'fallback.'],
                            'id': 'T-AI-05',
                            'implementation_steps': [ '1. Implement fallback retry chain with timeout handling.',
                                                      '2. Escalate to human handoff if all models fail.',
                                                      '3. Author unit tests verifying failover sequence.'],
                            'modify_scope': ['apps/api/src/ai/model-fallback.*'],
                            'objective_value': 'Implement multi-provider LLM fallback chain and outage escalation.',
                            'read': ['docs/10_engineering/15_AI_ARCHITECTURE.md', 'docs/00_product/03_MVP_SCOPE.md'],
                            'security_invariants': [ '🚫 **Never Send Degraded**: Never send raw error messages or '
                                                     'partial text to customers.'],
                            'size': 'M',
                            'technical_contract': [ 'Chain: Primary Model (Claude 3.5 Sonnet) -> Secondary Model '
                                                    '(GPT-4o) -> Fallback (GPT-4o-mini) -> Handoff (`MODEL_OUTAGE`)'],
                            'title': 'LLM fallback routing & graceful degradation handler',
                            'wave': 'W5',
                            'why': 'Ensure platform continuous uptime even during third-party AI provider outages per '
                                   'NFR-REL-07.'},
                  'letter': '',
                  'read': [ 'docs/10_engineering/11_TECH_STACK/03-llm-routing-models.md',
                            'docs/10_engineering/15_AI_ARCHITECTURE/02-rag-prompts-evaluation.md',
                            'docs/30_execution/32_FEATURE_SPECIFICATIONS.md'],
                  'title': 'LLM fallback routing & graceful degradation handler'}],
    'parent_done': '**Failover**: Switches to backup model on 5xx or rate limit.',
    'size': 'M',
    'title': 'LLM fallback routing & graceful degradation handler',
    'wave': 'W5'},
  { 'depends': ['T-AI-01'],
    'fs': ['FS-HAND-01'],
    'gold': { 'acceptance_test_scenarios': [ '[ ] **15 Triggers**: Every one of the 15 triggers reliably initiates '
                                             'handoff.',
                                             '[ ] **AI Paused**: Sets `ai_enabled = false` and status = '
                                             '`HUMAN_REQUIRED`.',
                                             '[ ] **Briefing Generated**: Inserts structured briefing note in '
                                             'conversation.'],
              'cmd': 'pnpm --filter api test -- src/ai',
              'depends': ['T-AI-01'],
              'dont_modify_scope': ['apps/web/'],
              'expected_deliverables': 'Handoff service, briefing generator, and 15-trigger test suite in '
                                       '`apps/api/src/ai`.',
              'files': [ 'apps/api/src/ai/handoff/handoff.service.ts',
                         'apps/api/src/ai/handoff/briefing-generator.service.ts',
                         'apps/api/src/ai/handoff/handoff.spec.ts',
                         'packages/shared/src/handoff.ts'],
              'fs': ['FS-HAND-01'],
              'human_contribution': [ "**🧪 Manual QA & Smoke test**: Send test message 'n7eb n7ki m3a agent'; verify "
                                      'AI pauses and briefing note appears in conversation.',
                                      '**👁️ Review & Sign-off**: Verify all 15 triggers from '
                                      '`06_AI_HUMAN_HANDOFF_RULES.md` are covered.'],
              'id': 'T-HAND-01',
              'implementation_steps': [ '1. Define the 15 trigger enum and briefing schema in shared.',
                                        '2. Implement `HandoffService` evaluating message and conversation state.',
                                        '3. Implement `BriefingGeneratorService` summarizing customer intent and cart.',
                                        '4. Author exhaustive unit tests verifying detection of all 15 triggers.'],
              'modify_scope': [ 'apps/api/src/ai/handoff.*',
                                'apps/api/src/ai/briefing-generator.*',
                                'packages/shared/src/handoff.ts'],
              'objective_value': 'Implement detection for all 15 canonical `HUMAN_REQUIRED` triggers from '
                                 '`06_AI_HUMAN_HANDOFF_RULES.md` and automated AI context briefing generation.',
              'read': [ 'docs/00_product/06_AI_HUMAN_HANDOFF_RULES.md',
                        'docs/10_engineering/15_AI_ARCHITECTURE.md',
                        'docs/30_execution/32_FEATURE_SPECIFICATIONS.md'],
              'security_invariants': [ '🔒 **Complete Coverage**: All 15 triggers must be implemented with explicit '
                                       'unit tests.',
                                       '🛡️ **Immediate Pause**: AI turns must immediately halt once a handoff trigger '
                                       'fires.'],
              'size': 'XL',
              'technical_contract': [ 'Triggers (15): `EXPLICIT_HUMAN_REQUEST`, `COMPLEX_NEGOTIATION`, '
                                      '`COMPLAINT_OR_DISPUTE`, `RETURN_OR_REFUND`, `CUSTOM_MODIFICATION`, '
                                      '`BULK_ORDER`, `REPEATED_CONFUSION`, `LOW_CONFIDENCE`, `PAYMENT_FAILURE`, '
                                      '`STOCK_OUTAGE`, `OUT_OF_SCOPE`, `SENSITIVE_TOPIC`, `POLICY_CONFLICT`, '
                                      '`HIGH_VALUE_LEAD`, `MANUAL_OVERRIDE`',
                                      'Action: Sets `conversation.ai_enabled = false`, status = `HUMAN_REQUIRED`, '
                                      'inserts briefing system note, emits `conversation.handoff_triggered` event.'],
              'title': 'AI-to-Human handoff triggers engine (all 15 triggers) & briefing generator',
              'wave': 'W5',
              'why': 'Seamless handoff to human agents is the core differentiator of the platform, ensuring shoppers '
                     'never get stuck with unhelpful AI.'},
    'id': 'T-HAND-01',
    'leaves': [ { 'cmd': 'pnpm --filter api test -- src/ai',
                  'do': [ '1. Define the 15 trigger enum and briefing schema in shared.',
                          '2. Implement `HandoffService` evaluating message and conversation state.',
                          '3. Implement `BriefingGeneratorService` summarizing customer intent and cart.',
                          '4. Author exhaustive unit tests verifying detection of all 15 triggers.'],
                  'done': '**15 Triggers**: Every one of the 15 triggers reliably initiates handoff.',
                  'dont': [],
                  'files': [ 'apps/api/src/ai/handoff/handoff.service.ts',
                             'apps/api/src/ai/handoff/briefing-generator.service.ts',
                             'apps/api/src/ai/handoff/handoff.spec.ts',
                             'packages/shared/src/handoff.ts'],
                  'gold': { 'acceptance_test_scenarios': [ '[ ] **15 Triggers**: Every one of the 15 triggers reliably '
                                                           'initiates handoff.',
                                                           '[ ] **AI Paused**: Sets `ai_enabled = false` and status = '
                                                           '`HUMAN_REQUIRED`.',
                                                           '[ ] **Briefing Generated**: Inserts structured briefing '
                                                           'note in conversation.'],
                            'cmd': 'pnpm --filter api test -- src/ai',
                            'depends': ['T-AI-01'],
                            'dont_modify_scope': ['apps/web/'],
                            'expected_deliverables': 'Handoff service, briefing generator, and 15-trigger test suite '
                                                     'in `apps/api/src/ai`.',
                            'files': [ 'apps/api/src/ai/handoff/handoff.service.ts',
                                       'apps/api/src/ai/handoff/briefing-generator.service.ts',
                                       'apps/api/src/ai/handoff/handoff.spec.ts',
                                       'packages/shared/src/handoff.ts'],
                            'fs': ['FS-HAND-01'],
                            'human_contribution': [ "**🧪 Manual QA & Smoke test**: Send test message 'n7eb n7ki m3a "
                                                    "agent'; verify AI pauses and briefing note appears in "
                                                    'conversation.',
                                                    '**👁️ Review & Sign-off**: Verify all 15 triggers from '
                                                    '`06_AI_HUMAN_HANDOFF_RULES.md` are covered.'],
                            'id': 'T-HAND-01',
                            'implementation_steps': [ '1. Define the 15 trigger enum and briefing schema in shared.',
                                                      '2. Implement `HandoffService` evaluating message and '
                                                      'conversation state.',
                                                      '3. Implement `BriefingGeneratorService` summarizing customer '
                                                      'intent and cart.',
                                                      '4. Author exhaustive unit tests verifying detection of all 15 '
                                                      'triggers.'],
                            'modify_scope': [ 'apps/api/src/ai/handoff.*',
                                              'apps/api/src/ai/briefing-generator.*',
                                              'packages/shared/src/handoff.ts'],
                            'objective_value': 'Implement detection for all 15 canonical `HUMAN_REQUIRED` triggers '
                                               'from `06_AI_HUMAN_HANDOFF_RULES.md` and automated AI context briefing '
                                               'generation.',
                            'read': [ 'docs/00_product/06_AI_HUMAN_HANDOFF_RULES.md',
                                      'docs/10_engineering/15_AI_ARCHITECTURE.md',
                                      'docs/30_execution/32_FEATURE_SPECIFICATIONS.md'],
                            'security_invariants': [ '🔒 **Complete Coverage**: All 15 triggers must be implemented '
                                                     'with explicit unit tests.',
                                                     '🛡️ **Immediate Pause**: AI turns must immediately halt once a '
                                                     'handoff trigger fires.'],
                            'size': 'XL',
                            'technical_contract': [ 'Triggers (15): `EXPLICIT_HUMAN_REQUEST`, `COMPLEX_NEGOTIATION`, '
                                                    '`COMPLAINT_OR_DISPUTE`, `RETURN_OR_REFUND`, '
                                                    '`CUSTOM_MODIFICATION`, `BULK_ORDER`, `REPEATED_CONFUSION`, '
                                                    '`LOW_CONFIDENCE`, `PAYMENT_FAILURE`, `STOCK_OUTAGE`, '
                                                    '`OUT_OF_SCOPE`, `SENSITIVE_TOPIC`, `POLICY_CONFLICT`, '
                                                    '`HIGH_VALUE_LEAD`, `MANUAL_OVERRIDE`',
                                                    'Action: Sets `conversation.ai_enabled = false`, status = '
                                                    '`HUMAN_REQUIRED`, inserts briefing system note, emits '
                                                    '`conversation.handoff_triggered` event.'],
                            'title': 'AI-to-Human handoff triggers engine (all 15 triggers) & briefing generator',
                            'wave': 'W5',
                            'why': 'Seamless handoff to human agents is the core differentiator of the platform, '
                                   'ensuring shoppers never get stuck with unhelpful AI.'},
                  'letter': '',
                  'read': [ 'docs/00_product/06_AI_HUMAN_HANDOFF_RULES/01-triggers-briefing.md',
                            'docs/10_engineering/14_SYSTEM_DESIGN/01-state-machine-message-pipeline.md',
                            'docs/30_execution/32_FEATURE_SPECIFICATIONS.md'],
                  'title': 'AI-to-Human handoff triggers engine (all 15 triggers) & briefing generator'}],
    'parent_done': '**15 Triggers**: Every one of the 15 triggers reliably initiates handoff.',
    'size': 'XL',
    'title': 'AI-to-Human handoff triggers engine (all 15 triggers) & briefing generator',
    'wave': 'W5'},
  { 'depends': ['T-BIZ-04', 'T-CAT-02', 'T-INT-01', 'T-AI-07'],
    'fs': ['FS-BIZ-03'],
    'gold': { 'acceptance_test_scenarios': [ '[ ] **Incomplete Setup (422)**: Returns 422 listing unmet gates.',
                                             '[ ] **Complete Setup (200)**: Sets `is_live = true` and enables live '
                                             'inbound AI processing.'],
              'cmd': 'pnpm --filter api test -- src/businesses',
              'depends': ['T-BIZ-04', 'T-CAT-02', 'T-INT-01', 'T-AI-07'],
              'dont_modify_scope': ['apps/web/'],
              'expected_deliverables': 'Activation controller and gate verification service in '
                                       '`apps/api/src/businesses`.',
              'files': [ 'apps/api/src/businesses/activation/activation.controller.ts',
                         'apps/api/src/businesses/activation/activation.service.ts'],
              'fs': ['FS-BIZ-03'],
              'human_contribution': [ '**🧪 Manual QA**: Call `PATCH /integrations/live` via Swagger before setup and '
                                      'verify 422 error payload.'],
              'id': 'T-BIZ-05',
              'implementation_steps': [ '1. Implement `ActivationService` querying database to independently verify '
                                        'each gate.',
                                        '2. Implement `ActivationController`.',
                                        '3. Author unit tests covering 422 rejection on missing gates and 200 OK on '
                                        'full completion.'],
              'modify_scope': ['apps/api/src/businesses/activation/*'],
              'objective_value': 'Implement live activation gate check strictly validating all 5 prerequisites (G1 '
                                 'channels, G2 catalog, G3 rules, G4 playground, G5 handoff policy) before enabling '
                                 'live AI customer responses.',
              'read': [ 'docs/00_product/03_MVP_SCOPE.md',
                        'docs/10_engineering/13_API_DESIGN.md',
                        'docs/30_execution/32_FEATURE_SPECIFICATIONS.md'],
              'security_invariants': [ '🔒 **Strict Enforcement**: If any gate is missing, return 422 Unprocessable '
                                       'Entity with error envelope listing unmet gates.',
                                       '🛡️ **Owner Only**: Requires role `OWNER`.'],
              'size': 'M',
              'technical_contract': [ '`PATCH /integrations/live` (200 OK) -> Body `{ enabled: true }` (returns 422 '
                                      'with unmet gates list if incomplete)'],
              'title': 'Live activation gate enforcement (G1–G5 validation)',
              'wave': 'W5',
              'why': 'Prevent merchants from accidentally activating unconfigured AI agents without connected '
                     'channels, products, or store policies.'},
    'id': 'T-BIZ-05',
    'leaves': [ { 'cmd': 'pnpm --filter api test -- src/businesses',
                  'do': [ '1. Implement `ActivationService` querying database to independently verify each gate.',
                          '2. Implement `ActivationController`.',
                          '3. Author unit tests covering 422 rejection on missing gates and 200 OK on full '
                          'completion.'],
                  'done': '**Incomplete Setup (422)**: Returns 422 listing unmet gates.',
                  'dont': [],
                  'files': [ 'apps/api/src/businesses/activation/activation.controller.ts',
                             'apps/api/src/businesses/activation/activation.service.ts'],
                  'gold': { 'acceptance_test_scenarios': [ '[ ] **Incomplete Setup (422)**: Returns 422 listing unmet '
                                                           'gates.',
                                                           '[ ] **Complete Setup (200)**: Sets `is_live = true` and '
                                                           'enables live inbound AI processing.'],
                            'cmd': 'pnpm --filter api test -- src/businesses',
                            'depends': ['T-BIZ-04', 'T-CAT-02', 'T-INT-01', 'T-AI-07'],
                            'dont_modify_scope': ['apps/web/'],
                            'expected_deliverables': 'Activation controller and gate verification service in '
                                                     '`apps/api/src/businesses`.',
                            'files': [ 'apps/api/src/businesses/activation/activation.controller.ts',
                                       'apps/api/src/businesses/activation/activation.service.ts'],
                            'fs': ['FS-BIZ-03'],
                            'human_contribution': [ '**🧪 Manual QA**: Call `PATCH /integrations/live` via Swagger '
                                                    'before setup and verify 422 error payload.'],
                            'id': 'T-BIZ-05',
                            'implementation_steps': [ '1. Implement `ActivationService` querying database to '
                                                      'independently verify each gate.',
                                                      '2. Implement `ActivationController`.',
                                                      '3. Author unit tests covering 422 rejection on missing gates '
                                                      'and 200 OK on full completion.'],
                            'modify_scope': ['apps/api/src/businesses/activation/*'],
                            'objective_value': 'Implement live activation gate check strictly validating all 5 '
                                               'prerequisites (G1 channels, G2 catalog, G3 rules, G4 playground, G5 '
                                               'handoff policy) before enabling live AI customer responses.',
                            'read': [ 'docs/00_product/03_MVP_SCOPE.md',
                                      'docs/10_engineering/13_API_DESIGN.md',
                                      'docs/30_execution/32_FEATURE_SPECIFICATIONS.md'],
                            'security_invariants': [ '🔒 **Strict Enforcement**: If any gate is missing, return 422 '
                                                     'Unprocessable Entity with error envelope listing unmet gates.',
                                                     '🛡️ **Owner Only**: Requires role `OWNER`.'],
                            'size': 'M',
                            'technical_contract': [ '`PATCH /integrations/live` (200 OK) -> Body `{ enabled: true }` '
                                                    '(returns 422 with unmet gates list if incomplete)'],
                            'title': 'Live activation gate enforcement (G1–G5 validation)',
                            'wave': 'W5',
                            'why': 'Prevent merchants from accidentally activating unconfigured AI agents without '
                                   'connected channels, products, or store policies.'},
                  'letter': '',
                  'read': [ 'docs/00_product/03_MVP_SCOPE/02-out-of-scope-hooks-gate.md',
                            'docs/10_engineering/13_API_DESIGN/02-auth-workspace-inbox.md',
                            'docs/30_execution/32_FEATURE_SPECIFICATIONS.md'],
                  'title': 'Live activation gate enforcement (G1–G5 validation)'}],
    'parent_done': '**Incomplete Setup (422)**: Returns 422 listing unmet gates.',
    'size': 'M',
    'title': 'Live activation gate enforcement (G1–G5 validation)',
    'wave': 'W5'},
  { 'depends': ['T-AI-01'],
    'fs': ['FS-AI-03'],
    'gold': { 'acceptance_test_scenarios': [ '[ ] **Simulation**: Executes AI turn and returns tool telemetry.',
                                             '[ ] **Test Isolation**: Playground conversations are marked `is_test = '
                                             'true`.',
                                             '[ ] **Employee (403)**: Employee role receives 403 Forbidden.'],
              'cmd': 'pnpm --filter api test -- src/ai',
              'depends': ['T-AI-01'],
              'dont_modify_scope': ['apps/web/'],
              'expected_deliverables': 'Playground simulation controller and sandbox service in `apps/api/src/ai`.',
              'files': [ 'apps/api/src/ai/playground/playground.controller.ts',
                         'apps/api/src/ai/playground/playground.service.ts',
                         'apps/api/src/ai/dto/playground-simulate.dto.ts'],
              'fs': ['FS-AI-03'],
              'human_contribution': [ '**🧪 Manual QA**: Send test prompt via Playground in Swagger and verify '
                                      'telemetry output.'],
              'id': 'T-AI-06',
              'implementation_steps': [ '1. Implement `PlaygroundService` executing AI orchestrator with `source = '
                                        "'PLAYGROUND'`.",
                                        '2. Implement `PlaygroundController`.',
                                        '3. Author unit tests covering simulation execution, test flag tagging, and '
                                        'employee 403 block.'],
              'modify_scope': ['apps/api/src/ai/playground.*', 'apps/api/src/ai/dto/*playground*'],
              'objective_value': 'Implement AI Playground sandbox simulation endpoint allowing merchants to test AI '
                                 'sales responses in a safe test environment.',
              'read': [ 'docs/10_engineering/13_API_DESIGN.md',
                        'docs/10_engineering/15_AI_ARCHITECTURE.md',
                        'docs/30_execution/32_FEATURE_SPECIFICATIONS.md'],
              'security_invariants': [ '🔒 **Test Flag**: All playground records flagged with `is_test = true` to '
                                       'exclude from metrics.',
                                       '🛡️ **No Outbound**: Bypasses Meta outbound queue; never dispatches to real '
                                       'channels.',
                                       "🛡️ **RBAC Permission**: Requires `@RequirePermission('ai.playground')` "
                                       '(Employee receives 403).'],
              'size': 'L',
              'technical_contract': [ '`POST /ai/playground` (200 OK) -> Body `{ message: string, conversationId?: '
                                      'string }`',
                                      'Response: `{ response: string, reasoning: string, toolCalls: [], '
                                      'handoffTriggered: boolean, handoffReason?: string }`'],
              'title': 'AI Playground execution sandbox & test simulation API',
              'wave': 'W5',
              'why': "Allow merchants to test their AI agent's prompts, knowledge, and tool execution in a simulation "
                     'sandbox without customer risk.'},
    'id': 'T-AI-06',
    'leaves': [ { 'cmd': 'pnpm --filter api test -- src/ai',
                  'do': [ "1. Implement `PlaygroundService` executing AI orchestrator with `source = 'PLAYGROUND'`.",
                          '2. Implement `PlaygroundController`.',
                          '3. Author unit tests covering simulation execution, test flag tagging, and employee 403 '
                          'block.'],
                  'done': '**Simulation**: Executes AI turn and returns tool telemetry.',
                  'dont': [],
                  'files': [ 'apps/api/src/ai/playground/playground.controller.ts',
                             'apps/api/src/ai/playground/playground.service.ts',
                             'apps/api/src/ai/dto/playground-simulate.dto.ts'],
                  'gold': { 'acceptance_test_scenarios': [ '[ ] **Simulation**: Executes AI turn and returns tool '
                                                           'telemetry.',
                                                           '[ ] **Test Isolation**: Playground conversations are '
                                                           'marked `is_test = true`.',
                                                           '[ ] **Employee (403)**: Employee role receives 403 '
                                                           'Forbidden.'],
                            'cmd': 'pnpm --filter api test -- src/ai',
                            'depends': ['T-AI-01'],
                            'dont_modify_scope': ['apps/web/'],
                            'expected_deliverables': 'Playground simulation controller and sandbox service in '
                                                     '`apps/api/src/ai`.',
                            'files': [ 'apps/api/src/ai/playground/playground.controller.ts',
                                       'apps/api/src/ai/playground/playground.service.ts',
                                       'apps/api/src/ai/dto/playground-simulate.dto.ts'],
                            'fs': ['FS-AI-03'],
                            'human_contribution': [ '**🧪 Manual QA**: Send test prompt via Playground in Swagger and '
                                                    'verify telemetry output.'],
                            'id': 'T-AI-06',
                            'implementation_steps': [ '1. Implement `PlaygroundService` executing AI orchestrator with '
                                                      "`source = 'PLAYGROUND'`.",
                                                      '2. Implement `PlaygroundController`.',
                                                      '3. Author unit tests covering simulation execution, test flag '
                                                      'tagging, and employee 403 block.'],
                            'modify_scope': ['apps/api/src/ai/playground.*', 'apps/api/src/ai/dto/*playground*'],
                            'objective_value': 'Implement AI Playground sandbox simulation endpoint allowing merchants '
                                               'to test AI sales responses in a safe test environment.',
                            'read': [ 'docs/10_engineering/13_API_DESIGN.md',
                                      'docs/10_engineering/15_AI_ARCHITECTURE.md',
                                      'docs/30_execution/32_FEATURE_SPECIFICATIONS.md'],
                            'security_invariants': [ '🔒 **Test Flag**: All playground records flagged with `is_test = '
                                                     'true` to exclude from metrics.',
                                                     '🛡️ **No Outbound**: Bypasses Meta outbound queue; never '
                                                     'dispatches to real channels.',
                                                     '🛡️ **RBAC Permission**: Requires '
                                                     "`@RequirePermission('ai.playground')` (Employee receives 403)."],
                            'size': 'L',
                            'technical_contract': [ '`POST /ai/playground` (200 OK) -> Body `{ message: string, '
                                                    'conversationId?: string }`',
                                                    'Response: `{ response: string, reasoning: string, toolCalls: [], '
                                                    'handoffTriggered: boolean, handoffReason?: string }`'],
                            'title': 'AI Playground execution sandbox & test simulation API',
                            'wave': 'W5',
                            'why': "Allow merchants to test their AI agent's prompts, knowledge, and tool execution in "
                                   'a simulation sandbox without customer risk.'},
                  'letter': '',
                  'read': [ 'docs/10_engineering/13_API_DESIGN/04-integrations-ai-admin-catalog.md',
                            'docs/10_engineering/15_AI_ARCHITECTURE/01-orchestrator-intent-tools.md',
                            'docs/30_execution/32_FEATURE_SPECIFICATIONS.md'],
                  'title': 'AI Playground execution sandbox & test simulation API'}],
    'parent_done': '**Simulation**: Executes AI turn and returns tool telemetry.',
    'size': 'L',
    'title': 'AI Playground execution sandbox & test simulation API',
    'wave': 'W5'},
  { 'depends': ['T-AI-06'],
    'fs': ['FS-AI-03'],
    'gold': { 'acceptance_test_scenarios': ['[ ] **Gate Update**: Marks Gate G4 complete.'],
              'cmd': 'pnpm --filter api test -- src/ai',
              'depends': ['T-AI-06'],
              'dont_modify_scope': ['apps/web/'],
              'expected_deliverables': 'Playground readiness handler in `apps/api/src/ai`.',
              'files': ['apps/api/src/ai/playground/playground.service.ts'],
              'fs': ['FS-AI-03'],
              'human_contribution': [ '**🧪 Manual QA**: Complete 1 test in Playground and verify Gate G4 status in '
                                      '`GET /onboarding`.'],
              'id': 'T-AI-07',
              'implementation_steps': [ '1. Update onboarding record upon first playground turn.',
                                        '2. Author unit test verifying gate status update.'],
              'modify_scope': ['apps/api/src/ai/playground/playground.service.ts'],
              'objective_value': 'Record successful completion of playground simulation test in onboarding Gate G4.',
              'read': ['docs/00_product/03_MVP_SCOPE.md', 'docs/10_engineering/13_API_DESIGN.md'],
              'security_invariants': [ '🚫 **No Auto Activation**: Completing playground test does NOT automatically '
                                       'activate live AI.'],
              'size': 'S',
              'technical_contract': [ 'Playground test turn completion marks `business_onboarding.playground_passed = '
                                      'true`.'],
              'title': 'AI Playground test completion & readiness check',
              'wave': 'W5',
              'why': 'Confirm merchant has tested their agent before live activation is unlocked.'},
    'id': 'T-AI-07',
    'leaves': [ { 'cmd': 'pnpm --filter api test -- src/ai',
                  'do': [ '1. Update onboarding record upon first playground turn.',
                          '2. Author unit test verifying gate status update.'],
                  'done': '**Gate Update**: Marks Gate G4 complete.',
                  'dont': [ '🚫 **No Auto Activation**: Completing playground test does NOT automatically activate live '
                            'AI.'],
                  'files': ['apps/api/src/ai/playground/playground.service.ts'],
                  'gold': { 'acceptance_test_scenarios': ['[ ] **Gate Update**: Marks Gate G4 complete.'],
                            'cmd': 'pnpm --filter api test -- src/ai',
                            'depends': ['T-AI-06'],
                            'dont_modify_scope': ['apps/web/'],
                            'expected_deliverables': 'Playground readiness handler in `apps/api/src/ai`.',
                            'files': ['apps/api/src/ai/playground/playground.service.ts'],
                            'fs': ['FS-AI-03'],
                            'human_contribution': [ '**🧪 Manual QA**: Complete 1 test in Playground and verify Gate G4 '
                                                    'status in `GET /onboarding`.'],
                            'id': 'T-AI-07',
                            'implementation_steps': [ '1. Update onboarding record upon first playground turn.',
                                                      '2. Author unit test verifying gate status update.'],
                            'modify_scope': ['apps/api/src/ai/playground/playground.service.ts'],
                            'objective_value': 'Record successful completion of playground simulation test in '
                                               'onboarding Gate G4.',
                            'read': ['docs/00_product/03_MVP_SCOPE.md', 'docs/10_engineering/13_API_DESIGN.md'],
                            'security_invariants': [ '🚫 **No Auto Activation**: Completing playground test does NOT '
                                                     'automatically activate live AI.'],
                            'size': 'S',
                            'technical_contract': [ 'Playground test turn completion marks '
                                                    '`business_onboarding.playground_passed = true`.'],
                            'title': 'AI Playground test completion & readiness check',
                            'wave': 'W5',
                            'why': 'Confirm merchant has tested their agent before live activation is unlocked.'},
                  'letter': '',
                  'read': [ 'docs/10_engineering/13_API_DESIGN/04-integrations-ai-admin-catalog.md',
                            'docs/00_product/03_MVP_SCOPE/02-out-of-scope-hooks-gate.md',
                            'docs/30_execution/32_FEATURE_SPECIFICATIONS.md'],
                  'title': 'AI Playground test completion & readiness check'}],
    'parent_done': '**Gate Update**: Marks Gate G4 complete.',
    'size': 'S',
    'title': 'AI Playground test completion & readiness check',
    'wave': 'W5'},
  { 'depends': ['T-AI-04'],
    'fs': ['FS-AI-01'],
    'gold': { 'acceptance_test_scenarios': [ '[ ] **On-Demand Draft**: Generates AI suggestion draft in timeline.',
                                             '[ ] **Complaint Block (409)**: Returns 409 Conflict if thread is in '
                                             'complaint status.'],
              'cmd': 'pnpm --filter api test -- src/ai',
              'depends': ['T-AI-04'],
              'dont_modify_scope': ['apps/web/'],
              'expected_deliverables': 'Suggest controller and service in `apps/api/src/ai`.',
              'files': ['apps/api/src/ai/suggest/suggest.controller.ts', 'apps/api/src/ai/suggest/suggest.service.ts'],
              'fs': ['FS-AI-01'],
              'human_contribution': [ '**🧪 Manual QA**: In human takeover mode, click suggest via Swagger and verify '
                                      'draft in timeline.'],
              'id': 'T-AI-08',
              'implementation_steps': [ '1. Implement `SuggestService` generating draft proposal.',
                                        '2. Implement `SuggestController`.',
                                        '3. Author unit tests covering draft creation, complaint suppression (409), '
                                        'and quota block (403).'],
              'modify_scope': ['apps/api/src/ai/suggest.*'],
              'objective_value': 'Implement on-demand AI reply suggestion endpoint assisting human sales agents in '
                                 'takeover mode.',
              'read': ['docs/10_engineering/13_API_DESIGN.md', 'docs/00_product/05_AI_BEHAVIOR_SPECIFICATION.md'],
              'security_invariants': [ '🚫 **No Keystroke Trigger**: Explicit user button click only (never trigger on '
                                       'keystroke or open).'],
              'size': 'M',
              'technical_contract': [ '`POST /conversations/:id/suggest` (202 Accepted) -> Triggers on-demand draft '
                                      'suggestion',
                                      'Error Codes: 409 Conflict (if conversation has active complaint), 403 Forbidden '
                                      '(if `ai_paused = true`)'],
              'title': 'On-demand AI draft suggestion API (`/conversations/:id/suggest`)',
              'wave': 'W5',
              'why': 'Assist human sales reps by generating high-quality response drafts on click while in human '
                     'takeover mode.'},
    'id': 'T-AI-08',
    'leaves': [ { 'cmd': 'pnpm --filter api test -- src/ai',
                  'do': [ '1. Implement `SuggestService` generating draft proposal.',
                          '2. Implement `SuggestController`.',
                          '3. Author unit tests covering draft creation, complaint suppression (409), and quota block '
                          '(403).'],
                  'done': '**On-Demand Draft**: Generates AI suggestion draft in timeline.',
                  'dont': [ '🚫 **No Keystroke Trigger**: Explicit user button click only (never trigger on keystroke '
                            'or open).'],
                  'files': ['apps/api/src/ai/suggest/suggest.controller.ts', 'apps/api/src/ai/suggest/suggest.service.ts'],
                  'gold': { 'acceptance_test_scenarios': [ '[ ] **On-Demand Draft**: Generates AI suggestion draft in '
                                                           'timeline.',
                                                           '[ ] **Complaint Block (409)**: Returns 409 Conflict if '
                                                           'thread is in complaint status.'],
                            'cmd': 'pnpm --filter api test -- src/ai',
                            'depends': ['T-AI-04'],
                            'dont_modify_scope': ['apps/web/'],
                            'expected_deliverables': 'Suggest controller and service in `apps/api/src/ai`.',
                            'files': ['apps/api/src/ai/suggest/suggest.controller.ts', 'apps/api/src/ai/suggest/suggest.service.ts'],
                            'fs': ['FS-AI-01'],
                            'human_contribution': [ '**🧪 Manual QA**: In human takeover mode, click suggest via '
                                                    'Swagger and verify draft in timeline.'],
                            'id': 'T-AI-08',
                            'implementation_steps': [ '1. Implement `SuggestService` generating draft proposal.',
                                                      '2. Implement `SuggestController`.',
                                                      '3. Author unit tests covering draft creation, complaint '
                                                      'suppression (409), and quota block (403).'],
                            'modify_scope': ['apps/api/src/ai/suggest.*'],
                            'objective_value': 'Implement on-demand AI reply suggestion endpoint assisting human sales '
                                               'agents in takeover mode.',
                            'read': [ 'docs/10_engineering/13_API_DESIGN.md',
                                      'docs/00_product/05_AI_BEHAVIOR_SPECIFICATION.md'],
                            'security_invariants': [ '🚫 **No Keystroke Trigger**: Explicit user button click only '
                                                     '(never trigger on keystroke or open).'],
                            'size': 'M',
                            'technical_contract': [ '`POST /conversations/:id/suggest` (202 Accepted) -> Triggers '
                                                    'on-demand draft suggestion',
                                                    'Error Codes: 409 Conflict (if conversation has active complaint), '
                                                    '403 Forbidden (if `ai_paused = true`)'],
                            'title': 'On-demand AI draft suggestion API (`/conversations/:id/suggest`)',
                            'wave': 'W5',
                            'why': 'Assist human sales reps by generating high-quality response drafts on click while '
                                   'in human takeover mode.'},
                  'letter': '',
                  'read': [ 'docs/10_engineering/13_API_DESIGN/02-auth-workspace-inbox.md',
                            'docs/10_engineering/15_AI_ARCHITECTURE/01-orchestrator-intent-tools.md',
                            'docs/30_execution/32_FEATURE_SPECIFICATIONS.md'],
                  'title': 'On-demand AI draft suggestion API (`/conversations/:id/suggest`)'}],
    'parent_done': '**On-Demand Draft**: Generates AI suggestion draft in timeline.',
    'size': 'M',
    'title': 'On-demand AI draft suggestion API (`/conversations/:id/suggest`)',
    'wave': 'W5'},
  { 'depends': ['T-AI-02'],
    'fs': ['FS-AI-01'],
    'gold': { 'acceptance_test_scenarios': [ '[ ] **Benchmark Run**: Benchmark executes all scenarios and outputs '
                                             'accuracy report.',
                                             '[ ] **Safety Invariant**: Zero commercial safety violations across '
                                             'entire dataset.'],
              'cmd': 'pnpm --filter api test -- test/golden-eval',
              'depends': ['T-AI-02'],
              'dont_modify_scope': ['apps/web/'],
              'expected_deliverables': 'Golden evaluation dataset and test runner in `apps/api/test/golden-eval`.',
              'files': [ 'apps/api/test/golden-eval/dataset.json',
                         'apps/api/test/golden-eval/eval-runner.spec.ts',
                         'apps/api/src/ai/evaluation/evaluation.service.ts'],
              'fs': ['FS-AI-01'],
              'human_contribution': [ '**Human contribution**: Review dataset scenarios in `dataset.json` for dialect '
                                      'accuracy.',
                                      '**🧪 Manual QA**: Run `pnpm --filter api test -- test/golden-eval` and inspect '
                                      'benchmark output.'],
              'id': 'T-AI-09',
              'implementation_steps': [ '1. Author 50-100 realistic Tunisian Derja/French multi-turn test scenarios in '
                                        '`dataset.json`.',
                                        '2. Implement `eval-runner.spec.ts` evaluating tool call accuracy and '
                                        'guardrail compliance.',
                                        '3. Integrate evaluation benchmark into CI test pipeline.'],
              'modify_scope': ['apps/api/test/golden-eval/', 'apps/api/src/ai/evaluation.*'],
              'objective_value': 'Implement golden evaluation dataset (50-100 Tunisian Derja/French dialogues) and '
                                 'automated accuracy benchmark runner in CI.',
              'read': [ 'docs/00_product/05_AI_BEHAVIOR_SPECIFICATION.md',
                        'docs/00_product/03_MVP_SCOPE.md',
                        'docs/30_execution/32_FEATURE_SPECIFICATIONS.md'],
              'security_invariants': [ '🚫 **CI Merge Block**: Any accuracy regression below thresholds blocks CI pull '
                                       'request merge.'],
              'size': 'L',
              'technical_contract': [ 'Benchmark Thresholds: Price grounding > 95%, Stock grounding > 95%, Handoff '
                                      'trigger accuracy > 98%, Commercial safety violation rate = 0%.'],
              'title': 'Golden evaluation dataset & automated benchmark in CI',
              'wave': 'W5',
              'why': 'Guarantee that model updates and prompt changes never regress AI sales accuracy or safety '
                     'standards in CI.'},
    'id': 'T-AI-09',
    'leaves': [ { 'cmd': 'pnpm --filter api test -- test/golden-eval',
                  'do': [ '1. Author 50-100 realistic Tunisian Derja/French multi-turn test scenarios in '
                          '`dataset.json`.',
                          '2. Implement `eval-runner.spec.ts` evaluating tool call accuracy and guardrail compliance.',
                          '3. Integrate evaluation benchmark into CI test pipeline.'],
                  'done': '**Benchmark Run**: Benchmark executes all scenarios and outputs accuracy report.',
                  'dont': [ '🚫 **CI Merge Block**: Any accuracy regression below thresholds blocks CI pull request '
                            'merge.'],
                  'files': [ 'apps/api/test/golden-eval/dataset.json',
                             'apps/api/test/golden-eval/eval-runner.spec.ts',
                             'apps/api/src/ai/evaluation/evaluation.service.ts'],
                  'gold': { 'acceptance_test_scenarios': [ '[ ] **Benchmark Run**: Benchmark executes all scenarios '
                                                           'and outputs accuracy report.',
                                                           '[ ] **Safety Invariant**: Zero commercial safety '
                                                           'violations across entire dataset.'],
                            'cmd': 'pnpm --filter api test -- test/golden-eval',
                            'depends': ['T-AI-02'],
                            'dont_modify_scope': ['apps/web/'],
                            'expected_deliverables': 'Golden evaluation dataset and test runner in '
                                                     '`apps/api/test/golden-eval`.',
                            'files': [ 'apps/api/test/golden-eval/dataset.json',
                                       'apps/api/test/golden-eval/eval-runner.spec.ts',
                                       'apps/api/src/ai/evaluation/evaluation.service.ts'],
                            'fs': ['FS-AI-01'],
                            'human_contribution': [ '**Human contribution**: Review dataset scenarios in '
                                                    '`dataset.json` for dialect accuracy.',
                                                    '**🧪 Manual QA**: Run `pnpm --filter api test -- test/golden-eval` '
                                                    'and inspect benchmark output.'],
                            'id': 'T-AI-09',
                            'implementation_steps': [ '1. Author 50-100 realistic Tunisian Derja/French multi-turn '
                                                      'test scenarios in `dataset.json`.',
                                                      '2. Implement `eval-runner.spec.ts` evaluating tool call '
                                                      'accuracy and guardrail compliance.',
                                                      '3. Integrate evaluation benchmark into CI test pipeline.'],
                            'modify_scope': ['apps/api/test/golden-eval/', 'apps/api/src/ai/evaluation.*'],
                            'objective_value': 'Implement golden evaluation dataset (50-100 Tunisian Derja/French '
                                               'dialogues) and automated accuracy benchmark runner in CI.',
                            'read': [ 'docs/00_product/05_AI_BEHAVIOR_SPECIFICATION.md',
                                      'docs/00_product/03_MVP_SCOPE.md',
                                      'docs/30_execution/32_FEATURE_SPECIFICATIONS.md'],
                            'security_invariants': [ '🚫 **CI Merge Block**: Any accuracy regression below thresholds '
                                                     'blocks CI pull request merge.'],
                            'size': 'L',
                            'technical_contract': [ 'Benchmark Thresholds: Price grounding > 95%, Stock grounding > '
                                                    '95%, Handoff trigger accuracy > 98%, Commercial safety violation '
                                                    'rate = 0%.'],
                            'title': 'Golden evaluation dataset & automated benchmark in CI',
                            'wave': 'W5',
                            'why': 'Guarantee that model updates and prompt changes never regress AI sales accuracy or '
                                   'safety standards in CI.'},
                  'letter': '',
                  'read': [ 'docs/10_engineering/15_AI_ARCHITECTURE/02-rag-prompts-evaluation.md',
                            'docs/00_product/05_AI_BEHAVIOR_SPECIFICATION/03-runtime-safety-prompts.md',
                            'docs/30_execution/32_FEATURE_SPECIFICATIONS.md'],
                  'title': 'Golden evaluation dataset & automated benchmark in CI'}],
    'parent_done': '**Benchmark Run**: Benchmark executes all scenarios and outputs accuracy report.',
    'size': 'L',
    'title': 'Golden evaluation dataset & automated benchmark in CI',
    'wave': 'W5'},
  { 'depends': ['T-AI-01'],
    'fs': ['FS-OBS-01'],
    'gold': { 'acceptance_test_scenarios': [ '[ ] **Trace Lookup**: Manager can inspect tool inputs/outputs and '
                                             'reasoning trace.'],
              'cmd': 'pnpm --filter api test -- src/ai',
              'depends': ['T-AI-01'],
              'dont_modify_scope': ['apps/web/'],
              'expected_deliverables': 'Observability service and trace endpoints in `apps/api/src/ai`.',
              'files': ['apps/api/src/ai/observability/observability.service.ts', 'apps/api/src/ai/observability/observability.controller.ts'],
              'fs': ['FS-OBS-01'],
              'human_contribution': [ '**🧪 Manual QA**: Call `GET /ai/traces/:messageId` via Swagger and inspect '
                                      'reasoning trace.'],
              'id': 'T-OBS-01',
              'implementation_steps': [ '1. Record structured decision trace during AI turn execution.',
                                        '2. Implement `ObservabilityController`.',
                                        '3. Author unit tests covering trace query and employee 403 block.'],
              'modify_scope': ['apps/api/src/ai/observability.*'],
              'objective_value': 'Implement AI decision trace and tool action logging service for complete operational '
                                 'observability.',
              'read': ['docs/10_engineering/15_AI_ARCHITECTURE.md', 'docs/10_engineering/12_DATABASE_DESIGN.md'],
              'security_invariants': [ "🛡️ **RBAC Permission**: Requires `@RequirePermission('ai.configure')` "
                                       '(Employee receives 403).'],
              'size': 'M',
              'technical_contract': [ '`GET /ai/traces/:messageId` (200 OK) -> Detailed trace (`intent`, `confidence`, '
                                      '`retrievedChunks`, `toolCalls`, `reasoning`)'],
              'title': 'AI decision traces & action logging service',
              'wave': 'W5',
              'why': 'Provide store managers with complete transparency into AI intent classification, tool '
                     'parameters, and reasoning traces.'},
    'id': 'T-OBS-01',
    'leaves': [ { 'cmd': 'pnpm --filter api test -- src/ai',
                  'do': [ '1. Record structured decision trace during AI turn execution.',
                          '2. Implement `ObservabilityController`.',
                          '3. Author unit tests covering trace query and employee 403 block.'],
                  'done': '**Trace Lookup**: Manager can inspect tool inputs/outputs and reasoning trace.',
                  'dont': [],
                  'files': ['apps/api/src/ai/observability/observability.service.ts', 'apps/api/src/ai/observability/observability.controller.ts'],
                  'gold': { 'acceptance_test_scenarios': [ '[ ] **Trace Lookup**: Manager can inspect tool '
                                                           'inputs/outputs and reasoning trace.'],
                            'cmd': 'pnpm --filter api test -- src/ai',
                            'depends': ['T-AI-01'],
                            'dont_modify_scope': ['apps/web/'],
                            'expected_deliverables': 'Observability service and trace endpoints in `apps/api/src/ai`.',
                            'files': [ 'apps/api/src/ai/observability/observability.service.ts',
                                       'apps/api/src/ai/observability/observability.controller.ts'],
                            'fs': ['FS-OBS-01'],
                            'human_contribution': [ '**🧪 Manual QA**: Call `GET /ai/traces/:messageId` via Swagger and '
                                                    'inspect reasoning trace.'],
                            'id': 'T-OBS-01',
                            'implementation_steps': [ '1. Record structured decision trace during AI turn execution.',
                                                      '2. Implement `ObservabilityController`.',
                                                      '3. Author unit tests covering trace query and employee 403 '
                                                      'block.'],
                            'modify_scope': ['apps/api/src/ai/observability.*'],
                            'objective_value': 'Implement AI decision trace and tool action logging service for '
                                               'complete operational observability.',
                            'read': [ 'docs/10_engineering/15_AI_ARCHITECTURE.md',
                                      'docs/10_engineering/12_DATABASE_DESIGN.md'],
                            'security_invariants': [ '🛡️ **RBAC Permission**: Requires '
                                                     "`@RequirePermission('ai.configure')` (Employee receives 403)."],
                            'size': 'M',
                            'technical_contract': [ '`GET /ai/traces/:messageId` (200 OK) -> Detailed trace (`intent`, '
                                                    '`confidence`, `retrievedChunks`, `toolCalls`, `reasoning`)'],
                            'title': 'AI decision traces & action logging service',
                            'wave': 'W5',
                            'why': 'Provide store managers with complete transparency into AI intent classification, '
                                   'tool parameters, and reasoning traces.'},
                  'letter': '',
                  'read': [ 'docs/10_engineering/15_AI_ARCHITECTURE/02-rag-prompts-evaluation.md',
                            'docs/10_engineering/12_DATABASE_DESIGN/04-orders-knowledge-ai-schema.md',
                            'docs/30_execution/32_FEATURE_SPECIFICATIONS.md'],
                  'title': 'AI decision traces & action logging service'}],
    'parent_done': '**Trace Lookup**: Manager can inspect tool inputs/outputs and reasoning trace.',
    'size': 'M',
    'title': 'AI decision traces & action logging service',
    'wave': 'W5'},
  { 'depends': ['T-AI-04'],
    'fs': ['FS-OBS-01'],
    'gold': { 'acceptance_test_scenarios': [ '[ ] **Feedback Submission**: Records feedback and updates satisfaction '
                                             'metrics.'],
              'cmd': 'pnpm --filter api test -- src/ai',
              'depends': ['T-AI-04'],
              'dont_modify_scope': ['apps/web/'],
              'expected_deliverables': 'Feedback controller and service in `apps/api/src/ai`.',
              'files': [ 'apps/api/src/ai/feedback/feedback.controller.ts',
                         'apps/api/src/ai/feedback/feedback.service.ts',
                         'apps/api/src/ai/dto/submit-feedback.dto.ts'],
              'fs': ['FS-OBS-01'],
              'human_contribution': ['**🧪 Manual QA**: Submit thumbs down rating with reason code via Swagger.'],
              'id': 'T-OBS-02',
              'implementation_steps': [ '1. Implement `FeedbackService` and `FeedbackController`.',
                                        '2. Author unit tests covering feedback submission and reason code '
                                        'validation.'],
              'modify_scope': ['apps/api/src/ai/feedback.*', 'apps/api/src/ai/dto/*feedback*'],
              'objective_value': 'Implement human feedback loop collecting thumbs up/down ratings and structured '
                                 'negative reason codes on AI responses.',
              'read': ['docs/10_engineering/13_API_DESIGN.md', 'docs/10_engineering/12_DATABASE_DESIGN.md'],
              'security_invariants': [ '🛡️ **Negative Reason Mandatory**: Thumbs down rating requires structured '
                                       'reason code.'],
              'size': 'M',
              'technical_contract': [ "`POST /messages/:id/feedback` (201 Created) -> Body `{ rating: 'THUMBS_UP' | "
                                      "'THUMBS_DOWN', reason?: FeedbackReason, comment?: string }`",
                                      '`GET /ai/feedback` (200 OK) -> Aggregate satisfaction metrics'],
              'title': 'AI message feedback API & quality ratings',
              'wave': 'W5',
              'why': 'Collect continuous feedback from sales reps to identify recurring prompt weaknesses and RAG '
                     'gaps.'},
    'id': 'T-OBS-02',
    'leaves': [ { 'cmd': 'pnpm --filter api test -- src/ai',
                  'do': [ '1. Implement `FeedbackService` and `FeedbackController`.',
                          '2. Author unit tests covering feedback submission and reason code validation.'],
                  'done': '**Feedback Submission**: Records feedback and updates satisfaction metrics.',
                  'dont': ['🛡️ **Negative Reason Mandatory**: Thumbs down rating requires structured reason code.'],
                  'files': [ 'apps/api/src/ai/feedback/feedback.controller.ts',
                             'apps/api/src/ai/feedback/feedback.service.ts',
                             'apps/api/src/ai/dto/submit-feedback.dto.ts'],
                  'gold': { 'acceptance_test_scenarios': [ '[ ] **Feedback Submission**: Records feedback and updates '
                                                           'satisfaction metrics.'],
                            'cmd': 'pnpm --filter api test -- src/ai',
                            'depends': ['T-AI-04'],
                            'dont_modify_scope': ['apps/web/'],
                            'expected_deliverables': 'Feedback controller and service in `apps/api/src/ai`.',
                            'files': [ 'apps/api/src/ai/feedback/feedback.controller.ts',
                                       'apps/api/src/ai/feedback/feedback.service.ts',
                                       'apps/api/src/ai/dto/submit-feedback.dto.ts'],
                            'fs': ['FS-OBS-01'],
                            'human_contribution': [ '**🧪 Manual QA**: Submit thumbs down rating with reason code via '
                                                    'Swagger.'],
                            'id': 'T-OBS-02',
                            'implementation_steps': [ '1. Implement `FeedbackService` and `FeedbackController`.',
                                                      '2. Author unit tests covering feedback submission and reason '
                                                      'code validation.'],
                            'modify_scope': ['apps/api/src/ai/feedback.*', 'apps/api/src/ai/dto/*feedback*'],
                            'objective_value': 'Implement human feedback loop collecting thumbs up/down ratings and '
                                               'structured negative reason codes on AI responses.',
                            'read': [ 'docs/10_engineering/13_API_DESIGN.md',
                                      'docs/10_engineering/12_DATABASE_DESIGN.md'],
                            'security_invariants': [ '🛡️ **Negative Reason Mandatory**: Thumbs down rating requires '
                                                     'structured reason code.'],
                            'size': 'M',
                            'technical_contract': [ '`POST /messages/:id/feedback` (201 Created) -> Body `{ rating: '
                                                    "'THUMBS_UP' | 'THUMBS_DOWN', reason?: FeedbackReason, comment?: "
                                                    'string }`',
                                                    '`GET /ai/feedback` (200 OK) -> Aggregate satisfaction metrics'],
                            'title': 'AI message feedback API & quality ratings',
                            'wave': 'W5',
                            'why': 'Collect continuous feedback from sales reps to identify recurring prompt '
                                   'weaknesses and RAG gaps.'},
                  'letter': '',
                  'read': [ 'docs/10_engineering/13_API_DESIGN/04-integrations-ai-admin-catalog.md',
                            'docs/10_engineering/12_DATABASE_DESIGN/04-orders-knowledge-ai-schema.md',
                            'docs/30_execution/32_FEATURE_SPECIFICATIONS.md'],
                  'title': 'AI message feedback API & quality ratings'}],
    'parent_done': '**Feedback Submission**: Records feedback and updates satisfaction metrics.',
    'size': 'M',
    'title': 'AI message feedback API & quality ratings',
    'wave': 'W5'},
  { 'depends': ['T-CONV-02'],
    'fs': ['FS-ORD-01'],
    'gold': { 'acceptance_test_scenarios': [ '[ ] **Create Draft**: Creates order in PENDING_CONFIRMATION with 30-min '
                                             'stock hold.',
                                             '[ ] **Confirm Order**: Deducts physical stock, commits reservation, sets '
                                             'status = CONFIRMED.',
                                             '[ ] **Cancel Order**: Cancels order and releases stock reservation hold.',
                                             "[ ] **Tenancy Block (403)**: Accessing another tenant's order returns "
                                             '403 Forbidden.'],
              'cmd': 'pnpm --filter api test -- src/orders',
              'depends': ['T-CONV-02'],
              'dont_modify_scope': ['apps/web/'],
              'expected_deliverables': 'Orders controller, service, DTOs, and unit tests in `apps/api/src/orders`.',
              'files': [ 'apps/api/src/orders/core/orders.controller.ts',
                         'apps/api/src/orders/core/orders.service.ts',
                         'apps/api/src/orders/dto/create-order.dto.ts',
                         'apps/api/src/orders/dto/update-order-status.dto.ts',
                         'apps/api/src/orders/orders.module.ts'],
              'fs': ['FS-ORD-01'],
              'human_contribution': [ '**🧪 Manual QA & Smoke test**: Create draft order via Swagger; call `POST '
                                      '/orders/:id/confirm` and verify stock deduction in Prisma Studio (`pnpm '
                                      '--filter api exec prisma studio`).',
                                      '**👁️ Review & Sign-off**: Verify stock hold and order creation occur in an '
                                      'atomic Prisma transaction.'],
              'id': 'T-ORD-01',
              'implementation_steps': [ '1. Define order DTOs and Zod schemas in shared.',
                                        '2. Implement `OrdersService` with atomic stock hold creation and order '
                                        'confirmation.',
                                        '3. Implement `OrdersController` with tenant and permissions guards.',
                                        '4. Author unit/integration tests covering order creation, confirmation, '
                                        'cancellation, and stock math.'],
              'modify_scope': ['apps/api/src/orders/', 'packages/shared/src/orders/'],
              'objective_value': 'Implement orders domain layer with state machine (`DRAFT`, `PENDING_CONFIRMATION`, '
                                 '`CONFIRMED`, `CANCELLED`, `FULFILLED`), stock reservation integration, and '
                                 'conversation linking.',
              'read': [ 'docs/10_engineering/13_API_DESIGN.md',
                        'docs/10_engineering/12_DATABASE_DESIGN.md',
                        'docs/30_execution/32_FEATURE_SPECIFICATIONS.md'],
              'security_invariants': [ '🔒 **Atomic Stock Deduction**: Order confirmation must commit stock deduction '
                                       'and mark reservation `COMMITTED` in a single transaction.',
                                       '🛡️ **Tenancy**: All order queries and operations must filter by `business_id`.',
                                       '🚫 **Negative Invariants**: Never allow confirming an order if stock '
                                       'reservation has expired or insufficient stock.'],
              'size': 'L',
              'technical_contract': [ '`POST /orders` (201 Created) -> Body `{ customerId: string, conversationId?: '
                                      'string, items: [{ variantId, quantity, unitPrice }], shippingAddress }`',
                                      '`POST /orders/:id/confirm` (200 OK) -> Confirms order, transitions status to '
                                      '`CONFIRMED`, commits physical stock deduction',
                                      '`POST /orders/:id/cancel` (200 OK) -> Cancels order, releases stock reservation '
                                      'hold',
                                      '`GET /orders/:id` (200 OK) -> Order details with line items and customer '
                                      'snapshot'],
              'title': 'Orders domain layer, lifecycle & stock reservation management (`/orders`)',
              'wave': 'W6',
              'why': 'Allow sales reps and AI agents to draft and confirm commercial orders while automatically '
                     'managing stock reservations to prevent overselling.'},
    'id': 'T-ORD-01',
    'leaves': [ { 'cmd': 'pnpm --filter api test -- src/orders',
                  'do': [ '1. Define order DTOs and Zod schemas in shared.',
                          '2. Implement `OrdersService` with atomic stock hold creation and order confirmation.',
                          '3. Implement `OrdersController` with tenant and permissions guards.',
                          '4. Author unit/integration tests covering order creation, confirmation, cancellation, and '
                          'stock math.'],
                  'done': '**Create Draft**: Creates order in PENDING_CONFIRMATION with 30-min stock hold.',
                  'dont': [ '🚫 **Negative Invariants**: Never allow confirming an order if stock reservation has '
                            'expired or insufficient stock.'],
                  'files': [ 'apps/api/src/orders/core/orders.controller.ts',
                             'apps/api/src/orders/core/orders.service.ts',
                             'apps/api/src/orders/dto/create-order.dto.ts',
                             'apps/api/src/orders/dto/update-order-status.dto.ts',
                             'apps/api/src/orders/orders.module.ts'],
                  'gold': { 'acceptance_test_scenarios': [ '[ ] **Create Draft**: Creates order in '
                                                           'PENDING_CONFIRMATION with 30-min stock hold.',
                                                           '[ ] **Confirm Order**: Deducts physical stock, commits '
                                                           'reservation, sets status = CONFIRMED.',
                                                           '[ ] **Cancel Order**: Cancels order and releases stock '
                                                           'reservation hold.',
                                                           "[ ] **Tenancy Block (403)**: Accessing another tenant's "
                                                           'order returns 403 Forbidden.'],
                            'cmd': 'pnpm --filter api test -- src/orders',
                            'depends': ['T-CONV-02'],
                            'dont_modify_scope': ['apps/web/'],
                            'expected_deliverables': 'Orders controller, service, DTOs, and unit tests in '
                                                     '`apps/api/src/orders`.',
                            'files': [ 'apps/api/src/orders/core/orders.controller.ts',
                                       'apps/api/src/orders/core/orders.service.ts',
                                       'apps/api/src/orders/dto/create-order.dto.ts',
                                       'apps/api/src/orders/dto/update-order-status.dto.ts',
                                       'apps/api/src/orders/orders.module.ts'],
                            'fs': ['FS-ORD-01'],
                            'human_contribution': [ '**🧪 Manual QA & Smoke test**: Create draft order via Swagger; '
                                                    'call `POST /orders/:id/confirm` and verify stock deduction in '
                                                    'Prisma Studio (`pnpm --filter api exec prisma studio`).',
                                                    '**👁️ Review & Sign-off**: Verify stock hold and order creation '
                                                    'occur in an atomic Prisma transaction.'],
                            'id': 'T-ORD-01',
                            'implementation_steps': [ '1. Define order DTOs and Zod schemas in shared.',
                                                      '2. Implement `OrdersService` with atomic stock hold creation '
                                                      'and order confirmation.',
                                                      '3. Implement `OrdersController` with tenant and permissions '
                                                      'guards.',
                                                      '4. Author unit/integration tests covering order creation, '
                                                      'confirmation, cancellation, and stock math.'],
                            'modify_scope': ['apps/api/src/orders/', 'packages/shared/src/orders/'],
                            'objective_value': 'Implement orders domain layer with state machine (`DRAFT`, '
                                               '`PENDING_CONFIRMATION`, `CONFIRMED`, `CANCELLED`, `FULFILLED`), stock '
                                               'reservation integration, and conversation linking.',
                            'read': [ 'docs/10_engineering/13_API_DESIGN.md',
                                      'docs/10_engineering/12_DATABASE_DESIGN.md',
                                      'docs/30_execution/32_FEATURE_SPECIFICATIONS.md'],
                            'security_invariants': [ '🔒 **Atomic Stock Deduction**: Order confirmation must commit '
                                                     'stock deduction and mark reservation `COMMITTED` in a single '
                                                     'transaction.',
                                                     '🛡️ **Tenancy**: All order queries and operations must filter by '
                                                     '`business_id`.',
                                                     '🚫 **Negative Invariants**: Never allow confirming an order if '
                                                     'stock reservation has expired or insufficient stock.'],
                            'size': 'L',
                            'technical_contract': [ '`POST /orders` (201 Created) -> Body `{ customerId: string, '
                                                    'conversationId?: string, items: [{ variantId, quantity, unitPrice '
                                                    '}], shippingAddress }`',
                                                    '`POST /orders/:id/confirm` (200 OK) -> Confirms order, '
                                                    'transitions status to `CONFIRMED`, commits physical stock '
                                                    'deduction',
                                                    '`POST /orders/:id/cancel` (200 OK) -> Cancels order, releases '
                                                    'stock reservation hold',
                                                    '`GET /orders/:id` (200 OK) -> Order details with line items and '
                                                    'customer snapshot'],
                            'title': 'Orders domain layer, lifecycle & stock reservation management (`/orders`)',
                            'wave': 'W6',
                            'why': 'Allow sales reps and AI agents to draft and confirm commercial orders while '
                                   'automatically managing stock reservations to prevent overselling.'},
                  'letter': '',
                  'read': [ 'docs/10_engineering/13_API_DESIGN/03-pipeline-orders-customers.md',
                            'docs/10_engineering/12_DATABASE_DESIGN/04-orders-knowledge-ai-schema.md',
                            'docs/30_execution/32_FEATURE_SPECIFICATIONS.md'],
                  'title': 'Orders domain layer, lifecycle & stock reservation management (`/orders`)'}],
    'parent_done': '**Create Draft**: Creates order in PENDING_CONFIRMATION with 30-min stock hold.',
    'size': 'L',
    'title': 'Orders domain layer, lifecycle & stock reservation management (`/orders`)',
    'wave': 'W6'},
  { 'depends': ['T-ORD-01'],
    'fs': ['FS-ORD-01'],
    'gold': { 'acceptance_test_scenarios': [ '[ ] **Automated Expiry**: Expired holds transition to EXPIRED status.',
                                             '[ ] **Inventory Restoration**: Available stock restores immediately upon '
                                             'hold expiry.'],
              'cmd': 'pnpm --filter api test -- src/orders',
              'depends': ['T-ORD-01'],
              'dont_modify_scope': ['apps/web/'],
              'expected_deliverables': 'Reservation sweeper service and background processor in `apps/api/src/orders`.',
              'files': [ 'apps/api/src/orders/reservations/reservation-sweeper.service.ts',
                         'apps/api/src/orders/reservations/reservation-sweeper.processor.ts'],
              'fs': ['FS-ORD-01'],
              'human_contribution': [ '**🧪 Manual QA**: Create draft order, set expiration timestamp to past in DB, '
                                      'run sweeper worker and verify status updates to EXPIRED.'],
              'id': 'T-ORD-02',
              'implementation_steps': [ '1. Implement `ReservationSweeperService` with batch expiry query.',
                                        '2. Implement BullMQ repeatable sweeper processor.',
                                        '3. Author unit tests covering reservation expiry and order cancellation.'],
              'modify_scope': ['apps/api/src/orders/reservation-sweeper.*'],
              'objective_value': 'Implement background worker to automatically expire unconfirmed 30-minute stock '
                                 'reservations and restore available inventory.',
              'read': ['docs/10_engineering/14_SYSTEM_DESIGN.md', 'docs/10_engineering/12_DATABASE_DESIGN.md'],
              'security_invariants': [ '🔒 **Idempotent Sweeper**: Running sweeper multiple times must produce '
                                       'identical results without double-restoring stock.'],
              'size': 'M',
              'technical_contract': [ 'Worker runs every 1 minute via BullMQ repeatable job.',
                                      "Finds `stock_reservations` with `status = 'ACTIVE'` and `expires_at < NOW()`.",
                                      "Marks `status = 'EXPIRED'`, updates linked order to `CANCELLED` (reason: "
                                      '`EXPIRED_RESERVATION`).'],
              'title': 'Stock reservation TTL worker & automated expiration sweeper',
              'wave': 'W6',
              'why': 'Prevent abandoned order drafts from indefinitely locking up merchant stock.'},
    'id': 'T-ORD-02',
    'leaves': [ { 'cmd': 'pnpm --filter api test -- src/orders',
                  'do': [ '1. Implement `ReservationSweeperService` with batch expiry query.',
                          '2. Implement BullMQ repeatable sweeper processor.',
                          '3. Author unit tests covering reservation expiry and order cancellation.'],
                  'done': '**Automated Expiry**: Expired holds transition to EXPIRED status.',
                  'dont': [],
                  'files': [ 'apps/api/src/orders/reservations/reservation-sweeper.service.ts',
                             'apps/api/src/orders/reservations/reservation-sweeper.processor.ts'],
                  'gold': { 'acceptance_test_scenarios': [ '[ ] **Automated Expiry**: Expired holds transition to '
                                                           'EXPIRED status.',
                                                           '[ ] **Inventory Restoration**: Available stock restores '
                                                           'immediately upon hold expiry.'],
                            'cmd': 'pnpm --filter api test -- src/orders',
                            'depends': ['T-ORD-01'],
                            'dont_modify_scope': ['apps/web/'],
                            'expected_deliverables': 'Reservation sweeper service and background processor in '
                                                     '`apps/api/src/orders`.',
                            'files': [ 'apps/api/src/orders/reservations/reservation-sweeper.service.ts',
                                       'apps/api/src/orders/reservations/reservation-sweeper.processor.ts'],
                            'fs': ['FS-ORD-01'],
                            'human_contribution': [ '**🧪 Manual QA**: Create draft order, set expiration timestamp to '
                                                    'past in DB, run sweeper worker and verify status updates to '
                                                    'EXPIRED.'],
                            'id': 'T-ORD-02',
                            'implementation_steps': [ '1. Implement `ReservationSweeperService` with batch expiry '
                                                      'query.',
                                                      '2. Implement BullMQ repeatable sweeper processor.',
                                                      '3. Author unit tests covering reservation expiry and order '
                                                      'cancellation.'],
                            'modify_scope': ['apps/api/src/orders/reservation-sweeper.*'],
                            'objective_value': 'Implement background worker to automatically expire unconfirmed '
                                               '30-minute stock reservations and restore available inventory.',
                            'read': [ 'docs/10_engineering/14_SYSTEM_DESIGN.md',
                                      'docs/10_engineering/12_DATABASE_DESIGN.md'],
                            'security_invariants': [ '🔒 **Idempotent Sweeper**: Running sweeper multiple times must '
                                                     'produce identical results without double-restoring stock.'],
                            'size': 'M',
                            'technical_contract': [ 'Worker runs every 1 minute via BullMQ repeatable job.',
                                                    "Finds `stock_reservations` with `status = 'ACTIVE'` and "
                                                    '`expires_at < NOW()`.',
                                                    "Marks `status = 'EXPIRED'`, updates linked order to `CANCELLED` "
                                                    '(reason: `EXPIRED_RESERVATION`).'],
                            'title': 'Stock reservation TTL worker & automated expiration sweeper',
                            'wave': 'W6',
                            'why': 'Prevent abandoned order drafts from indefinitely locking up merchant stock.'},
                  'letter': '',
                  'read': [ 'docs/10_engineering/14_SYSTEM_DESIGN/02-locks-jobs-events-scoring.md',
                            'docs/10_engineering/12_DATABASE_DESIGN/04-orders-knowledge-ai-schema.md',
                            'docs/30_execution/32_FEATURE_SPECIFICATIONS.md'],
                  'title': 'Stock reservation TTL worker & automated expiration sweeper'}],
    'parent_done': '**Automated Expiry**: Expired holds transition to EXPIRED status.',
    'size': 'M',
    'title': 'Stock reservation TTL worker & automated expiration sweeper',
    'wave': 'W6'},
  { 'depends': ['T-ORD-01'],
    'fs': ['FS-ORD-01'],
    'gold': { 'acceptance_test_scenarios': [ '[ ] **Filter by Status**: Correctly filters orders by CONFIRMED / '
                                             'PENDING.',
                                             '[ ] **Date Range Filter**: Limits results within specified date range.'],
              'cmd': 'pnpm --filter api test -- src/orders',
              'depends': ['T-ORD-01'],
              'dont_modify_scope': ['apps/web/'],
              'expected_deliverables': 'Orders listing query methods and tests in `apps/api/src/orders`.',
              'files': [ 'apps/api/src/orders/core/orders.controller.ts',
                         'apps/api/src/orders/core/orders.service.ts',
                         'apps/api/src/orders/dto/list-orders.dto.ts'],
              'fs': ['FS-ORD-01'],
              'human_contribution': ['**🧪 Manual QA**: Query `GET /orders` via Swagger with status filters.'],
              'id': 'T-ORD-03',
              'implementation_steps': [ '1. Implement `listOrders` query builder with cursor pagination.',
                                        '2. Author unit tests covering multi-status filtering and date range checks.'],
              'modify_scope': ['apps/api/src/orders/orders.*', 'apps/api/src/orders/dto/*list*'],
              'objective_value': 'Implement orders query endpoint with status filters, date range selection, customer '
                                 'search, and cursor pagination.',
              'read': ['docs/10_engineering/13_API_DESIGN.md', 'docs/10_engineering/12_DATABASE_DESIGN.md'],
              'security_invariants': ['🔒 **Tenancy Boundary**: Query must strictly filter by `business_id`.'],
              'size': 'M',
              'technical_contract': [ '`GET /orders` (200 OK) -> Query params: `status`, `customerId`, `from`, `to`, '
                                      '`cursor`, `limit`',
                                      'Response: `{ items: OrderSummaryDto[], nextCursor?: string, totalCount: number '
                                      '}`'],
              'title': 'Orders query API, filtering & detail view (`GET /orders`)',
              'wave': 'W6',
              'why': 'Allow merchants to review order history, monitor pending confirmations, and inspect fulfillment '
                     'details.'},
    'id': 'T-ORD-03',
    'leaves': [ { 'cmd': 'pnpm --filter api test -- src/orders',
                  'do': [ '1. Implement `listOrders` query builder with cursor pagination.',
                          '2. Author unit tests covering multi-status filtering and date range checks.'],
                  'done': '**Filter by Status**: Correctly filters orders by CONFIRMED / PENDING.',
                  'dont': [],
                  'files': [ 'apps/api/src/orders/core/orders.controller.ts',
                             'apps/api/src/orders/core/orders.service.ts',
                             'apps/api/src/orders/dto/list-orders.dto.ts'],
                  'gold': { 'acceptance_test_scenarios': [ '[ ] **Filter by Status**: Correctly filters orders by '
                                                           'CONFIRMED / PENDING.',
                                                           '[ ] **Date Range Filter**: Limits results within specified '
                                                           'date range.'],
                            'cmd': 'pnpm --filter api test -- src/orders',
                            'depends': ['T-ORD-01'],
                            'dont_modify_scope': ['apps/web/'],
                            'expected_deliverables': 'Orders listing query methods and tests in `apps/api/src/orders`.',
                            'files': [ 'apps/api/src/orders/core/orders.controller.ts',
                                       'apps/api/src/orders/core/orders.service.ts',
                                       'apps/api/src/orders/dto/list-orders.dto.ts'],
                            'fs': ['FS-ORD-01'],
                            'human_contribution': [ '**🧪 Manual QA**: Query `GET /orders` via Swagger with status '
                                                    'filters.'],
                            'id': 'T-ORD-03',
                            'implementation_steps': [ '1. Implement `listOrders` query builder with cursor pagination.',
                                                      '2. Author unit tests covering multi-status filtering and date '
                                                      'range checks.'],
                            'modify_scope': ['apps/api/src/orders/orders.*', 'apps/api/src/orders/dto/*list*'],
                            'objective_value': 'Implement orders query endpoint with status filters, date range '
                                               'selection, customer search, and cursor pagination.',
                            'read': [ 'docs/10_engineering/13_API_DESIGN.md',
                                      'docs/10_engineering/12_DATABASE_DESIGN.md'],
                            'security_invariants': [ '🔒 **Tenancy Boundary**: Query must strictly filter by '
                                                     '`business_id`.'],
                            'size': 'M',
                            'technical_contract': [ '`GET /orders` (200 OK) -> Query params: `status`, `customerId`, '
                                                    '`from`, `to`, `cursor`, `limit`',
                                                    'Response: `{ items: OrderSummaryDto[], nextCursor?: string, '
                                                    'totalCount: number }`'],
                            'title': 'Orders query API, filtering & detail view (`GET /orders`)',
                            'wave': 'W6',
                            'why': 'Allow merchants to review order history, monitor pending confirmations, and '
                                   'inspect fulfillment details.'},
                  'letter': '',
                  'read': [ 'docs/10_engineering/13_API_DESIGN/03-pipeline-orders-customers.md',
                            'docs/10_engineering/12_DATABASE_DESIGN/04-orders-knowledge-ai-schema.md',
                            'docs/30_execution/32_FEATURE_SPECIFICATIONS.md'],
                  'title': 'Orders query API, filtering & detail view (`GET /orders`)'}],
    'parent_done': '**Filter by Status**: Correctly filters orders by CONFIRMED / PENDING.',
    'size': 'M',
    'title': 'Orders query API, filtering & detail view (`GET /orders`)',
    'wave': 'W6'},
  { 'depends': ['T-ORD-01'],
    'fs': ['FS-ORD-01'],
    'gold': { 'acceptance_test_scenarios': [ '[ ] **Draft from Inbox**: Creates draft order linked to conversation '
                                             'thread.'],
              'cmd': 'pnpm --filter api test -- src/orders',
              'depends': ['T-ORD-01'],
              'dont_modify_scope': ['apps/web/'],
              'expected_deliverables': 'Manual order draft endpoints in `apps/api/src/orders`.',
              'files': ['apps/api/src/orders/core/orders.controller.ts', 'apps/api/src/orders/core/orders.service.ts'],
              'fs': ['FS-ORD-01'],
              'human_contribution': [ '**🧪 Manual QA**: Call `POST /conversations/:id/orders/draft` via Swagger and '
                                      'verify draft creation.'],
              'id': 'T-ORD-04',
              'implementation_steps': [ '1. Implement draft order creation route inside conversation context.',
                                        '2. Author unit tests verifying stock hold and conversation link.'],
              'modify_scope': ['apps/api/src/orders/orders.*'],
              'objective_value': 'Implement manual order draft generation directly linked to an active conversation '
                                 'thread.',
              'read': ['docs/10_engineering/13_API_DESIGN.md', 'docs/30_execution/32_FEATURE_SPECIFICATIONS.md'],
              'security_invariants': ["🔒 **Conversation Match**: Verify conversation belongs to caller's tenant."],
              'size': 'M',
              'technical_contract': [ '`POST /conversations/:id/orders/draft` (201 Created) -> Creates draft order '
                                      'linked to conversation, places stock hold, returns order summary.'],
              'title': 'Manual order draft creation from inbox conversation drawer',
              'wave': 'W6',
              'why': 'Allow sales reps to quickly draft an order while chatting with a customer in the inbox drawer.'},
    'id': 'T-ORD-04',
    'leaves': [ { 'cmd': 'pnpm --filter api test -- src/orders',
                  'do': [ '1. Implement draft order creation route inside conversation context.',
                          '2. Author unit tests verifying stock hold and conversation link.'],
                  'done': '**Draft from Inbox**: Creates draft order linked to conversation thread.',
                  'dont': [],
                  'files': ['apps/api/src/orders/core/orders.controller.ts', 'apps/api/src/orders/core/orders.service.ts'],
                  'gold': { 'acceptance_test_scenarios': [ '[ ] **Draft from Inbox**: Creates draft order linked to '
                                                           'conversation thread.'],
                            'cmd': 'pnpm --filter api test -- src/orders',
                            'depends': ['T-ORD-01'],
                            'dont_modify_scope': ['apps/web/'],
                            'expected_deliverables': 'Manual order draft endpoints in `apps/api/src/orders`.',
                            'files': [ 'apps/api/src/orders/core/orders.controller.ts',
                                       'apps/api/src/orders/core/orders.service.ts'],
                            'fs': ['FS-ORD-01'],
                            'human_contribution': [ '**🧪 Manual QA**: Call `POST /conversations/:id/orders/draft` via '
                                                    'Swagger and verify draft creation.'],
                            'id': 'T-ORD-04',
                            'implementation_steps': [ '1. Implement draft order creation route inside conversation '
                                                      'context.',
                                                      '2. Author unit tests verifying stock hold and conversation '
                                                      'link.'],
                            'modify_scope': ['apps/api/src/orders/orders.*'],
                            'objective_value': 'Implement manual order draft generation directly linked to an active '
                                               'conversation thread.',
                            'read': [ 'docs/10_engineering/13_API_DESIGN.md',
                                      'docs/30_execution/32_FEATURE_SPECIFICATIONS.md'],
                            'security_invariants': [ '🔒 **Conversation Match**: Verify conversation belongs to '
                                                     "caller's tenant."],
                            'size': 'M',
                            'technical_contract': [ '`POST /conversations/:id/orders/draft` (201 Created) -> Creates '
                                                    'draft order linked to conversation, places stock hold, returns '
                                                    'order summary.'],
                            'title': 'Manual order draft creation from inbox conversation drawer',
                            'wave': 'W6',
                            'why': 'Allow sales reps to quickly draft an order while chatting with a customer in the '
                                   'inbox drawer.'},
                  'letter': '',
                  'read': [ 'docs/10_engineering/13_API_DESIGN/03-pipeline-orders-customers.md',
                            'docs/20_design/23_UI_COMPONENTS/03-inbox-command-center.md',
                            'docs/30_execution/32_FEATURE_SPECIFICATIONS.md'],
                  'title': 'Manual order draft creation from inbox conversation drawer'}],
    'parent_done': '**Draft from Inbox**: Creates draft order linked to conversation thread.',
    'size': 'M',
    'title': 'Manual order draft creation from inbox conversation drawer',
    'wave': 'W6'},
  { 'depends': ['T-LEAD-01', 'T-ORD-01'],
    'fs': ['FS-CONV-02'],
    'gold': { 'acceptance_test_scenarios': [ '[ ] **4 Columns**: Conversations and orders correctly mapped to 4 '
                                             'pipeline stages.'],
              'cmd': 'pnpm --filter api test -- src/conversations',
              'depends': ['T-LEAD-01', 'T-ORD-01'],
              'dont_modify_scope': ['apps/web/'],
              'expected_deliverables': 'Pipeline aggregation controller and service in `apps/api/src/conversations`.',
              'files': [ 'apps/api/src/conversations/pipeline/pipeline.controller.ts',
                         'apps/api/src/conversations/pipeline/pipeline.service.ts'],
              'fs': ['FS-CONV-02'],
              'human_contribution': [ '**🧪 Manual QA**: Call `GET /pipeline` in Swagger and verify deal cards '
                                      'distribution.'],
              'id': 'T-CONV-07',
              'implementation_steps': [ '1. Implement `PipelineService.getPipeline()` aggregating conversations by '
                                        'lead status and pending orders.',
                                        '2. Implement `PipelineController`.',
                                        '3. Author unit tests covering column categorization and deal value sums.'],
              'modify_scope': ['apps/api/src/conversations/pipeline.*'],
              'objective_value': 'Implement 4-stage commercial sales pipeline Kanban board aggregation API '
                                 '(`NEW_LEAD`, `IN_CONVERSATION`, `PENDING_CONFIRMATION`, `CLOSED_WON`).',
              'read': ['docs/10_engineering/13_API_DESIGN.md', 'docs/30_execution/32_FEATURE_SPECIFICATIONS.md'],
              'security_invariants': [ '🔒 **Dynamic Projection**: Compute pipeline columns dynamically from '
                                       'conversation and order tables (do NOT create a separate pipeline table).'],
              'size': 'M',
              'technical_contract': [ '`GET /pipeline` (200 OK) -> Returns 4 columns: `new_leads`, `in_conversation`, '
                                      '`pending_confirmation`, `closed_won` with card summaries.'],
              'title': 'Sales pipeline Kanban board API (`GET /pipeline`)',
              'wave': 'W6',
              'why': 'Give store owners a high-level visual pipeline of all active deals and commercial conversion '
                     'velocity.'},
    'id': 'T-CONV-07',
    'leaves': [ { 'cmd': 'pnpm --filter api test -- src/conversations',
                  'do': [ '1. Implement `PipelineService.getPipeline()` aggregating conversations by lead status and '
                          'pending orders.',
                          '2. Implement `PipelineController`.',
                          '3. Author unit tests covering column categorization and deal value sums.'],
                  'done': '**4 Columns**: Conversations and orders correctly mapped to 4 pipeline stages.',
                  'dont': [],
                  'files': [ 'apps/api/src/conversations/pipeline/pipeline.controller.ts',
                             'apps/api/src/conversations/pipeline/pipeline.service.ts'],
                  'gold': { 'acceptance_test_scenarios': [ '[ ] **4 Columns**: Conversations and orders correctly '
                                                           'mapped to 4 pipeline stages.'],
                            'cmd': 'pnpm --filter api test -- src/conversations',
                            'depends': ['T-LEAD-01', 'T-ORD-01'],
                            'dont_modify_scope': ['apps/web/'],
                            'expected_deliverables': 'Pipeline aggregation controller and service in '
                                                     '`apps/api/src/conversations`.',
                            'files': [ 'apps/api/src/conversations/pipeline/pipeline.controller.ts',
                                       'apps/api/src/conversations/pipeline/pipeline.service.ts'],
                            'fs': ['FS-CONV-02'],
                            'human_contribution': [ '**🧪 Manual QA**: Call `GET /pipeline` in Swagger and verify deal '
                                                    'cards distribution.'],
                            'id': 'T-CONV-07',
                            'implementation_steps': [ '1. Implement `PipelineService.getPipeline()` aggregating '
                                                      'conversations by lead status and pending orders.',
                                                      '2. Implement `PipelineController`.',
                                                      '3. Author unit tests covering column categorization and deal '
                                                      'value sums.'],
                            'modify_scope': ['apps/api/src/conversations/pipeline.*'],
                            'objective_value': 'Implement 4-stage commercial sales pipeline Kanban board aggregation '
                                               'API (`NEW_LEAD`, `IN_CONVERSATION`, `PENDING_CONFIRMATION`, '
                                               '`CLOSED_WON`).',
                            'read': [ 'docs/10_engineering/13_API_DESIGN.md',
                                      'docs/30_execution/32_FEATURE_SPECIFICATIONS.md'],
                            'security_invariants': [ '🔒 **Dynamic Projection**: Compute pipeline columns dynamically '
                                                     'from conversation and order tables (do NOT create a separate '
                                                     'pipeline table).'],
                            'size': 'M',
                            'technical_contract': [ '`GET /pipeline` (200 OK) -> Returns 4 columns: `new_leads`, '
                                                    '`in_conversation`, `pending_confirmation`, `closed_won` with card '
                                                    'summaries.'],
                            'title': 'Sales pipeline Kanban board API (`GET /pipeline`)',
                            'wave': 'W6',
                            'why': 'Give store owners a high-level visual pipeline of all active deals and commercial '
                                   'conversion velocity.'},
                  'letter': '',
                  'read': [ 'docs/10_engineering/13_API_DESIGN/03-pipeline-orders-customers.md',
                            'docs/10_engineering/12_DATABASE_DESIGN/03-customers-messaging-integrations.md',
                            'docs/30_execution/32_FEATURE_SPECIFICATIONS.md'],
                  'title': 'Sales pipeline Kanban board API (`GET /pipeline`)'}],
    'parent_done': '**4 Columns**: Conversations and orders correctly mapped to 4 pipeline stages.',
    'size': 'M',
    'title': 'Sales pipeline Kanban board API (`GET /pipeline`)',
    'wave': 'W6'},
  { 'depends': ['T-HAND-01', 'T-ORD-01'],
    'fs': ['FS-HAND-01'],
    'gold': { 'acceptance_test_scenarios': [ '[ ] **Purchase Flow**: Inbound purchase intent creates draft order, '
                                             'reserves stock, and notifies human.',
                                             '[ ] **Insufficient Stock**: If stock is insufficient, triggers '
                                             '`STOCK_OUTAGE` handoff instead of drafting order.'],
              'cmd': 'pnpm --filter api test -- src/ai',
              'depends': ['T-HAND-01', 'T-ORD-01'],
              'dont_modify_scope': ['apps/web/'],
              'expected_deliverables': 'Purchase handoff service and test suite in `apps/api/src/ai`.',
              'files': ['apps/api/src/ai/handoff/purchase-handoff.service.ts', 'apps/api/src/ai/handoff/purchase-handoff.spec.ts'],
              'fs': ['FS-HAND-01'],
              'human_contribution': [ '**🧪 Manual QA & Smoke test**: Simulate customer purchase dialogue in test '
                                      'runner; verify draft order and briefing note appear.',
                                      '**👁️ Review & Sign-off**: Verify stock hold is placed prior to handoff '
                                      'notification.'],
              'id': 'T-HAND-02',
              'implementation_steps': [ '1. Implement purchase intent extractor and validator.',
                                        '2. Integrate order drafting and stock reservation hold.',
                                        '3. Transition conversation state and generate structured briefing.',
                                        '4. Author exhaustive unit tests verifying end-to-end purchase handoff.'],
              'modify_scope': ['apps/api/src/ai/purchase-handoff.*'],
              'objective_value': 'Implement end-to-end purchase intent handoff flow: AI collects customer '
                                 'name/phone/address, places 30-min stock reservation, drafts order, pauses AI, and '
                                 'generates handoff briefing for sales rep.',
              'read': [ 'docs/00_product/06_AI_HUMAN_HANDOFF_RULES.md',
                        'docs/10_engineering/15_AI_ARCHITECTURE.md',
                        'docs/30_execution/32_FEATURE_SPECIFICATIONS.md'],
              'security_invariants': [ '🔒 **Stock Hold Guarantee**: Never transition to purchase handoff without '
                                       'successfully placing stock reservation hold.'],
              'size': 'XL',
              'technical_contract': [ '`PurchaseHandoffService.handlePurchaseIntent(conversationId, intentData)`',
                                      'Creates draft order in `PENDING_CONFIRMATION`, sets `ai_enabled = false`, '
                                      'status = `HUMAN_REQUIRED`, inserts order briefing note in thread.'],
              'title': 'Purchase intent handoff & order draft flow',
              'wave': 'W6',
              'why': 'Automate 90% of order preparation while allowing a human sales rep to perform final confirmation '
                     'with the customer.'},
    'id': 'T-HAND-02',
    'leaves': [ { 'cmd': 'pnpm --filter api test -- src/ai',
                  'do': [ '1. Implement purchase intent extractor and validator.',
                          '2. Integrate order drafting and stock reservation hold.',
                          '3. Transition conversation state and generate structured briefing.',
                          '4. Author exhaustive unit tests verifying end-to-end purchase handoff.'],
                  'done': '**Purchase Flow**: Inbound purchase intent creates draft order, reserves stock, and '
                          'notifies human.',
                  'dont': [],
                  'files': ['apps/api/src/ai/handoff/purchase-handoff.service.ts', 'apps/api/src/ai/handoff/purchase-handoff.spec.ts'],
                  'gold': { 'acceptance_test_scenarios': [ '[ ] **Purchase Flow**: Inbound purchase intent creates '
                                                           'draft order, reserves stock, and notifies human.',
                                                           '[ ] **Insufficient Stock**: If stock is insufficient, '
                                                           'triggers `STOCK_OUTAGE` handoff instead of drafting '
                                                           'order.'],
                            'cmd': 'pnpm --filter api test -- src/ai',
                            'depends': ['T-HAND-01', 'T-ORD-01'],
                            'dont_modify_scope': ['apps/web/'],
                            'expected_deliverables': 'Purchase handoff service and test suite in `apps/api/src/ai`.',
                            'files': [ 'apps/api/src/ai/handoff/purchase-handoff.service.ts',
                                       'apps/api/src/ai/handoff/purchase-handoff.spec.ts'],
                            'fs': ['FS-HAND-01'],
                            'human_contribution': [ '**🧪 Manual QA & Smoke test**: Simulate customer purchase dialogue '
                                                    'in test runner; verify draft order and briefing note appear.',
                                                    '**👁️ Review & Sign-off**: Verify stock hold is placed prior to '
                                                    'handoff notification.'],
                            'id': 'T-HAND-02',
                            'implementation_steps': [ '1. Implement purchase intent extractor and validator.',
                                                      '2. Integrate order drafting and stock reservation hold.',
                                                      '3. Transition conversation state and generate structured '
                                                      'briefing.',
                                                      '4. Author exhaustive unit tests verifying end-to-end purchase '
                                                      'handoff.'],
                            'modify_scope': ['apps/api/src/ai/purchase-handoff.*'],
                            'objective_value': 'Implement end-to-end purchase intent handoff flow: AI collects '
                                               'customer name/phone/address, places 30-min stock reservation, drafts '
                                               'order, pauses AI, and generates handoff briefing for sales rep.',
                            'read': [ 'docs/00_product/06_AI_HUMAN_HANDOFF_RULES.md',
                                      'docs/10_engineering/15_AI_ARCHITECTURE.md',
                                      'docs/30_execution/32_FEATURE_SPECIFICATIONS.md'],
                            'security_invariants': [ '🔒 **Stock Hold Guarantee**: Never transition to purchase handoff '
                                                     'without successfully placing stock reservation hold.'],
                            'size': 'XL',
                            'technical_contract': [ '`PurchaseHandoffService.handlePurchaseIntent(conversationId, '
                                                    'intentData)`',
                                                    'Creates draft order in `PENDING_CONFIRMATION`, sets `ai_enabled = '
                                                    'false`, status = `HUMAN_REQUIRED`, inserts order briefing note in '
                                                    'thread.'],
                            'title': 'Purchase intent handoff & order draft flow',
                            'wave': 'W6',
                            'why': 'Automate 90% of order preparation while allowing a human sales rep to perform '
                                   'final confirmation with the customer.'},
                  'letter': '',
                  'read': [ 'docs/00_product/06_AI_HUMAN_HANDOFF_RULES/02-takeover-lifecycle-events.md',
                            'docs/10_engineering/13_API_DESIGN/03-pipeline-orders-customers.md',
                            'docs/30_execution/32_FEATURE_SPECIFICATIONS.md'],
                  'title': 'Purchase intent handoff & order draft flow'}],
    'parent_done': '**Purchase Flow**: Inbound purchase intent creates draft order, reserves stock, and notifies '
                   'human.',
    'size': 'XL',
    'title': 'Purchase intent handoff & order draft flow',
    'wave': 'W6'},
  { 'depends': ['T-INT-03'],
    'fs': ['FS-CUST-01'],
    'gold': { 'acceptance_test_scenarios': [ '[ ] **Identity Link**: Linking Instagram and WhatsApp with same phone '
                                             'links to single customer record.'],
              'cmd': 'pnpm --filter api test -- src/customers',
              'depends': ['T-INT-03'],
              'dont_modify_scope': ['apps/web/'],
              'expected_deliverables': 'Customer resolution service, controller, and tests in '
                                       '`apps/api/src/customers`.',
              'files': [ 'apps/api/src/customers/workspace/customers.controller.ts',
                         'apps/api/src/customers/workspace/customers.service.ts',
                         'apps/api/src/customers/identity/identity-resolver.service.ts',
                         'apps/api/src/customers/customers.module.ts'],
              'fs': ['FS-CUST-01'],
              'human_contribution': [ '**🧪 Manual QA**: Send message from IG and WhatsApp with same phone; verify '
                                      'single customer record in DB.'],
              'id': 'T-CUST-01',
              'implementation_steps': [ '1. Implement `IdentityResolverService` matching on phone or channel account '
                                        'ID.',
                                        '2. Implement `CustomersController` and `CustomersService`.',
                                        '3. Author unit tests covering identity linking, new profile creation, and '
                                        'tenant isolation.'],
              'modify_scope': ['apps/api/src/customers/', 'packages/shared/src/customers/'],
              'objective_value': 'Implement customer profile repository and multi-channel identity resolution linking '
                                 'phone numbers across Instagram, WhatsApp, and Messenger.',
              'read': [ 'docs/10_engineering/13_API_DESIGN.md',
                        'docs/10_engineering/12_DATABASE_DESIGN.md',
                        'docs/30_execution/32_FEATURE_SPECIFICATIONS.md'],
              'security_invariants': [ '🔒 **Tenancy Boundary**: Customer identity linking is strictly isolated to the '
                                       "merchant's `business_id`."],
              'size': 'L',
              'technical_contract': [ '`IdentityResolverService.resolveCustomer(businessId, channelType, externalId, '
                                      'phone)`: Looks up or creates unified `customers` record, links '
                                      '`customer_identities` row.',
                                      '`GET /customers/:id` (200 OK) -> Unified profile with all linked channel '
                                      'identities and order history.'],
              'title': 'Customer profile resolution & multi-channel identity linking',
              'wave': 'W6',
              'why': 'Provide a single customer profile when the same shopper contacts the store across different '
                     'social messaging platforms.'},
    'id': 'T-CUST-01',
    'leaves': [ { 'cmd': 'pnpm --filter api test -- src/customers',
                  'do': [ '1. Implement `IdentityResolverService` matching on phone or channel account ID.',
                          '2. Implement `CustomersController` and `CustomersService`.',
                          '3. Author unit tests covering identity linking, new profile creation, and tenant '
                          'isolation.'],
                  'done': '**Identity Link**: Linking Instagram and WhatsApp with same phone links to single customer '
                          'record.',
                  'dont': [],
                  'files': [ 'apps/api/src/customers/workspace/customers.controller.ts',
                             'apps/api/src/customers/workspace/customers.service.ts',
                             'apps/api/src/customers/identity/identity-resolver.service.ts',
                             'apps/api/src/customers/customers.module.ts'],
                  'gold': { 'acceptance_test_scenarios': [ '[ ] **Identity Link**: Linking Instagram and WhatsApp with '
                                                           'same phone links to single customer record.'],
                            'cmd': 'pnpm --filter api test -- src/customers',
                            'depends': ['T-INT-03'],
                            'dont_modify_scope': ['apps/web/'],
                            'expected_deliverables': 'Customer resolution service, controller, and tests in '
                                                     '`apps/api/src/customers`.',
                            'files': [ 'apps/api/src/customers/workspace/customers.controller.ts',
                                       'apps/api/src/customers/workspace/customers.service.ts',
                                       'apps/api/src/customers/identity/identity-resolver.service.ts',
                                       'apps/api/src/customers/customers.module.ts'],
                            'fs': ['FS-CUST-01'],
                            'human_contribution': [ '**🧪 Manual QA**: Send message from IG and WhatsApp with same '
                                                    'phone; verify single customer record in DB.'],
                            'id': 'T-CUST-01',
                            'implementation_steps': [ '1. Implement `IdentityResolverService` matching on phone or '
                                                      'channel account ID.',
                                                      '2. Implement `CustomersController` and `CustomersService`.',
                                                      '3. Author unit tests covering identity linking, new profile '
                                                      'creation, and tenant isolation.'],
                            'modify_scope': ['apps/api/src/customers/', 'packages/shared/src/customers/'],
                            'objective_value': 'Implement customer profile repository and multi-channel identity '
                                               'resolution linking phone numbers across Instagram, WhatsApp, and '
                                               'Messenger.',
                            'read': [ 'docs/10_engineering/13_API_DESIGN.md',
                                      'docs/10_engineering/12_DATABASE_DESIGN.md',
                                      'docs/30_execution/32_FEATURE_SPECIFICATIONS.md'],
                            'security_invariants': [ '🔒 **Tenancy Boundary**: Customer identity linking is strictly '
                                                     "isolated to the merchant's `business_id`."],
                            'size': 'L',
                            'technical_contract': [ '`IdentityResolverService.resolveCustomer(businessId, channelType, '
                                                    'externalId, phone)`: Looks up or creates unified `customers` '
                                                    'record, links `customer_identities` row.',
                                                    '`GET /customers/:id` (200 OK) -> Unified profile with all linked '
                                                    'channel identities and order history.'],
                            'title': 'Customer profile resolution & multi-channel identity linking',
                            'wave': 'W6',
                            'why': 'Provide a single customer profile when the same shopper contacts the store across '
                                   'different social messaging platforms.'},
                  'letter': '',
                  'read': [ 'docs/10_engineering/13_API_DESIGN/03-pipeline-orders-customers.md',
                            'docs/10_engineering/12_DATABASE_DESIGN/03-customers-messaging-integrations.md',
                            'docs/30_execution/32_FEATURE_SPECIFICATIONS.md'],
                  'title': 'Customer profile resolution & multi-channel identity linking'}],
    'parent_done': '**Identity Link**: Linking Instagram and WhatsApp with same phone links to single customer record.',
    'size': 'L',
    'title': 'Customer profile resolution & multi-channel identity linking',
    'wave': 'W6'},
  { 'depends': ['T-CUST-01'],
    'fs': ['FS-CUST-01'],
    'gold': { 'acceptance_test_scenarios': ['[ ] **Update Customer**: Staff can update customer tags and VIP status.'],
              'cmd': 'pnpm --filter api test -- src/customers',
              'depends': ['T-CUST-01'],
              'dont_modify_scope': ['apps/web/'],
              'expected_deliverables': 'Customer profile update endpoints in `apps/api/src/customers`.',
              'files': [ 'apps/api/src/customers/workspace/customers.controller.ts',
                         'apps/api/src/customers/workspace/customers.service.ts',
                         'apps/api/src/customers/dto/update-customer.dto.ts'],
              'fs': ['FS-CUST-01'],
              'human_contribution': ['**🧪 Manual QA**: Update customer tags via Swagger and verify in DB.'],
              'id': 'T-CUST-02',
              'implementation_steps': [ '1. Implement customer PATCH route and validation.',
                                        '2. Author unit tests covering tags, VIP status, and tenant isolation.'],
              'modify_scope': ['apps/api/src/customers/customers.*', 'apps/api/src/customers/dto/*'],
              'objective_value': 'Implement customer profile updates, staff internal notes, VIP flagging, and custom '
                                 'tags.',
              'read': ['docs/10_engineering/13_API_DESIGN.md', 'docs/10_engineering/12_DATABASE_DESIGN.md'],
              'security_invariants': ['🔒 **Tenancy**: Cross-tenant updates return 403 Forbidden.'],
              'size': 'M',
              'technical_contract': [ '`PATCH /customers/:id` (200 OK) -> Body `{ name?: string, phone?: string, '
                                      'tags?: string[], isVip?: boolean, notes?: string }`'],
              'title': 'Customer profile management, tags & VIP flags (`/customers/:id`)',
              'wave': 'W6',
              'why': "Allow sales reps to tag important clients ('VIP', 'Wholesale', 'Bad Return History') and record "
                     'private notes.'},
    'id': 'T-CUST-02',
    'leaves': [ { 'cmd': 'pnpm --filter api test -- src/customers',
                  'do': [ '1. Implement customer PATCH route and validation.',
                          '2. Author unit tests covering tags, VIP status, and tenant isolation.'],
                  'done': '**Update Customer**: Staff can update customer tags and VIP status.',
                  'dont': [],
                  'files': [ 'apps/api/src/customers/workspace/customers.controller.ts',
                             'apps/api/src/customers/workspace/customers.service.ts',
                             'apps/api/src/customers/dto/update-customer.dto.ts'],
                  'gold': { 'acceptance_test_scenarios': [ '[ ] **Update Customer**: Staff can update customer tags '
                                                           'and VIP status.'],
                            'cmd': 'pnpm --filter api test -- src/customers',
                            'depends': ['T-CUST-01'],
                            'dont_modify_scope': ['apps/web/'],
                            'expected_deliverables': 'Customer profile update endpoints in `apps/api/src/customers`.',
                            'files': [ 'apps/api/src/customers/workspace/customers.controller.ts',
                                       'apps/api/src/customers/workspace/customers.service.ts',
                                       'apps/api/src/customers/dto/update-customer.dto.ts'],
                            'fs': ['FS-CUST-01'],
                            'human_contribution': [ '**🧪 Manual QA**: Update customer tags via Swagger and verify in '
                                                    'DB.'],
                            'id': 'T-CUST-02',
                            'implementation_steps': [ '1. Implement customer PATCH route and validation.',
                                                      '2. Author unit tests covering tags, VIP status, and tenant '
                                                      'isolation.'],
                            'modify_scope': ['apps/api/src/customers/customers.*', 'apps/api/src/customers/dto/*'],
                            'objective_value': 'Implement customer profile updates, staff internal notes, VIP '
                                               'flagging, and custom tags.',
                            'read': [ 'docs/10_engineering/13_API_DESIGN.md',
                                      'docs/10_engineering/12_DATABASE_DESIGN.md'],
                            'security_invariants': ['🔒 **Tenancy**: Cross-tenant updates return 403 Forbidden.'],
                            'size': 'M',
                            'technical_contract': [ '`PATCH /customers/:id` (200 OK) -> Body `{ name?: string, phone?: '
                                                    'string, tags?: string[], isVip?: boolean, notes?: string }`'],
                            'title': 'Customer profile management, tags & VIP flags (`/customers/:id`)',
                            'wave': 'W6',
                            'why': "Allow sales reps to tag important clients ('VIP', 'Wholesale', 'Bad Return "
                                   "History') and record private notes."},
                  'letter': '',
                  'read': [ 'docs/10_engineering/13_API_DESIGN/03-pipeline-orders-customers.md',
                            'docs/10_engineering/12_DATABASE_DESIGN/03-customers-messaging-integrations.md',
                            'docs/30_execution/32_FEATURE_SPECIFICATIONS.md'],
                  'title': 'Customer profile management, tags & VIP flags (`/customers/:id`)'}],
    'parent_done': '**Update Customer**: Staff can update customer tags and VIP status.',
    'size': 'M',
    'title': 'Customer profile management, tags & VIP flags (`/customers/:id`)',
    'wave': 'W6'},
  { 'depends': ['T-CUST-01', 'T-BIZ-07'],
    'fs': ['FS-CUST-01'],
    'gold': { 'acceptance_test_scenarios': [ '[ ] **Merge Profiles**: Orders and conversations transfer to survivor '
                                             'profile.',
                                             '[ ] **Audit Entry**: Logs merge action with actor ID.'],
              'cmd': 'pnpm --filter api test -- src/customers',
              'depends': ['T-CUST-01', 'T-BIZ-07'],
              'dont_modify_scope': ['apps/web/'],
              'expected_deliverables': 'Customer merge controller, service, and tests in `apps/api/src/customers`.',
              'files': [ 'apps/api/src/customers/identity/merge.controller.ts',
                         'apps/api/src/customers/identity/merge.service.ts',
                         'apps/api/src/customers/dto/merge-customers.dto.ts'],
              'fs': ['FS-CUST-01'],
              'human_contribution': [ '**🧪 Manual QA**: Call `POST /customers/merge` via Swagger with 2 test customer '
                                      'IDs.'],
              'id': 'T-CUST-03',
              'implementation_steps': [ '1. Implement `MergeService.merge()` re-pointing foreign keys to survivor ID.',
                                        '2. Record audit log entry in `audit_logs` table.',
                                        '3. Author unit tests covering atomic merge and rollback on conflict.'],
              'modify_scope': ['apps/api/src/customers/merge.*', 'apps/api/src/customers/dto/*merge*'],
              'objective_value': 'Implement manual customer merge API consolidating duplicate customer records, '
                                 'orders, and conversation histories in an atomic transaction.',
              'read': ['docs/10_engineering/13_API_DESIGN.md', 'docs/10_engineering/12_DATABASE_DESIGN.md'],
              'security_invariants': [ '🔒 **Atomic Merge**: Merge must execute in a single database transaction.',
                                       "🛡️ **RBAC Permission**: Requires `@RequirePermission('customers.merge')`."],
              'size': 'M',
              'technical_contract': [ '`POST /customers/merge` (200 OK) -> Body `{ survivorId: string, duplicateId: '
                                      'string }`',
                                      'Re-points orders, conversations, and identities to survivor; archives '
                                      'duplicate; records audit log entry.'],
              'title': 'Customer manual merge API & duplicate consolidation (`/customers/merge`)',
              'wave': 'W6',
              'why': 'Allow store managers to merge duplicate profiles created before phone numbers were identified.'},
    'id': 'T-CUST-03',
    'leaves': [ { 'cmd': 'pnpm --filter api test -- src/customers',
                  'do': [ '1. Implement `MergeService.merge()` re-pointing foreign keys to survivor ID.',
                          '2. Record audit log entry in `audit_logs` table.',
                          '3. Author unit tests covering atomic merge and rollback on conflict.'],
                  'done': '**Merge Profiles**: Orders and conversations transfer to survivor profile.',
                  'dont': [],
                  'files': [ 'apps/api/src/customers/identity/merge.controller.ts',
                             'apps/api/src/customers/identity/merge.service.ts',
                             'apps/api/src/customers/dto/merge-customers.dto.ts'],
                  'gold': { 'acceptance_test_scenarios': [ '[ ] **Merge Profiles**: Orders and conversations transfer '
                                                           'to survivor profile.',
                                                           '[ ] **Audit Entry**: Logs merge action with actor ID.'],
                            'cmd': 'pnpm --filter api test -- src/customers',
                            'depends': ['T-CUST-01', 'T-BIZ-07'],
                            'dont_modify_scope': ['apps/web/'],
                            'expected_deliverables': 'Customer merge controller, service, and tests in '
                                                     '`apps/api/src/customers`.',
                            'files': [ 'apps/api/src/customers/identity/merge.controller.ts',
                                       'apps/api/src/customers/identity/merge.service.ts',
                                       'apps/api/src/customers/dto/merge-customers.dto.ts'],
                            'fs': ['FS-CUST-01'],
                            'human_contribution': [ '**🧪 Manual QA**: Call `POST /customers/merge` via Swagger with 2 '
                                                    'test customer IDs.'],
                            'id': 'T-CUST-03',
                            'implementation_steps': [ '1. Implement `MergeService.merge()` re-pointing foreign keys to '
                                                      'survivor ID.',
                                                      '2. Record audit log entry in `audit_logs` table.',
                                                      '3. Author unit tests covering atomic merge and rollback on '
                                                      'conflict.'],
                            'modify_scope': ['apps/api/src/customers/merge.*', 'apps/api/src/customers/dto/*merge*'],
                            'objective_value': 'Implement manual customer merge API consolidating duplicate customer '
                                               'records, orders, and conversation histories in an atomic transaction.',
                            'read': [ 'docs/10_engineering/13_API_DESIGN.md',
                                      'docs/10_engineering/12_DATABASE_DESIGN.md'],
                            'security_invariants': [ '🔒 **Atomic Merge**: Merge must execute in a single database '
                                                     'transaction.',
                                                     '🛡️ **RBAC Permission**: Requires '
                                                     "`@RequirePermission('customers.merge')`."],
                            'size': 'M',
                            'technical_contract': [ '`POST /customers/merge` (200 OK) -> Body `{ survivorId: string, '
                                                    'duplicateId: string }`',
                                                    'Re-points orders, conversations, and identities to survivor; '
                                                    'archives duplicate; records audit log entry.'],
                            'title': 'Customer manual merge API & duplicate consolidation (`/customers/merge`)',
                            'wave': 'W6',
                            'why': 'Allow store managers to merge duplicate profiles created before phone numbers were '
                                   'identified.'},
                  'letter': '',
                  'read': [ 'docs/10_engineering/13_API_DESIGN/03-pipeline-orders-customers.md',
                            'docs/10_engineering/12_DATABASE_DESIGN/03-customers-messaging-integrations.md',
                            'docs/30_execution/32_FEATURE_SPECIFICATIONS.md'],
                  'title': 'Customer manual merge API & duplicate consolidation (`/customers/merge`)'}],
    'parent_done': '**Merge Profiles**: Orders and conversations transfer to survivor profile.',
    'size': 'M',
    'title': 'Customer manual merge API & duplicate consolidation (`/customers/merge`)',
    'wave': 'W6'},
  { 'depends': ['T-CUST-01', 'T-ORD-01'],
    'fs': ['FS-CUST-01'],
    'gold': { 'acceptance_test_scenarios': [ '[ ] **First Order**: Transitions customer to FIRST_TIME_BUYER.',
                                             '[ ] **Repeat Order**: Transitions customer to RETURNING_CUSTOMER.'],
              'cmd': 'pnpm --filter api test -- src/customers',
              'depends': ['T-CUST-01', 'T-ORD-01'],
              'dont_modify_scope': ['apps/web/'],
              'expected_deliverables': 'Customer lifecycle service and processor in `apps/api/src/customers`.',
              'files': ['apps/api/src/customers/lifecycle/lifecycle.service.ts', 'apps/api/src/customers/lifecycle/lifecycle.processor.ts'],
              'fs': ['FS-CUST-01'],
              'human_contribution': [ '**🧪 Manual QA**: Confirm order in Swagger and verify customer lifecycle stage '
                                      'update in DB.'],
              'id': 'T-CUST-04',
              'implementation_steps': [ '1. Implement `LifecycleService` recalculating stage.',
                                        '2. Listen to `order.confirmed` domain event.',
                                        '3. Author unit tests covering all lifecycle transitions.'],
              'modify_scope': ['apps/api/src/customers/lifecycle.*'],
              'objective_value': 'Implement automated customer lifecycle stage classifier (`PROSPECT`, '
                                 '`FIRST_TIME_BUYER`, `RETURNING_CUSTOMER`, `CHURN_RISK`).',
              'read': ['docs/10_engineering/14_SYSTEM_DESIGN.md', 'docs/10_engineering/12_DATABASE_DESIGN.md'],
              'security_invariants': ['🚫 **Event Driven**: Recomputed asynchronously upon order confirmation event.'],
              'size': 'M',
              'technical_contract': [ '0 orders -> `PROSPECT`',
                                      '1 confirmed order -> `FIRST_TIME_BUYER`',
                                      '>=2 confirmed orders -> `RETURNING_CUSTOMER`',
                                      '>90 days without interaction -> `CHURN_RISK`'],
              'title': 'Customer lifecycle stage automated classification',
              'wave': 'W6',
              'why': 'Automatically classify customer relationship stages based on completed order history and '
                     'recency.'},
    'id': 'T-CUST-04',
    'leaves': [ { 'cmd': 'pnpm --filter api test -- src/customers',
                  'do': [ '1. Implement `LifecycleService` recalculating stage.',
                          '2. Listen to `order.confirmed` domain event.',
                          '3. Author unit tests covering all lifecycle transitions.'],
                  'done': '**First Order**: Transitions customer to FIRST_TIME_BUYER.',
                  'dont': ['🚫 **Event Driven**: Recomputed asynchronously upon order confirmation event.'],
                  'files': [ 'apps/api/src/customers/lifecycle/lifecycle.service.ts',
                             'apps/api/src/customers/lifecycle/lifecycle.processor.ts'],
                  'gold': { 'acceptance_test_scenarios': [ '[ ] **First Order**: Transitions customer to '
                                                           'FIRST_TIME_BUYER.',
                                                           '[ ] **Repeat Order**: Transitions customer to '
                                                           'RETURNING_CUSTOMER.'],
                            'cmd': 'pnpm --filter api test -- src/customers',
                            'depends': ['T-CUST-01', 'T-ORD-01'],
                            'dont_modify_scope': ['apps/web/'],
                            'expected_deliverables': 'Customer lifecycle service and processor in '
                                                     '`apps/api/src/customers`.',
                            'files': [ 'apps/api/src/customers/lifecycle/lifecycle.service.ts',
                                       'apps/api/src/customers/lifecycle/lifecycle.processor.ts'],
                            'fs': ['FS-CUST-01'],
                            'human_contribution': [ '**🧪 Manual QA**: Confirm order in Swagger and verify customer '
                                                    'lifecycle stage update in DB.'],
                            'id': 'T-CUST-04',
                            'implementation_steps': [ '1. Implement `LifecycleService` recalculating stage.',
                                                      '2. Listen to `order.confirmed` domain event.',
                                                      '3. Author unit tests covering all lifecycle transitions.'],
                            'modify_scope': ['apps/api/src/customers/lifecycle.*'],
                            'objective_value': 'Implement automated customer lifecycle stage classifier (`PROSPECT`, '
                                               '`FIRST_TIME_BUYER`, `RETURNING_CUSTOMER`, `CHURN_RISK`).',
                            'read': [ 'docs/10_engineering/14_SYSTEM_DESIGN.md',
                                      'docs/10_engineering/12_DATABASE_DESIGN.md'],
                            'security_invariants': [ '🚫 **Event Driven**: Recomputed asynchronously upon order '
                                                     'confirmation event.'],
                            'size': 'M',
                            'technical_contract': [ '0 orders -> `PROSPECT`',
                                                    '1 confirmed order -> `FIRST_TIME_BUYER`',
                                                    '>=2 confirmed orders -> `RETURNING_CUSTOMER`',
                                                    '>90 days without interaction -> `CHURN_RISK`'],
                            'title': 'Customer lifecycle stage automated classification',
                            'wave': 'W6',
                            'why': 'Automatically classify customer relationship stages based on completed order '
                                   'history and recency.'},
                  'letter': '',
                  'read': [ 'docs/10_engineering/14_SYSTEM_DESIGN/02-locks-jobs-events-scoring.md',
                            'docs/10_engineering/12_DATABASE_DESIGN/03-customers-messaging-integrations.md',
                            'docs/30_execution/32_FEATURE_SPECIFICATIONS.md'],
                  'title': 'Customer lifecycle stage automated classification'}],
    'parent_done': '**First Order**: Transitions customer to FIRST_TIME_BUYER.',
    'size': 'M',
    'title': 'Customer lifecycle stage automated classification',
    'wave': 'W6'},
  { 'depends': ['T-HAND-01', 'T-LEAD-01'],
    'fs': ['FS-NOTIF-01'],
    'gold': { 'acceptance_test_scenarios': [ '[ ] **Handoff Alert**: Creates notification row when handoff is '
                                             'triggered.',
                                             '[ ] **Suppression**: Duplicate handoff event within 30 min is '
                                             'suppressed.'],
              'cmd': 'pnpm --filter api test -- src/notifications',
              'depends': ['T-HAND-01', 'T-LEAD-01'],
              'dont_modify_scope': ['apps/web/'],
              'expected_deliverables': 'Notification dispatcher service, processor, and tests in '
                                       '`apps/api/src/notifications`.',
              'files': [ 'apps/api/src/notifications/dispatcher/notification-dispatcher.service.ts',
                         'apps/api/src/notifications/dispatcher/notifications.processor.ts',
                         'apps/api/src/notifications/notifications.module.ts'],
              'fs': ['FS-NOTIF-01'],
              'human_contribution': ['**🧪 Manual QA**: Trigger handoff alert and check notification in DB.'],
              'id': 'T-NOTIF-01',
              'implementation_steps': [ '1. Implement notification dispatcher with Redis suppression keys.',
                                        '2. Implement BullMQ `notifications.processor.ts` inserting to `notifications` '
                                        'table.',
                                        '3. Author unit tests covering alert generation, duplicate suppression, and '
                                        'routing.'],
              'modify_scope': ['apps/api/src/notifications/', 'packages/shared/src/notifications/'],
              'objective_value': 'Implement notification dispatcher routing handoff alerts, hot lead discoveries, and '
                                 'quota warnings with duplicate suppression.',
              'read': [ 'docs/10_engineering/14_SYSTEM_DESIGN.md',
                        'docs/10_engineering/12_DATABASE_DESIGN.md',
                        'docs/30_execution/32_FEATURE_SPECIFICATIONS.md'],
              'security_invariants': [ '🔒 **Rate Limiting**: Never spam staff with duplicate alerts within suppression '
                                       'window.'],
              'size': 'L',
              'technical_contract': [ '`NotificationDispatcherService.dispatch(event)`',
                                      'Alert Types: `HANDOFF_REQUIRED`, `HOT_LEAD`, `USAGE_WARNING_85`, '
                                      '`USAGE_BREACH_100`, `ORDER_DRAFT_READY`',
                                      'Suppression Window: Duplicate alert for same conversation suppressed for 30 '
                                      'minutes.'],
              'title': 'Notification dispatcher & handoff/lead alert engine',
              'wave': 'W7',
              'why': 'Ensure staff are instantly notified of high-priority events requiring immediate attention '
                     'without notification spam.'},
    'id': 'T-NOTIF-01',
    'leaves': [ { 'cmd': 'pnpm --filter api test -- src/notifications',
                  'do': [ '1. Implement notification dispatcher with Redis suppression keys.',
                          '2. Implement BullMQ `notifications.processor.ts` inserting to `notifications` table.',
                          '3. Author unit tests covering alert generation, duplicate suppression, and routing.'],
                  'done': '**Handoff Alert**: Creates notification row when handoff is triggered.',
                  'dont': [],
                  'files': [ 'apps/api/src/notifications/dispatcher/notification-dispatcher.service.ts',
                             'apps/api/src/notifications/dispatcher/notifications.processor.ts',
                             'apps/api/src/notifications/notifications.module.ts'],
                  'gold': { 'acceptance_test_scenarios': [ '[ ] **Handoff Alert**: Creates notification row when '
                                                           'handoff is triggered.',
                                                           '[ ] **Suppression**: Duplicate handoff event within 30 min '
                                                           'is suppressed.'],
                            'cmd': 'pnpm --filter api test -- src/notifications',
                            'depends': ['T-HAND-01', 'T-LEAD-01'],
                            'dont_modify_scope': ['apps/web/'],
                            'expected_deliverables': 'Notification dispatcher service, processor, and tests in '
                                                     '`apps/api/src/notifications`.',
                            'files': [ 'apps/api/src/notifications/dispatcher/notification-dispatcher.service.ts',
                                       'apps/api/src/notifications/dispatcher/notifications.processor.ts',
                                       'apps/api/src/notifications/notifications.module.ts'],
                            'fs': ['FS-NOTIF-01'],
                            'human_contribution': [ '**🧪 Manual QA**: Trigger handoff alert and check notification in '
                                                    'DB.'],
                            'id': 'T-NOTIF-01',
                            'implementation_steps': [ '1. Implement notification dispatcher with Redis suppression '
                                                      'keys.',
                                                      '2. Implement BullMQ `notifications.processor.ts` inserting to '
                                                      '`notifications` table.',
                                                      '3. Author unit tests covering alert generation, duplicate '
                                                      'suppression, and routing.'],
                            'modify_scope': ['apps/api/src/notifications/', 'packages/shared/src/notifications/'],
                            'objective_value': 'Implement notification dispatcher routing handoff alerts, hot lead '
                                               'discoveries, and quota warnings with duplicate suppression.',
                            'read': [ 'docs/10_engineering/14_SYSTEM_DESIGN.md',
                                      'docs/10_engineering/12_DATABASE_DESIGN.md',
                                      'docs/30_execution/32_FEATURE_SPECIFICATIONS.md'],
                            'security_invariants': [ '🔒 **Rate Limiting**: Never spam staff with duplicate alerts '
                                                     'within suppression window.'],
                            'size': 'L',
                            'technical_contract': [ '`NotificationDispatcherService.dispatch(event)`',
                                                    'Alert Types: `HANDOFF_REQUIRED`, `HOT_LEAD`, `USAGE_WARNING_85`, '
                                                    '`USAGE_BREACH_100`, `ORDER_DRAFT_READY`',
                                                    'Suppression Window: Duplicate alert for same conversation '
                                                    'suppressed for 30 minutes.'],
                            'title': 'Notification dispatcher & handoff/lead alert engine',
                            'wave': 'W7',
                            'why': 'Ensure staff are instantly notified of high-priority events requiring immediate '
                                   'attention without notification spam.'},
                  'letter': '',
                  'read': [ 'docs/10_engineering/13_API_DESIGN/05-realtime-platform-governance.md',
                            'docs/10_engineering/12_DATABASE_DESIGN/05-billing-notifications-audit.md',
                            'docs/30_execution/32_FEATURE_SPECIFICATIONS.md'],
                  'title': 'Notification dispatcher & handoff/lead alert engine'}],
    'parent_done': '**Handoff Alert**: Creates notification row when handoff is triggered.',
    'size': 'L',
    'title': 'Notification dispatcher & handoff/lead alert engine',
    'wave': 'W7'},
  { 'depends': ['T-NOTIF-01', 'T-CONV-06'],
    'fs': ['FS-NOTIF-01'],
    'gold': { 'acceptance_test_scenarios': [ '[ ] **Notification Feed**: Returns unread count and recent '
                                             'notifications.',
                                             '[ ] **Mark Read**: Decrements unread count upon marking read.'],
              'cmd': 'pnpm --filter api test -- src/notifications',
              'depends': ['T-NOTIF-01', 'T-CONV-06'],
              'dont_modify_scope': ['apps/web/'],
              'expected_deliverables': 'Notifications feed controller, service, and tests in '
                                       '`apps/api/src/notifications`.',
              'files': [ 'apps/api/src/notifications/core/notifications.controller.ts',
                         'apps/api/src/notifications/core/notifications.service.ts'],
              'fs': ['FS-NOTIF-01'],
              'human_contribution': ['**🧪 Manual QA**: Call `GET /notifications` and test mark read via Swagger.'],
              'id': 'T-NOTIF-02',
              'implementation_steps': [ '1. Implement `NotificationsController` and `NotificationsService`.',
                                        '2. Emit `notification.new` event via `RealtimeService`.',
                                        '3. Author unit tests covering feed pagination, read markers, and realtime '
                                        'push.'],
              'modify_scope': ['apps/api/src/notifications/notifications.*'],
              'objective_value': 'Implement in-app notifications query API and real-time WebSocket push for the '
                                 'navigation header bell.',
              'read': ['docs/10_engineering/13_API_DESIGN.md', 'docs/10_engineering/12_DATABASE_DESIGN.md'],
              'security_invariants': ["🔒 **Tenancy Boundary**: Queries strictly scoped to user's `business_id`."],
              'size': 'M',
              'technical_contract': [ '`GET /notifications` (200 OK) -> Paginated notification feed with `unreadCount`',
                                      '`PATCH /notifications/:id/read` (200 OK) -> Marks single notification read',
                                      '`POST /notifications/read-all` (200 OK) -> Marks all notifications read for '
                                      'tenant user'],
              'title': 'In-app notifications feed API & WebSocket bell push (`/notifications`)',
              'wave': 'W7',
              'why': 'Allow staff to view unread notification count, browse recent alert history, and mark alerts as '
                     'read.'},
    'id': 'T-NOTIF-02',
    'leaves': [ { 'cmd': 'pnpm --filter api test -- src/notifications',
                  'do': [ '1. Implement `NotificationsController` and `NotificationsService`.',
                          '2. Emit `notification.new` event via `RealtimeService`.',
                          '3. Author unit tests covering feed pagination, read markers, and realtime push.'],
                  'done': '**Notification Feed**: Returns unread count and recent notifications.',
                  'dont': [],
                  'files': [ 'apps/api/src/notifications/core/notifications.controller.ts',
                             'apps/api/src/notifications/core/notifications.service.ts'],
                  'gold': { 'acceptance_test_scenarios': [ '[ ] **Notification Feed**: Returns unread count and recent '
                                                           'notifications.',
                                                           '[ ] **Mark Read**: Decrements unread count upon marking '
                                                           'read.'],
                            'cmd': 'pnpm --filter api test -- src/notifications',
                            'depends': ['T-NOTIF-01', 'T-CONV-06'],
                            'dont_modify_scope': ['apps/web/'],
                            'expected_deliverables': 'Notifications feed controller, service, and tests in '
                                                     '`apps/api/src/notifications`.',
                            'files': [ 'apps/api/src/notifications/core/notifications.controller.ts',
                                       'apps/api/src/notifications/core/notifications.service.ts'],
                            'fs': ['FS-NOTIF-01'],
                            'human_contribution': [ '**🧪 Manual QA**: Call `GET /notifications` and test mark read via '
                                                    'Swagger.'],
                            'id': 'T-NOTIF-02',
                            'implementation_steps': [ '1. Implement `NotificationsController` and '
                                                      '`NotificationsService`.',
                                                      '2. Emit `notification.new` event via `RealtimeService`.',
                                                      '3. Author unit tests covering feed pagination, read markers, '
                                                      'and realtime push.'],
                            'modify_scope': ['apps/api/src/notifications/notifications.*'],
                            'objective_value': 'Implement in-app notifications query API and real-time WebSocket push '
                                               'for the navigation header bell.',
                            'read': [ 'docs/10_engineering/13_API_DESIGN.md',
                                      'docs/10_engineering/12_DATABASE_DESIGN.md'],
                            'security_invariants': [ "🔒 **Tenancy Boundary**: Queries strictly scoped to user's "
                                                     '`business_id`.'],
                            'size': 'M',
                            'technical_contract': [ '`GET /notifications` (200 OK) -> Paginated notification feed with '
                                                    '`unreadCount`',
                                                    '`PATCH /notifications/:id/read` (200 OK) -> Marks single '
                                                    'notification read',
                                                    '`POST /notifications/read-all` (200 OK) -> Marks all '
                                                    'notifications read for tenant user'],
                            'title': 'In-app notifications feed API & WebSocket bell push (`/notifications`)',
                            'wave': 'W7',
                            'why': 'Allow staff to view unread notification count, browse recent alert history, and '
                                   'mark alerts as read.'},
                  'letter': '',
                  'read': [ 'docs/10_engineering/13_API_DESIGN/05-realtime-platform-governance.md',
                            'docs/10_engineering/14_SYSTEM_DESIGN/02-locks-jobs-events-scoring.md',
                            'docs/30_execution/32_FEATURE_SPECIFICATIONS.md'],
                  'title': 'In-app notifications feed API & WebSocket bell push (`/notifications`)'}],
    'parent_done': '**Notification Feed**: Returns unread count and recent notifications.',
    'size': 'M',
    'title': 'In-app notifications feed API & WebSocket bell push (`/notifications`)',
    'wave': 'W7'},
  { 'depends': ['T-BIZ-01'],
    'fs': ['FS-BILL-01'],
    'gold': { 'acceptance_test_scenarios': [ '[ ] **Plan Quotas**: Returns 3 standard subscription tiers with correct '
                                             'quotas.'],
              'cmd': 'pnpm --filter api test -- src/billing',
              'depends': ['T-BIZ-01'],
              'dont_modify_scope': ['apps/web/'],
              'expected_deliverables': 'Plans service, controller, and tests in `apps/api/src/billing`.',
              'files': [ 'apps/api/src/billing/plans/plans.service.ts',
                         'apps/api/src/billing/plans/plans.controller.ts',
                         'apps/api/src/billing/billing.module.ts'],
              'fs': ['FS-BILL-01'],
              'human_contribution': ['**🧪 Manual QA**: Query `GET /billing/plans` in Swagger.'],
              'id': 'T-BILL-01',
              'implementation_steps': [ '1. Seed plans in database schema.',
                                        '2. Implement `PlansService` and `PlansController`.',
                                        '3. Author unit tests verifying plan quota retrieval.'],
              'modify_scope': ['apps/api/src/billing/', 'packages/shared/src/billing/'],
              'objective_value': 'Seed subscription plan tiers (Starter, Growth, Scale) with quota allocations.',
              'read': ['docs/00_product/03_MVP_SCOPE.md', 'docs/10_engineering/12_DATABASE_DESIGN.md'],
              'security_invariants': [ '🔒 **Plan Quotas**: Starter (2 seats, 1 channel, 500 AI msgs), Growth (5 seats, '
                                       '3 channels, 3000 AI msgs), Scale (15 seats, 10 channels, 15000 AI msgs).'],
              'size': 'M',
              'technical_contract': ['`GET /billing/plans` (200 OK) -> Lists available tiers and quotas.'],
              'title': 'Billing subscription plans seed & database repository',
              'wave': 'W7',
              'why': 'Provide system with canonical plan limits (seats, channel accounts, AI messages/month, '
                     'orders/month).'},
    'id': 'T-BILL-01',
    'leaves': [ { 'cmd': 'pnpm --filter api test -- src/billing',
                  'do': [ '1. Seed plans in database schema.',
                          '2. Implement `PlansService` and `PlansController`.',
                          '3. Author unit tests verifying plan quota retrieval.'],
                  'done': '**Plan Quotas**: Returns 3 standard subscription tiers with correct quotas.',
                  'dont': [],
                  'files': [ 'apps/api/src/billing/plans/plans.service.ts',
                             'apps/api/src/billing/plans/plans.controller.ts',
                             'apps/api/src/billing/billing.module.ts'],
                  'gold': { 'acceptance_test_scenarios': [ '[ ] **Plan Quotas**: Returns 3 standard subscription tiers '
                                                           'with correct quotas.'],
                            'cmd': 'pnpm --filter api test -- src/billing',
                            'depends': ['T-BIZ-01'],
                            'dont_modify_scope': ['apps/web/'],
                            'expected_deliverables': 'Plans service, controller, and tests in `apps/api/src/billing`.',
                            'files': [ 'apps/api/src/billing/plans/plans.service.ts',
                                       'apps/api/src/billing/plans/plans.controller.ts',
                                       'apps/api/src/billing/billing.module.ts'],
                            'fs': ['FS-BILL-01'],
                            'human_contribution': ['**🧪 Manual QA**: Query `GET /billing/plans` in Swagger.'],
                            'id': 'T-BILL-01',
                            'implementation_steps': [ '1. Seed plans in database schema.',
                                                      '2. Implement `PlansService` and `PlansController`.',
                                                      '3. Author unit tests verifying plan quota retrieval.'],
                            'modify_scope': ['apps/api/src/billing/', 'packages/shared/src/billing/'],
                            'objective_value': 'Seed subscription plan tiers (Starter, Growth, Scale) with quota '
                                               'allocations.',
                            'read': ['docs/00_product/03_MVP_SCOPE.md', 'docs/10_engineering/12_DATABASE_DESIGN.md'],
                            'security_invariants': [ '🔒 **Plan Quotas**: Starter (2 seats, 1 channel, 500 AI msgs), '
                                                     'Growth (5 seats, 3 channels, 3000 AI msgs), Scale (15 seats, 10 '
                                                     'channels, 15000 AI msgs).'],
                            'size': 'M',
                            'technical_contract': [ '`GET /billing/plans` (200 OK) -> Lists available tiers and '
                                                    'quotas.'],
                            'title': 'Billing subscription plans seed & database repository',
                            'wave': 'W7',
                            'why': 'Provide system with canonical plan limits (seats, channel accounts, AI '
                                   'messages/month, orders/month).'},
                  'letter': '',
                  'read': [ 'docs/00_product/03_MVP_SCOPE/01-in-scope-boundaries.md',
                            'docs/10_engineering/13_API_DESIGN/05-realtime-platform-governance.md',
                            'docs/10_engineering/12_DATABASE_DESIGN/05-billing-notifications-audit.md'],
                  'title': 'Billing subscription plans seed & database repository'}],
    'parent_done': '**Plan Quotas**: Returns 3 standard subscription tiers with correct quotas.',
    'size': 'M',
    'title': 'Billing subscription plans seed & database repository',
    'wave': 'W7'},
  { 'depends': ['T-BILL-01', 'T-AI-01'],
    'fs': ['FS-BILL-01'],
    'gold': { 'acceptance_test_scenarios': [ '[ ] **Usage Aggregation**: Aggregates match exact sum of raw usage '
                                             'events.'],
              'cmd': 'pnpm --filter api test -- src/billing',
              'depends': ['T-BILL-01', 'T-AI-01'],
              'dont_modify_scope': ['apps/web/'],
              'expected_deliverables': 'Usage metering service and rollup processor in `apps/api/src/billing`.',
              'files': ['apps/api/src/billing/metering/metering.service.ts', 'apps/api/src/billing/metering/metering.processor.ts'],
              'fs': ['FS-BILL-01'],
              'human_contribution': [ '**🧪 Manual QA**: Send 5 test messages, run hourly worker, and verify sums in '
                                      '`usage_aggregates`.'],
              'id': 'T-BILL-02',
              'implementation_steps': [ '1. Implement `MeteringService.recordUsage()` with async insert.',
                                        '2. Implement BullMQ hourly rollup processor.',
                                        '3. Author unit tests verifying usage recording and rollup accuracy.'],
              'modify_scope': ['apps/api/src/billing/metering.*'],
              'objective_value': 'Implement real-time usage event recording and hourly background aggregation worker.',
              'read': ['docs/10_engineering/14_SYSTEM_DESIGN.md', 'docs/10_engineering/12_DATABASE_DESIGN.md'],
              'security_invariants': [ '🔒 **Non-Blocking**: Raw usage metering must never block primary API response '
                                       'latency.'],
              'size': 'L',
              'technical_contract': [ '`MeteringService.recordUsage(businessId, metric, quantity)`: Inserts raw event '
                                      'to `usage_events`.',
                                      'Hourly BullMQ worker aggregates raw events into `usage_aggregates` table.'],
              'title': 'Usage events metering pipeline & hourly aggregation worker',
              'wave': 'W7',
              'why': 'Track consumed AI messages, tokens, and storage per tenant to enforce subscription quotas.'},
    'id': 'T-BILL-02',
    'leaves': [ { 'cmd': 'pnpm --filter api test -- src/billing',
                  'do': [ '1. Implement `MeteringService.recordUsage()` with async insert.',
                          '2. Implement BullMQ hourly rollup processor.',
                          '3. Author unit tests verifying usage recording and rollup accuracy.'],
                  'done': '**Usage Aggregation**: Aggregates match exact sum of raw usage events.',
                  'dont': [],
                  'files': ['apps/api/src/billing/metering/metering.service.ts', 'apps/api/src/billing/metering/metering.processor.ts'],
                  'gold': { 'acceptance_test_scenarios': [ '[ ] **Usage Aggregation**: Aggregates match exact sum of '
                                                           'raw usage events.'],
                            'cmd': 'pnpm --filter api test -- src/billing',
                            'depends': ['T-BILL-01', 'T-AI-01'],
                            'dont_modify_scope': ['apps/web/'],
                            'expected_deliverables': 'Usage metering service and rollup processor in '
                                                     '`apps/api/src/billing`.',
                            'files': [ 'apps/api/src/billing/metering/metering.service.ts',
                                       'apps/api/src/billing/metering/metering.processor.ts'],
                            'fs': ['FS-BILL-01'],
                            'human_contribution': [ '**🧪 Manual QA**: Send 5 test messages, run hourly worker, and '
                                                    'verify sums in `usage_aggregates`.'],
                            'id': 'T-BILL-02',
                            'implementation_steps': [ '1. Implement `MeteringService.recordUsage()` with async insert.',
                                                      '2. Implement BullMQ hourly rollup processor.',
                                                      '3. Author unit tests verifying usage recording and rollup '
                                                      'accuracy.'],
                            'modify_scope': ['apps/api/src/billing/metering.*'],
                            'objective_value': 'Implement real-time usage event recording and hourly background '
                                               'aggregation worker.',
                            'read': [ 'docs/10_engineering/14_SYSTEM_DESIGN.md',
                                      'docs/10_engineering/12_DATABASE_DESIGN.md'],
                            'security_invariants': [ '🔒 **Non-Blocking**: Raw usage metering must never block primary '
                                                     'API response latency.'],
                            'size': 'L',
                            'technical_contract': [ '`MeteringService.recordUsage(businessId, metric, quantity)`: '
                                                    'Inserts raw event to `usage_events`.',
                                                    'Hourly BullMQ worker aggregates raw events into '
                                                    '`usage_aggregates` table.'],
                            'title': 'Usage events metering pipeline & hourly aggregation worker',
                            'wave': 'W7',
                            'why': 'Track consumed AI messages, tokens, and storage per tenant to enforce subscription '
                                   'quotas.'},
                  'letter': '',
                  'read': [ 'docs/10_engineering/14_SYSTEM_DESIGN/02-locks-jobs-events-scoring.md',
                            'docs/10_engineering/12_DATABASE_DESIGN/05-billing-notifications-audit.md',
                            'docs/30_execution/32_FEATURE_SPECIFICATIONS.md'],
                  'title': 'Usage events metering pipeline & hourly aggregation worker'}],
    'parent_done': '**Usage Aggregation**: Aggregates match exact sum of raw usage events.',
    'size': 'L',
    'title': 'Usage events metering pipeline & hourly aggregation worker',
    'wave': 'W7'},
  { 'depends': ['T-BILL-02'],
    'fs': ['FS-BILL-01'],
    'gold': { 'acceptance_test_scenarios': [ '[ ] **85% Alert**: Triggers warning alert at 85% utilization.',
                                             '[ ] **100% Limit**: Pauses AI responses at 100% while allowing human '
                                             'replies.'],
              'cmd': 'pnpm --filter api test -- src/billing',
              'depends': ['T-BILL-02'],
              'dont_modify_scope': ['apps/web/'],
              'expected_deliverables': 'Quota enforcement service and usage widget endpoint in `apps/api/src/billing`.',
              'files': ['apps/api/src/billing/quota/quota.service.ts', 'apps/api/src/billing/core/billing.controller.ts'],
              'fs': ['FS-BILL-01'],
              'human_contribution': [ '**🧪 Manual QA**: Set tenant usage to 100% in DB; verify AI pauses while human '
                                      'reply succeeds.'],
              'id': 'T-BILL-03',
              'implementation_steps': [ '1. Implement `QuotaService.checkQuota(businessId)` calculating cycle '
                                        'percentage.',
                                        '2. Implement `BillingController.getUsage()`.',
                                        '3. Author unit tests verifying 85% alert and 100% AI pause while human '
                                        'messaging passes.'],
              'modify_scope': ['apps/api/src/billing/quota.*', 'apps/api/src/billing/billing.controller.*'],
              'objective_value': 'Implement quota enforcement engine (85% warning alert, 100% AI pause) and usage '
                                 'summary widget API.',
              'read': [ 'docs/00_product/03_MVP_SCOPE.md',
                        'docs/10_engineering/13_API_DESIGN.md',
                        'docs/30_execution/32_FEATURE_SPECIFICATIONS.md'],
              'security_invariants': [ '🔒 **Human Messaging Preserved**: Reaching 100% quota strictly pauses AI turns; '
                                       'human agent replies must NEVER be blocked.'],
              'size': 'L',
              'technical_contract': [ '`GET /billing/usage` (200 OK) -> Current billing cycle usage percentage and '
                                      'quota limits',
                                      '85% Quota: Dispatches warning notification `USAGE_WARNING_85`.',
                                      '100% Quota: Pauses AI auto-send turns (human agent replies remain permitted).'],
              'title': 'Quota enforcement engine, 85% warning & 100% hard limit gate (`/billing/usage`)',
              'wave': 'W7',
              'why': 'Prevent merchants from exceeding monthly quota allowances while keeping human messaging active.'},
    'id': 'T-BILL-03',
    'leaves': [ { 'cmd': 'pnpm --filter api test -- src/billing',
                  'do': [ '1. Implement `QuotaService.checkQuota(businessId)` calculating cycle percentage.',
                          '2. Implement `BillingController.getUsage()`.',
                          '3. Author unit tests verifying 85% alert and 100% AI pause while human messaging passes.'],
                  'done': '**85% Alert**: Triggers warning alert at 85% utilization.',
                  'dont': [],
                  'files': ['apps/api/src/billing/quota/quota.service.ts', 'apps/api/src/billing/core/billing.controller.ts'],
                  'gold': { 'acceptance_test_scenarios': [ '[ ] **85% Alert**: Triggers warning alert at 85% '
                                                           'utilization.',
                                                           '[ ] **100% Limit**: Pauses AI responses at 100% while '
                                                           'allowing human replies.'],
                            'cmd': 'pnpm --filter api test -- src/billing',
                            'depends': ['T-BILL-02'],
                            'dont_modify_scope': ['apps/web/'],
                            'expected_deliverables': 'Quota enforcement service and usage widget endpoint in '
                                                     '`apps/api/src/billing`.',
                            'files': [ 'apps/api/src/billing/quota/quota.service.ts',
                                       'apps/api/src/billing/core/billing.controller.ts'],
                            'fs': ['FS-BILL-01'],
                            'human_contribution': [ '**🧪 Manual QA**: Set tenant usage to 100% in DB; verify AI pauses '
                                                    'while human reply succeeds.'],
                            'id': 'T-BILL-03',
                            'implementation_steps': [ '1. Implement `QuotaService.checkQuota(businessId)` calculating '
                                                      'cycle percentage.',
                                                      '2. Implement `BillingController.getUsage()`.',
                                                      '3. Author unit tests verifying 85% alert and 100% AI pause '
                                                      'while human messaging passes.'],
                            'modify_scope': [ 'apps/api/src/billing/quota.*',
                                              'apps/api/src/billing/billing.controller.*'],
                            'objective_value': 'Implement quota enforcement engine (85% warning alert, 100% AI pause) '
                                               'and usage summary widget API.',
                            'read': [ 'docs/00_product/03_MVP_SCOPE.md',
                                      'docs/10_engineering/13_API_DESIGN.md',
                                      'docs/30_execution/32_FEATURE_SPECIFICATIONS.md'],
                            'security_invariants': [ '🔒 **Human Messaging Preserved**: Reaching 100% quota strictly '
                                                     'pauses AI turns; human agent replies must NEVER be blocked.'],
                            'size': 'L',
                            'technical_contract': [ '`GET /billing/usage` (200 OK) -> Current billing cycle usage '
                                                    'percentage and quota limits',
                                                    '85% Quota: Dispatches warning notification `USAGE_WARNING_85`.',
                                                    '100% Quota: Pauses AI auto-send turns (human agent replies remain '
                                                    'permitted).'],
                            'title': 'Quota enforcement engine, 85% warning & 100% hard limit gate (`/billing/usage`)',
                            'wave': 'W7',
                            'why': 'Prevent merchants from exceeding monthly quota allowances while keeping human '
                                   'messaging active.'},
                  'letter': '',
                  'read': [ 'docs/00_product/03_MVP_SCOPE/01-in-scope-boundaries.md',
                            'docs/10_engineering/13_API_DESIGN/05-realtime-platform-governance.md',
                            'docs/30_execution/32_FEATURE_SPECIFICATIONS.md'],
                  'title': 'Quota enforcement engine, 85% warning & 100% hard limit gate (`/billing/usage`)'}],
    'parent_done': '**85% Alert**: Triggers warning alert at 85% utilization.',
    'size': 'L',
    'title': 'Quota enforcement engine, 85% warning & 100% hard limit gate (`/billing/usage`)',
    'wave': 'W7'},
  { 'depends': ['T-OBS-01', 'T-BILL-02'],
    'fs': ['FS-BILL-01'],
    'gold': { 'acceptance_test_scenarios': ['[ ] **Cost Report**: Returns monthly token counts and estimated cost.'],
              'cmd': 'pnpm --filter api test -- src/ai',
              'depends': ['T-OBS-01', 'T-BILL-02'],
              'dont_modify_scope': ['apps/web/'],
              'expected_deliverables': 'AI usage reporting controller and service in `apps/api/src/ai`.',
              'files': ['apps/api/src/ai/usage/usage.controller.ts', 'apps/api/src/ai/usage/usage.service.ts'],
              'fs': ['FS-BILL-01'],
              'human_contribution': ['**🧪 Manual QA**: Call `GET /ai/usage` via Swagger as Owner.'],
              'id': 'T-BILL-04',
              'implementation_steps': [ '1. Implement `UsageService` querying `ai_usage` table with date group '
                                        'aggregates.',
                                        '2. Implement `UsageController`.',
                                        '3. Author unit tests covering token breakdown and owner role check.'],
              'modify_scope': ['apps/api/src/ai/usage/'],
              'objective_value': 'Implement AI token consumption and estimated inference cost monitoring endpoint.',
              'read': ['docs/10_engineering/13_API_DESIGN.md', 'docs/10_engineering/15_AI_ARCHITECTURE.md'],
              'security_invariants': ['🛡️ **Owner Only**: Restricted to `OWNER` role.'],
              'size': 'S',
              'technical_contract': [ '`GET /ai/usage` (200 OK) -> Monthly token counts, prompt vs completion '
                                      'breakdown, estimated USD cost.'],
              'title': 'AI inference cost & token consumption monitoring API (`/ai/usage`)',
              'wave': 'W7',
              'why': 'Allow store owners to inspect total prompt/completion tokens consumed and estimated LLM costs.'},
    'id': 'T-BILL-04',
    'leaves': [ { 'cmd': 'pnpm --filter api test -- src/ai',
                  'do': [ '1. Implement `UsageService` querying `ai_usage` table with date group aggregates.',
                          '2. Implement `UsageController`.',
                          '3. Author unit tests covering token breakdown and owner role check.'],
                  'done': '**Cost Report**: Returns monthly token counts and estimated cost.',
                  'dont': [],
                  'files': ['apps/api/src/ai/usage/usage.controller.ts', 'apps/api/src/ai/usage/usage.service.ts'],
                  'gold': { 'acceptance_test_scenarios': [ '[ ] **Cost Report**: Returns monthly token counts and '
                                                           'estimated cost.'],
                            'cmd': 'pnpm --filter api test -- src/ai',
                            'depends': ['T-OBS-01', 'T-BILL-02'],
                            'dont_modify_scope': ['apps/web/'],
                            'expected_deliverables': 'AI usage reporting controller and service in `apps/api/src/ai`.',
                            'files': ['apps/api/src/ai/usage/usage.controller.ts', 'apps/api/src/ai/usage/usage.service.ts'],
                            'fs': ['FS-BILL-01'],
                            'human_contribution': ['**🧪 Manual QA**: Call `GET /ai/usage` via Swagger as Owner.'],
                            'id': 'T-BILL-04',
                            'implementation_steps': [ '1. Implement `UsageService` querying `ai_usage` table with date '
                                                      'group aggregates.',
                                                      '2. Implement `UsageController`.',
                                                      '3. Author unit tests covering token breakdown and owner role '
                                                      'check.'],
                            'modify_scope': ['apps/api/src/ai/usage/'],
                            'objective_value': 'Implement AI token consumption and estimated inference cost monitoring '
                                               'endpoint.',
                            'read': [ 'docs/10_engineering/13_API_DESIGN.md',
                                      'docs/10_engineering/15_AI_ARCHITECTURE.md'],
                            'security_invariants': ['🛡️ **Owner Only**: Restricted to `OWNER` role.'],
                            'size': 'S',
                            'technical_contract': [ '`GET /ai/usage` (200 OK) -> Monthly token counts, prompt vs '
                                                    'completion breakdown, estimated USD cost.'],
                            'title': 'AI inference cost & token consumption monitoring API (`/ai/usage`)',
                            'wave': 'W7',
                            'why': 'Allow store owners to inspect total prompt/completion tokens consumed and '
                                   'estimated LLM costs.'},
                  'letter': '',
                  'read': [ 'docs/10_engineering/13_API_DESIGN/05-realtime-platform-governance.md',
                            'docs/10_engineering/15_AI_ARCHITECTURE/02-rag-prompts-evaluation.md',
                            'docs/30_execution/32_FEATURE_SPECIFICATIONS.md'],
                  'title': 'AI inference cost & token consumption monitoring API (`/ai/usage`)'}],
    'parent_done': '**Cost Report**: Returns monthly token counts and estimated cost.',
    'size': 'S',
    'title': 'AI inference cost & token consumption monitoring API (`/ai/usage`)',
    'wave': 'W7'},
  { 'depends': ['T-ORD-01', 'T-HAND-01'],
    'fs': ['FS-ANL-01'],
    'gold': { 'acceptance_test_scenarios': [ '[ ] **Rollup Math**: Correctly calculates GMV, order count, and AI '
                                             'resolution percentage.',
                                             '[ ] **Idempotency**: Multiple runs on same day update row without '
                                             'duplication.'],
              'cmd': 'pnpm --filter api test -- src/analytics',
              'depends': ['T-ORD-01', 'T-HAND-01'],
              'dont_modify_scope': ['apps/web/'],
              'expected_deliverables': 'Daily analytics rollup service, processor, and tests in '
                                       '`apps/api/src/analytics`.',
              'files': [ 'apps/api/src/analytics/rollups/daily-rollup.service.ts',
                         'apps/api/src/analytics/rollups/daily-rollup.processor.ts',
                         'apps/api/src/analytics/analytics.module.ts'],
              'fs': ['FS-ANL-01'],
              'human_contribution': [ '**🧪 Manual QA**: Run nightly rollup worker and inspect `analytics_daily` table '
                                      'in Prisma Studio.'],
              'id': 'T-ANL-01',
              'implementation_steps': [ '1. Implement `DailyRollupService` computing metrics from orders and '
                                        'conversation status events.',
                                        '2. Implement BullMQ nightly rollup processor.',
                                        '3. Author unit tests verifying rollup math and idempotency.'],
              'modify_scope': ['apps/api/src/analytics/', 'packages/shared/src/analytics/'],
              'objective_value': 'Implement nightly analytics aggregation worker computing daily GMV, order count, '
                                 'conversation volume, AI resolution rate, and response times into `analytics_daily`.',
              'read': [ 'docs/10_engineering/14_SYSTEM_DESIGN.md',
                        'docs/10_engineering/12_DATABASE_DESIGN.md',
                        'docs/30_execution/32_FEATURE_SPECIFICATIONS.md'],
              'security_invariants': [ '🔒 **Idempotent Upsert**: Running rollup multiple times for same date produces '
                                       'identical values.'],
              'size': 'L',
              'technical_contract': [ 'Worker runs at 00:05 UTC nightly via BullMQ repeatable job.',
                                      'Inserts/upserts row in `analytics_daily` per tenant with metrics: `revenue`, '
                                      '`ordersCount`, `conversationsCount`, `aiHandledCount`, `humanHandoffCount`, '
                                      '`aiResolutionRate`, `avgResponseTimeMs`.'],
              'title': 'Daily analytics aggregation worker & materialization pipeline',
              'wave': 'W7',
              'why': 'Precompute daily commercial performance metrics so dashboard queries load in <100ms without '
                     'scanning millions of raw rows.'},
    'id': 'T-ANL-01',
    'leaves': [ { 'cmd': 'pnpm --filter api test -- src/analytics',
                  'do': [ '1. Implement `DailyRollupService` computing metrics from orders and conversation status '
                          'events.',
                          '2. Implement BullMQ nightly rollup processor.',
                          '3. Author unit tests verifying rollup math and idempotency.'],
                  'done': '**Rollup Math**: Correctly calculates GMV, order count, and AI resolution percentage.',
                  'dont': [],
                  'files': [ 'apps/api/src/analytics/rollups/daily-rollup.service.ts',
                             'apps/api/src/analytics/rollups/daily-rollup.processor.ts',
                             'apps/api/src/analytics/analytics.module.ts'],
                  'gold': { 'acceptance_test_scenarios': [ '[ ] **Rollup Math**: Correctly calculates GMV, order '
                                                           'count, and AI resolution percentage.',
                                                           '[ ] **Idempotency**: Multiple runs on same day update row '
                                                           'without duplication.'],
                            'cmd': 'pnpm --filter api test -- src/analytics',
                            'depends': ['T-ORD-01', 'T-HAND-01'],
                            'dont_modify_scope': ['apps/web/'],
                            'expected_deliverables': 'Daily analytics rollup service, processor, and tests in '
                                                     '`apps/api/src/analytics`.',
                            'files': [ 'apps/api/src/analytics/rollups/daily-rollup.service.ts',
                                       'apps/api/src/analytics/rollups/daily-rollup.processor.ts',
                                       'apps/api/src/analytics/analytics.module.ts'],
                            'fs': ['FS-ANL-01'],
                            'human_contribution': [ '**🧪 Manual QA**: Run nightly rollup worker and inspect '
                                                    '`analytics_daily` table in Prisma Studio.'],
                            'id': 'T-ANL-01',
                            'implementation_steps': [ '1. Implement `DailyRollupService` computing metrics from orders '
                                                      'and conversation status events.',
                                                      '2. Implement BullMQ nightly rollup processor.',
                                                      '3. Author unit tests verifying rollup math and idempotency.'],
                            'modify_scope': ['apps/api/src/analytics/', 'packages/shared/src/analytics/'],
                            'objective_value': 'Implement nightly analytics aggregation worker computing daily GMV, '
                                               'order count, conversation volume, AI resolution rate, and response '
                                               'times into `analytics_daily`.',
                            'read': [ 'docs/10_engineering/14_SYSTEM_DESIGN.md',
                                      'docs/10_engineering/12_DATABASE_DESIGN.md',
                                      'docs/30_execution/32_FEATURE_SPECIFICATIONS.md'],
                            'security_invariants': [ '🔒 **Idempotent Upsert**: Running rollup multiple times for same '
                                                     'date produces identical values.'],
                            'size': 'L',
                            'technical_contract': [ 'Worker runs at 00:05 UTC nightly via BullMQ repeatable job.',
                                                    'Inserts/upserts row in `analytics_daily` per tenant with metrics: '
                                                    '`revenue`, `ordersCount`, `conversationsCount`, `aiHandledCount`, '
                                                    '`humanHandoffCount`, `aiResolutionRate`, `avgResponseTimeMs`.'],
                            'title': 'Daily analytics aggregation worker & materialization pipeline',
                            'wave': 'W7',
                            'why': 'Precompute daily commercial performance metrics so dashboard queries load in '
                                   '<100ms without scanning millions of raw rows.'},
                  'letter': '',
                  'read': [ 'docs/10_engineering/14_SYSTEM_DESIGN/02-locks-jobs-events-scoring.md',
                            'docs/10_engineering/12_DATABASE_DESIGN/05-billing-notifications-audit.md',
                            'docs/30_execution/32_FEATURE_SPECIFICATIONS.md'],
                  'title': 'Daily analytics aggregation worker & materialization pipeline'}],
    'parent_done': '**Rollup Math**: Correctly calculates GMV, order count, and AI resolution percentage.',
    'size': 'L',
    'title': 'Daily analytics aggregation worker & materialization pipeline',
    'wave': 'W7'},
  { 'depends': ['T-ANL-01'],
    'fs': ['FS-ANL-01'],
    'gold': { 'acceptance_test_scenarios': [ '[ ] **KPI Overview**: Returns 4 KPI metrics with trend deltas.',
                                             '[ ] **Timeseries**: Returns daily data points for charts.'],
              'cmd': 'pnpm --filter api test -- src/analytics',
              'depends': ['T-ANL-01'],
              'dont_modify_scope': ['apps/web/'],
              'expected_deliverables': 'Analytics overview controller, service, and tests in `apps/api/src/analytics`.',
              'files': [ 'apps/api/src/analytics/kpis/analytics.controller.ts',
                         'apps/api/src/analytics/kpis/analytics.service.ts',
                         'apps/api/src/analytics/dto/analytics-overview.dto.ts'],
              'fs': ['FS-ANL-01'],
              'human_contribution': ['**🧪 Manual QA**: Call `GET /analytics/overview?period=30d` via Swagger.'],
              'id': 'T-ANL-02',
              'implementation_steps': [ '1. Implement `AnalyticsService.getOverview()` querying materialized daily '
                                        'table.',
                                        '2. Implement `AnalyticsController` with '
                                        "`@RequirePermission('analytics.read')`.",
                                        '3. Author unit tests covering KPI aggregations and date filtering.'],
              'modify_scope': ['apps/api/src/analytics/analytics.*', 'apps/api/src/analytics/dto/*'],
              'objective_value': 'Implement merchant analytics overview API returning 4 core KPI cards (GMV, '
                                 'Conversations, AI Resolution Rate, Response Time) and trend timeseries.',
              'read': [ 'docs/10_engineering/13_API_DESIGN.md',
                        'docs/10_engineering/12_DATABASE_DESIGN.md',
                        'docs/30_execution/32_FEATURE_SPECIFICATIONS.md'],
              'security_invariants': [ "🔒 **Tenancy Boundary**: Queries strictly scoped to caller's `business_id`.",
                                       '🛡️ **Fast Response (<100ms)**: Reads from materialized `analytics_daily` '
                                       'table.'],
              'size': 'M',
              'technical_contract': [ '`GET /analytics/overview` (200 OK) -> Query params: `from`, `to`, `period` '
                                      "('7d' | '30d' | '90d')",
                                      'Response: `{ summary: { gmv, orders, conversations, aiResolutionRate, '
                                      'avgResponseTimeMs }, timeseries: DailyMetricPoint[] }`'],
              'title': 'Analytics dashboard summary & timeseries overview API (`/analytics/overview`)',
              'wave': 'W7',
              'why': 'Power the executive analytics dashboard in the merchant web application.'},
    'id': 'T-ANL-02',
    'leaves': [ { 'cmd': 'pnpm --filter api test -- src/analytics',
                  'do': [ '1. Implement `AnalyticsService.getOverview()` querying materialized daily table.',
                          "2. Implement `AnalyticsController` with `@RequirePermission('analytics.read')`.",
                          '3. Author unit tests covering KPI aggregations and date filtering.'],
                  'done': '**KPI Overview**: Returns 4 KPI metrics with trend deltas.',
                  'dont': [],
                  'files': [ 'apps/api/src/analytics/kpis/analytics.controller.ts',
                             'apps/api/src/analytics/kpis/analytics.service.ts',
                             'apps/api/src/analytics/dto/analytics-overview.dto.ts'],
                  'gold': { 'acceptance_test_scenarios': [ '[ ] **KPI Overview**: Returns 4 KPI metrics with trend '
                                                           'deltas.',
                                                           '[ ] **Timeseries**: Returns daily data points for charts.'],
                            'cmd': 'pnpm --filter api test -- src/analytics',
                            'depends': ['T-ANL-01'],
                            'dont_modify_scope': ['apps/web/'],
                            'expected_deliverables': 'Analytics overview controller, service, and tests in '
                                                     '`apps/api/src/analytics`.',
                            'files': [ 'apps/api/src/analytics/kpis/analytics.controller.ts',
                                       'apps/api/src/analytics/kpis/analytics.service.ts',
                                       'apps/api/src/analytics/dto/analytics-overview.dto.ts'],
                            'fs': ['FS-ANL-01'],
                            'human_contribution': [ '**🧪 Manual QA**: Call `GET /analytics/overview?period=30d` via '
                                                    'Swagger.'],
                            'id': 'T-ANL-02',
                            'implementation_steps': [ '1. Implement `AnalyticsService.getOverview()` querying '
                                                      'materialized daily table.',
                                                      '2. Implement `AnalyticsController` with '
                                                      "`@RequirePermission('analytics.read')`.",
                                                      '3. Author unit tests covering KPI aggregations and date '
                                                      'filtering.'],
                            'modify_scope': ['apps/api/src/analytics/analytics.*', 'apps/api/src/analytics/dto/*'],
                            'objective_value': 'Implement merchant analytics overview API returning 4 core KPI cards '
                                               '(GMV, Conversations, AI Resolution Rate, Response Time) and trend '
                                               'timeseries.',
                            'read': [ 'docs/10_engineering/13_API_DESIGN.md',
                                      'docs/10_engineering/12_DATABASE_DESIGN.md',
                                      'docs/30_execution/32_FEATURE_SPECIFICATIONS.md'],
                            'security_invariants': [ "🔒 **Tenancy Boundary**: Queries strictly scoped to caller's "
                                                     '`business_id`.',
                                                     '🛡️ **Fast Response (<100ms)**: Reads from materialized '
                                                     '`analytics_daily` table.'],
                            'size': 'M',
                            'technical_contract': [ '`GET /analytics/overview` (200 OK) -> Query params: `from`, `to`, '
                                                    "`period` ('7d' | '30d' | '90d')",
                                                    'Response: `{ summary: { gmv, orders, conversations, '
                                                    'aiResolutionRate, avgResponseTimeMs }, timeseries: '
                                                    'DailyMetricPoint[] }`'],
                            'title': 'Analytics dashboard summary & timeseries overview API (`/analytics/overview`)',
                            'wave': 'W7',
                            'why': 'Power the executive analytics dashboard in the merchant web application.'},
                  'letter': '',
                  'read': [ 'docs/10_engineering/13_API_DESIGN/05-realtime-platform-governance.md',
                            'docs/10_engineering/12_DATABASE_DESIGN/05-billing-notifications-audit.md',
                            'docs/30_execution/32_FEATURE_SPECIFICATIONS.md'],
                  'title': 'Analytics dashboard summary & timeseries overview API (`/analytics/overview`)'}],
    'parent_done': '**KPI Overview**: Returns 4 KPI metrics with trend deltas.',
    'size': 'M',
    'title': 'Analytics dashboard summary & timeseries overview API (`/analytics/overview`)',
    'wave': 'W7'},
  { 'depends': ['T-AUTH-01', 'T-AUTH-03'],
    'fs': ['FS-WEB-01'],
    'gold': { 'acceptance_test_scenarios': [ '[ ] **Login Page**: Successful login sets session and redirects to '
                                             '`/inbox` or `/onboarding`.',
                                             '[ ] **Register Page**: Registration creates account and launches '
                                             'onboarding.',
                                             '[ ] **Invite Page**: Valid token accepts invite and redirects to '
                                             'dashboard.'],
              'cmd': 'pnpm --filter web lint',
              'depends': ['T-AUTH-01', 'T-AUTH-03'],
              'dont_modify_scope': ['apps/api/'],
              'expected_deliverables': 'Auth pages, hooks, and session provider in `apps/web`.',
              'files': [ 'apps/web/src/app/(auth)/login/page.tsx',
                         'apps/web/src/app/(auth)/register/page.tsx',
                         'apps/web/src/app/(auth)/invite/page.tsx',
                         'apps/web/src/providers/auth-provider.tsx',
                         'apps/web/src/hooks/use-auth.ts'],
              'fs': ['FS-WEB-01'],
              'human_contribution': [ '**🧪 Manual QA & Smoke test**: Open `http://localhost:3000/login` and '
                                      '`/register` in browser; test sign-in with valid and invalid credentials.',
                                      '**👁️ Review & Sign-off**: Verify zero sensitive tokens stored in '
                                      '`localStorage`.'],
              'id': 'T-WEB-01',
              'implementation_steps': [ '1. Implement `AuthProvider` and `useAuth()` hook managing session state.',
                                        '2. Implement login page with form validation and error handling.',
                                        '3. Implement register page with password requirements.',
                                        '4. Implement invite acceptance page reading `?token=` query param.',
                                        '5. Author component tests with React Testing Library.'],
              'modify_scope': [ 'apps/web/src/app/(auth)/',
                                'apps/web/src/providers/auth-provider.*',
                                'apps/web/src/hooks/use-auth.*'],
              'objective_value': 'Implement web authentication interface pages (login, registration, invite '
                                 'acceptance) with React Hook Form, Zod validation, and session provider.',
              'read': [ 'docs/20_design/20_DESIGN_SYSTEM.md',
                        'docs/20_design/23_UI_COMPONENTS.md',
                        'docs/30_execution/32_FEATURE_SPECIFICATIONS.md'],
              'security_invariants': [ '🔒 **No LocalStorage Tokens**: Store access token in React memory/context; '
                                       'refresh token stays in HTTP-only Secure cookie.',
                                       '🛡️ **No Cross-Boundary Imports**: Never import from `apps/api/src/`.'],
              'size': 'L',
              'technical_contract': [ '`/login`: Email/password form with error banner for invalid credentials '
                                      '(generic error copy).',
                                      '`/register`: Name, email, password (min 10 chars) with strength meter.',
                                      '`/invite?token=...`: Tokenized onboarding form for invited staff.',
                                      '`AuthProvider`: Manages access token in memory, auto-refreshes session with '
                                      'HTTP-only cookie.'],
              'title': 'Web authentication UI (login, register, accept invite, session provider)',
              'wave': 'W8',
              'why': 'Allow merchants and invited team members to sign in and authenticate securely on the web '
                     'application.'},
    'id': 'T-WEB-01',
    'leaves': [ { 'cmd': 'pnpm --filter web lint',
                  'do': [ '1. Implement `AuthProvider` and `useAuth()` hook managing session state.',
                          '2. Implement login page with form validation and error handling.',
                          '3. Implement register page with password requirements.',
                          '4. Implement invite acceptance page reading `?token=` query param.',
                          '5. Author component tests with React Testing Library.'],
                  'done': '**Login Page**: Successful login sets session and redirects to `/inbox` or `/onboarding`.',
                  'dont': [],
                  'files': [ 'apps/web/src/app/(auth)/login/page.tsx',
                             'apps/web/src/app/(auth)/register/page.tsx',
                             'apps/web/src/app/(auth)/invite/page.tsx',
                             'apps/web/src/providers/auth-provider.tsx',
                             'apps/web/src/hooks/use-auth.ts'],
                  'gold': { 'acceptance_test_scenarios': [ '[ ] **Login Page**: Successful login sets session and '
                                                           'redirects to `/inbox` or `/onboarding`.',
                                                           '[ ] **Register Page**: Registration creates account and '
                                                           'launches onboarding.',
                                                           '[ ] **Invite Page**: Valid token accepts invite and '
                                                           'redirects to dashboard.'],
                            'cmd': 'pnpm --filter web lint',
                            'depends': ['T-AUTH-01', 'T-AUTH-03'],
                            'dont_modify_scope': ['apps/api/'],
                            'expected_deliverables': 'Auth pages, hooks, and session provider in `apps/web`.',
                            'files': [ 'apps/web/src/app/(auth)/login/page.tsx',
                                       'apps/web/src/app/(auth)/register/page.tsx',
                                       'apps/web/src/app/(auth)/invite/page.tsx',
                                       'apps/web/src/providers/auth-provider.tsx',
                                       'apps/web/src/hooks/use-auth.ts'],
                            'fs': ['FS-WEB-01'],
                            'human_contribution': [ '**🧪 Manual QA & Smoke test**: Open `http://localhost:3000/login` '
                                                    'and `/register` in browser; test sign-in with valid and invalid '
                                                    'credentials.',
                                                    '**👁️ Review & Sign-off**: Verify zero sensitive tokens stored in '
                                                    '`localStorage`.'],
                            'id': 'T-WEB-01',
                            'implementation_steps': [ '1. Implement `AuthProvider` and `useAuth()` hook managing '
                                                      'session state.',
                                                      '2. Implement login page with form validation and error '
                                                      'handling.',
                                                      '3. Implement register page with password requirements.',
                                                      '4. Implement invite acceptance page reading `?token=` query '
                                                      'param.',
                                                      '5. Author component tests with React Testing Library.'],
                            'modify_scope': [ 'apps/web/src/app/(auth)/',
                                              'apps/web/src/providers/auth-provider.*',
                                              'apps/web/src/hooks/use-auth.*'],
                            'objective_value': 'Implement web authentication interface pages (login, registration, '
                                               'invite acceptance) with React Hook Form, Zod validation, and session '
                                               'provider.',
                            'read': [ 'docs/20_design/20_DESIGN_SYSTEM.md',
                                      'docs/20_design/23_UI_COMPONENTS.md',
                                      'docs/30_execution/32_FEATURE_SPECIFICATIONS.md'],
                            'security_invariants': [ '🔒 **No LocalStorage Tokens**: Store access token in React '
                                                     'memory/context; refresh token stays in HTTP-only Secure cookie.',
                                                     '🛡️ **No Cross-Boundary Imports**: Never import from '
                                                     '`apps/api/src/`.'],
                            'size': 'L',
                            'technical_contract': [ '`/login`: Email/password form with error banner for invalid '
                                                    'credentials (generic error copy).',
                                                    '`/register`: Name, email, password (min 10 chars) with strength '
                                                    'meter.',
                                                    '`/invite?token=...`: Tokenized onboarding form for invited staff.',
                                                    '`AuthProvider`: Manages access token in memory, auto-refreshes '
                                                    'session with HTTP-only cookie.'],
                            'title': 'Web authentication UI (login, register, accept invite, session provider)',
                            'wave': 'W8',
                            'why': 'Allow merchants and invited team members to sign in and authenticate securely on '
                                   'the web application.'},
                  'letter': '',
                  'read': [ 'docs/20_design/20_DESIGN_SYSTEM/01-tokens-color-typography.md',
                            'docs/20_design/23_UI_COMPONENTS/02-primitives-shared-atoms-shell.md',
                            'docs/30_execution/32_FEATURE_SPECIFICATIONS.md'],
                  'title': 'Web authentication UI (login, register, accept invite, session provider)'}],
    'parent_done': '**Login Page**: Successful login sets session and redirects to `/inbox` or `/onboarding`.',
    'size': 'L',
    'title': 'Web authentication UI (login, register, accept invite, session provider)',
    'wave': 'W8'},
  { 'depends': ['T-WEB-01', 'T-BILL-03', 'T-NOTIF-02'],
    'fs': ['FS-WEB-01'],
    'gold': { 'acceptance_test_scenarios': [ '[ ] **Responsive Layout**: Sidebar collapses to Sheet drawer on mobile '
                                             'viewport.',
                                             '[ ] **Tenant Switcher**: Switching workspace refreshes data context.',
                                             '[ ] **Role Visibility**: Employee role does not see Settings navigation '
                                             'link.'],
              'cmd': 'pnpm --filter web lint',
              'depends': ['T-WEB-01', 'T-BILL-03', 'T-NOTIF-02'],
              'dont_modify_scope': ['apps/api/'],
              'expected_deliverables': 'Responsive AppShell layout components and unit tests in `apps/web`.',
              'files': [ 'apps/web/src/app/(dashboard)/layout.tsx',
                         'apps/web/src/components/layout/app-shell.tsx',
                         'apps/web/src/components/layout/sidebar.tsx',
                         'apps/web/src/components/layout/header.tsx',
                         'apps/web/src/components/layout/tenant-switcher.tsx',
                         'apps/web/src/components/layout/usage-widget.tsx',
                         'apps/web/src/components/layout/notification-popover.tsx'],
              'fs': ['FS-WEB-01'],
              'human_contribution': [ '**🧪 Manual QA & Smoke test**: Log in as Owner (verify all nav links, usage '
                                      'widget, notification bell); log in as Employee (verify Settings hidden); test '
                                      'mobile responsive drawer.'],
              'id': 'T-WEB-02',
              'implementation_steps': [ '1. Implement `AppShell` and responsive layout with Radix / shadcn components.',
                                        '2. Implement `Sidebar` with active route highlights and role filtering.',
                                        '3. Implement `TenantSwitcher` switching `X-Business-Id` in active session.',
                                        '4. Implement `UsageWidget` and `NotificationPopover` in header.',
                                        '5. Author layout unit tests verifying role-based item visibility.'],
              'modify_scope': ['apps/web/src/app/(dashboard)/layout.tsx', 'apps/web/src/components/layout/'],
              'objective_value': 'Implement responsive web application dashboard shell with collapsible sidebar, '
                                 'RBAC-filtered navigation, tenant workspace switcher, live usage progress widget, and '
                                 'notification bell popover.',
              'read': [ 'docs/20_design/20_DESIGN_SYSTEM.md',
                        'docs/20_design/23_UI_COMPONENTS.md',
                        'docs/30_execution/32_FEATURE_SPECIFICATIONS.md'],
              'security_invariants': [ '🔒 **RBAC Navigation Filtering**: Navigation items hidden if user lacks '
                                       'permission.'],
              'size': 'L',
              'technical_contract': [ 'Desktop: Left sidebar (collapsible to icons) + Top header with tenant switcher, '
                                      'usage widget, and notification bell.',
                                      'Mobile (<768px): Header with hamburger button opening Sheet drawer menu.',
                                      'RBAC Filtering: Hide Settings link for Employee role.'],
              'title': 'Web application shell, navigation, tenant switcher, usage widget & header',
              'wave': 'W8',
              'why': 'Provide a cohesive, responsive layout framing all dashboard views with workspace switching and '
                     'alert indicators.'},
    'id': 'T-WEB-02',
    'leaves': [ { 'cmd': 'pnpm --filter web lint',
                  'do': [ '1. Implement `AppShell` and responsive layout with Radix / shadcn components.',
                          '2. Implement `Sidebar` with active route highlights and role filtering.',
                          '3. Implement `TenantSwitcher` switching `X-Business-Id` in active session.',
                          '4. Implement `UsageWidget` and `NotificationPopover` in header.',
                          '5. Author layout unit tests verifying role-based item visibility.'],
                  'done': '**Responsive Layout**: Sidebar collapses to Sheet drawer on mobile viewport.',
                  'dont': [],
                  'files': [ 'apps/web/src/app/(dashboard)/layout.tsx',
                             'apps/web/src/components/layout/app-shell.tsx',
                             'apps/web/src/components/layout/sidebar.tsx',
                             'apps/web/src/components/layout/header.tsx',
                             'apps/web/src/components/layout/tenant-switcher.tsx',
                             'apps/web/src/components/layout/usage-widget.tsx',
                             'apps/web/src/components/layout/notification-popover.tsx'],
                  'gold': { 'acceptance_test_scenarios': [ '[ ] **Responsive Layout**: Sidebar collapses to Sheet '
                                                           'drawer on mobile viewport.',
                                                           '[ ] **Tenant Switcher**: Switching workspace refreshes '
                                                           'data context.',
                                                           '[ ] **Role Visibility**: Employee role does not see '
                                                           'Settings navigation link.'],
                            'cmd': 'pnpm --filter web lint',
                            'depends': ['T-WEB-01', 'T-BILL-03', 'T-NOTIF-02'],
                            'dont_modify_scope': ['apps/api/'],
                            'expected_deliverables': 'Responsive AppShell layout components and unit tests in '
                                                     '`apps/web`.',
                            'files': [ 'apps/web/src/app/(dashboard)/layout.tsx',
                                       'apps/web/src/components/layout/app-shell.tsx',
                                       'apps/web/src/components/layout/sidebar.tsx',
                                       'apps/web/src/components/layout/header.tsx',
                                       'apps/web/src/components/layout/tenant-switcher.tsx',
                                       'apps/web/src/components/layout/usage-widget.tsx',
                                       'apps/web/src/components/layout/notification-popover.tsx'],
                            'fs': ['FS-WEB-01'],
                            'human_contribution': [ '**🧪 Manual QA & Smoke test**: Log in as Owner (verify all nav '
                                                    'links, usage widget, notification bell); log in as Employee '
                                                    '(verify Settings hidden); test mobile responsive drawer.'],
                            'id': 'T-WEB-02',
                            'implementation_steps': [ '1. Implement `AppShell` and responsive layout with Radix / '
                                                      'shadcn components.',
                                                      '2. Implement `Sidebar` with active route highlights and role '
                                                      'filtering.',
                                                      '3. Implement `TenantSwitcher` switching `X-Business-Id` in '
                                                      'active session.',
                                                      '4. Implement `UsageWidget` and `NotificationPopover` in header.',
                                                      '5. Author layout unit tests verifying role-based item '
                                                      'visibility.'],
                            'modify_scope': [ 'apps/web/src/app/(dashboard)/layout.tsx',
                                              'apps/web/src/components/layout/'],
                            'objective_value': 'Implement responsive web application dashboard shell with collapsible '
                                               'sidebar, RBAC-filtered navigation, tenant workspace switcher, live '
                                               'usage progress widget, and notification bell popover.',
                            'read': [ 'docs/20_design/20_DESIGN_SYSTEM.md',
                                      'docs/20_design/23_UI_COMPONENTS.md',
                                      'docs/30_execution/32_FEATURE_SPECIFICATIONS.md'],
                            'security_invariants': [ '🔒 **RBAC Navigation Filtering**: Navigation items hidden if user '
                                                     'lacks permission.'],
                            'size': 'L',
                            'technical_contract': [ 'Desktop: Left sidebar (collapsible to icons) + Top header with '
                                                    'tenant switcher, usage widget, and notification bell.',
                                                    'Mobile (<768px): Header with hamburger button opening Sheet '
                                                    'drawer menu.',
                                                    'RBAC Filtering: Hide Settings link for Employee role.'],
                            'title': 'Web application shell, navigation, tenant switcher, usage widget & header',
                            'wave': 'W8',
                            'why': 'Provide a cohesive, responsive layout framing all dashboard views with workspace '
                                   'switching and alert indicators.'},
                  'letter': '',
                  'read': [ 'docs/20_design/20_DESIGN_SYSTEM/01-tokens-color-typography.md',
                            'docs/20_design/23_UI_COMPONENTS/02-primitives-shared-atoms-shell.md',
                            'docs/20_design/22_UX_FLOWS/01-shell-onboarding-activation.md'],
                  'title': 'Web application shell, navigation, tenant switcher, usage widget & header'}],
    'parent_done': '**Responsive Layout**: Sidebar collapses to Sheet drawer on mobile viewport.',
    'size': 'L',
    'title': 'Web application shell, navigation, tenant switcher, usage widget & header',
    'wave': 'W8'},
  { 'depends': ['T-WEB-02', 'T-CONV-02', 'T-ORD-01', 'T-AI-08'],
    'fs': ['FS-WEB-02'],
    'gold': { 'acceptance_test_scenarios': [ '[ ] **3-Pane Inbox**: Renders conversation list, active thread, and '
                                             'details drawer.',
                                             '[ ] **Draft Action**: Approving draft dispatches message and removes '
                                             'draft card.',
                                             '[ ] **Live Updates**: Incoming WebSocket messages prepend/append to '
                                             'thread without page refresh.',
                                             '[ ] **Order Drawer**: Can draft and confirm order directly from '
                                             'conversation pane.'],
              'cmd': 'pnpm --filter web lint',
              'depends': ['T-WEB-02', 'T-CONV-02', 'T-ORD-01', 'T-AI-08'],
              'dont_modify_scope': ['apps/api/'],
              'expected_deliverables': 'Realtime Inbox page, components, and tests in `apps/web`.',
              'files': [ 'apps/web/src/app/(dashboard)/inbox/page.tsx',
                         'apps/web/src/components/inbox/conversation-list.tsx',
                         'apps/web/src/components/inbox/conversation-thread.tsx',
                         'apps/web/src/components/inbox/message-bubble.tsx',
                         'apps/web/src/components/inbox/draft-approval-card.tsx',
                         'apps/web/src/components/inbox/order-drawer.tsx',
                         'apps/web/src/components/inbox/inbox-action-bar.tsx',
                         'apps/web/src/hooks/use-realtime-inbox.ts'],
              'fs': ['FS-WEB-02'],
              'human_contribution': [ '**🧪 Manual QA & Smoke test**: Open `http://localhost:3000/inbox`; select '
                                      'thread, approve AI draft, send reply, toggle takeover, confirm draft order in '
                                      'drawer.',
                                      '**👁️ Review & Sign-off**: Verify WebSocket reconnect logic and optimistic UI '
                                      'rollback on error.'],
              'id': 'T-WEB-03',
              'implementation_steps': [ '1. Implement `useRealtimeInbox` hook subscribing to Socket.IO events.',
                                        '2. Implement `ConversationList` with search, view filters (`needs_me`), and '
                                        'lead score pills.',
                                        '3. Implement `ConversationThread` with message bubbles, status banners, and '
                                        'draft cards.',
                                        '4. Implement `InboxActionBar` with AI suggest button, takeover toggle, and '
                                        'quick responses.',
                                        '5. Implement `OrderDrawer` for manual drafting and confirming pending orders.',
                                        '6. Author component tests with React Testing Library.'],
              'modify_scope': [ 'apps/web/src/app/(dashboard)/inbox/',
                                'apps/web/src/components/inbox/',
                                'apps/web/src/hooks/use-realtime-inbox.*'],
              'objective_value': 'Implement web Realtime Inbox interface with conversation list, real-time message '
                                 'stream, AI draft approval cards, takeover/resume toggle, lead score pills, on-demand '
                                 'AI suggest trigger, and order confirmation drawer.',
              'read': [ 'docs/20_design/22_UX_FLOWS.md',
                        'docs/20_design/23_UI_COMPONENTS.md',
                        'docs/30_execution/32_FEATURE_SPECIFICATIONS.md'],
              'security_invariants': [ '🔒 **Explicit Takeover Visuals**: Clear visual banner when conversation is in '
                                       'human takeover mode (`AI Paused`).'],
              'size': 'XL',
              'technical_contract': [ '3-Pane Layout: Left filter/search + Middle conversation thread + Right '
                                      'customer/order drawer.',
                                      "Draft Approval Card: Displays proposed AI message with 'Approve & Send', "
                                      "'Edit', and 'Reject' buttons.",
                                      'WebSocket Integration: Optimistic UI updates on send; listens for `message.new` '
                                      'and `lead.score_updated`.'],
              'title': 'Web Realtime Inbox UI (threads, messages, actions, draft approval, order drawer)',
              'wave': 'W8',
              'why': 'The primary operational surface for merchants to manage conversations, approve AI drafts, chat '
                     'with shoppers, and convert orders.'},
    'id': 'T-WEB-03',
    'leaves': [ { 'cmd': 'pnpm --filter web lint',
                  'do': [ '1. Implement `useRealtimeInbox` hook subscribing to Socket.IO events.',
                          '2. Implement `ConversationList` with search, view filters (`needs_me`), and lead score '
                          'pills.',
                          '3. Implement `ConversationThread` with message bubbles, status banners, and draft cards.',
                          '4. Implement `InboxActionBar` with AI suggest button, takeover toggle, and quick responses.',
                          '5. Implement `OrderDrawer` for manual drafting and confirming pending orders.',
                          '6. Author component tests with React Testing Library.'],
                  'done': '**3-Pane Inbox**: Renders conversation list, active thread, and details drawer.',
                  'dont': [],
                  'files': [ 'apps/web/src/app/(dashboard)/inbox/page.tsx',
                             'apps/web/src/components/inbox/conversation-list.tsx',
                             'apps/web/src/components/inbox/conversation-thread.tsx',
                             'apps/web/src/components/inbox/message-bubble.tsx',
                             'apps/web/src/components/inbox/draft-approval-card.tsx',
                             'apps/web/src/components/inbox/order-drawer.tsx',
                             'apps/web/src/components/inbox/inbox-action-bar.tsx',
                             'apps/web/src/hooks/use-realtime-inbox.ts'],
                  'gold': { 'acceptance_test_scenarios': [ '[ ] **3-Pane Inbox**: Renders conversation list, active '
                                                           'thread, and details drawer.',
                                                           '[ ] **Draft Action**: Approving draft dispatches message '
                                                           'and removes draft card.',
                                                           '[ ] **Live Updates**: Incoming WebSocket messages '
                                                           'prepend/append to thread without page refresh.',
                                                           '[ ] **Order Drawer**: Can draft and confirm order directly '
                                                           'from conversation pane.'],
                            'cmd': 'pnpm --filter web lint',
                            'depends': ['T-WEB-02', 'T-CONV-02', 'T-ORD-01', 'T-AI-08'],
                            'dont_modify_scope': ['apps/api/'],
                            'expected_deliverables': 'Realtime Inbox page, components, and tests in `apps/web`.',
                            'files': [ 'apps/web/src/app/(dashboard)/inbox/page.tsx',
                                       'apps/web/src/components/inbox/conversation-list.tsx',
                                       'apps/web/src/components/inbox/conversation-thread.tsx',
                                       'apps/web/src/components/inbox/message-bubble.tsx',
                                       'apps/web/src/components/inbox/draft-approval-card.tsx',
                                       'apps/web/src/components/inbox/order-drawer.tsx',
                                       'apps/web/src/components/inbox/inbox-action-bar.tsx',
                                       'apps/web/src/hooks/use-realtime-inbox.ts'],
                            'fs': ['FS-WEB-02'],
                            'human_contribution': [ '**🧪 Manual QA & Smoke test**: Open `http://localhost:3000/inbox`; '
                                                    'select thread, approve AI draft, send reply, toggle takeover, '
                                                    'confirm draft order in drawer.',
                                                    '**👁️ Review & Sign-off**: Verify WebSocket reconnect logic and '
                                                    'optimistic UI rollback on error.'],
                            'id': 'T-WEB-03',
                            'implementation_steps': [ '1. Implement `useRealtimeInbox` hook subscribing to Socket.IO '
                                                      'events.',
                                                      '2. Implement `ConversationList` with search, view filters '
                                                      '(`needs_me`), and lead score pills.',
                                                      '3. Implement `ConversationThread` with message bubbles, status '
                                                      'banners, and draft cards.',
                                                      '4. Implement `InboxActionBar` with AI suggest button, takeover '
                                                      'toggle, and quick responses.',
                                                      '5. Implement `OrderDrawer` for manual drafting and confirming '
                                                      'pending orders.',
                                                      '6. Author component tests with React Testing Library.'],
                            'modify_scope': [ 'apps/web/src/app/(dashboard)/inbox/',
                                              'apps/web/src/components/inbox/',
                                              'apps/web/src/hooks/use-realtime-inbox.*'],
                            'objective_value': 'Implement web Realtime Inbox interface with conversation list, '
                                               'real-time message stream, AI draft approval cards, takeover/resume '
                                               'toggle, lead score pills, on-demand AI suggest trigger, and order '
                                               'confirmation drawer.',
                            'read': [ 'docs/20_design/22_UX_FLOWS.md',
                                      'docs/20_design/23_UI_COMPONENTS.md',
                                      'docs/30_execution/32_FEATURE_SPECIFICATIONS.md'],
                            'security_invariants': [ '🔒 **Explicit Takeover Visuals**: Clear visual banner when '
                                                     'conversation is in human takeover mode (`AI Paused`).'],
                            'size': 'XL',
                            'technical_contract': [ '3-Pane Layout: Left filter/search + Middle conversation thread + '
                                                    'Right customer/order drawer.',
                                                    "Draft Approval Card: Displays proposed AI message with 'Approve & "
                                                    "Send', 'Edit', and 'Reject' buttons.",
                                                    'WebSocket Integration: Optimistic UI updates on send; listens for '
                                                    '`message.new` and `lead.score_updated`.'],
                            'title': 'Web Realtime Inbox UI (threads, messages, actions, draft approval, order drawer)',
                            'wave': 'W8',
                            'why': 'The primary operational surface for merchants to manage conversations, approve AI '
                                   'drafts, chat with shoppers, and convert orders.'},
                  'letter': '',
                  'read': [ 'docs/20_design/22_UX_FLOWS/02-inbox-three-pane-command-center.md',
                            'docs/20_design/23_UI_COMPONENTS/03-inbox-command-center.md',
                            'docs/30_execution/32_FEATURE_SPECIFICATIONS.md'],
                  'title': 'Web Realtime Inbox UI (threads, messages, actions, draft approval, order drawer)'}],
    'parent_done': '**3-Pane Inbox**: Renders conversation list, active thread, and details drawer.',
    'size': 'XL',
    'title': 'Web Realtime Inbox UI (threads, messages, actions, draft approval, order drawer)',
    'wave': 'W8'},
  { 'depends': ['T-WEB-02', 'T-BIZ-04', 'T-AI-06', 'T-INT-01', 'T-CAT-03'],
    'fs': ['FS-WEB-03'],
    'gold': { 'acceptance_test_scenarios': [ '[ ] **Step Navigation**: Merchant can progress through all 5 steps.',
                                             '[ ] **Gate Lock**: Live activation toggle remains locked until '
                                             'prerequisites are satisfied.',
                                             '[ ] **Activation Success**: Successful activation redirects to '
                                             '`/inbox`.'],
              'cmd': 'pnpm --filter web lint',
              'depends': ['T-WEB-02', 'T-BIZ-04', 'T-AI-06', 'T-INT-01', 'T-CAT-03'],
              'dont_modify_scope': ['apps/api/'],
              'expected_deliverables': 'Onboarding Wizard page and step components in `apps/web`.',
              'files': [ 'apps/web/src/app/(dashboard)/onboarding/page.tsx',
                         'apps/web/src/components/onboarding/onboarding-wizard.tsx',
                         'apps/web/src/components/onboarding/step-store-setup.tsx',
                         'apps/web/src/components/onboarding/step-channel-connect.tsx',
                         'apps/web/src/components/onboarding/step-catalog-upload.tsx',
                         'apps/web/src/components/onboarding/step-playground-test.tsx',
                         'apps/web/src/components/onboarding/step-live-activation.tsx'],
              'fs': ['FS-WEB-03'],
              'human_contribution': [ '**🧪 Manual QA & Smoke test**: Open `http://localhost:3000/onboarding`; test '
                                      'Step 1 store setup, Step 2 channel card, Step 3 catalog upload, Step 4 '
                                      'playground chat, Step 5 live activation.'],
              'id': 'T-WEB-04',
              'implementation_steps': [ '1. Implement `OnboardingWizard` with step state machine and progress bar.',
                                        '2. Implement Steps 1–5 components connecting to corresponding API endpoints.',
                                        '3. Implement live checklist validating server `unmetGates` list.',
                                        '4. Author component tests covering wizard step transitions and activation '
                                        'button states.'],
              'modify_scope': ['apps/web/src/app/(dashboard)/onboarding/', 'apps/web/src/components/onboarding/'],
              'objective_value': 'Implement 5-step interactive Onboarding Wizard guiding merchants through Store '
                                 'Profile, Channel Connection, Catalog CSV Upload, AI Playground Simulation, and Live '
                                 'Activation Checklist.',
              'read': [ 'docs/20_design/22_UX_FLOWS.md',
                        'docs/20_design/23_UI_COMPONENTS.md',
                        'docs/30_execution/32_FEATURE_SPECIFICATIONS.md'],
              'security_invariants': [ '🔒 **Gated Activation**: Step 5 activation toggle is disabled until Gates G1–G4 '
                                       'are complete.'],
              'size': 'L',
              'technical_contract': [ 'Step 1: Store Setup (name, currency, timezone, phone)',
                                      'Step 2: Channel Connect (Meta OAuth Instagram/Messenger connect card)',
                                      'Step 3: Catalog Upload (CSV drag-and-drop with validation preview)',
                                      'Step 4: Playground Test (Live simulated chat modal)',
                                      'Step 5: Live Activation (Checklist of Gates G1–G5 with activation toggle)'],
              'title': 'Web Onboarding Wizard UI (5 steps: Store, Channels, Catalog, Playground, Live Gate)',
              'wave': 'W8',
              'why': 'Ensure every merchant completes all necessary configuration before turning on live '
                     'customer-facing AI responses.'},
    'id': 'T-WEB-04',
    'leaves': [ { 'cmd': 'pnpm --filter web lint',
                  'do': [ '1. Implement `OnboardingWizard` with step state machine and progress bar.',
                          '2. Implement Steps 1–5 components connecting to corresponding API endpoints.',
                          '3. Implement live checklist validating server `unmetGates` list.',
                          '4. Author component tests covering wizard step transitions and activation button states.'],
                  'done': '**Step Navigation**: Merchant can progress through all 5 steps.',
                  'dont': [],
                  'files': [ 'apps/web/src/app/(dashboard)/onboarding/page.tsx',
                             'apps/web/src/components/onboarding/onboarding-wizard.tsx',
                             'apps/web/src/components/onboarding/step-store-setup.tsx',
                             'apps/web/src/components/onboarding/step-channel-connect.tsx',
                             'apps/web/src/components/onboarding/step-catalog-upload.tsx',
                             'apps/web/src/components/onboarding/step-playground-test.tsx',
                             'apps/web/src/components/onboarding/step-live-activation.tsx'],
                  'gold': { 'acceptance_test_scenarios': [ '[ ] **Step Navigation**: Merchant can progress through all '
                                                           '5 steps.',
                                                           '[ ] **Gate Lock**: Live activation toggle remains locked '
                                                           'until prerequisites are satisfied.',
                                                           '[ ] **Activation Success**: Successful activation '
                                                           'redirects to `/inbox`.'],
                            'cmd': 'pnpm --filter web lint',
                            'depends': ['T-WEB-02', 'T-BIZ-04', 'T-AI-06', 'T-INT-01', 'T-CAT-03'],
                            'dont_modify_scope': ['apps/api/'],
                            'expected_deliverables': 'Onboarding Wizard page and step components in `apps/web`.',
                            'files': [ 'apps/web/src/app/(dashboard)/onboarding/page.tsx',
                                       'apps/web/src/components/onboarding/onboarding-wizard.tsx',
                                       'apps/web/src/components/onboarding/step-store-setup.tsx',
                                       'apps/web/src/components/onboarding/step-channel-connect.tsx',
                                       'apps/web/src/components/onboarding/step-catalog-upload.tsx',
                                       'apps/web/src/components/onboarding/step-playground-test.tsx',
                                       'apps/web/src/components/onboarding/step-live-activation.tsx'],
                            'fs': ['FS-WEB-03'],
                            'human_contribution': [ '**🧪 Manual QA & Smoke test**: Open '
                                                    '`http://localhost:3000/onboarding`; test Step 1 store setup, Step '
                                                    '2 channel card, Step 3 catalog upload, Step 4 playground chat, '
                                                    'Step 5 live activation.'],
                            'id': 'T-WEB-04',
                            'implementation_steps': [ '1. Implement `OnboardingWizard` with step state machine and '
                                                      'progress bar.',
                                                      '2. Implement Steps 1–5 components connecting to corresponding '
                                                      'API endpoints.',
                                                      '3. Implement live checklist validating server `unmetGates` '
                                                      'list.',
                                                      '4. Author component tests covering wizard step transitions and '
                                                      'activation button states.'],
                            'modify_scope': [ 'apps/web/src/app/(dashboard)/onboarding/',
                                              'apps/web/src/components/onboarding/'],
                            'objective_value': 'Implement 5-step interactive Onboarding Wizard guiding merchants '
                                               'through Store Profile, Channel Connection, Catalog CSV Upload, AI '
                                               'Playground Simulation, and Live Activation Checklist.',
                            'read': [ 'docs/20_design/22_UX_FLOWS.md',
                                      'docs/20_design/23_UI_COMPONENTS.md',
                                      'docs/30_execution/32_FEATURE_SPECIFICATIONS.md'],
                            'security_invariants': [ '🔒 **Gated Activation**: Step 5 activation toggle is disabled '
                                                     'until Gates G1–G4 are complete.'],
                            'size': 'L',
                            'technical_contract': [ 'Step 1: Store Setup (name, currency, timezone, phone)',
                                                    'Step 2: Channel Connect (Meta OAuth Instagram/Messenger connect '
                                                    'card)',
                                                    'Step 3: Catalog Upload (CSV drag-and-drop with validation '
                                                    'preview)',
                                                    'Step 4: Playground Test (Live simulated chat modal)',
                                                    'Step 5: Live Activation (Checklist of Gates G1–G5 with activation '
                                                    'toggle)'],
                            'title': 'Web Onboarding Wizard UI (5 steps: Store, Channels, Catalog, Playground, Live '
                                     'Gate)',
                            'wave': 'W8',
                            'why': 'Ensure every merchant completes all necessary configuration before turning on live '
                                   'customer-facing AI responses.'},
                  'letter': '',
                  'read': [ 'docs/20_design/22_UX_FLOWS/01-shell-onboarding-activation.md',
                            'docs/20_design/23_UI_COMPONENTS/04-views-onboarding-governance.md',
                            'docs/30_execution/32_FEATURE_SPECIFICATIONS.md'],
                  'title': 'Web Onboarding Wizard UI (5 steps: Store, Channels, Catalog, Playground, Live Gate)'}],
    'parent_done': '**Step Navigation**: Merchant can progress through all 5 steps.',
    'size': 'L',
    'title': 'Web Onboarding Wizard UI (5 steps: Store, Channels, Catalog, Playground, Live Gate)',
    'wave': 'W8'},
  { 'depends': ['T-WEB-01'],
    'fs': ['FS-WEB-01'],
    'gold': { 'acceptance_test_scenarios': [ '[ ] **Locale Switch**: Switching language changes all UI text '
                                             'seamlessly.',
                                             "[ ] **RTL Direction**: Switching to Arabic applies `dir='rtl'`."],
              'cmd': 'pnpm --filter web lint',
              'depends': ['T-WEB-01'],
              'dont_modify_scope': ['apps/api/'],
              'expected_deliverables': 'Translation catalogs and i18n configuration in `apps/web`.',
              'files': [ 'apps/web/src/i18n/messages/fr.json',
                         'apps/web/src/i18n/messages/ar.json',
                         'apps/web/src/i18n/messages/en.json',
                         'apps/web/src/i18n/request.ts'],
              'fs': ['FS-WEB-01'],
              'human_contribution': [ '**🧪 Manual QA**: Switch language selector between FR, AR (verify RTL layout), '
                                      'and EN in browser.'],
              'id': 'T-WEB-05',
              'implementation_steps': [ '1. Author comprehensive translation catalogs in `fr.json`, `ar.json`, '
                                        '`en.json`.',
                                        '2. Configure next-intl middleware and request configuration.',
                                        '3. Add language switcher component in header.',
                                        '4. Author tests verifying catalog completeness without missing keys.'],
              'modify_scope': ['apps/web/src/i18n/'],
              'objective_value': 'Implement next-intl localization catalogs for French (primary), Arabic (with RTL '
                                 "`dir='rtl'` layout), and English.",
              'read': ['docs/20_design/20_DESIGN_SYSTEM.md', 'docs/00_product/03_MVP_SCOPE.md'],
              'security_invariants': [ "🔒 **RTL Layout**: Arabic locale sets `dir='rtl'` on HTML root and flips "
                                       'navigation/drawer alignments.'],
              'size': 'M',
              'technical_contract': [ 'Locales: `fr` (French - default), `ar` (Arabic with RTL direction), `en` '
                                      '(English).',
                                      'Zero hardcoded UI strings; all labels sourced from `useTranslations()`.'],
              'title': 'Internationalization Catalogs & RTL layout (Arabic/French/English)',
              'wave': 'W8',
              'why': 'Provide Tunisian merchants with a localized UI in their preferred language.'},
    'id': 'T-WEB-05',
    'leaves': [ { 'cmd': 'pnpm --filter web lint',
                  'do': [ '1. Author comprehensive translation catalogs in `fr.json`, `ar.json`, `en.json`.',
                          '2. Configure next-intl middleware and request configuration.',
                          '3. Add language switcher component in header.',
                          '4. Author tests verifying catalog completeness without missing keys.'],
                  'done': '**Locale Switch**: Switching language changes all UI text seamlessly.',
                  'dont': [],
                  'files': [ 'apps/web/src/i18n/messages/fr.json',
                             'apps/web/src/i18n/messages/ar.json',
                             'apps/web/src/i18n/messages/en.json',
                             'apps/web/src/i18n/request.ts'],
                  'gold': { 'acceptance_test_scenarios': [ '[ ] **Locale Switch**: Switching language changes all UI '
                                                           'text seamlessly.',
                                                           '[ ] **RTL Direction**: Switching to Arabic applies '
                                                           "`dir='rtl'`."],
                            'cmd': 'pnpm --filter web lint',
                            'depends': ['T-WEB-01'],
                            'dont_modify_scope': ['apps/api/'],
                            'expected_deliverables': 'Translation catalogs and i18n configuration in `apps/web`.',
                            'files': [ 'apps/web/src/i18n/messages/fr.json',
                                       'apps/web/src/i18n/messages/ar.json',
                                       'apps/web/src/i18n/messages/en.json',
                                       'apps/web/src/i18n/request.ts'],
                            'fs': ['FS-WEB-01'],
                            'human_contribution': [ '**🧪 Manual QA**: Switch language selector between FR, AR (verify '
                                                    'RTL layout), and EN in browser.'],
                            'id': 'T-WEB-05',
                            'implementation_steps': [ '1. Author comprehensive translation catalogs in `fr.json`, '
                                                      '`ar.json`, `en.json`.',
                                                      '2. Configure next-intl middleware and request configuration.',
                                                      '3. Add language switcher component in header.',
                                                      '4. Author tests verifying catalog completeness without missing '
                                                      'keys.'],
                            'modify_scope': ['apps/web/src/i18n/'],
                            'objective_value': 'Implement next-intl localization catalogs for French (primary), Arabic '
                                               "(with RTL `dir='rtl'` layout), and English.",
                            'read': ['docs/20_design/20_DESIGN_SYSTEM.md', 'docs/00_product/03_MVP_SCOPE.md'],
                            'security_invariants': [ "🔒 **RTL Layout**: Arabic locale sets `dir='rtl'` on HTML root "
                                                     'and flips navigation/drawer alignments.'],
                            'size': 'M',
                            'technical_contract': [ 'Locales: `fr` (French - default), `ar` (Arabic with RTL '
                                                    'direction), `en` (English).',
                                                    'Zero hardcoded UI strings; all labels sourced from '
                                                    '`useTranslations()`.'],
                            'title': 'Internationalization Catalogs & RTL layout (Arabic/French/English)',
                            'wave': 'W8',
                            'why': 'Provide Tunisian merchants with a localized UI in their preferred language.'},
                  'letter': '',
                  'read': [ 'docs/20_design/20_DESIGN_SYSTEM/02-layout-motion-a11y.md',
                            'docs/00_product/03_MVP_SCOPE/01-in-scope-boundaries.md'],
                  'title': 'Internationalization Catalogs & RTL layout (Arabic/French/English)'}],
    'parent_done': '**Locale Switch**: Switching language changes all UI text seamlessly.',
    'size': 'M',
    'title': 'Internationalization Catalogs & RTL layout (Arabic/French/English)',
    'wave': 'W8'},
  { 'depends': ['T-WEB-03', 'T-WEB-04'],
    'fs': ['FS-WEB-01'],
    'gold': { 'acceptance_test_scenarios': [ '[ ] **E2E Success**: Playwright test completes full '
                                             'registration-to-order journey with 0 errors.'],
              'cmd': 'pnpm --filter web exec playwright test',
              'depends': ['T-WEB-03', 'T-WEB-04'],
              'dont_modify_scope': ['apps/api/'],
              'expected_deliverables': 'Playwright E2E configuration and test suite in `apps/web/e2e`.',
              'files': ['apps/web/playwright.config.ts', 'apps/web/e2e/core-journey.spec.ts'],
              'fs': ['FS-WEB-01'],
              'human_contribution': [ '**🧪 Manual QA**: Run `pnpm --filter web exec playwright test --headed` and '
                                      'observe automated browser execution.'],
              'id': 'T-WEB-06',
              'implementation_steps': [ '1. Configure Playwright configuration with web server hooks.',
                                        '2. Author `core-journey.spec.ts` testing the complete user journey.',
                                        '3. Run test in CI headless mode.'],
              'modify_scope': ['apps/web/e2e/', 'apps/web/playwright.config.ts'],
              'objective_value': 'Implement Playwright E2E test executing complete merchant lifecycle: Signup -> '
                                 'Onboarding -> Inbox -> AI Draft Approval -> Order Confirmation.',
              'read': ['docs/30_execution/32_FEATURE_SPECIFICATIONS.md', 'docs/00_product/03_MVP_SCOPE.md'],
              'security_invariants': ['🔒 **Clean Fixtures**: Tests run against isolated seed database fixtures.'],
              'size': 'M',
              'technical_contract': [ 'E2E Scenario: Merchant registers -> completes onboarding -> receives simulated '
                                      'message -> reviews and approves AI draft -> confirms draft order.'],
              'title': 'Playwright end-to-end core user journey test suite',
              'wave': 'W8',
              'why': 'Automated regression verification of the primary user journey across the frontend and backend '
                     'stack.'},
    'id': 'T-WEB-06',
    'leaves': [ { 'cmd': 'pnpm --filter web exec playwright test',
                  'do': [ '1. Configure Playwright configuration with web server hooks.',
                          '2. Author `core-journey.spec.ts` testing the complete user journey.',
                          '3. Run test in CI headless mode.'],
                  'done': '**E2E Success**: Playwright test completes full registration-to-order journey with 0 '
                          'errors.',
                  'dont': [],
                  'files': ['apps/web/playwright.config.ts', 'apps/web/e2e/core-journey.spec.ts'],
                  'gold': { 'acceptance_test_scenarios': [ '[ ] **E2E Success**: Playwright test completes full '
                                                           'registration-to-order journey with 0 errors.'],
                            'cmd': 'pnpm --filter web exec playwright test',
                            'depends': ['T-WEB-03', 'T-WEB-04'],
                            'dont_modify_scope': ['apps/api/'],
                            'expected_deliverables': 'Playwright E2E configuration and test suite in `apps/web/e2e`.',
                            'files': ['apps/web/playwright.config.ts', 'apps/web/e2e/core-journey.spec.ts'],
                            'fs': ['FS-WEB-01'],
                            'human_contribution': [ '**🧪 Manual QA**: Run `pnpm --filter web exec playwright test '
                                                    '--headed` and observe automated browser execution.'],
                            'id': 'T-WEB-06',
                            'implementation_steps': [ '1. Configure Playwright configuration with web server hooks.',
                                                      '2. Author `core-journey.spec.ts` testing the complete user '
                                                      'journey.',
                                                      '3. Run test in CI headless mode.'],
                            'modify_scope': ['apps/web/e2e/', 'apps/web/playwright.config.ts'],
                            'objective_value': 'Implement Playwright E2E test executing complete merchant lifecycle: '
                                               'Signup -> Onboarding -> Inbox -> AI Draft Approval -> Order '
                                               'Confirmation.',
                            'read': [ 'docs/30_execution/32_FEATURE_SPECIFICATIONS.md',
                                      'docs/00_product/03_MVP_SCOPE.md'],
                            'security_invariants': [ '🔒 **Clean Fixtures**: Tests run against isolated seed database '
                                                     'fixtures.'],
                            'size': 'M',
                            'technical_contract': [ 'E2E Scenario: Merchant registers -> completes onboarding -> '
                                                    'receives simulated message -> reviews and approves AI draft -> '
                                                    'confirms draft order.'],
                            'title': 'Playwright end-to-end core user journey test suite',
                            'wave': 'W8',
                            'why': 'Automated regression verification of the primary user journey across the frontend '
                                   'and backend stack.'},
                  'letter': '',
                  'read': [ 'docs/30_execution/32_FEATURE_SPECIFICATIONS.md',
                            'docs/00_product/03_MVP_SCOPE/01-in-scope-boundaries.md',
                            'docs/20_design/22_UX_FLOWS/04-journeys-states-accessibility.md'],
                  'title': 'Playwright end-to-end core user journey test suite'}],
    'parent_done': '**E2E Success**: Playwright test completes full registration-to-order journey with 0 errors.',
    'size': 'M',
    'title': 'Playwright end-to-end core user journey test suite',
    'wave': 'W8'},
  { 'depends': ['T-WEB-02', 'T-CONV-07'],
    'fs': ['FS-WEB-04'],
    'gold': { 'acceptance_test_scenarios': [ '[ ] **Kanban View**: Renders 4 columns with active deal cards and '
                                             'totals.'],
              'cmd': 'pnpm --filter web lint',
              'depends': ['T-WEB-02', 'T-CONV-07'],
              'dont_modify_scope': ['apps/api/'],
              'expected_deliverables': 'Sales pipeline Kanban page and components in `apps/web`.',
              'files': [ 'apps/web/src/app/(dashboard)/pipeline/page.tsx',
                         'apps/web/src/components/pipeline/pipeline-board.tsx',
                         'apps/web/src/components/pipeline/pipeline-column.tsx',
                         'apps/web/src/components/pipeline/pipeline-card.tsx'],
              'fs': ['FS-WEB-04'],
              'human_contribution': ['**🧪 Manual QA**: Navigate to `http://localhost:3000/pipeline` in browser.'],
              'id': 'T-WEB-07',
              'implementation_steps': [ '1. Implement `PipelineBoard` fetching data from `GET /pipeline`.',
                                        '2. Implement `PipelineColumn` and `PipelineCard` components.',
                                        '3. Author component tests.'],
              'modify_scope': ['apps/web/src/app/(dashboard)/pipeline/', 'apps/web/src/components/pipeline/'],
              'objective_value': 'Implement 4-stage visual Kanban board interface for commercial sales pipeline with '
                                 'deal value summaries.',
              'read': ['docs/20_design/22_UX_FLOWS.md', 'docs/20_design/23_UI_COMPONENTS.md'],
              'security_invariants': ['🔒 **Tenancy**: Displays data strictly for active workspace.'],
              'size': 'M',
              'technical_contract': [ 'Columns: New Leads, In Conversation, Pending Confirmation, Closed Won.',
                                      'Clicking card navigates to `/inbox?conversationId=...`.'],
              'title': 'Web Sales Pipeline Kanban Board UI (`/pipeline`)',
              'wave': 'W9',
              'why': 'Give store owners a high-level view of all active conversations and conversion stages.'},
    'id': 'T-WEB-07',
    'leaves': [ { 'cmd': 'pnpm --filter web lint',
                  'do': [ '1. Implement `PipelineBoard` fetching data from `GET /pipeline`.',
                          '2. Implement `PipelineColumn` and `PipelineCard` components.',
                          '3. Author component tests.'],
                  'done': '**Kanban View**: Renders 4 columns with active deal cards and totals.',
                  'dont': [],
                  'files': [ 'apps/web/src/app/(dashboard)/pipeline/page.tsx',
                             'apps/web/src/components/pipeline/pipeline-board.tsx',
                             'apps/web/src/components/pipeline/pipeline-column.tsx',
                             'apps/web/src/components/pipeline/pipeline-card.tsx'],
                  'gold': { 'acceptance_test_scenarios': [ '[ ] **Kanban View**: Renders 4 columns with active deal '
                                                           'cards and totals.'],
                            'cmd': 'pnpm --filter web lint',
                            'depends': ['T-WEB-02', 'T-CONV-07'],
                            'dont_modify_scope': ['apps/api/'],
                            'expected_deliverables': 'Sales pipeline Kanban page and components in `apps/web`.',
                            'files': [ 'apps/web/src/app/(dashboard)/pipeline/page.tsx',
                                       'apps/web/src/components/pipeline/pipeline-board.tsx',
                                       'apps/web/src/components/pipeline/pipeline-column.tsx',
                                       'apps/web/src/components/pipeline/pipeline-card.tsx'],
                            'fs': ['FS-WEB-04'],
                            'human_contribution': [ '**🧪 Manual QA**: Navigate to `http://localhost:3000/pipeline` in '
                                                    'browser.'],
                            'id': 'T-WEB-07',
                            'implementation_steps': [ '1. Implement `PipelineBoard` fetching data from `GET '
                                                      '/pipeline`.',
                                                      '2. Implement `PipelineColumn` and `PipelineCard` components.',
                                                      '3. Author component tests.'],
                            'modify_scope': [ 'apps/web/src/app/(dashboard)/pipeline/',
                                              'apps/web/src/components/pipeline/'],
                            'objective_value': 'Implement 4-stage visual Kanban board interface for commercial sales '
                                               'pipeline with deal value summaries.',
                            'read': ['docs/20_design/22_UX_FLOWS.md', 'docs/20_design/23_UI_COMPONENTS.md'],
                            'security_invariants': ['🔒 **Tenancy**: Displays data strictly for active workspace.'],
                            'size': 'M',
                            'technical_contract': [ 'Columns: New Leads, In Conversation, Pending Confirmation, Closed '
                                                    'Won.',
                                                    'Clicking card navigates to `/inbox?conversationId=...`.'],
                            'title': 'Web Sales Pipeline Kanban Board UI (`/pipeline`)',
                            'wave': 'W9',
                            'why': 'Give store owners a high-level view of all active conversations and conversion '
                                   'stages.'},
                  'letter': '',
                  'read': [ 'docs/20_design/22_UX_FLOWS/03-views-pipeline-catalog-settings.md',
                            'docs/20_design/23_UI_COMPONENTS/04-views-onboarding-governance.md',
                            'docs/10_engineering/13_API_DESIGN/03-pipeline-orders-customers.md'],
                  'title': 'Web Sales Pipeline Kanban Board UI (`/pipeline`)'}],
    'parent_done': '**Kanban View**: Renders 4 columns with active deal cards and totals.',
    'size': 'M',
    'title': 'Web Sales Pipeline Kanban Board UI (`/pipeline`)',
    'wave': 'W9'},
  { 'depends': ['T-WEB-02', 'T-CAT-02'],
    'fs': ['FS-WEB-04'],
    'gold': { 'acceptance_test_scenarios': [ '[ ] **Product CRUD**: Merchant can add, edit, and archive products with '
                                             'variants.'],
              'cmd': 'pnpm --filter web lint',
              'depends': ['T-WEB-02', 'T-CAT-02'],
              'dont_modify_scope': ['apps/api/'],
              'expected_deliverables': 'Products management page and components in `apps/web`.',
              'files': [ 'apps/web/src/app/(dashboard)/products/page.tsx',
                         'apps/web/src/components/products/product-list.tsx',
                         'apps/web/src/components/products/product-form-dialog.tsx',
                         'apps/web/src/components/products/variant-editor.tsx',
                         'apps/web/src/components/products/image-uploader.tsx'],
              'fs': ['FS-WEB-04'],
              'human_contribution': [ '**🧪 Manual QA**: Navigate to `http://localhost:3000/products`; add new product '
                                      'with variants and photo.'],
              'id': 'T-WEB-08',
              'implementation_steps': [ '1. Implement `ProductList` table with search and category filters.',
                                        '2. Implement `ProductFormDialog` and `VariantEditor`.',
                                        '3. Implement S3 direct photo upload component.',
                                        '4. Author component tests.'],
              'modify_scope': ['apps/web/src/app/(dashboard)/products/', 'apps/web/src/components/products/'],
              'objective_value': 'Implement Products and Catalog management interface with variant editor, stock '
                                 'badges, image uploads, and CSV import modal.',
              'read': ['docs/20_design/22_UX_FLOWS.md', 'docs/20_design/23_UI_COMPONENTS.md'],
              'security_invariants': [ '🔒 **RBAC Disabled Controls**: Edit and delete controls disabled for Employee '
                                       'role.'],
              'size': 'L',
              'technical_contract': [ 'Product Table: Title, Category, Variant Count, Physical Stock, Available Stock, '
                                      'Status Badge, Actions.',
                                      'Product Dialog: Multi-variant editor (SKU, Price, Stock, Options) + Photo '
                                      'upload.'],
              'title': 'Web Products & Catalog Management UI (`/products`)',
              'wave': 'W9',
              'why': 'Allow merchants to add products, adjust stock levels, edit prices, and upload photos directly in '
                     'the web app.'},
    'id': 'T-WEB-08',
    'leaves': [ { 'cmd': 'pnpm --filter web lint',
                  'do': [ '1. Implement `ProductList` table with search and category filters.',
                          '2. Implement `ProductFormDialog` and `VariantEditor`.',
                          '3. Implement S3 direct photo upload component.',
                          '4. Author component tests.'],
                  'done': '**Product CRUD**: Merchant can add, edit, and archive products with variants.',
                  'dont': [],
                  'files': [ 'apps/web/src/app/(dashboard)/products/page.tsx',
                             'apps/web/src/components/products/product-list.tsx',
                             'apps/web/src/components/products/product-form-dialog.tsx',
                             'apps/web/src/components/products/variant-editor.tsx',
                             'apps/web/src/components/products/image-uploader.tsx'],
                  'gold': { 'acceptance_test_scenarios': [ '[ ] **Product CRUD**: Merchant can add, edit, and archive '
                                                           'products with variants.'],
                            'cmd': 'pnpm --filter web lint',
                            'depends': ['T-WEB-02', 'T-CAT-02'],
                            'dont_modify_scope': ['apps/api/'],
                            'expected_deliverables': 'Products management page and components in `apps/web`.',
                            'files': [ 'apps/web/src/app/(dashboard)/products/page.tsx',
                                       'apps/web/src/components/products/product-list.tsx',
                                       'apps/web/src/components/products/product-form-dialog.tsx',
                                       'apps/web/src/components/products/variant-editor.tsx',
                                       'apps/web/src/components/products/image-uploader.tsx'],
                            'fs': ['FS-WEB-04'],
                            'human_contribution': [ '**🧪 Manual QA**: Navigate to `http://localhost:3000/products`; '
                                                    'add new product with variants and photo.'],
                            'id': 'T-WEB-08',
                            'implementation_steps': [ '1. Implement `ProductList` table with search and category '
                                                      'filters.',
                                                      '2. Implement `ProductFormDialog` and `VariantEditor`.',
                                                      '3. Implement S3 direct photo upload component.',
                                                      '4. Author component tests.'],
                            'modify_scope': [ 'apps/web/src/app/(dashboard)/products/',
                                              'apps/web/src/components/products/'],
                            'objective_value': 'Implement Products and Catalog management interface with variant '
                                               'editor, stock badges, image uploads, and CSV import modal.',
                            'read': ['docs/20_design/22_UX_FLOWS.md', 'docs/20_design/23_UI_COMPONENTS.md'],
                            'security_invariants': [ '🔒 **RBAC Disabled Controls**: Edit and delete controls disabled '
                                                     'for Employee role.'],
                            'size': 'L',
                            'technical_contract': [ 'Product Table: Title, Category, Variant Count, Physical Stock, '
                                                    'Available Stock, Status Badge, Actions.',
                                                    'Product Dialog: Multi-variant editor (SKU, Price, Stock, Options) '
                                                    '+ Photo upload.'],
                            'title': 'Web Products & Catalog Management UI (`/products`)',
                            'wave': 'W9',
                            'why': 'Allow merchants to add products, adjust stock levels, edit prices, and upload '
                                   'photos directly in the web app.'},
                  'letter': '',
                  'read': [ 'docs/20_design/22_UX_FLOWS/03-views-pipeline-catalog-settings.md',
                            'docs/20_design/23_UI_COMPONENTS/04-views-onboarding-governance.md',
                            'docs/10_engineering/13_API_DESIGN/04-integrations-ai-admin-catalog.md'],
                  'title': 'Web Products & Catalog Management UI (`/products`)'}],
    'parent_done': '**Product CRUD**: Merchant can add, edit, and archive products with variants.',
    'size': 'L',
    'title': 'Web Products & Catalog Management UI (`/products`)',
    'wave': 'W9'},
  { 'depends': ['T-WEB-02', 'T-ANL-02'],
    'fs': ['FS-WEB-04'],
    'gold': { 'acceptance_test_scenarios': ['[ ] **Analytics View**: Renders KPI cards and trend charts accurately.'],
              'cmd': 'pnpm --filter web lint',
              'depends': ['T-WEB-02', 'T-ANL-02'],
              'dont_modify_scope': ['apps/api/'],
              'expected_deliverables': 'Analytics dashboard page and chart components in `apps/web`.',
              'files': [ 'apps/web/src/app/(dashboard)/analytics/page.tsx',
                         'apps/web/src/components/analytics/analytics-kpi-cards.tsx',
                         'apps/web/src/components/analytics/revenue-chart.tsx',
                         'apps/web/src/components/analytics/ai-resolution-chart.tsx'],
              'fs': ['FS-WEB-04'],
              'human_contribution': [ '**🧪 Manual QA**: Navigate to `http://localhost:3000/analytics`; test period '
                                      'filters (7d, 30d, 90d).'],
              'id': 'T-WEB-09',
              'implementation_steps': [ '1. Implement KPI cards component with metric deltas.',
                                        '2. Implement timeseries area/bar charts using Recharts.',
                                        '3. Author component tests.'],
              'modify_scope': ['apps/web/src/app/(dashboard)/analytics/', 'apps/web/src/components/analytics/'],
              'objective_value': 'Implement merchant Analytics dashboard with 4 KPI summary cards, GMV revenue chart, '
                                 'and AI resolution percentage chart.',
              'read': ['docs/20_design/22_UX_FLOWS.md', 'docs/20_design/23_UI_COMPONENTS.md'],
              'security_invariants': ['🛡️ **RBAC Permission**: Requires `analytics.read`.'],
              'size': 'M',
              'technical_contract': [ 'KPI Cards: GMV Revenue, Total Orders, Conversations, AI Resolution Rate.',
                                      'Period Selector: 7 days, 30 days, 90 days with trend indicators.'],
              'title': 'Web Analytics Dashboard UI (`/analytics`)',
              'wave': 'W9',
              'why': 'Provide merchants with visual insights into store sales performance and AI operational '
                     'efficiency.'},
    'id': 'T-WEB-09',
    'leaves': [ { 'cmd': 'pnpm --filter web lint',
                  'do': [ '1. Implement KPI cards component with metric deltas.',
                          '2. Implement timeseries area/bar charts using Recharts.',
                          '3. Author component tests.'],
                  'done': '**Analytics View**: Renders KPI cards and trend charts accurately.',
                  'dont': [],
                  'files': [ 'apps/web/src/app/(dashboard)/analytics/page.tsx',
                             'apps/web/src/components/analytics/analytics-kpi-cards.tsx',
                             'apps/web/src/components/analytics/revenue-chart.tsx',
                             'apps/web/src/components/analytics/ai-resolution-chart.tsx'],
                  'gold': { 'acceptance_test_scenarios': [ '[ ] **Analytics View**: Renders KPI cards and trend charts '
                                                           'accurately.'],
                            'cmd': 'pnpm --filter web lint',
                            'depends': ['T-WEB-02', 'T-ANL-02'],
                            'dont_modify_scope': ['apps/api/'],
                            'expected_deliverables': 'Analytics dashboard page and chart components in `apps/web`.',
                            'files': [ 'apps/web/src/app/(dashboard)/analytics/page.tsx',
                                       'apps/web/src/components/analytics/analytics-kpi-cards.tsx',
                                       'apps/web/src/components/analytics/revenue-chart.tsx',
                                       'apps/web/src/components/analytics/ai-resolution-chart.tsx'],
                            'fs': ['FS-WEB-04'],
                            'human_contribution': [ '**🧪 Manual QA**: Navigate to `http://localhost:3000/analytics`; '
                                                    'test period filters (7d, 30d, 90d).'],
                            'id': 'T-WEB-09',
                            'implementation_steps': [ '1. Implement KPI cards component with metric deltas.',
                                                      '2. Implement timeseries area/bar charts using Recharts.',
                                                      '3. Author component tests.'],
                            'modify_scope': [ 'apps/web/src/app/(dashboard)/analytics/',
                                              'apps/web/src/components/analytics/'],
                            'objective_value': 'Implement merchant Analytics dashboard with 4 KPI summary cards, GMV '
                                               'revenue chart, and AI resolution percentage chart.',
                            'read': ['docs/20_design/22_UX_FLOWS.md', 'docs/20_design/23_UI_COMPONENTS.md'],
                            'security_invariants': ['🛡️ **RBAC Permission**: Requires `analytics.read`.'],
                            'size': 'M',
                            'technical_contract': [ 'KPI Cards: GMV Revenue, Total Orders, Conversations, AI '
                                                    'Resolution Rate.',
                                                    'Period Selector: 7 days, 30 days, 90 days with trend indicators.'],
                            'title': 'Web Analytics Dashboard UI (`/analytics`)',
                            'wave': 'W9',
                            'why': 'Provide merchants with visual insights into store sales performance and AI '
                                   'operational efficiency.'},
                  'letter': '',
                  'read': [ 'docs/20_design/22_UX_FLOWS/03-views-pipeline-catalog-settings.md',
                            'docs/20_design/23_UI_COMPONENTS/04-views-onboarding-governance.md',
                            'docs/10_engineering/13_API_DESIGN/05-realtime-platform-governance.md'],
                  'title': 'Web Analytics Dashboard UI (`/analytics`)'}],
    'parent_done': '**Analytics View**: Renders KPI cards and trend charts accurately.',
    'size': 'M',
    'title': 'Web Analytics Dashboard UI (`/analytics`)',
    'wave': 'W9'},
  { 'depends': ['T-WEB-02', 'T-KNOW-01', 'T-BIZ-03', 'T-BILL-03', 'T-AI-10'],
    'fs': ['FS-WEB-04'],
    'gold': { 'acceptance_test_scenarios': [ '[ ] **Settings Tabs**: Owner can configure personality, channels, rules, '
                                             'team, and billing.'],
              'cmd': 'pnpm --filter web lint',
              'depends': ['T-WEB-02', 'T-KNOW-01', 'T-BIZ-03', 'T-BILL-03', 'T-AI-10'],
              'dont_modify_scope': ['apps/api/'],
              'expected_deliverables': 'Settings page and tab components in `apps/web`.',
              'files': [ 'apps/web/src/app/(dashboard)/settings/page.tsx',
                         'apps/web/src/components/settings/settings-personality-tab.tsx',
                         'apps/web/src/components/settings/settings-channels-tab.tsx',
                         'apps/web/src/components/settings/settings-rules-tab.tsx',
                         'apps/web/src/components/settings/settings-team-tab.tsx',
                         'apps/web/src/components/settings/settings-billing-tab.tsx'],
              'fs': ['FS-WEB-04'],
              'human_contribution': [ '**🧪 Manual QA**: Navigate to `http://localhost:3000/settings`; test updating '
                                      'personality and inviting teammate.'],
              'id': 'T-WEB-10',
              'implementation_steps': [ '1. Implement `SettingsTabs` wrapper with URL hash syncing.',
                                        '2. Implement Tabs 1 through 5 components.',
                                        '3. Author component tests covering tab rendering and form submissions.'],
              'modify_scope': ['apps/web/src/app/(dashboard)/settings/', 'apps/web/src/components/settings/'],
              'objective_value': 'Implement complete Settings interface with 5 dedicated configuration tabs (Agent '
                                 'Personality, Channels, Commercial Rules, Team Members, and Billing/Quotas).',
              'read': ['docs/20_design/22_UX_FLOWS.md', 'docs/20_design/23_UI_COMPONENTS.md'],
              'security_invariants': ['🛡️ **Billing Tab**: Visible strictly to `OWNER` role.'],
              'size': 'L',
              'technical_contract': [ 'Tab 1 (Personality): Agent name, tone slider, language, reply mode selector.',
                                      'Tab 2 (Channels): Connected accounts list + Meta connect button.',
                                      'Tab 3 (Rules): Delivery zones, return policy, payment rules.',
                                      'Tab 4 (Team): Member list + Invite modal with role selector.',
                                      'Tab 5 (Billing): Current plan, quota usage bars, upgrade modal (Owner only).'],
              'title': 'Web Settings Tabs UI (Personality, Channels, Rules, Team, Billing)',
              'wave': 'W9',
              'why': 'Allow store owners and managers to manage their AI configuration, channels, store policies, team '
                     'permissions, and billing.'},
    'id': 'T-WEB-10',
    'leaves': [ { 'cmd': 'pnpm --filter web lint',
                  'do': [ '1. Implement `SettingsTabs` wrapper with URL hash syncing.',
                          '2. Implement Tabs 1 through 5 components.',
                          '3. Author component tests covering tab rendering and form submissions.'],
                  'done': '**Settings Tabs**: Owner can configure personality, channels, rules, team, and billing.',
                  'dont': [],
                  'files': [ 'apps/web/src/app/(dashboard)/settings/page.tsx',
                             'apps/web/src/components/settings/settings-personality-tab.tsx',
                             'apps/web/src/components/settings/settings-channels-tab.tsx',
                             'apps/web/src/components/settings/settings-rules-tab.tsx',
                             'apps/web/src/components/settings/settings-team-tab.tsx',
                             'apps/web/src/components/settings/settings-billing-tab.tsx'],
                  'gold': { 'acceptance_test_scenarios': [ '[ ] **Settings Tabs**: Owner can configure personality, '
                                                           'channels, rules, team, and billing.'],
                            'cmd': 'pnpm --filter web lint',
                            'depends': ['T-WEB-02', 'T-KNOW-01', 'T-BIZ-03', 'T-BILL-03', 'T-AI-10'],
                            'dont_modify_scope': ['apps/api/'],
                            'expected_deliverables': 'Settings page and tab components in `apps/web`.',
                            'files': [ 'apps/web/src/app/(dashboard)/settings/page.tsx',
                                       'apps/web/src/components/settings/settings-personality-tab.tsx',
                                       'apps/web/src/components/settings/settings-channels-tab.tsx',
                                       'apps/web/src/components/settings/settings-rules-tab.tsx',
                                       'apps/web/src/components/settings/settings-team-tab.tsx',
                                       'apps/web/src/components/settings/settings-billing-tab.tsx'],
                            'fs': ['FS-WEB-04'],
                            'human_contribution': [ '**🧪 Manual QA**: Navigate to `http://localhost:3000/settings`; '
                                                    'test updating personality and inviting teammate.'],
                            'id': 'T-WEB-10',
                            'implementation_steps': [ '1. Implement `SettingsTabs` wrapper with URL hash syncing.',
                                                      '2. Implement Tabs 1 through 5 components.',
                                                      '3. Author component tests covering tab rendering and form '
                                                      'submissions.'],
                            'modify_scope': [ 'apps/web/src/app/(dashboard)/settings/',
                                              'apps/web/src/components/settings/'],
                            'objective_value': 'Implement complete Settings interface with 5 dedicated configuration '
                                               'tabs (Agent Personality, Channels, Commercial Rules, Team Members, and '
                                               'Billing/Quotas).',
                            'read': ['docs/20_design/22_UX_FLOWS.md', 'docs/20_design/23_UI_COMPONENTS.md'],
                            'security_invariants': ['🛡️ **Billing Tab**: Visible strictly to `OWNER` role.'],
                            'size': 'L',
                            'technical_contract': [ 'Tab 1 (Personality): Agent name, tone slider, language, reply '
                                                    'mode selector.',
                                                    'Tab 2 (Channels): Connected accounts list + Meta connect button.',
                                                    'Tab 3 (Rules): Delivery zones, return policy, payment rules.',
                                                    'Tab 4 (Team): Member list + Invite modal with role selector.',
                                                    'Tab 5 (Billing): Current plan, quota usage bars, upgrade modal '
                                                    '(Owner only).'],
                            'title': 'Web Settings Tabs UI (Personality, Channels, Rules, Team, Billing)',
                            'wave': 'W9',
                            'why': 'Allow store owners and managers to manage their AI configuration, channels, store '
                                   'policies, team permissions, and billing.'},
                  'letter': '',
                  'read': [ 'docs/20_design/22_UX_FLOWS/03-views-pipeline-catalog-settings.md',
                            'docs/20_design/23_UI_COMPONENTS/04-views-onboarding-governance.md',
                            'docs/10_engineering/13_API_DESIGN/04-integrations-ai-admin-catalog.md'],
                  'title': 'Web Settings Tabs UI (Personality, Channels, Rules, Team, Billing)'}],
    'parent_done': '**Settings Tabs**: Owner can configure personality, channels, rules, team, and billing.',
    'size': 'L',
    'title': 'Web Settings Tabs UI (Personality, Channels, Rules, Team, Billing)',
    'wave': 'W9'},
  { 'depends': ['T-WEB-10'],
    'fs': ['FS-WEB-04'],
    'gold': { 'acceptance_test_scenarios': [ '[ ] **Landing Page**: Renders hero, chat demo, bento grid, and working auth CTA links.'],
              'cmd': 'pnpm --filter web lint && pnpm --filter web check-types',
              'depends': ['T-WEB-10'],
              'dont_modify_scope': ['apps/api/', 'apps/worker/'],
              'expected_deliverables': 'Public landing page and marketing components in `apps/web`.',
              'files': [ 'apps/web/src/app/page.tsx',
                         'apps/web/src/components/marketing/marketing-header.tsx',
                         'apps/web/src/components/marketing/landing-hero.tsx',
                         'apps/web/src/components/marketing/interactive-chat-demo.tsx',
                         'apps/web/src/components/marketing/bento-features.tsx',
                         'apps/web/src/components/marketing/marketing-footer.tsx'],
              'fs': ['FS-AUTH-02'],
              'human_contribution': [ '**🧪 Manual QA**: Visit `http://localhost:3000/` and verify layout, mobile responsiveness, and link destinations.'],
              'id': 'T-WEB-11',
              'implementation_steps': [ '1. Implement `MarketingHeader` with brand mark and auth links.',
                                        '2. Implement `LandingHero` with brand tokens.',
                                        '3. Implement `InteractiveChatDemo` with simulated Derja conversation.',
                                        '4. Implement `BentoFeatures` and `MarketingFooter`.',
                                        '5. Wire root page `apps/web/src/app/page.tsx`.'],
              'modify_scope': [ 'apps/web/src/app/page.tsx',
                                'apps/web/src/components/marketing/'],
              'objective_value': 'Implement high-conversion public landing page communicating product positioning for Tunisian/MENA social commerce.',
              'read': [ 'docs/20_design/21_BRAND_STRATEGY/01-positioning-personality-voice.md',
                        'docs/20_design/20_DESIGN_SYSTEM/01-tokens-color-typography.md',
                        'docs/20_design/22_UX_FLOWS/01-shell-onboarding-activation.md',
                        'docs/20_design/23_UI_COMPONENTS/01-composition-file-map.md',
                        'docs/30_execution/32_FEATURE_SPECIFICATIONS.md'],
              'security_invariants': ['🔒 **Zero Data Leakage**: No sensitive merchant data leaked on public page.'],
              'size': 'M',
              'technical_contract': [ 'Root route `/` renders marketing page when unauthenticated, or links to `/inbox` if session active.',
                                      'Primary CTAs link to `/register` and `/login`.'],
              'title': 'Public Marketing Landing Page UI (`/`)',
              'wave': 'W9',
              'why': 'Provide an authoritative public web presence to convert inbound traffic and satisfy Meta app review compliance.'},
    'id': 'T-WEB-11',
    'leaves': [ { 'cmd': 'pnpm --filter web lint && pnpm --filter web check-types',
                  'do': [ '1. Implement responsive landing page at `apps/web/src/app/page.tsx` replacing boilerplate ASCII art.',
                          '2. Build `MarketingHeader` with brand tokens and auth CTAs (`/register`, `/login`).',
                          '3. Build `LandingHero` with brand tokens, value proposition, badges, and auth CTAs (`/register`, `/login`).',
                          '4. Build `InteractiveChatDemo` demonstrating Tunisian Derja and French conversation with stock qualification.',
                          '5. Build `BentoFeatures` highlighting the four core pillars: local linguistic fluency, inventory grounding, Silence Guarantee, and transparent ROI.',
                          '6. Build `MarketingFooter` with legal/privacy links required for Meta review.'],
                  'done': '**Landing Page Ready**: Responsive marketing page at `/` renders hero, Derja demo, bento grid, and auth CTAs.',
                  'dont': ['Do not import from apps/api/src/.'],
                  'files': [ 'apps/web/src/app/page.tsx',
                             'apps/web/src/components/marketing/marketing-header.tsx',
                             'apps/web/src/components/marketing/landing-hero.tsx',
                             'apps/web/src/components/marketing/interactive-chat-demo.tsx',
                             'apps/web/src/components/marketing/bento-features.tsx',
                             'apps/web/src/components/marketing/marketing-footer.tsx'],
                  'gold': { 'acceptance_test_scenarios': [ '[ ] **Landing Page**: Renders hero, chat demo, bento grid, and working auth CTA links.'],
                            'cmd': 'pnpm --filter web lint && pnpm --filter web check-types',
                            'depends': ['T-WEB-10'],
                            'dont_modify_scope': ['apps/api/', 'apps/worker/'],
                            'expected_deliverables': 'Public landing page and marketing components in `apps/web`.',
                            'files': [ 'apps/web/src/app/page.tsx',
                                       'apps/web/src/components/marketing/marketing-header.tsx',
                                       'apps/web/src/components/marketing/landing-hero.tsx',
                                       'apps/web/src/components/marketing/interactive-chat-demo.tsx',
                                       'apps/web/src/components/marketing/bento-features.tsx',
                                       'apps/web/src/components/marketing/marketing-footer.tsx'],
                            'fs': ['FS-AUTH-02'],
                            'human_contribution': [ '**🧪 Manual QA**: Visit `http://localhost:3000/` and verify layout, mobile responsiveness, and link destinations.'],
                            'id': 'T-WEB-11',
                            'implementation_steps': [ '1. Implement `MarketingHeader` with brand mark and auth links.',
                                                      '2. Implement `LandingHero` with brand tokens.',
                                                      '3. Implement `InteractiveChatDemo` with simulated Derja conversation.',
                                                      '4. Implement `BentoFeatures` and `MarketingFooter`.',
                                                      '5. Wire root page `apps/web/src/app/page.tsx`.'],
                            'modify_scope': [ 'apps/web/src/app/page.tsx',
                                              'apps/web/src/components/marketing/'],
                            'objective_value': 'Implement high-conversion public landing page communicating product positioning for Tunisian/MENA social commerce.',
                            'read': [ 'docs/20_design/21_BRAND_STRATEGY/01-positioning-personality-voice.md',
                                      'docs/20_design/20_DESIGN_SYSTEM/01-tokens-color-typography.md',
                                      'docs/20_design/22_UX_FLOWS/01-shell-onboarding-activation.md',
                                      'docs/20_design/23_UI_COMPONENTS/01-composition-file-map.md',
                                      'docs/30_execution/32_FEATURE_SPECIFICATIONS.md'],
                            'security_invariants': ['🔒 **Zero Data Leakage**: No sensitive merchant data leaked on public page.'],
                            'size': 'M',
                            'technical_contract': [ 'Root route `/` renders marketing page when unauthenticated, or links to `/inbox` if session active.',
                                                    'Primary CTAs link to `/register` and `/login`.'],
                            'title': 'Public Marketing Landing Page UI (`/`)',
                            'wave': 'W9',
                            'why': 'Provide an authoritative public web presence to convert inbound traffic and satisfy Meta app review compliance.'},
                  'letter': '',
                  'read': [ 'docs/20_design/21_BRAND_STRATEGY/01-positioning-personality-voice.md',
                            'docs/20_design/20_DESIGN_SYSTEM/01-tokens-color-typography.md',
                            'docs/20_design/22_UX_FLOWS/01-shell-onboarding-activation.md',
                            'docs/20_design/23_UI_COMPONENTS/01-composition-file-map.md',
                            'docs/30_execution/32_FEATURE_SPECIFICATIONS.md'],
                  'title': 'Public Marketing Landing Page UI (`/`)'}],
    'parent_done': '**Landing Page Ready**: Responsive marketing page at `/` renders hero, Derja demo, bento grid, and auth CTAs.',
    'size': 'M',
    'title': 'Public Marketing Landing Page UI (`/`)',
    'wave': 'W9'},
  { 'depends': ['T-BOOT-04'],
    'fs': ['FS-OPS-01'],
    'gold': { 'acceptance_test_scenarios': [ '[ ] **Terraform Validation**: `terraform validate` exits code 0 with '
                                             'valid syntax.'],
              'cmd': 'terraform -chdir=infra/terraform validate',
              'depends': ['T-BOOT-04'],
              'dont_modify_scope': ['apps/'],
              'expected_deliverables': 'Validated Terraform infrastructure configuration in `infra/terraform`.',
              'files': [ 'infra/terraform/main.tf',
                         'infra/terraform/variables.tf',
                         'infra/terraform/ecs.tf',
                         'infra/terraform/rds.tf',
                         'infra/terraform/redis.tf',
                         'infra/terraform/s3.tf',
                         'infra/terraform/alb.tf'],
              'fs': ['FS-OPS-01'],
              'human_contribution': [ '**🔑 AWS Credentials**: Run `aws configure` with deployment credentials.',
                                      '**🌐 Setup**: Run `terraform -chdir=infra/terraform init` and validate.',
                                      '**👁️ Review & Sign-off**: Verify no NAT Gateway is created (maintains cost '
                                      'constraint).'],
              'id': 'T-OPS-01',
              'implementation_steps': [ '1. Author Terraform VPC and subnet definitions.',
                                        '2. Author RDS Postgres, ElastiCache Redis, and S3 modules.',
                                        '3. Author ECS cluster, task definitions, and ALB routing rules.',
                                        '4. Validate configuration with `terraform validate`.'],
              'modify_scope': ['infra/terraform/'],
              'objective_value': 'Author complete production Terraform infrastructure definition provisioning 3 ECS '
                                 'Fargate services (API, Worker, Web), RDS Postgres 16 with pgvector, ElastiCache '
                                 'Redis, S3 bucket, and Application Load Balancer without NAT Gateway costs.',
              'read': ['docs/10_engineering/18_DEPLOYMENT.md', 'docs/10_engineering/14_SYSTEM_DESIGN.md'],
              'security_invariants': [ '🔒 **Security Groups**: RDS and Redis only accept ingress from ECS security '
                                       'group.',
                                       '🛡️ **Secrets**: Sensitive environment variables sourced from AWS Secrets '
                                       'Manager.'],
              'size': 'XL',
              'technical_contract': [ 'ECS Services: `api` (port 3001), `worker` (background BullMQ), `web` (Next.js '
                                      'port 3000).',
                                      'RDS: PostgreSQL 16.x with `pgvector` extension enabled.',
                                      'Redis: ElastiCache 7.x cluster mode disabled.',
                                      'Cost Optimization: Dual public subnets for Fargate with public IP assignment '
                                      '(avoids $32/mo NAT Gateway).'],
              'title': 'Production Terraform infrastructure (ECS Fargate ×3, RDS Postgres 16, Redis, S3, ALB)',
              'wave': 'W10',
              'why': 'Provide automated, reproducible, cost-optimized AWS production infrastructure per '
                     '`18_DEPLOYMENT_INFRASTRUCTURE.md`.'},
    'id': 'T-OPS-01',
    'leaves': [ { 'cmd': 'terraform -chdir=infra/terraform validate',
                  'do': [ '1. Author Terraform VPC and subnet definitions.',
                          '2. Author RDS Postgres, ElastiCache Redis, and S3 modules.',
                          '3. Author ECS cluster, task definitions, and ALB routing rules.',
                          '4. Validate configuration with `terraform validate`.'],
                  'done': '**Terraform Validation**: `terraform validate` exits code 0 with valid syntax.',
                  'dont': [],
                  'files': [ 'infra/terraform/main.tf',
                             'infra/terraform/variables.tf',
                             'infra/terraform/ecs.tf',
                             'infra/terraform/rds.tf',
                             'infra/terraform/redis.tf',
                             'infra/terraform/s3.tf',
                             'infra/terraform/alb.tf'],
                  'gold': { 'acceptance_test_scenarios': [ '[ ] **Terraform Validation**: `terraform validate` exits '
                                                           'code 0 with valid syntax.'],
                            'cmd': 'terraform -chdir=infra/terraform validate',
                            'depends': ['T-BOOT-04'],
                            'dont_modify_scope': ['apps/'],
                            'expected_deliverables': 'Validated Terraform infrastructure configuration in '
                                                     '`infra/terraform`.',
                            'files': [ 'infra/terraform/main.tf',
                                       'infra/terraform/variables.tf',
                                       'infra/terraform/ecs.tf',
                                       'infra/terraform/rds.tf',
                                       'infra/terraform/redis.tf',
                                       'infra/terraform/s3.tf',
                                       'infra/terraform/alb.tf'],
                            'fs': ['FS-OPS-01'],
                            'human_contribution': [ '**🔑 AWS Credentials**: Run `aws configure` with deployment '
                                                    'credentials.',
                                                    '**🌐 Setup**: Run `terraform -chdir=infra/terraform init` and '
                                                    'validate.',
                                                    '**👁️ Review & Sign-off**: Verify no NAT Gateway is created '
                                                    '(maintains cost constraint).'],
                            'id': 'T-OPS-01',
                            'implementation_steps': [ '1. Author Terraform VPC and subnet definitions.',
                                                      '2. Author RDS Postgres, ElastiCache Redis, and S3 modules.',
                                                      '3. Author ECS cluster, task definitions, and ALB routing rules.',
                                                      '4. Validate configuration with `terraform validate`.'],
                            'modify_scope': ['infra/terraform/'],
                            'objective_value': 'Author complete production Terraform infrastructure definition '
                                               'provisioning 3 ECS Fargate services (API, Worker, Web), RDS Postgres '
                                               '16 with pgvector, ElastiCache Redis, S3 bucket, and Application Load '
                                               'Balancer without NAT Gateway costs.',
                            'read': ['docs/10_engineering/18_DEPLOYMENT.md', 'docs/10_engineering/14_SYSTEM_DESIGN.md'],
                            'security_invariants': [ '🔒 **Security Groups**: RDS and Redis only accept ingress from '
                                                     'ECS security group.',
                                                     '🛡️ **Secrets**: Sensitive environment variables sourced from AWS '
                                                     'Secrets Manager.'],
                            'size': 'XL',
                            'technical_contract': [ 'ECS Services: `api` (port 3001), `worker` (background BullMQ), '
                                                    '`web` (Next.js port 3000).',
                                                    'RDS: PostgreSQL 16.x with `pgvector` extension enabled.',
                                                    'Redis: ElastiCache 7.x cluster mode disabled.',
                                                    'Cost Optimization: Dual public subnets for Fargate with public IP '
                                                    'assignment (avoids $32/mo NAT Gateway).'],
                            'title': 'Production Terraform infrastructure (ECS Fargate ×3, RDS Postgres 16, Redis, S3, '
                                     'ALB)',
                            'wave': 'W10',
                            'why': 'Provide automated, reproducible, cost-optimized AWS production infrastructure per '
                                   '`18_DEPLOYMENT_INFRASTRUCTURE.md`.'},
                  'letter': '',
                  'read': [ 'docs/10_engineering/18_DEPLOYMENT/01-infrastructure-topology-ecs.md',
                            'docs/10_engineering/14_SYSTEM_DESIGN/02-locks-jobs-events-scoring.md'],
                  'title': 'Production Terraform infrastructure (ECS Fargate ×3, RDS Postgres 16, Redis, S3, ALB)'}],
    'parent_done': '**Terraform Validation**: `terraform validate` exits code 0 with valid syntax.',
    'size': 'XL',
    'title': 'Production Terraform infrastructure (ECS Fargate ×3, RDS Postgres 16, Redis, S3, ALB)',
    'wave': 'W10'},
  { 'depends': ['T-OPS-01', 'T-BOOT-05'],
    'fs': ['FS-OPS-01'],
    'gold': { 'acceptance_test_scenarios': [ '[ ] **Workflow Syntax**: GitHub Actions YAML parses and validates '
                                             'correctly.'],
              'cmd': 'pnpm check:full',
              'depends': ['T-OPS-01', 'T-BOOT-05'],
              'dont_modify_scope': ['apps/'],
              'expected_deliverables': 'GitHub Actions deployment workflows in `.github/workflows`.',
              'files': ['.github/workflows/deploy-production.yml', '.github/workflows/deploy-staging.yml'],
              'fs': ['FS-OPS-01'],
              'human_contribution': [ '**🔑 Secrets**: Configure GitHub repository secrets (`AWS_ROLE_ARN`, '
                                      '`ECR_REGISTRY`).'],
              'id': 'T-OPS-02',
              'implementation_steps': [ '1. Author GitHub Actions deployment workflow.',
                                        '2. Configure AWS OIDC authentication.',
                                        '3. Add health check verification step post-rollout.'],
              'modify_scope': ['.github/workflows/deploy*'],
              'objective_value': 'Implement automated GitHub Actions CI/CD deployment pipeline with Docker multi-stage '
                                 'builds, ECR push, standalone Prisma migration task, and ECS rolling updates.',
              'read': ['docs/10_engineering/18_DEPLOYMENT.md'],
              'security_invariants': [ '🔒 **Migration Safety**: Run migrations as standalone task before rolling new '
                                       'container images.'],
              'size': 'L',
              'technical_contract': [ 'Pipeline: Lint & Test -> Build Docker Images -> Push to ECR -> Run `prisma '
                                      'migrate deploy` as one-off ECS task -> Trigger ECS rolling service update.'],
              'title': 'CI/CD deployment workflow & zero-downtime rolling update pipeline',
              'wave': 'W10',
              'why': 'Enable reliable, automated zero-downtime production deployments on merge to main.'},
    'id': 'T-OPS-02',
    'leaves': [ { 'cmd': 'pnpm check:full',
                  'do': [ '1. Author GitHub Actions deployment workflow.',
                          '2. Configure AWS OIDC authentication.',
                          '3. Add health check verification step post-rollout.'],
                  'done': '**Workflow Syntax**: GitHub Actions YAML parses and validates correctly.',
                  'dont': [],
                  'files': ['.github/workflows/deploy-production.yml', '.github/workflows/deploy-staging.yml'],
                  'gold': { 'acceptance_test_scenarios': [ '[ ] **Workflow Syntax**: GitHub Actions YAML parses and '
                                                           'validates correctly.'],
                            'cmd': 'pnpm check:full',
                            'depends': ['T-OPS-01', 'T-BOOT-05'],
                            'dont_modify_scope': ['apps/'],
                            'expected_deliverables': 'GitHub Actions deployment workflows in `.github/workflows`.',
                            'files': [ '.github/workflows/deploy-production.yml',
                                       '.github/workflows/deploy-staging.yml'],
                            'fs': ['FS-OPS-01'],
                            'human_contribution': [ '**🔑 Secrets**: Configure GitHub repository secrets '
                                                    '(`AWS_ROLE_ARN`, `ECR_REGISTRY`).'],
                            'id': 'T-OPS-02',
                            'implementation_steps': [ '1. Author GitHub Actions deployment workflow.',
                                                      '2. Configure AWS OIDC authentication.',
                                                      '3. Add health check verification step post-rollout.'],
                            'modify_scope': ['.github/workflows/deploy*'],
                            'objective_value': 'Implement automated GitHub Actions CI/CD deployment pipeline with '
                                               'Docker multi-stage builds, ECR push, standalone Prisma migration task, '
                                               'and ECS rolling updates.',
                            'read': ['docs/10_engineering/18_DEPLOYMENT.md'],
                            'security_invariants': [ '🔒 **Migration Safety**: Run migrations as standalone task before '
                                                     'rolling new container images.'],
                            'size': 'L',
                            'technical_contract': [ 'Pipeline: Lint & Test -> Build Docker Images -> Push to ECR -> '
                                                    'Run `prisma migrate deploy` as one-off ECS task -> Trigger ECS '
                                                    'rolling service update.'],
                            'title': 'CI/CD deployment workflow & zero-downtime rolling update pipeline',
                            'wave': 'W10',
                            'why': 'Enable reliable, automated zero-downtime production deployments on merge to main.'},
                  'letter': '',
                  'read': ['docs/10_engineering/18_DEPLOYMENT/02-storage-env-ci-ops.md'],
                  'title': 'CI/CD deployment workflow & zero-downtime rolling update pipeline'}],
    'parent_done': '**Workflow Syntax**: GitHub Actions YAML parses and validates correctly.',
    'size': 'L',
    'title': 'CI/CD deployment workflow & zero-downtime rolling update pipeline',
    'wave': 'W10'},
  { 'depends': ['T-OPS-01'],
    'fs': ['FS-OPS-01'],
    'gold': { 'acceptance_test_scenarios': [ '[ ] **Liveness Probe**: Returns 200 OK.',
                                             '[ ] **Readiness Probe**: Returns 200 when DB/Redis healthy, 503 when '
                                             'disconnected.'],
              'cmd': 'pnpm --filter api test -- src/platform',
              'depends': ['T-OPS-01'],
              'dont_modify_scope': ['apps/web/'],
              'expected_deliverables': 'Health probe controller and CloudWatch alarms in `apps/api` and `infra`.',
              'files': [ 'apps/api/src/platform/health/health.controller.ts',
                         'apps/api/src/platform/health/health-indicators.service.ts',
                         'infra/terraform/cloudwatch.tf'],
              'fs': ['FS-OPS-01'],
              'human_contribution': ['**🧪 Manual QA**: Call `http://localhost:3001/health/ready` via curl.'],
              'id': 'T-OPS-03',
              'implementation_steps': [ '1. Implement health controller with Terminus health indicators.',
                                        '2. Author CloudWatch alarms in Terraform.',
                                        '3. Author unit tests for health probes.'],
              'modify_scope': ['apps/api/src/platform/health.*', 'infra/terraform/cloudwatch.tf'],
              'objective_value': 'Implement liveness/readiness health probes and CloudWatch alarms for 5xx errors, DLQ '
                                 'backlog, and database connection exhaustion.',
              'read': ['docs/10_engineering/18_DEPLOYMENT.md', 'docs/10_engineering/13_API_DESIGN.md'],
              'security_invariants': [ '🔒 **Probe Separation**: `/health/live` does not query DB; `/health/ready` '
                                       'validates database connectivity.'],
              'size': 'M',
              'technical_contract': [ '`GET /health/live` (200 OK) -> Process liveness probe',
                                      '`GET /health/ready` (200 OK) -> Checks Postgres, Redis, and MinIO connectivity '
                                      '(returns 503 if DB down)'],
              'title': 'CloudWatch alarms, structured logging & health endpoints (`/health/live`, `/health/ready`)',
              'wave': 'W10',
              'why': 'Provide ALB with accurate health check signals and alert on-call engineers of system '
                     'degradation.'},
    'id': 'T-OPS-03',
    'leaves': [ { 'cmd': 'pnpm --filter api test -- src/platform',
                  'do': [ '1. Implement health controller with Terminus health indicators.',
                          '2. Author CloudWatch alarms in Terraform.',
                          '3. Author unit tests for health probes.'],
                  'done': '**Liveness Probe**: Returns 200 OK.',
                  'dont': [],
                  'files': [ 'apps/api/src/platform/health/health.controller.ts',
                             'apps/api/src/platform/health/health-indicators.service.ts',
                             'infra/terraform/cloudwatch.tf'],
                  'gold': { 'acceptance_test_scenarios': [ '[ ] **Liveness Probe**: Returns 200 OK.',
                                                           '[ ] **Readiness Probe**: Returns 200 when DB/Redis '
                                                           'healthy, 503 when disconnected.'],
                            'cmd': 'pnpm --filter api test -- src/platform',
                            'depends': ['T-OPS-01'],
                            'dont_modify_scope': ['apps/web/'],
                            'expected_deliverables': 'Health probe controller and CloudWatch alarms in `apps/api` and '
                                                     '`infra`.',
                            'files': [ 'apps/api/src/platform/health/health.controller.ts',
                                       'apps/api/src/platform/health/health-indicators.service.ts',
                                       'infra/terraform/cloudwatch.tf'],
                            'fs': ['FS-OPS-01'],
                            'human_contribution': [ '**🧪 Manual QA**: Call `http://localhost:3001/health/ready` via '
                                                    'curl.'],
                            'id': 'T-OPS-03',
                            'implementation_steps': [ '1. Implement health controller with Terminus health indicators.',
                                                      '2. Author CloudWatch alarms in Terraform.',
                                                      '3. Author unit tests for health probes.'],
                            'modify_scope': ['apps/api/src/platform/health.*', 'infra/terraform/cloudwatch.tf'],
                            'objective_value': 'Implement liveness/readiness health probes and CloudWatch alarms for '
                                               '5xx errors, DLQ backlog, and database connection exhaustion.',
                            'read': ['docs/10_engineering/18_DEPLOYMENT.md', 'docs/10_engineering/13_API_DESIGN.md'],
                            'security_invariants': [ '🔒 **Probe Separation**: `/health/live` does not query DB; '
                                                     '`/health/ready` validates database connectivity.'],
                            'size': 'M',
                            'technical_contract': [ '`GET /health/live` (200 OK) -> Process liveness probe',
                                                    '`GET /health/ready` (200 OK) -> Checks Postgres, Redis, and MinIO '
                                                    'connectivity (returns 503 if DB down)'],
                            'title': 'CloudWatch alarms, structured logging & health endpoints (`/health/live`, '
                                     '`/health/ready`)',
                            'wave': 'W10',
                            'why': 'Provide ALB with accurate health check signals and alert on-call engineers of '
                                   'system degradation.'},
                  'letter': '',
                  'read': [ 'docs/10_engineering/18_DEPLOYMENT/02-storage-env-ci-ops.md',
                            'docs/10_engineering/13_API_DESIGN/05-realtime-platform-governance.md'],
                  'title': 'CloudWatch alarms, structured logging & health endpoints (`/health/live`, '
                           '`/health/ready`)'}],
    'parent_done': '**Liveness Probe**: Returns 200 OK.',
    'size': 'M',
    'title': 'CloudWatch alarms, structured logging & health endpoints (`/health/live`, `/health/ready`)',
    'wave': 'W10'},
  { 'depends': ['T-AUTH-02'],
    'fs': ['FS-OPS-01'],
    'gold': { 'acceptance_test_scenarios': [ '[ ] **Security Matrix Pass**: All multi-tenant and RBAC security tests '
                                             'pass with 0 failures.'],
              'cmd': 'pnpm --filter api test -- test/security-matrix',
              'depends': ['T-AUTH-02'],
              'dont_modify_scope': ['apps/web/'],
              'expected_deliverables': 'Security matrix test suite in `apps/api/test/security-matrix`.',
              'files': [ 'apps/api/test/security-matrix/tenancy-isolation.spec.ts',
                         'apps/api/test/security-matrix/rbac-matrix.spec.ts'],
              'fs': ['FS-OPS-01'],
              'human_contribution': [ '**🧪 Manual QA**: Run `pnpm --filter api test -- test/security-matrix` and '
                                      'inspect pass report.'],
              'id': 'T-OPS-04',
              'implementation_steps': [ '1. Author `tenancy-isolation.spec.ts` testing cross-tenant ID injection '
                                        'across all modules.',
                                        '2. Author `rbac-matrix.spec.ts` testing all 22 permissions across Owner, '
                                        'Manager, Employee.',
                                        '3. Run security matrix test suite.'],
              'modify_scope': ['apps/api/test/security-matrix/'],
              'objective_value': 'Implement automated end-to-end security matrix test suite verifying 100% tenant '
                                 'isolation across all 12 modules and RBAC permission enforcement across Owner, '
                                 'Manager, and Employee roles.',
              'read': ['docs/10_engineering/17_SECURITY_DESIGN.md', 'docs/10_engineering/13_API_DESIGN.md'],
              'security_invariants': ['🔒 **Zero Tolerance**: 100% pass rate required for launch gate sign-off.'],
              'size': 'L',
              'technical_contract': [ 'Matrix Suite: Executes 50+ automated security assertion scenarios across every '
                                      'API route.'],
              'title': 'Comprehensive security matrix test suite (multi-tenant isolation & RBAC)',
              'wave': 'W10',
              'why': 'Provide mathematical verification that no cross-tenant data leakage or privilege escalation '
                     'exists in the system per NFR-SEC-04-05.'},
    'id': 'T-OPS-04',
    'leaves': [ { 'cmd': 'pnpm --filter api test -- test/security-matrix',
                  'do': [ '1. Author `tenancy-isolation.spec.ts` testing cross-tenant ID injection across all modules.',
                          '2. Author `rbac-matrix.spec.ts` testing all 22 permissions across Owner, Manager, Employee.',
                          '3. Run security matrix test suite.'],
                  'done': '**Security Matrix Pass**: All multi-tenant and RBAC security tests pass with 0 failures.',
                  'dont': [],
                  'files': [ 'apps/api/test/security-matrix/tenancy-isolation.spec.ts',
                             'apps/api/test/security-matrix/rbac-matrix.spec.ts'],
                  'gold': { 'acceptance_test_scenarios': [ '[ ] **Security Matrix Pass**: All multi-tenant and RBAC '
                                                           'security tests pass with 0 failures.'],
                            'cmd': 'pnpm --filter api test -- test/security-matrix',
                            'depends': ['T-AUTH-02'],
                            'dont_modify_scope': ['apps/web/'],
                            'expected_deliverables': 'Security matrix test suite in `apps/api/test/security-matrix`.',
                            'files': [ 'apps/api/test/security-matrix/tenancy-isolation.spec.ts',
                                       'apps/api/test/security-matrix/rbac-matrix.spec.ts'],
                            'fs': ['FS-OPS-01'],
                            'human_contribution': [ '**🧪 Manual QA**: Run `pnpm --filter api test -- '
                                                    'test/security-matrix` and inspect pass report.'],
                            'id': 'T-OPS-04',
                            'implementation_steps': [ '1. Author `tenancy-isolation.spec.ts` testing cross-tenant ID '
                                                      'injection across all modules.',
                                                      '2. Author `rbac-matrix.spec.ts` testing all 22 permissions '
                                                      'across Owner, Manager, Employee.',
                                                      '3. Run security matrix test suite.'],
                            'modify_scope': ['apps/api/test/security-matrix/'],
                            'objective_value': 'Implement automated end-to-end security matrix test suite verifying '
                                               '100% tenant isolation across all 12 modules and RBAC permission '
                                               'enforcement across Owner, Manager, and Employee roles.',
                            'read': [ 'docs/10_engineering/17_SECURITY_DESIGN.md',
                                      'docs/10_engineering/13_API_DESIGN.md'],
                            'security_invariants': [ '🔒 **Zero Tolerance**: 100% pass rate required for launch gate '
                                                     'sign-off.'],
                            'size': 'L',
                            'technical_contract': [ 'Matrix Suite: Executes 50+ automated security assertion scenarios '
                                                    'across every API route.'],
                            'title': 'Comprehensive security matrix test suite (multi-tenant isolation & RBAC)',
                            'wave': 'W10',
                            'why': 'Provide mathematical verification that no cross-tenant data leakage or privilege '
                                   'escalation exists in the system per NFR-SEC-04-05.'},
                  'letter': '',
                  'read': [ 'docs/10_engineering/17_SECURITY_DESIGN/01-auth-tenancy-rbac.md',
                            'docs/10_engineering/13_API_DESIGN/01-conventions-dto-contracts.md'],
                  'title': 'Comprehensive security matrix test suite (multi-tenant isolation & RBAC)'}],
    'parent_done': '**Security Matrix Pass**: All multi-tenant and RBAC security tests pass with 0 failures.',
    'size': 'L',
    'title': 'Comprehensive security matrix test suite (multi-tenant isolation & RBAC)',
    'wave': 'W10'},
  { 'depends': ['T-INT-04', 'T-AI-05'],
    'fs': ['FS-OPS-01'],
    'gold': { 'acceptance_test_scenarios': [ '[ ] **Resilience Pass**: All fault injection scenarios handle errors '
                                             'cleanly.'],
              'cmd': 'pnpm --filter api test -- test/resilience',
              'depends': ['T-INT-04', 'T-AI-05'],
              'dont_modify_scope': ['apps/web/'],
              'expected_deliverables': 'Resilience test suite in `apps/api/test/resilience`.',
              'files': ['apps/api/test/resilience/fault-injection.spec.ts'],
              'fs': ['FS-OPS-01'],
              'human_contribution': ['**🧪 Manual QA**: Run `pnpm --filter api test -- test/resilience`.'],
              'id': 'T-OPS-05',
              'implementation_steps': [ '1. Author resilience test scenarios injecting simulated network and provider '
                                        'faults.',
                                        '2. Run resilience test suite.'],
              'modify_scope': ['apps/api/test/resilience/'],
              'objective_value': 'Implement automated resilience and fault injection test suite testing webhook '
                                 'duplicate deduplication, Redis failover, LLM fallback failover, and DLQ retries.',
              'read': ['docs/10_engineering/14_SYSTEM_DESIGN.md'],
              'security_invariants': [ '🔒 **Graceful Recovery**: System recovers automatically without dropped turns '
                                       'or data corruption.'],
              'size': 'M',
              'technical_contract': [ 'Resilience Scenarios: Meta webhook duplicate storm, AI primary provider 500 '
                                      'error, Redis transient drop, Outbound delivery 5xx backoff.'],
              'title': 'System fault injection & resilience verification suite',
              'wave': 'W10',
              'why': 'Verify system stability and error handling under external simulated failures per NFR-REL-07.'},
    'id': 'T-OPS-05',
    'leaves': [ { 'cmd': 'pnpm --filter api test -- test/resilience',
                  'do': [ '1. Author resilience test scenarios injecting simulated network and provider faults.',
                          '2. Run resilience test suite.'],
                  'done': '**Resilience Pass**: All fault injection scenarios handle errors cleanly.',
                  'dont': [],
                  'files': ['apps/api/test/resilience/fault-injection.spec.ts'],
                  'gold': { 'acceptance_test_scenarios': [ '[ ] **Resilience Pass**: All fault injection scenarios '
                                                           'handle errors cleanly.'],
                            'cmd': 'pnpm --filter api test -- test/resilience',
                            'depends': ['T-INT-04', 'T-AI-05'],
                            'dont_modify_scope': ['apps/web/'],
                            'expected_deliverables': 'Resilience test suite in `apps/api/test/resilience`.',
                            'files': ['apps/api/test/resilience/fault-injection.spec.ts'],
                            'fs': ['FS-OPS-01'],
                            'human_contribution': ['**🧪 Manual QA**: Run `pnpm --filter api test -- test/resilience`.'],
                            'id': 'T-OPS-05',
                            'implementation_steps': [ '1. Author resilience test scenarios injecting simulated network '
                                                      'and provider faults.',
                                                      '2. Run resilience test suite.'],
                            'modify_scope': ['apps/api/test/resilience/'],
                            'objective_value': 'Implement automated resilience and fault injection test suite testing '
                                               'webhook duplicate deduplication, Redis failover, LLM fallback '
                                               'failover, and DLQ retries.',
                            'read': ['docs/10_engineering/14_SYSTEM_DESIGN.md'],
                            'security_invariants': [ '🔒 **Graceful Recovery**: System recovers automatically without '
                                                     'dropped turns or data corruption.'],
                            'size': 'M',
                            'technical_contract': [ 'Resilience Scenarios: Meta webhook duplicate storm, AI primary '
                                                    'provider 500 error, Redis transient drop, Outbound delivery 5xx '
                                                    'backoff.'],
                            'title': 'System fault injection & resilience verification suite',
                            'wave': 'W10',
                            'why': 'Verify system stability and error handling under external simulated failures per '
                                   'NFR-REL-07.'},
                  'letter': '',
                  'read': ['docs/10_engineering/14_SYSTEM_DESIGN/02-locks-jobs-events-scoring.md'],
                  'title': 'System fault injection & resilience verification suite'}],
    'parent_done': '**Resilience Pass**: All fault injection scenarios handle errors cleanly.',
    'size': 'M',
    'title': 'System fault injection & resilience verification suite',
    'wave': 'W10'},
  { 'depends': ['T-OPS-03'],
    'fs': ['FS-OPS-01'],
    'gold': { 'acceptance_test_scenarios': [ '[ ] **Runbook Documentation**: Complete, actionable runbook in '
                                             'repository docs.'],
              'cmd': 'pnpm check:full',
              'depends': ['T-OPS-03'],
              'dont_modify_scope': ['apps/'],
              'expected_deliverables': 'Production operational runbook in `docs/10_engineering/RUNBOOK.md`.',
              'files': ['docs/10_engineering/RUNBOOK.md'],
              'fs': ['FS-OPS-01'],
              'human_contribution': [ '**👁️ Review & Sign-off**: Review operational runbook with engineering on-call '
                                      'team.'],
              'id': 'T-OPS-06',
              'implementation_steps': [ '1. Author `docs/10_engineering/RUNBOOK.md` with step-by-step incident '
                                        'resolution workflows.'],
              'modify_scope': ['docs/10_engineering/RUNBOOK.md'],
              'objective_value': 'Author comprehensive engineering operational runbook detailing on-call incident '
                                 'response procedures, Meta webhook re-synchronization, and RDS backup restoration '
                                 'steps.',
              'read': ['docs/10_engineering/18_DEPLOYMENT.md'],
              'security_invariants': [ '🔒 **No Plaintext Secrets**: Ensure runbook references AWS Secrets Manager '
                                       'without raw credentials.'],
              'size': 'S',
              'technical_contract': [ 'Runbook Sections: System Architecture Overview, Alert Response Playbooks, Meta '
                                      'Token Refresh, Redis Recovery, RDS Point-in-Time Restore.'],
              'title': 'Operational runbook, incident response guides & backup verification',
              'wave': 'W10',
              'why': 'Equip on-call engineers with clear operational procedures for production maintenance and '
                     'incident recovery.'},
    'id': 'T-OPS-06',
    'leaves': [ { 'cmd': 'pnpm check:full',
                  'do': ['1. Author `docs/10_engineering/RUNBOOK.md` with step-by-step incident resolution workflows.'],
                  'done': '**Runbook Documentation**: Complete, actionable runbook in repository docs.',
                  'dont': [],
                  'files': ['docs/10_engineering/RUNBOOK.md'],
                  'gold': { 'acceptance_test_scenarios': [ '[ ] **Runbook Documentation**: Complete, actionable '
                                                           'runbook in repository docs.'],
                            'cmd': 'pnpm check:full',
                            'depends': ['T-OPS-03'],
                            'dont_modify_scope': ['apps/'],
                            'expected_deliverables': 'Production operational runbook in '
                                                     '`docs/10_engineering/RUNBOOK.md`.',
                            'files': ['docs/10_engineering/RUNBOOK.md'],
                            'fs': ['FS-OPS-01'],
                            'human_contribution': [ '**👁️ Review & Sign-off**: Review operational runbook with '
                                                    'engineering on-call team.'],
                            'id': 'T-OPS-06',
                            'implementation_steps': [ '1. Author `docs/10_engineering/RUNBOOK.md` with step-by-step '
                                                      'incident resolution workflows.'],
                            'modify_scope': ['docs/10_engineering/RUNBOOK.md'],
                            'objective_value': 'Author comprehensive engineering operational runbook detailing on-call '
                                               'incident response procedures, Meta webhook re-synchronization, and RDS '
                                               'backup restoration steps.',
                            'read': ['docs/10_engineering/18_DEPLOYMENT.md'],
                            'security_invariants': [ '🔒 **No Plaintext Secrets**: Ensure runbook references AWS '
                                                     'Secrets Manager without raw credentials.'],
                            'size': 'S',
                            'technical_contract': [ 'Runbook Sections: System Architecture Overview, Alert Response '
                                                    'Playbooks, Meta Token Refresh, Redis Recovery, RDS Point-in-Time '
                                                    'Restore.'],
                            'title': 'Operational runbook, incident response guides & backup verification',
                            'wave': 'W10',
                            'why': 'Equip on-call engineers with clear operational procedures for production '
                                   'maintenance and incident recovery.'},
                  'letter': '',
                  'read': [ 'docs/10_engineering/18_DEPLOYMENT/02-storage-env-ci-ops.md',
                            'docs/10_engineering/18_DEPLOYMENT/01-infrastructure-topology-ecs.md'],
                  'title': 'Operational runbook, incident response guides & backup verification'}],
    'parent_done': '**Runbook Documentation**: Complete, actionable runbook in repository docs.',
    'size': 'S',
    'title': 'Operational runbook, incident response guides & backup verification',
    'wave': 'W10'},
  { 'depends': ['T-WEB-06', 'T-OPS-04', 'T-OPS-05'],
    'fs': ['FS-OPS-01'],
    'gold': { 'acceptance_test_scenarios': ['[ ] **Launch Ready**: 100% required tasks done, all tests green.'],
              'cmd': 'pnpm check:full',
              'depends': ['T-WEB-06', 'T-OPS-04', 'T-OPS-05'],
              'dont_modify_scope': ['apps/'],
              'expected_deliverables': 'Phase 1 MVP Launch sign-off documentation and release changelog.',
              'files': ['docs/40_project_management/43_CHANGELOG.md'],
              'fs': ['FS-OPS-01'],
              'human_contribution': [ '**Human sign-off**: Run `python3 backlog/_build.py --check-launch` and execute '
                                      'production launch approval.'],
              'id': 'T-OPS-07',
              'implementation_steps': [ '1. Verify all required tasks are completed and verified.',
                                        '2. Update CHANGELOG.md with Phase 1 MVP release notes.'],
              'modify_scope': ['docs/40_project_management/43_CHANGELOG.md'],
              'objective_value': 'Final Phase 1 MVP Launch Gate verification confirming 100% completion of Must '
                                 'functional requirements, passing test suites, zero open blockers, and production '
                                 'sign-off.',
              'read': [ 'docs/00_product/03_MVP_SCOPE.md',
                        'docs/30_execution/30_TASKS.md',
                        'docs/40_project_management/43_CHANGELOG.md'],
              'security_invariants': ['🔒 **Zero Open Blockers**: All Launch Gate criteria satisfied.'],
              'size': 'M',
              'technical_contract': [ 'Launch Verification: 100% of required cards marked `done`, `pnpm check:full` '
                                      'exits 0, Playwright E2E passes.'],
              'title': 'Phase 1 MVP Launch Gate sign-off & Must requirements verification',
              'wave': 'W10',
              'why': 'Formal engineering sign-off ensuring the system meets all product requirements and quality '
                     'standards before launch.'},
    'id': 'T-OPS-07',
    'leaves': [ { 'cmd': 'pnpm check:full',
                  'do': [ '1. Verify all required tasks are completed and verified.',
                          '2. Update CHANGELOG.md with Phase 1 MVP release notes.'],
                  'done': '**Launch Ready**: 100% required tasks done, all tests green.',
                  'dont': [],
                  'files': ['docs/40_project_management/43_CHANGELOG.md'],
                  'gold': { 'acceptance_test_scenarios': [ '[ ] **Launch Ready**: 100% required tasks done, all tests '
                                                           'green.'],
                            'cmd': 'pnpm check:full',
                            'depends': ['T-WEB-06', 'T-OPS-04', 'T-OPS-05'],
                            'dont_modify_scope': ['apps/'],
                            'expected_deliverables': 'Phase 1 MVP Launch sign-off documentation and release changelog.',
                            'files': ['docs/40_project_management/43_CHANGELOG.md'],
                            'fs': ['FS-OPS-01'],
                            'human_contribution': [ '**Human sign-off**: Run `python3 backlog/_build.py '
                                                    '--check-launch` and execute production launch approval.'],
                            'id': 'T-OPS-07',
                            'implementation_steps': [ '1. Verify all required tasks are completed and verified.',
                                                      '2. Update CHANGELOG.md with Phase 1 MVP release notes.'],
                            'modify_scope': ['docs/40_project_management/43_CHANGELOG.md'],
                            'objective_value': 'Final Phase 1 MVP Launch Gate verification confirming 100% completion '
                                               'of Must functional requirements, passing test suites, zero open '
                                               'blockers, and production sign-off.',
                            'read': [ 'docs/00_product/03_MVP_SCOPE.md',
                                      'docs/30_execution/30_TASKS.md',
                                      'docs/40_project_management/43_CHANGELOG.md'],
                            'security_invariants': ['🔒 **Zero Open Blockers**: All Launch Gate criteria satisfied.'],
                            'size': 'M',
                            'technical_contract': [ 'Launch Verification: 100% of required cards marked `done`, `pnpm '
                                                    'check:full` exits 0, Playwright E2E passes.'],
                            'title': 'Phase 1 MVP Launch Gate sign-off & Must requirements verification',
                            'wave': 'W10',
                            'why': 'Formal engineering sign-off ensuring the system meets all product requirements and '
                                   'quality standards before launch.'},
                  'letter': '',
                  'read': [ 'docs/00_product/03_MVP_SCOPE/02-out-of-scope-hooks-gate.md',
                            'docs/30_execution/30_TASKS.md',
                            'docs/40_project_management/43_CHANGELOG.md'],
                  'title': 'Phase 1 MVP Launch Gate sign-off & Must requirements verification'}],
    'parent_done': '**Launch Ready**: 100% required tasks done, all tests green.',
    'size': 'M',
    'title': 'Phase 1 MVP Launch Gate sign-off & Must requirements verification',
    'wave': 'W10'}]
