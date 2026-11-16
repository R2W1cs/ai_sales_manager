# WhatsApp Cloud API (pilots)

Official Meta WhatsApp Cloud API only (`ADR-023`, `ADR-026`). No Baileys / whatsapp-web.js.

## Enable

1. Meta Business verification + WhatsApp Business phone number
2. Set `META_WA_PHONE_NUMBER_ID`, page/WABA tokens via channel connect
3. Set `WHATSAPP_ENABLED=true` in production env
4. Subscribe webhooks for `whatsapp_business_account` → same Meta webhook URL

## Behaviour

| Direction              | Implementation                                                                    |
| ---------------------- | --------------------------------------------------------------------------------- |
| Inbound                | `MetaWhatsappAdapter.mapInbound` normalizes Cloud API payloads                    |
| Outbound session (24h) | Text / image via `MetaApiClient.sendWhatsAppMessage`                              |
| Outbound outside 24h   | `templateName` + `templateLanguage` + `templateBodyParams` on `CanonicalOutbound` |

## Recommended templates (submit in Meta)

| Name                 | Use                           |
| -------------------- | ----------------------------- |
| `order_confirmation` | Staff-confirmed COD follow-up |
| `order_reengagement` | Re-open a cold thread         |

Keep human COD confirm — do not auto-charge (`ADR-003`, `ADR-027`).

## Metering

Count WhatsApp conversations separately from IG/Messenger for margin review before public pricing (OQ-22).
