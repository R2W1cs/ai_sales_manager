# 10 — Architecture

Modular monolith architecture, system containers, domain modules, dependency rules, multi-tenancy, and deployment topology.

> [!IMPORTANT]
> This spec was split into modular domain parts for AI context efficiency; the part files are authoritative.

## Document Parts

- [`01-modular-monolith-domains.md`](10_ARCHITECTURE/01-modular-monolith-domains.md): **Architectural style, system containers, domain module boundaries & encapsulation**
  - _Guidance:_ Read if understanding backend modular structure, domain module boundaries, or workspace layout.
- [`02-flow-tenancy-topology.md`](10_ARCHITECTURE/02-flow-tenancy-topology.md): **Inbound message control flow, multi-tenancy rules, topology & agent guidance**
  - _Guidance:_ Read if implementing cross-module workflows, tenant isolation enforcement, or deployment topologies.

## Agent Navigation Guidance

When implementing specific tasks, prefer reading only the exact part file(s) in `10_ARCHITECTURE/` required for your domain (see bullets above) rather than loading all documentation.
