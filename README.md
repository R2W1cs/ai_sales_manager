# AI Sales Manager

An AI-assisted sales workspace for Tunisian e-commerce merchants. A merchant loads a product catalog and business rules. An AI assistant then answers customers on Instagram and Messenger in **French, Modern Standard Arabic, Tunisian Arabic (Derja) and Arabizi**, using only the merchant's real data. When a customer is ready to buy, the AI hands the conversation to a human as a *pending order*, which staff confirm in one click. Four KPIs show whether it works.

> Course project (Software Engineering, AI-assisted development). This repository is organised **phase by phase**, and each phase is a pull request owned by one team member.

## Team and phase ownership

| Member | Phase | Folder |
| ------ | ----- | ------ |
| **Rayen** | Requirements, methodology, design and architecture | [`docs/01-requirements`](docs/01-requirements), [`docs/02-methodology`](docs/02-methodology), [`docs/03-design`](docs/03-design) |
| Aymen | Frontend and ethics | `apps/web`, `docs/06-ethics` (to be added) |
| Moataz | Backend, optimization and refactoring | `apps/api`, `docs/05-refactoring` (to be added) |
| Asma | Testing of the whole application | `tests/`, `docs/04-testing` (to be added) |

Authorship is whatever Git records. Each member commits their own phase from their own account. See [`docs/02-methodology/CONTRIBUTING.md`](docs/02-methodology/CONTRIBUTING.md).

## Repository map

```
docs/
  01-requirements/   proposal, user stories, backlog, NFRs, traceability
  02-methodology/    Scrum plan, definition of done, branching, risks, contributing
  03-design/         architecture, UML (use-case, class, sequence, state, component), flows, ERD, ADRs
  ai-usage-log.md    where AI tools were used, with prompts and review notes
```

## Reading order for graders

1. [Project proposal](docs/01-requirements/01-project-proposal.md): the problem, the users, the scope
2. [User stories](docs/01-requirements/02-user-stories.md) and [backlog](docs/01-requirements/03-product-backlog.md): what gets built and in what order
3. [NFRs](docs/01-requirements/04-non-functional-requirements.md) and [traceability](docs/01-requirements/05-traceability-matrix.md)
4. [Methodology](docs/02-methodology/01-methodology.md)
5. [Design overview](docs/03-design/00-design-overview.md), then the diagram documents it links to

## Status

| Phase | State |
| ----- | ----- |
| Requirements | In review (PR) |
| Methodology | In review (PR) |
| Design | In review (PR) |
| Frontend / ethics | Not started |
| Backend / refactoring | Not started |
| Testing | Not started |

## Diagrams

Diagram sources are Mermaid, embedded in the design documents, extracted as `.mmd` files in [`docs/03-design/diagrams`](docs/03-design/diagrams) and rendered as PNG images in [`docs/03-design/diagrams/png`](docs/03-design/diagrams/png). Regenerate the `.mmd` files with `node scripts/extract-diagrams.mjs`.
