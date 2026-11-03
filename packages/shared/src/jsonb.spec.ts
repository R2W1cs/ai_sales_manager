import {
  HandoffContextSchema,
  PlanLimitsSchema,
  VariantAttributesSchema,
  BusinessSettingsSchema,
  DeliveryRulePayloadSchema,
  PaymentRulePayloadSchema,
  DiscountRulePayloadSchema,
  CustomerPreferencesSchema,
} from "./jsonb";

describe("JSONB Schemas", () => {
  it("validates HandoffContextSchema", () => {
    const valid = {
      schema_version: 1,
      customer: {
        id: "123e4567-e89b-12d3-a456-426614174000",
        name: "Aymen",
        phone: "+21699999999",
        channel: "instagram",
        lifecycle_stage: "qualified_lead",
      },
      summary: "Customer wants Black Hoodie size M.",
      intent: "purchase_intent",
      confidence: 0.92,
      confidence_source: "llm",
      products_discussed: [
        {
          product_id: "123e4567-e89b-12d3-a456-426614174001",
          variant_id: "123e4567-e89b-12d3-a456-426614174002",
          name: "Black Hoodie M",
          sku: "HOODIE-BLK-M",
          price: 120,
          currency: "TND",
        },
      ],
      collected_fields: ["name", "phone", "address", "quantity"],
      missing_fields: [],
      ai_recommendation: "Confirm COD; delivery 5 DT Tunis.",
      escalation_reason: "purchase_handoff",
      handoff_priority: "high",
      also_matched: [],
      pending_order: {
        id: "123e4567-e89b-12d3-a456-426614174003",
        amount: 125,
        currency: "TND",
        item_count: 1,
      },
      action_required: "Confirm order with customer",
      decision_trace_id: "123e4567-e89b-12d3-a456-426614174004",
    };

    expect(HandoffContextSchema.parse(valid)).toEqual(valid);

    // Rejects confidence without confidence_source
    expect(() =>
      HandoffContextSchema.parse({
        ...valid,
        confidence: 0.8,
        confidence_source: null,
      }),
    ).toThrow();

    // Rejects confidence_source when confidence is null
    expect(() =>
      HandoffContextSchema.parse({
        ...valid,
        confidence: null,
        confidence_source: "llm",
      }),
    ).toThrow();

    // Rejects 'default' as confidence_source (only llm | rule | manual allowed)
    expect(() =>
      HandoffContextSchema.parse({
        ...valid,
        confidence: 0.8,
        confidence_source: "default" as any,
      }),
    ).toThrow();

    // Accepts unscored (both null)
    expect(() =>
      HandoffContextSchema.parse({
        ...valid,
        confidence: null,
        confidence_source: null,
      }),
    ).not.toThrow();

    // Accepts canonical 06 §6.1 briefing where confidence_source is omitted
    const { confidence_source: _omitted, ...canonicalPayload } = valid;
    expect(() => HandoffContextSchema.parse(canonicalPayload)).not.toThrow();
  });

  it("validates PlanLimitsSchema", () => {
    const starter = {
      channel_accounts: 1,
      ai_messages_per_month: 1000,
      max_conversations: null,
      max_ai_replies_per_month: 1000,
      seats: 1,
      monthly_ai_budget_usd: null,
    };
    expect(PlanLimitsSchema.parse(starter)).toEqual(starter);
  });

  it("validates BusinessSettingsSchema as strict empty object in MVP", () => {
    expect(BusinessSettingsSchema.parse({})).toEqual({});
    expect(() => BusinessSettingsSchema.parse({ extra: true })).toThrow();
  });

  it("validates VariantAttributesSchema and CustomerPreferencesSchema", () => {
    const attrs = { color: "Black", size: "M" };
    expect(VariantAttributesSchema.parse(attrs)).toEqual(attrs);

    const prefs = { sizes: ["M", "L"], colors: ["black"], notes: "likes oversized" };
    expect(CustomerPreferencesSchema.parse(prefs)).toEqual(prefs);
  });

  it("validates business rules payloads", () => {
    const delivery = {
      zones: [{ name: "Tunis", fee: 5, currency: "TND", eta_hours: 24 }],
    };
    expect(DeliveryRulePayloadSchema.parse(delivery)).toEqual(delivery);

    const payment = { methods: [{ code: "cod", label: "Cash on delivery" }] };
    expect(PaymentRulePayloadSchema.parse(payment)).toEqual(payment);

    const discount = { ai_may_offer: false, max_percent: null };
    expect(DiscountRulePayloadSchema.parse(discount)).toEqual(discount);
  });
});
