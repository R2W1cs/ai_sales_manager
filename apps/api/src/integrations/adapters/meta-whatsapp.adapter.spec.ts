import { MetaWhatsappAdapter } from "./meta-whatsapp.adapter";

describe("MetaWhatsappAdapter (T-INT-03)", () => {
  let adapter: MetaWhatsappAdapter;
  const originalEnv = process.env.WHATSAPP_ENABLED;

  beforeEach(() => {
    process.env.WHATSAPP_ENABLED = "true";
    adapter = new MetaWhatsappAdapter();
  });

  afterAll(() => {
    process.env.WHATSAPP_ENABLED = originalEnv;
  });

  describe("mapInbound", () => {
    it("Disabled stub: Returns empty list when WHATSAPP_ENABLED is false", () => {
      process.env.WHATSAPP_ENABLED = "false";
      const payload = {
        object: "whatsapp_business_account",
        entry: [
          { id: "1", changes: [{ value: { messages: [{ id: "m1", text: { body: "hi" } }] } }] },
        ],
      };
      expect(adapter.mapInbound(payload)).toEqual([]);
    });

    it("Normalization: WhatsApp text message payload maps into CanonicalMessage", () => {
      const payload = {
        object: "whatsapp_business_account",
        entry: [
          {
            id: "WABA_12345",
            changes: [
              {
                field: "messages",
                value: {
                  messaging_product: "whatsapp",
                  metadata: {
                    display_phone_number: "+15551234567",
                    phone_number_id: "PHONE_ID_999",
                  },
                  contacts: [
                    {
                      profile: { name: "John Doe" },
                      wa_id: "15559876543",
                    },
                  ],
                  messages: [
                    {
                      from: "15559876543",
                      id: "wamid.HBgLMTE1NTU5ODc2NTQzFQIAEhggM0EyRjI2MDc4ODhCMkE0QzM5",
                      timestamp: "1700000000",
                      text: {
                        body: "Hello from WhatsApp",
                      },
                      type: "text",
                    },
                  ],
                },
              },
            ],
          },
        ],
      };

      const result = adapter.mapInbound(payload);

      expect(result).toHaveLength(1);
      const msg = result[0];
      expect(msg).toBeDefined();
      expect(msg?.externalMessageId).toBe(
        "wamid.HBgLMTE1NTU5ODc2NTQzFQIAEhggM0EyRjI2MDc4ODhCMkE0QzM5",
      );
      expect(msg?.channelType).toBe("whatsapp");
      expect(msg?.channelAccountId).toBe("PHONE_ID_999");
      expect(msg?.externalSenderId).toBe("15559876543");
      expect(msg?.text).toBe("Hello from WhatsApp");
      expect(msg?.attachments).toEqual([]);
      expect(new Date(msg?.timestamp ?? "").getTime()).not.toBeNaN();
      expect(msg?.eventKind).toBe("message");
      expect(msg?.isEcho).toBe(false);
    });

    it("Normalization: WhatsApp image attachment maps into CanonicalMessage", () => {
      const payload = {
        object: "whatsapp_business_account",
        entry: [
          {
            id: "WABA_12345",
            changes: [
              {
                field: "messages",
                value: {
                  messaging_product: "whatsapp",
                  metadata: {
                    phone_number_id: "PHONE_ID_999",
                  },
                  messages: [
                    {
                      from: "15559876543",
                      id: "wamid.IMG_123",
                      timestamp: 1700000000,
                      type: "image",
                      image: {
                        id: "MEDIA_ID_IMG_99",
                        mime_type: "image/jpeg",
                        sha256: "abc123hash",
                        caption: "Look at this product",
                      },
                    },
                  ],
                },
              },
            ],
          },
        ],
      };

      const result = adapter.mapInbound(payload);

      expect(result).toHaveLength(1);
      const msg = result[0];
      expect(msg?.externalMessageId).toBe("wamid.IMG_123");
      expect(msg?.text).toBe("Look at this product");
      expect(msg?.attachments).toHaveLength(1);
      expect(msg?.attachments[0]).toEqual({
        type: "image",
        providerUrl: "whatsapp-media://MEDIA_ID_IMG_99",
        url: "whatsapp-media://MEDIA_ID_IMG_99",
      });
    });

    it("Normalization: WhatsApp button and interactive quick replies map properly", () => {
      const payload = {
        object: "whatsapp_business_account",
        entry: [
          {
            id: "WABA_123",
            changes: [
              {
                value: {
                  metadata: { phone_number_id: "PHONE_ID_1" },
                  messages: [
                    {
                      from: "15551",
                      id: "wamid.BTN_1",
                      timestamp: 1700000000,
                      type: "button",
                      button: { text: "Order Now", payload: "ORDER_NOW_PAYLOAD" },
                    },
                    {
                      from: "15551",
                      id: "wamid.INTERACTIVE_1",
                      timestamp: 1700000001,
                      type: "interactive",
                      interactive: {
                        type: "button_reply",
                        button_reply: { id: "OPT_A", title: "Option A" },
                      },
                    },
                  ],
                },
              },
            ],
          },
        ],
      };

      const result = adapter.mapInbound(payload);
      expect(result).toHaveLength(2);
      expect(result[0]?.text).toBe("Order Now");
      expect(result[1]?.text).toBe("Option A");
    });

    it("Normalization: WhatsApp status updates (delivered/read) map to delivery/read eventKind", () => {
      const payload = {
        object: "whatsapp_business_account",
        entry: [
          {
            id: "WABA_123",
            changes: [
              {
                value: {
                  metadata: { phone_number_id: "PHONE_ID_1" },
                  statuses: [
                    {
                      id: "wamid.OUTBOUND_1",
                      recipient_id: "1555987",
                      status: "delivered",
                      timestamp: "1700000000",
                    },
                  ],
                },
              },
            ],
          },
        ],
      };

      const result = adapter.mapInbound(payload);
      expect(result).toHaveLength(1);
      expect(result[0]?.eventKind).toBe("delivery");
      expect(result[0]?.externalMessageId).toBe("wamid.OUTBOUND_1");
      expect(result[0]?.externalSenderId).toBe("1555987");
    });

    it("Malformed Resilience: Malformed provider JSON is flagged without crashing background worker.", () => {
      expect(adapter.mapInbound(null)).toEqual([]);
      expect(adapter.mapInbound(undefined)).toEqual([]);
      expect(adapter.mapInbound("not-an-object")).toEqual([]);
      expect(adapter.mapInbound({})).toEqual([]);
      expect(adapter.mapInbound({ entry: "invalid-entry" })).toEqual([]);
      expect(adapter.mapInbound({ entry: [{ changes: "invalid-changes" }] })).toEqual([]);
      expect(
        adapter.mapInbound({
          entry: [
            {
              changes: [
                {
                  value: {
                    messages: [null, undefined, { invalid: "data" }],
                  },
                },
              ],
            },
          ],
        }),
      ).toHaveLength(1); // Handles graceful fallback id/sender
    });
  });

  describe("send", () => {
    it("Returns feature_disabled when WHATSAPP_ENABLED is false", async () => {
      delete process.env.WHATSAPP_ENABLED;
      const result = await adapter.send(
        {
          channel: "whatsapp",
          recipientPlatformUserId: "15559876543",
          text: "Test outbound",
        },
        "token_123",
      );

      expect(result.ok).toBe(false);
      expect(result.providerCode).toBe("feature_disabled");
      expect(result.retryable).toBe(false);
    });

    it("Sends Cloud API text when WHATSAPP_ENABLED is true", async () => {
      process.env.WHATSAPP_ENABLED = "true";
      const fetchMock = jest.spyOn(globalThis, "fetch").mockResolvedValue(
        new Response(JSON.stringify({ messages: [{ id: "wamid.SENT_1" }] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );

      const result = await adapter.send(
        {
          channel: "whatsapp",
          recipientPlatformUserId: "15559876543",
          text: "Test outbound",
          pageId: "PHONE_ID_999",
        },
        "token_123",
      );

      expect(result.ok).toBe(true);
      expect(result.externalMessageId).toBe("wamid.SENT_1");
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("/PHONE_ID_999/messages"),
        expect.objectContaining({ method: "POST" }),
      );
      fetchMock.mockRestore();
    });

    it("Sends approved template when templateName is set", async () => {
      process.env.WHATSAPP_ENABLED = "true";
      const fetchMock = jest.spyOn(globalThis, "fetch").mockResolvedValue(
        new Response(JSON.stringify({ messages: [{ id: "wamid.TPL_1" }] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );

      const result = await adapter.send(
        {
          channel: "whatsapp",
          recipientPlatformUserId: "15559876543",
          pageId: "PHONE_ID_999",
          templateName: "order_confirmation",
          templateLanguage: "fr",
          templateBodyParams: ["Amina", "ORD-12"],
        },
        "token_123",
      );

      expect(result.ok).toBe(true);
      const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
      const body = JSON.parse(String(init.body)) as {
        type: string;
        template: { name: string };
      };
      expect(body.type).toBe("template");
      expect(body.template.name).toBe("order_confirmation");
      fetchMock.mockRestore();
    });
  });
});
