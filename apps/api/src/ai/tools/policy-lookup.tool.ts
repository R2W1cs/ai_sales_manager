import { Injectable, Optional } from "@nestjs/common";
import type { PrismaClient } from "@prisma/client";

import type {
  DeliveryRulePayload,
  PaymentRulePayload,
  ReturnsRulePayload,
  WorkingHoursPayload,
  DiscountRulePayload,
  FreeShippingPayload,
  MinOrderPayload,
} from "@app/shared";

import { prisma as defaultPrisma } from "../../lib/prisma";

export type PolicyType =
  | "delivery"
  | "payment"
  | "returns"
  | "working_hours"
  | "discount"
  | "min_order"
  | "free_shipping";

export interface PolicyLookupInput {
  type: PolicyType;
  region?: string;
}

export interface PolicyLookupOutput {
  ruleFound: boolean;
  type: PolicyType;
  payload: unknown;
  textSummary: string;
}

@Injectable()
export class PolicyLookupTool {
  private readonly prisma: PrismaClient;

  constructor(@Optional() prismaClient?: PrismaClient) {
    this.prisma = prismaClient ?? defaultPrisma;
  }

  async getStorePolicy(businessId: string, input: PolicyLookupInput): Promise<PolicyLookupOutput> {
    const ruleType = input.type;

    const rule = await this.prisma.businessRule.findFirst({
      where: {
        business_id: businessId,
        rule_type: ruleType,
        enabled: true,
      },
      orderBy: {
        priority: "desc",
      },
    });

    if (!rule?.payload) {
      return {
        ruleFound: false,
        type: input.type,
        payload: null,
        textSummary: `No specific policy configured for ${input.type}. Standard store terms apply.`,
      };
    }

    const payload = rule.payload;
    let textSummary: string;

    switch (input.type) {
      case "delivery": {
        const deliveryData = payload as DeliveryRulePayload;
        const zones = deliveryData.zones;
        if (input.region && zones.length > 0) {
          const regionLower = input.region.toLowerCase().trim();
          const matchedZone = zones.find(
            (z) =>
              z.name.toLowerCase().includes(regionLower) ||
              regionLower.includes(z.name.toLowerCase()),
          );
          if (matchedZone) {
            textSummary = `Delivery to ${matchedZone.name}: ${matchedZone.fee.toFixed(3)} ${matchedZone.currency} (Estimated time: ${matchedZone.eta_hours} hours).`;
          } else {
            const allZones = zones
              .map((z) => `${z.name}: ${z.fee.toFixed(3)} ${z.currency} (~${z.eta_hours}h)`)
              .join(", ");
            textSummary = `Delivery rates: ${allZones}.`;
          }
        } else if (zones.length > 0) {
          const allZones = zones
            .map((z) => `${z.name}: ${z.fee.toFixed(3)} ${z.currency} (~${z.eta_hours}h)`)
            .join(", ");
          textSummary = `Delivery rates: ${allZones}.`;
        } else {
          textSummary = "Standard nationwide delivery across Tunisia available.";
        }
        break;
      }

      case "payment": {
        const paymentData = payload as PaymentRulePayload;
        const methods = paymentData.methods;
        if (methods.length > 0) {
          textSummary = `Accepted payment methods: ${methods.map((m) => m.label).join(", ")}.`;
        } else {
          textSummary = "Accepted payment method: Cash on delivery (Paiement à la livraison).";
        }
        break;
      }

      case "returns": {
        const returnData = payload as ReturnsRulePayload;
        textSummary = `Return policy: ${returnData.window_days} days return window. Conditions: ${returnData.conditions || "Items must be in original condition with tags intact."}`;
        break;
      }

      case "working_hours": {
        const hoursData = payload as WorkingHoursPayload;
        textSummary = `Support working hours (${hoursData.timezone}): Representatives available during regular business hours. AI agent available 24/7.`;
        break;
      }

      case "discount": {
        const discountData = payload as DiscountRulePayload;
        if (discountData.ai_may_offer && discountData.max_percent !== null) {
          textSummary = `AI discount policy: AI authorized to offer up to ${discountData.max_percent}% promotional discount for hesitant buyers.`;
        } else {
          textSummary =
            "No unauthorized discounts. AI cannot create custom discounts outside official promotions.";
        }
        break;
      }

      case "free_shipping": {
        const freeShipData = payload as FreeShippingPayload;
        textSummary = `Free shipping available on orders above ${freeShipData.threshold.toFixed(3)} ${freeShipData.currency}.`;
        break;
      }

      case "min_order": {
        const minOrderData = payload as MinOrderPayload;
        textSummary = `Minimum order amount: ${minOrderData.amount.toFixed(3)} ${minOrderData.currency}.`;
        break;
      }
    }

    return {
      ruleFound: true,
      type: input.type,
      payload,
      textSummary,
    };
  }
}
