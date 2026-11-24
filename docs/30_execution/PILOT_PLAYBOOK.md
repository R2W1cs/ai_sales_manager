# Pilot playbook — Ben Arous / Ezzahra fashion shops

Hand-held onboarding for the first paying merchants. Self-serve growth waits until 10 pilots prove the loop.

## Offer

- Free setup + **14 days**
- Then **99–149 TND / month** (or setup fee + monthly)
- You import catalog, connect Meta, watch inbox for the first evenings
- Default AI mode: `approval_required` for week 1

## Success metric (per shop)

Pending orders created **and confirmed** by staff. Chat-only usage without confirms = product not working for them.

## Walk-in prospects (priority)

| #   | Shop            | Area                            | Contact                                                                                           | Channel fit                  |
| --- | --------------- | ------------------------------- | ------------------------------------------------------------------------------------------------- | ---------------------------- |
| 1   | Sara Stores     | Ennakhil, Ezzahra               | 54 529 879 · [@sara_stores.tn](https://www.instagram.com/sara_stores.tn/) · sara.stores@yahoo.com | Fashion + IG + COD           |
| 2   | Espace Kenza    | Ben Arous                       | 23 423 827 · [@espace.kenza](https://www.instagram.com/espace.kenza)                              | Wedding / evening            |
| 3   | Nawara.Fashion  | 9 Rue de Kairouan, Ben Arous    | Local FB / DM order flow                                                                          | Marketplace + message orders |
| 4   | The OPEN SHOP   | Ben Arous                       | 54 714 025 · contact@theopenshop.tn · [theopenshop.tn](https://theopenshop.tn/)                   | Apparel marketplace          |
| 5   | Azalee Rose     | Av. de l’Environnement, Ezzahra | 29 346 077 · [@azalee.rose8](https://www.instagram.com/azalee.rose8/)                             | Beauty / IG                  |
| 6   | Beauty La Reine | Ezzahra                         | 79 485 616                                                                                        | Beauty + delivery            |
| 7   | Cleopatre       | Ezzahra / Hammam-Lif            | 29 835 402 · [para-cleopatre.tn](https://para-cleopatre.tn)                                       | Para + ecom                  |
| 8   | Magasin TPL     | Hammam-Lif                      | 54 013 114 · [magasin-tpl.com](https://magasin-tpl.com/contact)                                   | Local retail + delivery      |

## Pitch (Derja / FR)

> الـ DM يجاوب وحدو بالدرجة على الـ stock والسوم. كان العميل حاب يشري، الـ commande تجي عندك باش تأكدها قبل الـ COD.

Do **not** say “course project.” Say you are launching for Tunisian fashion shops.

## Onboarding checklist

Copy into a sheet per merchant:

1. [ ] Tenant created (Owner account)
2. [ ] 20–50 SKUs imported (CSV or manual)
3. [ ] Business rules: delivery fee, COD, exchanges
4. [ ] Instagram (and Messenger) connected via Meta OAuth
5. [ ] Webhook URL points at production API
6. [ ] Test Derja question in Playground (price + stock)
7. [ ] Live IG DM → AI draft → staff approve
8. [ ] Purchase intent → pending order → staff confirm
9. [ ] Owner trained 30 minutes on Inbox + Pipeline
10. [ ] Watch inbox 3 evenings; log bugs + objections
11. [ ] WhatsApp requested? Log date — enable when 2+ shops demand it
12. [ ] Day 14: convert to paid or collect written feedback

## Objection log

| Date | Shop | Objection        | Action                            |
| ---- | ---- | ---------------- | --------------------------------- |
|      |      | Need WhatsApp    | Count toward Phase D unlock       |
|      |      | Catalog too hard | Help with CSV; note Shopify later |
|      |      | Price            | Pilot free; then 99 TND           |

## Tracking

Target exit: **3 design partners live**, ≥1 confirming orders weekly, first paid month from ≥1 shop.

### Commercial launch gate (course / product bar)

See [`PILOT_GATE_TRACKER.md`](./PILOT_GATE_TRACKER.md).

- Seed three verticals locally: `pnpm db:seed` then `pnpm pilot:seed`
- Measure interactions: `pnpm pilot:report` (requires ≥**20** inbound messages per merchant, IG+Messenger `active`, ≥1 confirmed COD order, 0 critical failures)
- Live Meta proof: [`META_LIVE_LOOP.md`](./META_LIVE_LOOP.md)
- GitHub process (branches / failing CI / bugfix): [`GITHUB_COMPANY_WORKFLOW.md`](./GITHUB_COMPANY_WORKFLOW.md)
