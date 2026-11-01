import type { ExecutionContext } from "@nestjs/common";

import { PipelineResponseSchema } from "@app/shared";

import { PipelineController } from "../../src/conversations/pipeline/pipeline.controller";
import { PipelineService } from "../../src/conversations/pipeline/pipeline.service";
import { PermissionsGuard } from "../../src/platform/security/permissions.guard";
import { TenantGuard } from "../../src/platform/security/tenant.guard";
import { startHttpApp, type HttpTestApp } from "./harness";

jest.mock("../../src/lib/queue.js", () => ({ connection: {} }));
jest.mock("../../src/lib/queue", () => ({ connection: {} }));

const validBusinessId = "11111111-1111-4111-a111-111111111111";

describe("Pipeline HTTP Surface & Routing Integration", () => {
  let harness: HttpTestApp;
  let mockPipelineService: {
    getPipeline: jest.Mock;
  };

  const samplePipelineResponse = {
    currency: "TND",
    columns: {
      new_leads: { count: 0, totalValue: 0, cards: [] },
      qualified: { count: 0, totalValue: 0, cards: [] },
      payment_pending: { count: 0, totalValue: 0, cards: [] },
      sold: { count: 0, totalValue: 0, cards: [] },
    },
  };

  beforeAll(async () => {
    mockPipelineService = {
      getPipeline: jest.fn().mockResolvedValue(samplePipelineResponse),
    };

    harness = await startHttpApp(
      {
        controllers: [PipelineController],
        providers: [
          {
            provide: PipelineService,
            useValue: mockPipelineService,
          },
        ],
      },
      (builder) => {
        return builder
          .overrideGuard(TenantGuard)
          .useValue({
            canActivate: (context: ExecutionContext) => {
              const req = context.switchToHttp().getRequest();
              const headerBiz = req.headers["x-business-id"];
              if (headerBiz === "unauthorized") {
                return false;
              }
              req.businessId = headerBiz ?? validBusinessId;
              return true;
            },
          })
          .overrideGuard(PermissionsGuard)
          .useValue({
            canActivate: (context: ExecutionContext) => {
              const req = context.switchToHttp().getRequest();
              if (req.headers["x-role"] === "no_inbox_read") {
                return false;
              }
              return true;
            },
          });
      },
    );
  });

  afterAll(async () => {
    await harness.close();
  });

  it("GET /api/v1/pipeline: returns 200 and serialized pipeline projection for authorized caller", async () => {
    const res = await harness.fetch("/api/v1/pipeline", {
      headers: {
        "x-business-id": validBusinessId,
      },
    });

    expect(res.status).toBe(200);
    const body = PipelineResponseSchema.parse(await res.json());
    expect(body.columns).toBeDefined();
    expect(mockPipelineService.getPipeline).toHaveBeenCalledWith(
      validBusinessId,
      expect.anything(),
    );
  });

  it("GET /pipeline: canonical dual path alias is reachable", async () => {
    const res = await harness.fetch("/pipeline", {
      headers: {
        "x-business-id": validBusinessId,
      },
    });

    expect(res.status).toBe(200);
    const body = PipelineResponseSchema.parse(await res.json());
    expect(body.columns).toBeDefined();
  });

  it("GET /api/v1/pipeline: rejects unauthorized request with 403 Forbidden", async () => {
    const res = await harness.fetch("/api/v1/pipeline", {
      headers: {
        "x-business-id": validBusinessId,
        "x-role": "no_inbox_read",
      },
    });

    expect(res.status).toBe(403);
  });
});
