import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";

import {
  type ConfirmConversationOrderDto,
  type CreateDraftOrderDto,
  type CreateOrderDto,
  type ListOrdersQueryDto,
  type OrderResponse,
  type PaginatedOrdersResponse,
  type PaymentStatus,
  type UpdateOrderStatusDto,
  ConfirmConversationOrderSchema,
} from "@app/shared";

import { toValidationException } from "../../platform/core/errors";
import { RequirePermission } from "../../platform/security/permissions";
import { PermissionsGuard } from "../../platform/security/permissions.guard";
import {
  type AuthenticatedUser,
  CurrentBusinessId,
  CurrentUser,
  TenantGuard,
} from "../../platform/security/tenant.guard";
import { resolveIdempotencyKey } from "../dto/create-order.dto";
import { OrdersService, assertUuid } from "./orders.service";

/**
 * Orders & Conversation Order Drafts API (13 §8, 13 §6.2, T-ORD-01, T-ORD-04)
 *
 * Route Table:
 * - POST  /api/v1/orders, /orders -> Manual order creation (FR-ORD-003)
 * - POST  /api/v1/conversations/:id/orders/draft, /conversations/:id/orders/draft -> Draft order from conversation drawer (T-ORD-04)
 * - POST  /api/v1/conversations/:id/confirm-order, /conversations/:id/confirm-order -> Conversation order confirmation alias (13 §6.2)
 * - GET   /api/v1/orders, /orders -> List orders with cursor pagination and status/date filtering (13 §8)
 * - GET   /api/v1/orders/:id, /orders/:id -> Single order detail (13 §8)
 * - PATCH /api/v1/orders/:id/status, /orders/:id/status -> Canonical status updater (13 §8)
 */
@Controller()
@UseGuards(TenantGuard, PermissionsGuard)
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  /**
   * 13 §8 POST /api/v1/orders
   * Manual create order (FR-ORD-003).
   */
  @Post(["api/v1/orders", "orders"])
  @HttpCode(HttpStatus.CREATED)
  @RequirePermission("orders.write")
  async createOrder(
    @CurrentBusinessId() businessId: string,
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Body() body: CreateOrderDto,
    @Headers("idempotency-key") idempotencyKey?: string,
    @Headers("x-idempotency-key") xIdempotencyKey?: string,
  ): Promise<OrderResponse> {
    const key = resolveIdempotencyKey(idempotencyKey || xIdempotencyKey, body.idempotencyKey);
    return this.ordersService.createOrder(businessId, user?.id ?? user?.sub, body, "user", key);
  }

  /**
   * Technical Contract: POST /conversations/:id/orders/draft (T-ORD-04)
   * Creates draft order linked to conversation, places stock hold, returns order summary.
   */
  @Post(["api/v1/conversations/:id/orders/draft", "conversations/:id/orders/draft"])
  @HttpCode(HttpStatus.CREATED)
  @RequirePermission("orders.write")
  async createDraftOrder(
    @CurrentBusinessId() businessId: string,
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Param("id") conversationId: string,
    @Body() body: CreateDraftOrderDto,
    @Headers("idempotency-key") idempotencyKey?: string,
    @Headers("x-idempotency-key") xIdempotencyKey?: string,
  ): Promise<OrderResponse> {
    assertUuid(conversationId, "conversationId");
    const headerKey = idempotencyKey || xIdempotencyKey;
    return this.ordersService.createDraftOrder(
      businessId,
      conversationId,
      user?.id ?? user?.sub,
      body,
      headerKey,
    );
  }

  /**
   * 13 §6.2 POST /api/v1/conversations/:id/confirm-order
   * Alias: Resolves pending order via conversation_id + PENDING_CONFIRMATION.
   */
  @Post(["api/v1/conversations/:id/confirm-order", "conversations/:id/confirm-order"])
  @HttpCode(HttpStatus.OK)
  @RequirePermission("orders.write")
  async confirmConversationOrder(
    @CurrentBusinessId() businessId: string,
    @Param("id") conversationId: string,
    @Body() body?: ConfirmConversationOrderDto,
  ): Promise<OrderResponse> {
    assertUuid(conversationId, "conversationId");
    let paymentStatus: PaymentStatus | undefined;
    if (body && typeof body === "object" && Object.keys(body).length > 0) {
      const parsed = ConfirmConversationOrderSchema.safeParse(body);
      if (!parsed.success) {
        throw toValidationException(parsed.error);
      }
      paymentStatus = parsed.data.paymentStatus;
    }
    return this.ordersService.confirmConversationOrder(businessId, conversationId, paymentStatus);
  }

  /**
   * 13 §8 GET /api/v1/orders
   * List orders with filtering and pagination.
   */
  @Get(["api/v1/orders", "orders"])
  @RequirePermission("inbox.read")
  async listOrders(
    @CurrentBusinessId() businessId: string,
    @Query() query: ListOrdersQueryDto,
  ): Promise<PaginatedOrdersResponse> {
    return this.ordersService.listOrders(businessId, query);
  }

  /**
   * 13 §8 GET /api/v1/orders/:id
   * Get single order details.
   */
  @Get(["api/v1/orders/:id", "orders/:id"])
  @RequirePermission("inbox.read")
  async getOrder(
    @CurrentBusinessId() businessId: string,
    @Param("id") id: string,
  ): Promise<OrderResponse> {
    assertUuid(id, "orderId");
    return this.ordersService.getOrder(businessId, id);
  }

  /**
   * 13 §8 PATCH /api/v1/orders/:id/status
   * Canonical status updater.
   */
  @Patch(["api/v1/orders/:id/status", "orders/:id/status"])
  @HttpCode(HttpStatus.OK)
  @RequirePermission("orders.write")
  async updateOrderStatus(
    @CurrentBusinessId() businessId: string,
    @Param("id") id: string,
    @Body() body: UpdateOrderStatusDto,
  ): Promise<OrderResponse> {
    assertUuid(id, "orderId");
    return this.ordersService.updateOrderStatus(businessId, id, body);
  }
}
