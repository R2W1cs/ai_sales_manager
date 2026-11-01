import { MetaInstagramAdapter } from "../adapters/meta-instagram.adapter";
import { MetaMessengerAdapter } from "../adapters/meta-messenger.adapter";
import { MetaWhatsappAdapter } from "../adapters/meta-whatsapp.adapter";
import { NormalizerService } from "./normalizer.service";

describe("NormalizerService (T-INT-03)", () => {
  let service: NormalizerService;
  let instagramAdapter: MetaInstagramAdapter;
  let messengerAdapter: MetaMessengerAdapter;
  let whatsappAdapter: MetaWhatsappAdapter;
  const originalEnv = process.env.WHATSAPP_ENABLED;

  beforeEach(() => {
    process.env.WHATSAPP_ENABLED = "true";
    instagramAdapter = new MetaInstagramAdapter();
    messengerAdapter = new MetaMessengerAdapter();
    whatsappAdapter = new MetaWhatsappAdapter();
    service = new NormalizerService(instagramAdapter, messengerAdapter, whatsappAdapter);
  });

  afterAll(() => {
    process.env.WHATSAPP_ENABLED = originalEnv;
  });

  describe("Channel Detection and Normalization", () => {
    it("Normalization: Instagram, Messenger, and WhatsApp payloads map into identical CanonicalMessage interface.", () => {
      // 1. Instagram payload
      const igPayload = {
        object: "instagram",
        entry: [
          {
            id: "IG_ACCOUNT_1",
            messaging: [
              {
                sender: { id: "IG_SENDER_1" },
                recipient: { id: "IG_ACCOUNT_1" },
                timestamp: 1700000000000,
                message: {
                  mid: "mid_ig_123",
                  text: "Hello from IG",
                },
              },
            ],
          },
        ],
      };

      // 2. Messenger payload
      const messengerPayload = {
        object: "page",
        entry: [
          {
            id: "PAGE_1",
            messaging: [
              {
                sender: { id: "PSID_1" },
                recipient: { id: "PAGE_1" },
                timestamp: 1700000000000,
                message: {
                  mid: "mid_messenger_123",
                  text: "Hello from Messenger",
                },
              },
            ],
          },
        ],
      };

      // 3. WhatsApp payload
      const waPayload = {
        object: "whatsapp_business_account",
        entry: [
          {
            id: "WABA_1",
            changes: [
              {
                field: "messages",
                value: {
                  metadata: { phone_number_id: "PHONE_1" },
                  messages: [
                    {
                      from: "WA_SENDER_1",
                      id: "wamid.123",
                      timestamp: 1700000000,
                      type: "text",
                      text: { body: "Hello from WhatsApp" },
                    },
                  ],
                },
              },
            ],
          },
        ],
      };

      const igResult = service.normalize(igPayload);
      const messengerResult = service.normalize(messengerPayload);
      const waResult = service.normalize(waPayload);

      expect(igResult).toHaveLength(1);
      expect(messengerResult).toHaveLength(1);
      expect(waResult).toHaveLength(1);

      const igMsg = igResult[0];
      const messengerMsg = messengerResult[0];
      const waMsg = waResult[0];

      expect(igMsg).toBeDefined();
      expect(messengerMsg).toBeDefined();
      expect(waMsg).toBeDefined();

      if (!igMsg || !messengerMsg || !waMsg) {
        throw new Error("Expected all messages to be defined");
      }

      // Verify identical CanonicalMessage contract structure
      for (const msg of [igMsg, messengerMsg, waMsg]) {
        expect(typeof msg.externalMessageId).toBe("string");
        expect(["instagram", "messenger", "whatsapp"]).toContain(msg.channel);
        expect(["instagram", "messenger", "whatsapp"]).toContain(msg.channelType);
        expect(typeof msg.externalAccountId).toBe("string");
        expect(typeof msg.channelAccountId).toBe("string");
        expect(typeof msg.platformUserId).toBe("string");
        expect(typeof msg.externalSenderId).toBe("string");
        expect(typeof msg.text).toBe("string");
        expect(Array.isArray(msg.attachments)).toBe(true);
        expect(typeof msg.timestamp).toBe("string");
        expect(new Date(msg.timestamp).getTime()).not.toBeNaN();
        expect(msg.provider).toBe("meta");
      }

      expect(igMsg.channel).toBe("instagram");
      expect(igMsg.channelType).toBe("instagram");
      expect(igMsg.text).toBe("Hello from IG");

      expect(messengerMsg.channel).toBe("messenger");
      expect(messengerMsg.channelType).toBe("messenger");
      expect(messengerMsg.text).toBe("Hello from Messenger");

      expect(waMsg.channel).toBe("whatsapp");
      expect(waMsg.channelType).toBe("whatsapp");
      expect(waMsg.text).toBe("Hello from WhatsApp");
    });

    it("Routes based on explicit channel in context or payload", () => {
      const genericPayload = {
        sender: { id: "USER_1" },
        recipient: { id: "PAGE_1" },
        timestamp: 1700000000000,
        message: { mid: "mid_1", text: "Generic message" },
      };

      const result = service.normalize(genericPayload, { channel: "messenger" });
      expect(result).toHaveLength(1);
      expect(result[0]?.channelType).toBe("messenger");
      expect(result[0]?.text).toBe("Generic message");
    });

    it("normalizeSingle returns the first normalized message or null", () => {
      const igPayload = {
        object: "instagram",
        entry: [
          {
            id: "IG_1",
            messaging: [
              {
                sender: { id: "USER_1" },
                recipient: { id: "IG_1" },
                timestamp: 1700000000000,
                message: { mid: "mid_1", text: "First" },
              },
              {
                sender: { id: "USER_1" },
                recipient: { id: "IG_1" },
                timestamp: 1700000000001,
                message: { mid: "mid_2", text: "Second" },
              },
            ],
          },
        ],
      };

      const first = service.normalizeSingle(igPayload);
      expect(first).not.toBeNull();
      expect(first?.externalMessageId).toBe("mid_1");
      expect(first?.text).toBe("First");

      expect(service.normalizeSingle(null)).toBeNull();
    });
  });

  describe("Malformed Resilience", () => {
    it("Malformed Resilience: Malformed provider JSON is flagged without crashing background worker.", () => {
      expect(service.normalize(null)).toEqual([]);
      expect(service.normalize(undefined)).toEqual([]);
      expect(service.normalize("invalid-string")).toEqual([]);
      expect(service.normalize(12345)).toEqual([]);
      expect(service.normalize(true)).toEqual([]);
      expect(service.normalize({})).toEqual([]);
      expect(service.normalize({ object: "unknown_provider" })).toEqual([]);
      expect(service.normalize({ object: "page", entry: "corrupted" })).toEqual([]);
      expect(service.normalize({ object: "instagram", entry: [{ messaging: {} }] })).toEqual([]);
      expect(service.normalize({ object: "whatsapp_business_account", entry: null })).toEqual([]);
    });

    it("Handles adapter exceptions gracefully without throwing", () => {
      const brokenAdapter = {
        channel: "messenger" as const,
        mapInbound: jest.fn().mockImplementation(() => {
          throw new Error("Simulated adapter explosion");
        }),
        send: jest.fn(),
        outboundLimiter: { max: 20, durationMs: 1000 },
      };

      const customService = new NormalizerService(instagramAdapter, brokenAdapter, whatsappAdapter);

      const result = customService.normalize({
        object: "page",
        entry: [{ id: "1" }],
      });

      expect(result).toEqual([]);
    });
  });
});
