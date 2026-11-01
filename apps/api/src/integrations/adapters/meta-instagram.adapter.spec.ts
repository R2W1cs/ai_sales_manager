import { MetaInstagramAdapter } from "./meta-instagram.adapter";

describe("MetaInstagramAdapter (T-INT-03)", () => {
  let adapter: MetaInstagramAdapter;

  beforeEach(() => {
    adapter = new MetaInstagramAdapter();
  });

  describe("mapInbound", () => {
    it("Normalization: Instagram text message payload maps into CanonicalMessage", () => {
      const payload = {
        object: "instagram",
        entry: [
          {
            id: "IG_BIZ_ACC_123",
            time: 1700000000000,
            messaging: [
              {
                sender: { id: "IG_USER_456" },
                recipient: { id: "IG_BIZ_ACC_123" },
                timestamp: 1700000000000,
                message: {
                  mid: "aWdfbWlkXzEyMzQ1Njc4OTA",
                  text: "Hello from Instagram Direct",
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
      expect(msg?.externalMessageId).toBe("aWdfbWlkXzEyMzQ1Njc4OTA");
      expect(msg?.channelType).toBe("instagram");
      expect(msg?.channelAccountId).toBe("IG_BIZ_ACC_123");
      expect(msg?.externalSenderId).toBe("IG_USER_456");
      expect(msg?.text).toBe("Hello from Instagram Direct");
      expect(msg?.attachments).toEqual([]);
      expect(new Date(msg?.timestamp ?? "").getTime()).not.toBeNaN();
      expect(msg?.eventKind).toBe("message");
      expect(msg?.isEcho).toBe(false);
    });

    it("Normalization: Instagram image attachment maps into CanonicalMessage", () => {
      const payload = {
        object: "instagram",
        entry: [
          {
            id: "IG_BIZ_ACC_123",
            messaging: [
              {
                sender: { id: "IG_USER_456" },
                recipient: { id: "IG_BIZ_ACC_123" },
                timestamp: 1700000000000,
                message: {
                  mid: "mid_ig_img",
                  attachments: [
                    {
                      type: "image",
                      payload: {
                        url: "https://lookaside.fbsbx.com/ig_messaging_cdn/image.jpg",
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
      expect(msg?.externalMessageId).toBe("mid_ig_img");
      expect(msg?.text).toBeNull();
      expect(msg?.attachments).toHaveLength(1);
      expect(msg?.attachments[0]).toEqual({
        type: "image",
        providerUrl: "https://lookaside.fbsbx.com/ig_messaging_cdn/image.jpg",
        url: "https://lookaside.fbsbx.com/ig_messaging_cdn/image.jpg",
      });
    });

    it("Normalization: Instagram quick reply payload maps properly", () => {
      const payload = {
        object: "instagram",
        entry: [
          {
            id: "IG_BIZ_1",
            messaging: [
              {
                sender: { id: "USER_1" },
                recipient: { id: "IG_BIZ_1" },
                timestamp: 1700000000000,
                message: {
                  mid: "mid_qr",
                  text: "Selected Size",
                  quick_reply: {
                    payload: "SIZE_XL",
                  },
                },
              },
            ],
          },
        ],
      };

      const result = adapter.mapInbound(payload);
      expect(result).toHaveLength(1);
      expect(result[0]?.text).toBe("Selected Size");
    });

    it("Normalization: Instagram reactions and postbacks map appropriately", () => {
      const payload = {
        object: "instagram",
        entry: [
          {
            id: "IG_BIZ_1",
            messaging: [
              {
                sender: { id: "USER_1" },
                recipient: { id: "IG_BIZ_1" },
                timestamp: 1700000000000,
                reaction: {
                  mid: "mid_reacted_to",
                  action: "react",
                  emoji: "❤️",
                },
              },
              {
                sender: { id: "USER_1" },
                recipient: { id: "IG_BIZ_1" },
                timestamp: 1700000000001,
                postback: {
                  title: "View Catalog",
                  payload: "VIEW_CATALOG",
                },
              },
            ],
          },
        ],
      };

      const result = adapter.mapInbound(payload);
      expect(result).toHaveLength(2);
      expect(result[0]?.eventKind).toBe("other");
      expect(result[0]?.text).toBe("❤️");
      expect(result[1]?.eventKind).toBe("other");
      expect(result[1]?.text).toBe("View Catalog");
    });

    it("Normalization: Instagram echo messages properly assign page ID to externalAccountId and customer to platformUserId", () => {
      const payload = {
        object: "instagram",
        entry: [
          {
            id: "IG_PAGE_123",
            messaging: [
              {
                sender: { id: "IG_PAGE_123" }, // sender is the page for echoes
                recipient: { id: "IG_CUSTOMER_456" }, // recipient is the customer
                timestamp: 1700000000000,
                message: {
                  mid: "echo_mid_1",
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
      expect(msg?.externalAccountId).toBe("IG_PAGE_123");
      expect(msg?.platformUserId).toBe("IG_CUSTOMER_456");
      expect(msg?.text).toBe("Agent reply sent from page");
    });

    it("Malformed Resilience: Malformed provider JSON is flagged without crashing background worker.", () => {
      expect(adapter.mapInbound(null)).toEqual([]);
      expect(adapter.mapInbound(undefined)).toEqual([]);
      expect(adapter.mapInbound("random-string")).toEqual([]);
      expect(adapter.mapInbound({})).toEqual([]);
      expect(adapter.mapInbound({ entry: "invalid" })).toEqual([]);
      expect(adapter.mapInbound({ entry: [{ messaging: "not-array" }] })).toEqual([]);
      expect(
        adapter.mapInbound({
          entry: [
            {
              messaging: [null, undefined, { broken: true }],
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
          channel: "instagram",
          recipientPlatformUserId: "IG_USER_1",
          text: "Hello",
        },
        "",
      );

      expect(result.ok).toBe(false);
      expect(result.message).toContain("Missing access token");
    });
  });
});
