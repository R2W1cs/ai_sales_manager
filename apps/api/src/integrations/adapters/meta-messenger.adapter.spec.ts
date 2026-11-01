import { MetaMessengerAdapter } from "./meta-messenger.adapter";

describe("MetaMessengerAdapter (T-INT-03)", () => {
  let adapter: MetaMessengerAdapter;

  beforeEach(() => {
    adapter = new MetaMessengerAdapter();
  });

  describe("mapInbound", () => {
    it("Normalization: Messenger text message payload maps into CanonicalMessage", () => {
      const payload = {
        object: "page",
        entry: [
          {
            id: "PAGE_ID_12345",
            time: 1700000000000,
            messaging: [
              {
                sender: { id: "PSID_USER_99" },
                recipient: { id: "PAGE_ID_12345" },
                timestamp: 1700000000000,
                message: {
                  mid: "m_mid_messenger_12345",
                  text: "Hello from Facebook Messenger",
                  is_echo: false,
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
      expect(msg?.externalMessageId).toBe("m_mid_messenger_12345");
      expect(msg?.channelType).toBe("messenger");
      expect(msg?.channelAccountId).toBe("PAGE_ID_12345");
      expect(msg?.externalSenderId).toBe("PSID_USER_99");
      expect(msg?.text).toBe("Hello from Facebook Messenger");
      expect(msg?.attachments).toEqual([]);
      expect(new Date(msg?.timestamp ?? "").getTime()).not.toBeNaN();
      expect(msg?.eventKind).toBe("message");
      expect(msg?.isEcho).toBe(false);
    });

    it("Normalization: Messenger image attachment maps into CanonicalMessage", () => {
      const payload = {
        object: "page",
        entry: [
          {
            id: "PAGE_ID_12345",
            messaging: [
              {
                sender: { id: "PSID_USER_99" },
                recipient: { id: "PAGE_ID_12345" },
                timestamp: 1700000000000,
                message: {
                  mid: "m_img_123",
                  attachments: [
                    {
                      type: "image",
                      payload: {
                        url: "https://cdn.facebook.com/messenger/image.png",
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
      expect(msg?.externalMessageId).toBe("m_img_123");
      expect(msg?.text).toBeNull();
      expect(msg?.attachments).toHaveLength(1);
      expect(msg?.attachments[0]).toEqual({
        type: "image",
        providerUrl: "https://cdn.facebook.com/messenger/image.png",
        url: "https://cdn.facebook.com/messenger/image.png",
      });
    });

    it("Normalization: Messenger delivery and read receipts map properly", () => {
      const payload = {
        object: "page",
        entry: [
          {
            id: "PAGE_1",
            messaging: [
              {
                sender: { id: "PSID_1" },
                recipient: { id: "PAGE_1" },
                timestamp: 1700000000000,
                delivery: {
                  mids: ["m_mid_delivered_1"],
                  watermark: 1700000000000,
                },
              },
              {
                sender: { id: "PSID_1" },
                recipient: { id: "PAGE_1" },
                timestamp: 1700000000001,
                read: {
                  watermark: 1700000000001,
                },
              },
            ],
          },
        ],
      };

      const result = adapter.mapInbound(payload);
      expect(result).toHaveLength(2);
      expect(result[0]?.eventKind).toBe("delivery");
      expect(result[0]?.externalMessageId).toBe("m_mid_delivered_1");
      expect(result[1]?.eventKind).toBe("read");
      expect(result[1]?.externalMessageId).toBe("read_1700000000001");
    });

    it("Normalization: Messenger echo messages properly assign page ID to externalAccountId and customer to platformUserId", () => {
      const payload = {
        object: "page",
        entry: [
          {
            id: "PAGE_123",
            messaging: [
              {
                sender: { id: "PAGE_123" }, // sender is the page for echoes
                recipient: { id: "PSID_USER_456" }, // recipient is the customer
                timestamp: 1700000000000,
                message: {
                  mid: "echo_messenger_mid_1",
                  text: "Agent reply sent from page",
                  is_echo: true,
                },
              },
            ],
          },
        ],
      };

      const result = adapter.mapInbound(payload);
      expect(result).toHaveLength(1);
      const msg = result[0];
      expect(msg?.isEcho).toBe(true);
      expect(msg?.externalAccountId).toBe("PAGE_123");
      expect(msg?.platformUserId).toBe("PSID_USER_456");
      expect(msg?.text).toBe("Agent reply sent from page");
    });

    it("Malformed Resilience: Malformed provider JSON is flagged without crashing background worker.", () => {
      expect(adapter.mapInbound(null)).toEqual([]);
      expect(adapter.mapInbound(undefined)).toEqual([]);
      expect(adapter.mapInbound("string-val")).toEqual([]);
      expect(adapter.mapInbound({})).toEqual([]);
      expect(adapter.mapInbound({ entry: 123 })).toEqual([]);
      expect(adapter.mapInbound({ entry: [{ messaging: false }] })).toEqual([]);
      expect(
        adapter.mapInbound({
          entry: [
            {
              messaging: [null, { unexpected: "payload" }],
            },
          ],
        }),
      ).toEqual([]);
    });
  });

  describe("send", () => {
    it("Fails safely when token is missing", async () => {
      const result = await adapter.send(
        {
          channel: "messenger",
          recipientPlatformUserId: "PSID_123",
          text: "Hello",
        },
        "",
      );

      expect(result.ok).toBe(false);
      expect(result.message).toContain("Missing access token");
    });
  });
});
