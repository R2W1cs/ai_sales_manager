import type { ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";

import type { PermissionCode, RoleName } from "../../src/platform/security/permissions";
import type {
  AuthenticatedSession,
  AuthenticatedUser,
  TenantRequest,
} from "../../src/platform/security/tenant.guard";

export const TENANT_A_ID = "11111111-1111-4111-8111-111111111111";
export const TENANT_B_ID = "22222222-2222-4222-8222-222222222222";

export const USER_OWNER_A: AuthenticatedUser = {
  id: "aaaaaaaa-1111-4111-8111-111111111111",
  sub: "aaaaaaaa-1111-4111-8111-111111111111",
  email: "owner-a@tenant-a.com",
  name: "Owner A",
  twoFactorEnabled: true,
};

export const USER_ADMIN_A: AuthenticatedUser = {
  id: "aaaaaaaa-2222-4222-8222-222222222222",
  sub: "aaaaaaaa-2222-4222-8222-222222222222",
  email: "admin-a@tenant-a.com",
  name: "Admin A",
  twoFactorEnabled: true,
};

export const USER_AGENT_A: AuthenticatedUser = {
  id: "aaaaaaaa-3333-4333-8333-333333333333",
  sub: "aaaaaaaa-3333-4333-8333-333333333333",
  email: "agent-a@tenant-a.com",
  name: "Agent A",
  twoFactorEnabled: false,
};

export const USER_OWNER_B: AuthenticatedUser = {
  id: "bbbbbbbb-1111-4111-8111-111111111111",
  sub: "bbbbbbbb-1111-4111-8111-111111111111",
  email: "owner-b@tenant-b.com",
  name: "Owner B",
  twoFactorEnabled: true,
};

// UUIDs belonging strictly to Tenant B for IDOR / cross-tenant injection simulations
export const TENANT_B_UUIDS = {
  conversationId: "bbbb0001-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  messageId: "bbbb0002-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  productId: "bbbb0003-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  variantId: "bbbb0004-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  categoryId: "bbbb0005-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  orderId: "bbbb0006-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  channelId: "bbbb0007-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  customerId: "bbbb0008-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  ruleId: "bbbb0009-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  documentId: "bbbb0010-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  promptId: "bbbb0011-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  invitationId: "bbbb0012-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  imageId: "bbbb0013-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
};

export interface MockSecurityContextOptions {
  user?: AuthenticatedUser;
  businessId?: string;
  role?: RoleName;
  headers?: Record<string, string>;
  params?: Record<string, string>;
  body?: unknown;
  query?: Record<string, string>;
  path?: string;
  method?: string;
  mfaVerified?: boolean;
  requiredPermissions?: PermissionCode[];
  grantedPermissions?: string[];
}

export function createMockSecurityContext(options: MockSecurityContextOptions = {}) {
  const user = options.user ?? USER_OWNER_A;
  const role = options.role ?? "owner";
  const businessId = options.businessId ?? TENANT_A_ID;
  const mfaVerified = options.mfaVerified ?? true;

  const session: AuthenticatedSession = {
    id: `sess-${user.id}`,
    mfaVerified,
    activeOrganizationId: businessId,
  };

  const req: Partial<TenantRequest> = {
    user,
    session,
    businessId,
    tenantId: businessId,
    headers: {
      "x-business-id": businessId,
      cookie: `better-auth.session_token=test-token-${user.id}`,
      ...options.headers,
    },
    params: options.params ?? {},
    query: options.query ?? {},
    body: options.body ?? {},
    method: options.method ?? "GET",
    url: options.path ?? "/api/v1/test",
    membership: {
      id: `mem-${user.id}`,
      user_id: user.id,
      business_id: businessId,
      role: {
        name: role,
        role_permissions: [],
      },
      permissions: options.grantedPermissions ?? [],
    },
  };

  const reflector = new Reflector();
  if (options.requiredPermissions) {
    jest.spyOn(reflector, "getAllAndOverride").mockReturnValue(options.requiredPermissions);
  }

  const context: ExecutionContext = {
    switchToHttp: () => ({
      getRequest: () => req as TenantRequest,
      getResponse: () => ({
        header: jest.fn(),
        status: jest.fn().mockReturnThis(),
        send: jest.fn(),
      }),
      getNext: () => jest.fn(),
    }),
    getHandler: () => ({}),
    getClass: () => class SecurityTestController {},
  } as unknown as ExecutionContext;

  return { context, req: req as TenantRequest, reflector };
}

export function createSecurityPrismaMock() {
  const state = {
    businesses: [
      { id: TENANT_A_ID, name: "Tenant A Boutique", deleted_at: null },
      { id: TENANT_B_ID, name: "Tenant B Store", deleted_at: null },
    ],
    members: [
      { id: "mem-owner-a", userId: USER_OWNER_A.id, organizationId: TENANT_A_ID, role: "owner" },
      { id: "mem-admin-a", userId: USER_ADMIN_A.id, organizationId: TENANT_A_ID, role: "admin" },
      { id: "mem-agent-a", userId: USER_AGENT_A.id, organizationId: TENANT_A_ID, role: "employee" },
      { id: "mem-owner-b", userId: USER_OWNER_B.id, organizationId: TENANT_B_ID, role: "owner" },
    ],
  };

  const prismaMock = {
    business: {
      findFirst: jest.fn().mockImplementation(({ where }) => {
        if (!where) return Promise.resolve(state.businesses[0]);
        const found = state.businesses.find((b) => {
          if (where.id && b.id !== where.id) return false;
          if (where.deleted_at === null && b.deleted_at !== null) return false;
          return true;
        });
        return Promise.resolve(found ?? null);
      }),
      findMany: jest.fn().mockResolvedValue(state.businesses),
      findUnique: jest.fn().mockImplementation(({ where }) => {
        const found = state.businesses.find((b) => b.id === where?.id);
        return Promise.resolve(found ?? null);
      }),
    },
    member: {
      findFirst: jest.fn().mockImplementation(({ where }) => {
        const found = state.members.find((m) => {
          if (where?.userId && m.userId !== where.userId) return false;
          if (where?.organizationId && m.organizationId !== where.organizationId) return false;
          return true;
        });
        return Promise.resolve(found ?? null);
      }),
      findMany: jest.fn().mockImplementation(({ where }) => {
        const results = state.members.filter((m) => {
          if (where?.userId && m.userId !== where.userId) return false;
          if (where?.organizationId && m.organizationId !== where.organizationId) return false;
          return true;
        });
        return Promise.resolve(results);
      }),
    },
    businessMember: {
      findFirst: jest.fn().mockImplementation(({ where }) => {
        const found = state.members.find((m) => {
          if (where?.user_id && m.userId !== where.user_id) return false;
          if (where?.business_id && m.organizationId !== where.business_id) return false;
          return true;
        });
        return Promise.resolve(found ? { ...found, role: { name: found.role } } : null);
      }),
      findMany: jest.fn().mockResolvedValue([]),
    },
  };

  return { prismaMock, state };
}
