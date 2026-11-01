import { NotFoundException } from "@nestjs/common";
import type { Job, Queue } from "bullmq";

import {
  LeadScoringProcessor,
  NIGHTLY_DECAY_JOB,
  SCORE_LEAD_JOB,
  type ScoreLeadJobData,
} from "./lead-scoring.processor";
import { FACTOR_WEIGHTS, LeadScoringService } from "./lead-scoring.service";

describe("Deterministic lead scoring engine & priority calculation (T-LEAD-01)", () => {
  let scoringService: LeadScoringService;
  let mockPrisma: any;

  beforeEach(() => {
    mockPrisma = {
      conversation: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
      },
      order: {
        findFirst: jest.fn(),
      },
      aiSettings: {
        findUnique: jest.fn(),
      },
    };

    scoringService = new LeadScoringService(mockPrisma);
  });

  describe("1. Deterministic Score & Factor Weights", () => {
    it("Deterministic Score: Verified factor inputs produce exact mathematical score.", () => {
      // Product inquiry (+15)
      const r1 = scoringService.computeScore({ product_inquiry: FACTOR_WEIGHTS.product_inquiry });
      expect(r1.score).toBe(15);
      expect(r1.temperature).toBe("cold");

      // Price question (+20) + Product inquiry (+15) = 35
      const r2 = scoringService.computeScore({
        product_inquiry: FACTOR_WEIGHTS.product_inquiry,
        price_question: FACTOR_WEIGHTS.price_question,
      });
      expect(r2.score).toBe(35);
      expect(r2.temperature).toBe("cold");

      // Product inquiry (+15) + Price question (+20) + Phone shared (+25) = 60 (WARM)
      const r3 = scoringService.computeScore({
        product_inquiry: 15,
        price_question: 20,
        phone_shared: 25,
      });
      expect(r3.score).toBe(60);
      expect(r3.temperature).toBe("warm");

      // Cart intent (+35) + Phone shared (+25) + Price question (+20) = 80 (HOT)
      const r4 = scoringService.computeScore({
        cart_intent: 35,
        phone_shared: 25,
        price_question: 20,
      });
      expect(r4.score).toBe(80);
      expect(r4.temperature).toBe("hot");

      // Negative sentiment (-20) reduces score
      const r5 = scoringService.computeScore({
        cart_intent: 35,
        phone_shared: 25,
        negative_sentiment: -20,
      });
      expect(r5.score).toBe(40);
      expect(r5.temperature).toBe("warm");
    });

    it("Clamps score strictly to [0, 100]", () => {
      // Exceeds 100
      const overflow = scoringService.computeScore({
        purchase_intent: 40,
        order_pending_confirmation: 30,
        phone_shared: 25,
        price_question: 20,
        vip_tag: 15,
      });
      expect(overflow.score).toBe(100);

      // Below 0
      const underflow = scoringService.computeScore({
        negative_sentiment: -20,
        inactive_48h: -20,
      });
      expect(underflow.score).toBe(0);
      expect(underflow.temperature).toBe("cold");
    });

    it("Computes scores accurately via computeScoreFromSignals helper", () => {
      const result = scoringService.computeScoreFromSignals({
        productInquiry: true,
        priceQuestion: true,
        phoneShared: true,
        cartIntent: true,
      });
      // 15 + 20 + 25 + 35 = 95
      expect(result.score).toBe(95);
      expect(result.temperature).toBe("hot");
      expect(result.factors).toEqual({
        product_inquiry: 15,
        price_question: 20,
        phone_shared: 25,
        cart_intent: 35,
      });
    });
  });

  describe("2. Temperature Pill & Thresholds", () => {
    it("Temperature Pill: Ranges accurately map to HOT, WARM, and COLD with default thresholds (70, 40).", () => {
      // Hot: >= 70
      expect(scoringService.getTemperature(100)).toBe("hot");
      expect(scoringService.getTemperature(70)).toBe("hot");

      // Warm: 40 - 69
      expect(scoringService.getTemperature(69)).toBe("warm");
      expect(scoringService.getTemperature(55)).toBe("warm");
      expect(scoringService.getTemperature(40)).toBe("warm");

      // Cold: < 40
      expect(scoringService.getTemperature(39)).toBe("cold");
      expect(scoringService.getTemperature(15)).toBe("cold");
      expect(scoringService.getTemperature(0)).toBe("cold");
    });

    it("Applies configurable per-business thresholds (FR-LEAD-005)", () => {
      const customHot = 80;
      const customWarm = 50;

      // With hotMin=80, warmMin=50:
      expect(scoringService.getTemperature(80, customHot, customWarm)).toBe("hot");
      expect(scoringService.getTemperature(79, customHot, customWarm)).toBe("warm");
      expect(scoringService.getTemperature(50, customHot, customWarm)).toBe("warm");
      expect(scoringService.getTemperature(49, customHot, customWarm)).toBe("cold");

      const result = scoringService.computeScore(
        { price_question: 20, cart_intent: 35, phone_shared: 20 },
        { hotMin: customHot, warmMin: customWarm },
      );
      // 20 + 35 + 20 = 75 -> warm (since < 80)
      expect(result.score).toBe(75);
      expect(result.temperature).toBe("warm");
    });
  });

  describe("3. Nightly Decay & Inactivity", () => {
    it("Nightly Decay: Inactive leads decay score by 10 points after 24h.", () => {
      const now = new Date("2026-08-22T12:00:00Z");
      const inactive25h = new Date("2026-08-21T11:00:00Z");
      const active10h = new Date("2026-08-22T02:00:00Z");

      // Inactive > 24h: decays 10 points
      const d1 = scoringService.calculateDecay(60, inactive25h, now);
      expect(d1.decayedScore).toBe(50);
      expect(d1.pointsDecayed).toBe(10);
      expect(d1.isDecayed).toBe(true);

      // Low score decays to 0, not negative
      const d2 = scoringService.calculateDecay(6, inactive25h, now);
      expect(d2.decayedScore).toBe(0);
      expect(d2.pointsDecayed).toBe(6);
      expect(d2.isDecayed).toBe(true);

      // Active < 24h: does not decay
      const d3 = scoringService.calculateDecay(60, active10h, now);
      expect(d3.decayedScore).toBe(60);
      expect(d3.pointsDecayed).toBe(0);
      expect(d3.isDecayed).toBe(false);

      // Null lastMessageAt: decays
      const d4 = scoringService.calculateDecay(50, null, now);
      expect(d4.decayedScore).toBe(40);
      expect(d4.pointsDecayed).toBe(10);
      expect(d4.isDecayed).toBe(true);
    });

    it("runNightlyDecay executes batch decay across inactive conversations", async () => {
      const inactiveDate = new Date(Date.now() - 30 * 60 * 60 * 1000);
      mockPrisma.conversation.findMany.mockResolvedValue([
        {
          id: "conv-1",
          business_id: "biz-1",
          lead_score: 50,
          lead_temperature: "warm",
          lead_score_factors: { price_question: 20, cart_intent: 30 },
          last_message_at: inactiveDate,
          business: {
            ai_settings: { lead_hot_min: 70, lead_warm_min: 40 },
          },
        },
        {
          id: "conv-2",
          business_id: "biz-1",
          lead_score: 8,
          lead_temperature: "cold",
          lead_score_factors: { product_inquiry: 8 },
          last_message_at: null,
          business: {
            ai_settings: { lead_hot_min: 70, lead_warm_min: 40 },
          },
        },
      ]);

      mockPrisma.conversation.update.mockResolvedValue({});

      const summary = await scoringService.runNightlyDecay("biz-1");

      expect(summary.processed).toBe(2);
      expect(summary.decayed).toBe(2);
      expect(mockPrisma.conversation.update).toHaveBeenCalledTimes(2);

      // Verify conv-1 decayed from 50 to 40 (warm)
      expect(mockPrisma.conversation.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "conv-1" },
          data: expect.objectContaining({
            lead_score: 40,
            lead_temperature: "warm",
            lead_score_factors: expect.objectContaining({
              inactivity_decay_24h: -10,
            }),
          }),
        }),
      );

      // Verify conv-2 decayed from 8 to 0 (cold)
      expect(mockPrisma.conversation.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "conv-2" },
          data: expect.objectContaining({
            lead_score: 0,
            lead_temperature: "cold",
            lead_score_factors: expect.objectContaining({
              inactivity_decay_24h: -8,
            }),
          }),
        }),
      );
    });
  });

  describe("4. Database Conversation Scoring & Multi-Tenancy", () => {
    const businessId = "biz-100";
    const conversationId = "conv-200";

    it("Enforces multi-tenant isolation by querying with business_id", async () => {
      mockPrisma.conversation.findFirst.mockResolvedValue(null);

      await expect(scoringService.scoreConversation(businessId, conversationId)).rejects.toThrow(
        NotFoundException,
      );

      expect(mockPrisma.conversation.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: conversationId, business_id: businessId },
        }),
      );
    });

    it("Resets lead score to 0 on RESOLVED conversation (FR-LEAD-006)", async () => {
      mockPrisma.conversation.findFirst.mockResolvedValue({
        id: conversationId,
        business_id: businessId,
        status: "RESOLVED",
        lead_score: 80,
      });
      mockPrisma.conversation.update.mockResolvedValue({});

      const result = await scoringService.scoreConversation(businessId, conversationId);

      expect(result.score).toBe(0);
      expect(result.temperature).toBe("cold");
      expect(result.factors).toEqual({});
      expect(mockPrisma.conversation.update).toHaveBeenCalledWith({
        where: { id: conversationId },
        data: {
          lead_score: 0,
          lead_temperature: "cold",
          lead_score_factors: {},
          lead_scored_at: expect.any(Date),
        },
      });
    });

    it("Recomputes score from intent, collected fields, and customer signals", async () => {
      mockPrisma.conversation.findFirst.mockResolvedValue({
        id: conversationId,
        business_id: businessId,
        status: "AI_ACTIVE",
        last_intent: "cart_intent",
        collected_fields: ["phone", "quantity"],
        last_message_at: new Date(Date.now() - 5 * 60 * 1000), // 5 min ago
        customer: {
          id: "cust-1",
          phone: "+21699112233",
          confirmed_order_count: 2,
          lifecycle_stage: "returning_customer",
          tags: [{ tag: "vip" }],
        },
      });

      mockPrisma.aiSettings.findUnique.mockResolvedValue({
        lead_hot_min: 80,
        lead_warm_min: 50,
      });

      mockPrisma.order.findFirst.mockResolvedValue({
        id: "order-1",
        status: "PENDING_CONFIRMATION",
      });

      mockPrisma.conversation.update.mockResolvedValue({});

      const result = await scoringService.scoreConversation(businessId, conversationId);

      // cart_intent (+35) + order_pending_confirmation (+30) + phone_shared (+25)
      // + bulk_quantity (+10) + returning_customer (+10) + vip_tag (+15) + recent_message (+5)
      // = 130 -> clamped to 100 (HOT)
      expect(result.score).toBe(100);
      expect(result.temperature).toBe("hot");
      expect(result.factors).toEqual({
        cart_intent: 35,
        order_pending_confirmation: 30,
        phone_shared: 25,
        bulk_quantity: 10,
        returning_customer: 10,
        vip_tag: 15,
        recent_message: 5,
      });
      expect(mockPrisma.conversation.update).toHaveBeenCalledWith({
        where: { id: conversationId },
        data: {
          lead_score: 100,
          lead_temperature: "hot",
          lead_score_factors: expect.any(Object),
          lead_scored_at: expect.any(Date),
        },
      });
    });
  });

  describe("5. BullMQ Processor & Worker", () => {
    let processor: LeadScoringProcessor;
    let mockQueue: jest.Mocked<Partial<Queue<ScoreLeadJobData>>>;

    beforeEach(() => {
      mockQueue = {
        add: jest.fn().mockResolvedValue({ id: "job-1" } as any),
        close: jest.fn().mockResolvedValue(undefined),
      };

      processor = new LeadScoringProcessor(
        scoringService,
        mockQueue as unknown as Queue<ScoreLeadJobData>,
      );
    });

    afterEach(async () => {
      await processor.onModuleDestroy();
    });

    it("enqueueScoreLead creates job with deterministic jobId and BullMQ exponential backoff", async () => {
      const businessId = "biz-1";
      const conversationId = "conv-1";

      const job = await processor.enqueueScoreLead(businessId, conversationId, "order_created");

      expect(job).toBeDefined();
      expect(mockQueue.add).toHaveBeenCalledWith(
        SCORE_LEAD_JOB,
        expect.objectContaining({
          type: "score",
          businessId,
          conversationId,
          trigger: "order_created",
        }),
        expect.objectContaining({
          jobId: expect.stringMatching(new RegExp(`^${conversationId}:score:order_created:`)),
          attempts: 3,
          backoff: {
            type: "exponential",
            delay: 5000,
          },
        }),
      );
    });

    it("enqueueNightlyDecay creates nightly decay job with deterministic date bucket", async () => {
      const job = await processor.enqueueNightlyDecay("biz-1");

      expect(job).toBeDefined();
      expect(mockQueue.add).toHaveBeenCalledWith(
        NIGHTLY_DECAY_JOB,
        expect.objectContaining({
          type: "decay",
          businessId: "biz-1",
        }),
        expect.objectContaining({
          jobId: expect.stringMatching(/^score_decay:nightly:\d{4}-\d{2}-\d{2}:biz-1$/),
          attempts: 3,
          backoff: {
            type: "exponential",
            delay: 5000,
          },
        }),
      );
    });

    it("processJob routes score_lead job to scoreConversation", async () => {
      const scoreSpy = jest.spyOn(scoringService, "scoreConversation").mockResolvedValue({
        score: 75,
        temperature: "hot",
        factors: { cart_intent: 35, phone_shared: 25, price_question: 15 },
      });

      const mockJob = {
        id: "job-1",
        name: SCORE_LEAD_JOB,
        data: {
          businessId: "biz-1",
          conversationId: "conv-1",
        },
      } as Job<ScoreLeadJobData>;

      const result = await processor.processJob(mockJob);

      expect(result.success).toBe(true);
      expect(result.score).toBe(75);
      expect(result.temperature).toBe("hot");
      expect(scoreSpy).toHaveBeenCalledWith("biz-1", "conv-1", undefined);
    });

    it("processJob routes nightly_decay job to runNightlyDecay", async () => {
      const decaySpy = jest.spyOn(scoringService, "runNightlyDecay").mockResolvedValue({
        processed: 10,
        decayed: 4,
      });

      const mockJob = {
        id: "job-2",
        name: NIGHTLY_DECAY_JOB,
        data: {
          type: "decay",
          businessId: "biz-1",
        },
      } as Job<ScoreLeadJobData>;

      const result = await processor.processJob(mockJob);

      expect(result.success).toBe(true);
      expect(result.processed).toBe(10);
      expect(result.decayed).toBe(4);
      expect(decaySpy).toHaveBeenCalledWith("biz-1");
    });
  });
});
