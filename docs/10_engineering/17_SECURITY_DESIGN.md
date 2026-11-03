# 17 — Security Design

Security architecture, JWT authentication, tenant isolation, RBAC matrix, secret management, encryption, and PII protection.

> [!IMPORTANT]
> This spec was split into modular domain parts for AI context efficiency; the part files are authoritative.

## Document Parts

- [`01-auth-tenancy-rbac.md`](17_SECURITY_DESIGN/01-auth-tenancy-rbac.md): **Authentication flows, multi-tenant isolation guardrails & RBAC permission matrix**
  - _Guidance:_ Read if implementing auth guards, tenant boundary validation, membership checks, or RBAC decorators.
- [`02-secrets-encryption-pii-audit.md`](17_SECURITY_DESIGN/02-secrets-encryption-pii-audit.md): **Secret storage (KMS), token encryption, PII redaction, audit logging & transport security**
  - _Guidance:_ Read if implementing encryption at rest, API key storage, PII sanitization, audit logging, or security headers.

## Agent Navigation Guidance

When implementing specific tasks, prefer reading only the exact part file(s) in `17_SECURITY_DESIGN/` required for your domain (see bullets above) rather than loading all documentation.
