import { SetMetadata } from "@nestjs/common";

/**
 * 13 §2.11 Permission codes
 * Seed permissions.code with this closed list (12 §5.6).
 * 17 owns enforcement internals.
 * Merchant UI may label Employee Agent; the code stays employee.
 */
export const PERMISSION_CODES = [
  "billing.manage",
  "business.delete",
  "usage.read",
  "members.manage",
  "business.write",
  "integrations.manage",
  "catalog.write",
  "rules.write",
  "knowledge.write",
  "ai.configure",
  "ai.playground",
  "ai.traces.read",
  "flags.write",
  "customers.merge",
  "customers.export",
  "customers.erase",
  "audit.read",
  "analytics.read",
  "inbox.read",
  "inbox.write",
  "orders.write",
  "customers.write",
] as const;

export type PermissionCode = (typeof PERMISSION_CODES)[number];

const PERMISSION_CODE_SET = new Set<string>(PERMISSION_CODES);

export function isPermissionCode(value: unknown): value is PermissionCode {
  return typeof value === "string" && PERMISSION_CODE_SET.has(value);
}

export const ROLE_NAMES = ["owner", "admin", "employee"] as const;
export type RoleName = (typeof ROLE_NAMES)[number];

export function isRoleName(value: unknown): value is RoleName {
  return typeof value === "string" && (ROLE_NAMES as readonly string[]).includes(value);
}

/**
 * 13 §2.11 / 17 §5.1 System role-to-permission mapping
 * - Owner: all 22 permissions
 * - Admin: 19 permissions (all except billing.manage, business.delete, usage.read)
 * - Employee: 5 permissions (analytics.read, inbox.read, inbox.write, orders.write, customers.write)
 */
export const ROLE_PERMISSIONS: Record<RoleName, readonly PermissionCode[]> = {
  owner: PERMISSION_CODES,
  admin: [
    "members.manage",
    "business.write",
    "integrations.manage",
    "catalog.write",
    "rules.write",
    "knowledge.write",
    "ai.configure",
    "ai.playground",
    "ai.traces.read",
    "flags.write",
    "customers.merge",
    "customers.export",
    "customers.erase",
    "audit.read",
    "analytics.read",
    "inbox.read",
    "inbox.write",
    "orders.write",
    "customers.write",
  ],
  employee: ["analytics.read", "inbox.read", "inbox.write", "orders.write", "customers.write"],
};

export function getRolePermissions(
  role: "owner" | "admin" | "employee",
): readonly PermissionCode[] {
  return ROLE_PERMISSIONS[role];
}

export function hasPermission(
  grantedPermissions: Iterable<string>,
  required: PermissionCode,
): boolean {
  if (grantedPermissions instanceof Set) {
    return grantedPermissions.has(required);
  }
  for (const perm of grantedPermissions) {
    if (perm === required) return true;
  }
  return false;
}

export const PERMISSIONS_KEY = "permissions";

/**
 * 17 §5.1 @RequirePermission decorator
 * Attaches required permission code(s) to a route handler or controller class.
 */
export const RequirePermission = (...permissions: PermissionCode[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);

export const RequirePermissions = RequirePermission;
export const Permissions = RequirePermission;
