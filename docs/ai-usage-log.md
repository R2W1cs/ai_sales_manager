# AI Usage Log

Required by the course. Every meaningful use of an AI tool is recorded here: the tool, the purpose, the prompt, how the output was used, and what the human changed or rejected. Entries are added by the person who used the tool.

**Policy:** AI output is a draft. The person named in the entry is responsible for its content and has reviewed it.

| Field | Meaning |
|---|---|
| Output flag | `kept` used as is, `edited` changed by a human, `rejected` not used |

---

## Entry 001. Requirements, methodology and design drafts

| | |
|---|---|
| **Date** | 2026-10-31 |
| **Member** | Rayen |
| **Tool** | Claude Code (Claude Sonnet 5.5) |
| **Phase** | Requirements, methodology, design |
| **Purpose** | Draft the project proposal, user stories with acceptance criteria, product backlog, NFRs, traceability matrix, Scrum methodology, risk register, and the design documents (use cases, class diagrams, state machines, sequence flows, component and deployment, ERD, ADRs) |
| **Inputs given to the tool** | The team's earlier planning repository (user stories, requirements, architecture, system design, security design, handoff rules, Prisma schema) and the course guidance on structure and deliverables |

**Prompt (summarised)**

> Act as a software designer and architect. From the existing planning documents and schema, produce for my part (requirements, methodology, design): the proposal, user stories with acceptance criteria, MoSCoW backlog, NFRs, traceability, Scrum methodology, and a complete design: use-case diagram, a high-quality class diagram, all flows with explanation, state machines, component and deployment views, ERD and architecture decisions. Use Mermaid so the sources live in the repo.

**Output flags**

| Artefact | Flag | Notes |
|---|---|---|
| Requirements documents | edited / to be confirmed | Content derived from the earlier planning documents; the person responsible must review and refine with peers |
| Methodology | to be confirmed | Sprint dates and the sprint log are intentionally empty |
| Class diagrams C1 to C7 | kept | Entities and fields follow the schema; method signatures are illustrative |
| Sequence flows F1 to F20 | kept / partly proposed | See "Provenance" in the design overview for the proposed items |
| ADRs | kept | Based on documented decisions in the earlier planning documents |

**Human review still required**

- [ ] Rayen reviews every document, corrects anything that does not match the team's intent
- [ ] Teammates review their phase's interfaces (frontend: Aymen; backend: Moataz; testing: Asma)
- [ ] Proposed items listed in the design overview are confirmed or corrected
- [ ] Diagrams re-rendered after any edit

**Risks considered:** the drafts could contain plausible but wrong detail (hallucinated behaviour). Mitigation: sources are named, proposals are listed explicitly, and the traceability matrix makes gaps visible.

---

## Entry template

```
## Entry NNN. <title>
Date:
Member:
Tool and version:
Phase:
Purpose:
Prompt (verbatim or summarised):
Output flags (kept / edited / rejected) and notes:
Human review done (who, what was changed):
Risks considered:
```
