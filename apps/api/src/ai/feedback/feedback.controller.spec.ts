import { BadRequestException, ForbiddenException, NotFoundException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { PrismaClient } from "@prisma/client";

import { PERMISSIONS_KEY, RequirePermission } from "../../platform/security/permissions";
import { PermissionsGuard } from "../../platform/security/permissions.guard";
import type { AuthenticatedUser } from "../../platform/security/tenant.guard";
import { FeedbackController } from "./feedback.controller";
import { FeedbackService } from "./feedback.service";

describe("AI message feedback API & quality ratings (T-OBS-02)", () => {
  let service: FeedbackService;
  let controller: FeedbackController;
  let prismaMock: {
    message: {
      findFirst: jest.Mock;
    };
    aiFeedback: {
      upsert: jest.Mock;
      findMany: jest.Mock;
      groupBy: jest.Mock;
    };
    businessMember: {
      findFirst: jest.Mock;
      findMany: jest.Mock;
    };
  };

  const businessId = "11111111-1111-4111-a111-111111111111";
  const otherBusinessId = "99999999-9999-4999-a999-999999999999";
  const userId = "user-staff-1";
  const messageId = "33333333-3333-4333-a333-333333333333";
  const feedbackId = "55555555-5555-4555-a555-555555555555";
  const promptVersionId = "77777777-7777-4777-a777-777777777777";
  const now = new Date("2026-08-29T12:00:00Z");

  const mockUser: AuthenticatedUser = {
    id: userId,
    sub: userId,
    email: "rep@example.com",
    role: "employee",
    businessId,
  };

  beforeEach(() => {
    prismaMock = {
      message: {
        findFirst: jest.fn(),
      },
      aiFeedback: {
        upsert: jest.fn(),
        findMany: jest.fn(),
        groupBy: jest.fn(),
      },
      businessMember: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
      },
    };

    service = new FeedbackService(prismaMock as unknown as PrismaClient);
    controller = new FeedbackController(service);
  });

  describe("1. Feedback Submission (POST /messages/:id/feedback)", () => {
    it("Feedback Submission: Records feedback and updates satisfaction metrics.", async () => {
      // Setup AI message in database
      prismaMock.message.findFirst.mockResolvedValue({
        id: messageId,
        business_id: businessId,
        sender_type: "ai",
        content: "Voici les informations sur nos robes disponibles en taille M.",
        ai_metadata: { prompt_version_id: "pv-123", model: "gemini-3.5-flash" },
      });

      prismaMock.aiFeedback.upsert.mockResolvedValue({
        id: feedbackId,
        business_id: businessId,
        message_id: messageId,
        user_id: userId,
        rating: "positive",
        reason: null,
        comment: "Excellente réponse rapide",
        created_at: now,
      });

      const result = await controller.submitFeedback(businessId, mockUser, messageId, {
        rating: "THUMBS_UP",
        comment: "Excellente réponse rapide",
      });

      expect(prismaMock.message.findFirst).toHaveBeenCalledWith({
        where: { id: messageId, business_id: businessId },
      });

      expect(prismaMock.aiFeedback.upsert).toHaveBeenCalledWith({
        where: {
          business_id_message_id_user_id: {
            business_id: businessId,
            message_id: messageId,
            user_id: userId,
          },
        },
        create: {
          business_id: businessId,
          message_id: messageId,
          user_id: userId,
          rating: "positive",
          reason: null,
          comment: "Excellente réponse rapide",
        },
        update: {
          rating: "positive",
          reason: null,
          comment: "Excellente réponse rapide",
        },
      });

      expect(result.id).toBe(feedbackId);
      expect(result.rating).toBe("positive");
      expect(result.promptVersionId).toBe(null);
    });

    it("Invariant: Negative rating (THUMBS_DOWN) requires structured reason code", async () => {
      prismaMock.message.findFirst.mockResolvedValue({
        id: messageId,
        business_id: businessId,
        sender_type: "ai",
        content: "Mauvaise information",
        ai_metadata: { prompt_version_id: "pv-1" },
      });

      // Missing reason should throw BadRequestException
      await expect(
        controller.submitFeedback(businessId, mockUser, messageId, {
          rating: "THUMBS_DOWN",
        }),
      ).rejects.toThrow(BadRequestException);

      await expect(
        controller.submitFeedback(businessId, mockUser, messageId, {
          rating: "negative",
        }),
      ).rejects.toThrow(BadRequestException);

      // With structured reason code, succeeds
      prismaMock.aiFeedback.upsert.mockResolvedValue({
        id: feedbackId,
        business_id: businessId,
        message_id: messageId,
        user_id: userId,
        rating: "negative",
        reason: "wrong_product",
        comment: "Le modèle a confondu la couleur",
        created_at: now,
      });

      const validResult = await controller.submitFeedback(businessId, mockUser, messageId, {
        rating: "THUMBS_DOWN",
        reason: "wrong_product",
        comment: "Le modèle a confondu la couleur",
      });

      expect(validResult.rating).toBe("negative");
      expect(validResult.reason).toBe("wrong_product");
    });

    it("FR-OBS-006: Feedback on non-AI messages is rejected with 400 Bad Request", async () => {
      // Customer message (not AI)
      prismaMock.message.findFirst.mockResolvedValue({
        id: messageId,
        business_id: businessId,
        sender_type: "customer",
        content: "Bonjour, avez-vous du stock ?",
        ai_metadata: null,
      });

      await expect(
        controller.submitFeedback(businessId, mockUser, messageId, {
          rating: "THUMBS_UP",
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it("FR-OBS-006: a human message carrying ai_metadata is still not AI-authored", async () => {
      // A rep who edited and sent an AI draft leaves `ai_metadata` behind on a
      // `human` message. Rating it would attribute the staff edit to the model.
      prismaMock.message.findFirst.mockResolvedValue({
        id: messageId,
        business_id: businessId,
        sender_type: "human",
        content: "Réponse corrigée par le vendeur",
        ai_metadata: { prompt_version_id: promptVersionId, model: "gemini-3.5-flash" },
      });

      await expect(
        controller.submitFeedback(businessId, mockUser, messageId, {
          rating: "THUMBS_UP",
        }),
      ).rejects.toThrow(BadRequestException);
      expect(prismaMock.aiFeedback.upsert).not.toHaveBeenCalled();
    });

    it("rejects contradictory positive feedback supplying a reason code with 400", async () => {
      prismaMock.message.findFirst.mockResolvedValue({
        id: messageId,
        business_id: businessId,
        sender_type: "ai",
        content: "Réponse correcte",
        ai_metadata: null,
      });

      await expect(
        controller.submitFeedback(businessId, mockUser, messageId, {
          rating: "positive",
          reason: "wrong_tone",
        }),
      ).rejects.toThrow(BadRequestException);

      await expect(
        controller.submitFeedback(businessId, mockUser, messageId, {
          rating: "THUMBS_UP",
          reason: "hallucination",
        }),
      ).rejects.toThrow(BadRequestException);

      expect(prismaMock.aiFeedback.upsert).not.toHaveBeenCalled();
    });

    it("rejects feedback for non-existent message or foreign tenant with 404", async () => {
      prismaMock.message.findFirst.mockResolvedValue(null);

      await expect(
        controller.submitFeedback(otherBusinessId, mockUser, messageId, {
          rating: "THUMBS_UP",
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it("rejects non-UUID messageId with 400 Bad Request", async () => {
      await expect(
        controller.submitFeedback(businessId, mockUser, "not-a-uuid", {
          rating: "THUMBS_UP",
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it("redacts credit card PANs in feedback comment and messageContent on read/write", async () => {
      prismaMock.message.findFirst.mockResolvedValue({
        id: messageId,
        business_id: businessId,
        sender_type: "ai",
        content: "Paid with 4111 1111 1111 1111 on file",
        ai_metadata: { prompt_version_id: promptVersionId },
      });

      prismaMock.aiFeedback.upsert.mockResolvedValue({
        id: feedbackId,
        business_id: businessId,
        message_id: messageId,
        user_id: userId,
        rating: "positive",
        reason: null,
        comment: "Card 4111 1111 1111 1111 worked",
        created_at: now,
      });

      const result = await controller.submitFeedback(businessId, mockUser, messageId, {
        rating: "THUMBS_UP",
        comment: "Card 4111 1111 1111 1111 worked",
      });

      expect(result.comment).toBe("Card [REDACTED_PAN] worked");
      expect(result.messageContent).toBe("Paid with [REDACTED_PAN] on file");
    });
  });

  describe("2. Aggregate Satisfaction Metrics (GET /ai/feedback)", () => {
    it("returns aggregate satisfaction rate and reason distribution", async () => {
      // Counts come from a single DB aggregate, not an in-memory row scan.
      prismaMock.aiFeedback.groupBy.mockResolvedValue([
        { rating: "positive", reason: null, _count: { _all: 3 } },
        { rating: "negative", reason: "wrong_product", _count: { _all: 1 } },
        { rating: "negative", reason: "hallucination", _count: { _all: 1 } },
        { rating: "negative", reason: "missing_information", _count: { _all: 1 } },
        { rating: "negative", reason: "incorrect_policy", _count: { _all: 1 } },
        { rating: "negative", reason: "wrong_tone", _count: { _all: 1 } },
        { rating: "negative", reason: "other", _count: { _all: 1 } },
        { rating: "negative", reason: null, _count: { _all: 1 } }, // legacy nullable reason
      ]);
      prismaMock.aiFeedback.findMany.mockResolvedValue([
        {
          id: feedbackId,
          business_id: businessId,
          message_id: messageId,
          user_id: userId,
          rating: "positive",
          reason: null,
          comment: "Top",
          created_at: now,
          message: {
            content: "AI reply content",
            ai_metadata: { prompt_version_id: promptVersionId },
          },
        },
      ]);

      const metrics = await controller.getFeedbackMetrics(businessId, {});

      expect(metrics.totalFeedback).toBe(10);
      expect(metrics.positiveCount).toBe(3);
      expect(metrics.negativeCount).toBe(7);
      expect(metrics.satisfactionRate).toBe(30); // 3 / 10 = 30%
      expect(metrics.reasonsBreakdown.wrong_product).toBe(1);
      expect(metrics.reasonsBreakdown.hallucination).toBe(1);
      expect(metrics.reasonsBreakdown.missing_information).toBe(1);
      expect(metrics.reasonsBreakdown.incorrect_policy).toBe(1);
      expect(metrics.reasonsBreakdown.wrong_tone).toBe(1);
      expect(metrics.reasonsBreakdown.other).toBe(1);
      expect(metrics.items).toHaveLength(1);
      expect(metrics.items[0]?.promptVersionId).toBe(promptVersionId);
    });

    it("fails loudly if corrupted feedback rating exists in the database", async () => {
      prismaMock.aiFeedback.groupBy.mockResolvedValue([
        { rating: "corrupted_rating" as any, reason: null, _count: { _all: 2 } },
      ]);
      prismaMock.aiFeedback.findMany.mockResolvedValue([]);

      await expect(controller.getFeedbackMetrics(businessId, {})).rejects.toThrow(
        /Corrupted feedback rating/,
      );
    });

    it("aggregates without loading matching rows into memory", async () => {
      prismaMock.aiFeedback.groupBy.mockResolvedValue([]);
      prismaMock.aiFeedback.findMany.mockResolvedValue([]);

      await controller.getFeedbackMetrics(businessId, {});

      expect(prismaMock.aiFeedback.groupBy).toHaveBeenCalledWith(
        expect.objectContaining({
          by: ["rating", "reason"],
          _count: { _all: true },
        }),
      );
      // Exactly one `findMany`: the paginated page. No unbounded count scan.
      expect(prismaMock.aiFeedback.findMany).toHaveBeenCalledTimes(1);
    });

    it("paginates on a unique compound ordering so ties cannot skip rows", async () => {
      prismaMock.aiFeedback.groupBy.mockResolvedValue([]);
      prismaMock.aiFeedback.findMany.mockResolvedValue([]);

      await controller.getFeedbackMetrics(businessId, { cursor: feedbackId, limit: 10 });

      expect(prismaMock.aiFeedback.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: [{ created_at: "desc" }, { id: "desc" }],
          cursor: { id: feedbackId },
          skip: 1,
          take: 11,
        }),
      );
    });

    it("filters feedback metrics by prompt_version_id in where clause", async () => {
      prismaMock.aiFeedback.groupBy.mockResolvedValue([]);
      prismaMock.aiFeedback.findMany.mockResolvedValue([]);

      await controller.getFeedbackMetrics(businessId, { prompt_version_id: promptVersionId });

      expect(prismaMock.aiFeedback.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            business_id: businessId,
            message: {
              is: {
                ai_metadata: {
                  path: ["prompt_version_id"],
                  equals: promptVersionId,
                },
              },
            },
          }),
        }),
      );
    });

    it("rejects malformed query parameters and invalid date ranges with 400", async () => {
      prismaMock.aiFeedback.groupBy.mockResolvedValue([]);
      prismaMock.aiFeedback.findMany.mockResolvedValue([]);

      // Unknown enum member would otherwise reach Prisma as an invalid `reason`.
      await expect(
        controller.getFeedbackMetrics(businessId, { reason: "not_a_reason" }),
      ).rejects.toThrow(BadRequestException);

      // `new Date("nonsense")` produced an Invalid Date in the filter.
      await expect(controller.getFeedbackMetrics(businessId, { from: "nonsense" })).rejects.toThrow(
        BadRequestException,
      );

      // `from > to` date range violation
      await expect(
        controller.getFeedbackMetrics(businessId, {
          from: "2026-08-30T00:00:00.000Z",
          to: "2026-08-20T00:00:00.000Z",
        }),
      ).rejects.toThrow(BadRequestException);

      // `Number.parseInt("abc", 10)` is NaN, which propagated into `take`.
      await expect(controller.getFeedbackMetrics(businessId, { limit: "abc" })).rejects.toThrow(
        BadRequestException,
      );

      await expect(
        controller.getFeedbackMetrics(businessId, { prompt_version_id: "not-a-uuid" }),
      ).rejects.toThrow(BadRequestException);

      // Unknown query param rejected by .strict()
      await expect(
        controller.getFeedbackMetrics(businessId, { unknown_param: "test" } as any),
      ).rejects.toThrow(BadRequestException);

      expect(prismaMock.aiFeedback.findMany).not.toHaveBeenCalled();
    });

    it("translates Prisma cursor P2025 error to 400 Bad Request", async () => {
      prismaMock.aiFeedback.groupBy.mockResolvedValue([]);
      const prismaError = new Error("Record to use for cursor not found");
      (prismaError as any).code = "P2025";
      prismaMock.aiFeedback.findMany.mockRejectedValue(prismaError);

      await expect(
        controller.getFeedbackMetrics(businessId, { cursor: feedbackId }),
      ).rejects.toThrow(BadRequestException);
    });

    it("reports a fixed reason key set regardless of stored values", async () => {
      prismaMock.aiFeedback.groupBy.mockResolvedValue([
        { rating: "negative", reason: "other", _count: { _all: 2 } },
      ]);
      prismaMock.aiFeedback.findMany.mockResolvedValue([]);

      const metrics = await controller.getFeedbackMetrics(businessId, {});

      expect(Object.keys(metrics.reasonsBreakdown).sort()).toEqual([
        "hallucination",
        "incorrect_policy",
        "missing_information",
        "other",
        "wrong_product",
        "wrong_tone",
      ]);
      expect(metrics.reasonsBreakdown.other).toBe(2);
    });
  });

  describe("3. RBAC & Security Guardrails", () => {
    it("verifies controller endpoint permissions", () => {
      const submitHandler = Reflect.get(FeedbackController.prototype, "submitFeedback") as object;
      const submitPerm = Reflect.getMetadata(PERMISSIONS_KEY, submitHandler);
      expect(submitPerm).toEqual(["inbox.write"]);

      const metricsHandler = Reflect.get(
        FeedbackController.prototype,
        "getFeedbackMetrics",
      ) as object;
      const metricsPerm = Reflect.getMetadata(PERMISSIONS_KEY, metricsHandler);
      expect(metricsPerm).toEqual(["ai.configure"]);
    });

    it("Employee Access: Employee can submit feedback (inbox.write) but receives 403 on metrics (ai.configure)", async () => {
      const reflector = new Reflector();
      const guard = new PermissionsGuard(reflector, prismaMock as unknown as PrismaClient);

      // 1. Submit endpoint check
      const submitHandler = () => undefined;
      RequirePermission("inbox.write")(submitHandler);

      const employeeReq = {
        membership: {
          role: {
            name: "employee",
            role_permissions: [],
          },
        },
      };

      const submitContext = {
        switchToHttp: () => ({
          getRequest: () => employeeReq,
          getResponse: () => ({}),
          getNext: () => ({}),
        }),
        getHandler: () => submitHandler,
        getClass: () => FeedbackController,
      } as any;

      expect(await guard.canActivate(submitContext)).toBe(true);

      // 2. Metrics endpoint check (ai.configure)
      const metricsHandler = () => undefined;
      RequirePermission("ai.configure")(metricsHandler);

      const metricsContext = {
        switchToHttp: () => ({
          getRequest: () => employeeReq,
          getResponse: () => ({}),
          getNext: () => ({}),
        }),
        getHandler: () => metricsHandler,
        getClass: () => FeedbackController,
      } as any;

      await expect(guard.canActivate(metricsContext)).rejects.toThrow(ForbiddenException);
    });

    it("Owner/Admin Access: Admin and Owner can view aggregate satisfaction metrics", async () => {
      const reflector = new Reflector();
      const guard = new PermissionsGuard(reflector, prismaMock as unknown as PrismaClient);

      const metricsHandler = () => undefined;
      RequirePermission("ai.configure")(metricsHandler);

      const adminReq = {
        membership: {
          role: {
            name: "admin",
            role_permissions: [],
          },
        },
      };

      const adminContext = {
        switchToHttp: () => ({
          getRequest: () => adminReq,
          getResponse: () => ({}),
          getNext: () => ({}),
        }),
        getHandler: () => metricsHandler,
        getClass: () => FeedbackController,
      } as any;

      expect(await guard.canActivate(adminContext)).toBe(true);
    });
  });
});
