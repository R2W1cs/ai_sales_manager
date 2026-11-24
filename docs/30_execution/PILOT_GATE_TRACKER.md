# Commercial launch gate tracker

Parent epic: GitHub issue **#14**.

## Acceptance criteria

| #   | Criterion                 | Target                                                                                           |
| --- | ------------------------- | ------------------------------------------------------------------------------------------------ |
| 1   | Design partners onboarded | **3** (fashion, cosmetics, electronics)                                                          |
| 2   | Catalogs live             | Variants + **TND** prices + stock                                                                |
| 3   | Channels                  | Instagram Direct + Messenger (Facebook Page)                                                     |
| 4   | Purchase loop             | Intent → inquiry → reservation → delivery (governorate / delegation / phone) → **pending** order |
| 5   | Human loop                | Merchant notification + Inbox takeover                                                           |
| 6   | COD                       | Pending → staff confirm (cash on delivery)                                                       |
| 7   | Volume                    | **≥20** successful live customer interactions **per** merchant                                   |
| 8   | Quality                   | **0** critical failures / unexpected hallucinations in pilot transactions                        |

Measure progress with `pnpm pilot:report` (fails exit code 2 until the gate passes).

## Design partners (seeded)

| Merchant    | Vertical                  | Owner login (after `pnpm pilot:seed`) | CSV fixture                      |
| ----------- | ------------------------- | ------------------------------------- | -------------------------------- |
| Sara Stores | Fashion / apparel         | `pilot.sara@example.com`              | `fixtures/pilot/sara-stores.csv` |
| Azalee Rose | Cosmetics / beauty        | `pilot.azalee@example.com`            | `fixtures/pilot/azalee-rose.csv` |
| Magasin TPL | Electronics / accessories | `pilot.tpl@example.com`               | `fixtures/pilot/magasin-tpl.csv` |

Password for all pilot owners: `PilotPartner123!`

Channel accounts are seeded **disconnected**. Merchants connect Instagram + Messenger themselves via Settings → Canaux (Meta OAuth). No Meta tokens are stored in git.

## Per-merchant checklist

Copy one block per shop. Update counts from `pnpm pilot:report` or Inbox analytics.

### Sara Stores (fashion)

- [ ] Tenant created without engineering intervention (self-serve or playbook walkthrough)
- [ ] Catalog imported (≥20 SKUs, TND)
- [ ] Delivery rules: governorate zones + COD
- [ ] Instagram connected (status `active`)
- [ ] Messenger connected (status `active`)
- [ ] Playground Derja price + stock OK
- [ ] Live: intent → pending order
- [ ] Live: Inbox takeover + merchant notification
- [ ] Live: COD confirm
- [ ] Interactions ≥ 20: `____`
- [ ] Critical failures: `0`
- [ ] Recording / evidence link: `____`

### Azalee Rose (cosmetics)

- [ ] Tenant created without engineering intervention
- [ ] Catalog imported (≥20 SKUs, TND)
- [ ] Delivery rules + COD
- [ ] Instagram connected
- [ ] Messenger connected
- [ ] Live purchase → pending → confirm
- [ ] Interactions ≥ 20: `____`
- [ ] Critical failures: `0`
- [ ] Evidence: `____`

### Magasin TPL (electronics)

- [ ] Tenant created without engineering intervention
- [ ] Catalog imported (≥20 SKUs, TND)
- [ ] Delivery rules + COD
- [ ] Instagram connected
- [ ] Messenger connected
- [ ] Live purchase → pending → confirm
- [ ] Interactions ≥ 20: `____`
- [ ] Critical failures: `0`
- [ ] Evidence: `____`

## Gate decision

| Date | `pnpm pilot:report` | Decision   | Notes |
| ---- | ------------------- | ---------- | ----- |
|      | PASS / FAIL         | Go / No-go |       |

## Related docs

- [`PILOT_PLAYBOOK.md`](./PILOT_PLAYBOOK.md) — prospect list + pitch
- [`META_LIVE_LOOP.md`](./META_LIVE_LOOP.md) — one live IG proof
- [`GITHUB_COMPANY_WORKFLOW.md`](./GITHUB_COMPANY_WORKFLOW.md) — how this work moved through GitHub
