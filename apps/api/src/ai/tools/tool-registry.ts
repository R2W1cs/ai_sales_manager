import { BadRequestException } from "@nestjs/common";

export type ToolCapability = "read" | "write" | "external_side_effect";
export type ExecutionMode = "inbound" | "suggest" | "playground";

export type RegisteredToolName =
  | "searchCatalog"
  | "checkStock"
  | "getStorePolicy"
  | "requestHumanHandoff"
  | "reserve_stock"
  | "create_pending_order"
  | "updateCustomer"
  | "adjustInventory"
  | "chargePayment"
  | "sendMessageLive";

export interface ToolDefinition {
  name: RegisteredToolName;
  aliases?: string[];
  capability: ToolCapability;
  description: string;
  allowedModes: ExecutionMode[];
}

/**
 * Authoritative Canonical Tool Registry
 * Strictly enforces tool execution capabilities across AI execution modes.
 * In `playground` and `suggest` modes, ONLY tools with capability "read" are allowed.
 */
export const TOOL_REGISTRY: Record<RegisteredToolName, ToolDefinition> = {
  // Read-only tools (allowed in all modes including sandbox/playground and copilot/suggest)
  searchCatalog: {
    name: "searchCatalog",
    aliases: ["catalog_search", "search_catalog"],
    capability: "read",
    description: "Search active product catalog and compute available inventory levels",
    allowedModes: ["inbound", "suggest", "playground"],
  },
  checkStock: {
    name: "checkStock",
    aliases: ["stock_check", "check_stock"],
    capability: "read",
    description: "Check variant/product stock availability and reservability",
    allowedModes: ["inbound", "suggest", "playground"],
  },
  getStorePolicy: {
    name: "getStorePolicy",
    aliases: ["policy_lookup", "get_store_policy"],
    capability: "read",
    description: "Look up store policies (delivery, returns, payments, hours)",
    allowedModes: ["inbound", "suggest", "playground"],
  },
  requestHumanHandoff: {
    name: "requestHumanHandoff",
    aliases: ["request_human_handoff", "handoff"],
    capability: "read",
    description: "Escalate conversation to human support queue without external mutations",
    allowedModes: ["inbound", "suggest", "playground"],
  },

  // Mutating / write tools (blocked in sandbox/playground and suggest modes)
  reserve_stock: {
    name: "reserve_stock",
    aliases: ["reserveStock", "stock_reservation"],
    capability: "write",
    description: "Create a temporary stock reservation holding inventory",
    allowedModes: ["inbound"],
  },
  create_pending_order: {
    name: "create_pending_order",
    aliases: ["createPendingOrder", "createOrder", "create_order"],
    capability: "write",
    description: "Create an order in pending confirmation state",
    allowedModes: ["inbound"],
  },
  updateCustomer: {
    name: "updateCustomer",
    aliases: ["update_customer", "modify_customer"],
    capability: "write",
    description: "Update customer identity, address, or lifecycle stage",
    allowedModes: ["inbound"],
  },
  adjustInventory: {
    name: "adjustInventory",
    aliases: ["adjust_inventory", "inventory_movement"],
    capability: "write",
    description: "Adjust inventory quantities or log inventory movements",
    allowedModes: ["inbound"],
  },

  // External side effect tools (strictly blocked in sandbox/playground and suggest modes)
  chargePayment: {
    name: "chargePayment",
    aliases: ["charge_payment", "process_payment"],
    capability: "external_side_effect",
    description: "Initiate payment gateway charge or generate payment links",
    allowedModes: ["inbound"],
  },
  sendMessageLive: {
    name: "sendMessageLive",
    aliases: ["send_message_live", "dispatch_outbound_external"],
    capability: "external_side_effect",
    description: "Send live outbound message directly over external channel API (Meta/WhatsApp)",
    allowedModes: ["inbound"],
  },
} satisfies Record<RegisteredToolName, ToolDefinition>;

/**
 * Validates registration invariants for tool capabilities and mode restrictions.
 */
function validateToolDefinition(tool: ToolDefinition): void {
  if (!["read", "write", "external_side_effect"].includes(tool.capability)) {
    throw new Error(`Tool '${tool.name}' has invalid capability '${tool.capability}'`);
  }
  if (tool.capability !== "read") {
    if (tool.allowedModes.includes("playground") || tool.allowedModes.includes("suggest")) {
      throw new Error(
        `Mutating/Side-effect tool '${tool.name}' (${tool.capability}) cannot allow playground or suggest modes`,
      );
    }
  }
}

/**
 * Fast lookup map index resolving canonical names and all registered aliases
 */
const RESOLVED_TOOL_MAP = new Map<string, ToolDefinition>();

for (const tool of Object.values(TOOL_REGISTRY)) {
  validateToolDefinition(tool);
  RESOLVED_TOOL_MAP.set(tool.name.toLowerCase(), tool);
  if (tool.aliases) {
    for (const alias of tool.aliases) {
      RESOLVED_TOOL_MAP.set(alias.toLowerCase(), tool);
    }
  }
}

/**
 * Resolves a tool definition by name or alias.
 */
export function resolveToolDefinition(toolName: string): ToolDefinition | undefined {
  return RESOLVED_TOOL_MAP.get(toolName.toLowerCase().trim());
}

/**
 * Central capability assertion boundary.
 * Throws BadRequestException if tool is mutating / side-effecting in read-only sandbox or copilot modes,
 * or if an unknown tool does not explicitly declare read capability (fail-closed policy).
 */
export function assertToolCapability(toolName: string, mode: ExecutionMode): void {
  const tool = resolveToolDefinition(toolName);

  if (!tool) {
    // Fail-closed policy for unregistered tools in restricted modes
    if (mode === "playground" || mode === "suggest") {
      throw new BadRequestException({
        error: {
          code: "tool_capability_violation",
          message: `Tool '${toolName}' is not registered as a read-only capability and is blocked in ${mode} mode`,
        },
      });
    }
    return;
  }

  if (
    !tool.allowedModes.includes(mode) ||
    ((mode === "playground" || mode === "suggest") && tool.capability !== "read")
  ) {
    throw new BadRequestException({
      error: {
        code: "tool_capability_violation",
        message: `Tool '${tool.name}' (capability: ${tool.capability}) is blocked in ${mode} mode to preserve sandbox read-only isolation`,
      },
    });
  }
}
