/* oxlint-disable */
import * as crypto from "node:crypto";

import type { PrismaClient } from "@prisma/client";
import * as argon2 from "argon2";

import { signJwt } from "../src/auth/core/auth.service";

export const TEST_BETTER_AUTH_SECRET = "test-access-secret-min-32-chars-long-xyz";

export interface MockDbState {
  users: Array<{
    id: string;
    email: string;
    name: string;
    password_hash: string | null;
    email_verified_at: Date | null;
    created_at: Date;
    updated_at: Date;
  }>;
  businesses: Array<{
    id: string;
    name: string;
    currency: string;
    timezone: string;
    created_at: Date;
    updated_at: Date;
    deleted_at: Date | null;
  }>;
  businessMembers: Array<{
    id: string;
    business_id: string;
    user_id: string;
    role_id: string;
    removed_at: Date | null;
    created_at: Date;
    business?: any;
    role?: any;
    user?: any;
  }>;
  roles: Array<{
    id: string;
    name: string;
    business_id: string | null;
    role_permissions?: Array<{
      id: string;
      role_id: string;
      permission_id: string;
      permission?: { id: string; code: string };
    }>;
  }>;
  permissions: Array<{
    id: string;
    code: string;
    name: string;
  }>;
  refreshTokens: Array<{
    id: string;
    user_id: string;
    family_id: string;
    token_hash: string;
    revoked_at: Date | null;
    expires_at: Date;
    created_at: Date;
  }>;
  businessInvitations: Array<{
    id: string;
    business_id: string;
    email: string;
    role_id: string;
    token_hash: string;
    invited_by: string;
    expires_at: Date;
    accepted_at: Date | null;
    created_at: Date;
    role?: any;
    business?: any;
  }>;
  idempotencyKeys: Array<{
    id: string;
    key: string;
    user_id: string;
    business_id: string | null;
    request_path?: string;
    request_hash?: string | null;
    response_status?: number;
    response_body?: any;
    created_at: Date;
    expires_at: Date;
  }>;
  aiAgents: Array<{
    id: string;
    business_id: string;
    name: string;
    status: string;
    model_id: string;
    temperature: number;
    system_prompt: string;
    created_at: Date;
    updated_at: Date;
  }>;
  aiSettings: Array<{
    id: string;
    business_id: string;
    mode: string;
    max_turns: number;
    auto_handoff_minutes: number;
    created_at: Date;
    updated_at: Date;
  }>;
  businessRules: Array<{
    id: string;
    business_id: string;
    name: string;
    rule_type: string;
    content: string;
    created_at: Date;
  }>;
  businessOnboardings: Array<{
    id: string;
    business_id: string;
    catalog_seeded: boolean;
    channel_connected: boolean;
    handoff_acknowledged: boolean;
    ai_activated: boolean;
    unmet_gates: string[];
    created_at: Date;
    updated_at: Date;
  }>;
  businessFeatureFlags: Array<{
    id: string;
    business_id: string;
    key: string;
    enabled: boolean;
    created_at: Date;
    updated_at: Date;
  }>;
  auditLogs: Array<{
    id: string;
    business_id: string;
    actor_user_id: string | null;
    action: string;
    target_type: string;
    target_id: string;
    payload: any;
    ip_address: string | null;
    created_at: Date;
  }>;
}

export function createMockPrisma(initialState?: Partial<MockDbState>): {
  prisma: PrismaClient;
  state: MockDbState;
} {
  const state: MockDbState = {
    users: [],
    businesses: [],
    businessMembers: [],
    roles: [
      { id: "role-owner-id", name: "owner", business_id: null },
      { id: "role-admin-id", name: "admin", business_id: null },
      { id: "role-employee-id", name: "employee", business_id: null },
    ],
    permissions: [],
    refreshTokens: [],
    businessInvitations: [],
    idempotencyKeys: [],
    aiAgents: [],
    aiSettings: [],
    businessRules: [],
    businessOnboardings: [],
    businessFeatureFlags: [],
    auditLogs: [],
    ...initialState,
  };

  const mockClient: any = {
    $transaction: jest.fn(async (arg: any) => {
      if (typeof arg === "function") {
        return arg(mockClient);
      }
      if (Array.isArray(arg)) {
        return Promise.all(arg);
      }
      return arg;
    }),

    user: {
      findUnique: jest.fn(
        async ({ where }: { where: { email?: string; id?: string }; include?: any }) => {
          let u: any = null;
          if (where.email) {
            u =
              state.users.find((usr) => usr.email.toLowerCase() === where.email?.toLowerCase()) ||
              null;
          } else if (where.id) {
            u = state.users.find((usr) => usr.id === where.id) || null;
          }
          if (!u) return null;
          const memberships = state.businessMembers
            .filter((m) => m.user_id === u.id && m.removed_at === null)
            .map((m) => ({
              ...m,
              role: m.role || state.roles.find((r) => r.id === m.role_id) || { name: "employee" },
              business: m.business || state.businesses.find((b) => b.id === m.business_id),
            }));
          return {
            ...u,
            memberships,
          };
        },
      ),
      findUniqueOrThrow: jest.fn(
        async ({ where }: { where: { email?: string; id?: string }; include?: any }) => {
          let u: any = null;
          if (where.email) {
            u =
              state.users.find((usr) => usr.email.toLowerCase() === where.email?.toLowerCase()) ||
              null;
          } else if (where.id) {
            u = state.users.find((usr) => usr.id === where.id) || null;
          }
          if (!u) throw new Error("User not found");
          const memberships = state.businessMembers
            .filter((m) => m.user_id === u.id && m.removed_at === null)
            .map((m) => ({
              ...m,
              role: m.role || state.roles.find((r) => r.id === m.role_id) || { name: "employee" },
              business: m.business || state.businesses.find((b) => b.id === m.business_id),
            }));
          return {
            ...u,
            memberships,
          };
        },
      ),
      findFirst: jest.fn(async ({ where }: { where: any }) => {
        return (
          state.users.find((u) => {
            if (where.email && u.email.toLowerCase() !== where.email.toLowerCase()) return false;
            if (where.id && u.id !== where.id) return false;
            return true;
          }) || null
        );
      }),
      create: jest.fn(async ({ data }: { data: any }) => {
        const newUser = {
          id: data.id || crypto.randomUUID(),
          email: data.email.toLowerCase(),
          name: data.name,
          password_hash: data.password_hash || null,
          email_verified_at: data.email_verified_at || null,
          created_at: new Date(),
          updated_at: new Date(),
        };
        state.users.push(newUser);
        return newUser;
      }),
      update: jest.fn(async ({ where, data }: { where: { id: string }; data: any }) => {
        const user = state.users.find((u) => u.id === where.id);
        if (!user) throw new Error("User not found");
        Object.assign(user, data, { updated_at: new Date() });
        return user;
      }),
    },

    business: {
      findFirst: jest.fn(async ({ where }: { where: any }) => {
        return (
          state.businesses.find((b) => {
            if (where.id && b.id !== where.id) return false;
            if (where.deleted_at === null && b.deleted_at !== null) return false;
            return true;
          }) || null
        );
      }),
      findUnique: jest.fn(async ({ where }: { where: { id: string } }) => {
        return state.businesses.find((b) => b.id === where.id) || null;
      }),
      findMany: jest.fn(async () => state.businesses),
      create: jest.fn(async ({ data }: { data: any }) => {
        const newBiz = {
          id: data.id || crypto.randomUUID(),
          name: data.name,
          currency: data.currency || "TND",
          timezone: data.timezone || "Africa/Tunis",
          created_at: new Date(),
          updated_at: new Date(),
          deleted_at: null,
        };
        state.businesses.push(newBiz);
        return newBiz;
      }),
      update: jest.fn(async ({ where, data }: { where: { id: string }; data: any }) => {
        const biz = state.businesses.find((b) => b.id === where.id);
        if (!biz) throw new Error("Business not found");
        Object.assign(biz, data, { updated_at: new Date() });
        return biz;
      }),
    },

    businessMember: {
      findUnique: jest.fn(async ({ where }: { where: any }) => {
        if (where.business_id_user_id) {
          return (
            state.businessMembers.find(
              (m) =>
                m.business_id === where.business_id_user_id.business_id &&
                m.user_id === where.business_id_user_id.user_id &&
                m.removed_at === null,
            ) || null
          );
        }
        if (where.id) {
          return state.businessMembers.find((m) => m.id === where.id) || null;
        }
        return null;
      }),
      findFirst: jest.fn(async ({ where }: { where: any }) => {
        const m = state.businessMembers.find((member) => {
          if (where.user_id && member.user_id !== where.user_id) return false;
          if (where.business_id && member.business_id !== where.business_id) return false;
          if (where.id && member.id !== where.id) return false;
          if (where.removed_at === null && member.removed_at !== null) return false;
          if (where.user?.email) {
            const u = member.user || state.users.find((usr) => usr.id === member.user_id);
            if (!u || u.email.toLowerCase() !== where.user.email.toLowerCase()) return false;
          }
          const biz = member.business || state.businesses.find((b) => b.id === member.business_id);
          if (where.business?.deleted_at === null && biz?.deleted_at !== null) return false;
          return true;
        });
        if (!m) return null;
        return {
          ...m,
          user: m.user ||
            state.users.find((u) => u.id === m.user_id) || { name: "User", email: "user@test.com" },
          role: m.role || state.roles.find((r) => r.id === m.role_id) || { name: "owner" },
          business: m.business || state.businesses.find((b) => b.id === m.business_id),
        };
      }),
      findMany: jest.fn(async ({ where }: { where?: any } = {}) => {
        return state.businessMembers
          .filter((m) => {
            if (!where) return true;
            if (where.business_id && m.business_id !== where.business_id) return false;
            if (where.user_id && m.user_id !== where.user_id) return false;
            if (where.removed_at === null && m.removed_at !== null) return false;
            const biz = m.business || state.businesses.find((b) => b.id === m.business_id);
            if (where.business?.deleted_at === null && biz?.deleted_at !== null) return false;
            return true;
          })
          .map((m) => ({
            ...m,
            user: m.user ||
              state.users.find((u) => u.id === m.user_id) || {
                name: "User",
                email: "user@test.com",
              },
            role: m.role || state.roles.find((r) => r.id === m.role_id) || { name: "employee" },
            business: m.business || state.businesses.find((b) => b.id === m.business_id),
          }));
      }),
      count: jest.fn(async ({ where }: { where?: any } = {}) => {
        return state.businessMembers.filter((m) => {
          if (!where) return true;
          if (where.business_id && m.business_id !== where.business_id) return false;
          if (where.user_id && m.user_id !== where.user_id) return false;
          if (where.removed_at === null && m.removed_at !== null) return false;
          if (where.role?.name) {
            const r = m.role || state.roles.find((rl) => rl.id === m.role_id);
            if (r?.name !== where.role.name) return false;
          }
          return true;
        }).length;
      }),
      create: jest.fn(async ({ data }: { data: any }) => {
        const memberRole = state.roles.find((r) => r.id === data.role_id) || {
          id: data.role_id,
          name: data.role_id === "role-owner-id" ? "owner" : "employee",
        };
        const biz = state.businesses.find((b) => b.id === data.business_id);
        const usr = state.users.find((u) => u.id === data.user_id);
        const newMember = {
          id: data.id || crypto.randomUUID(),
          business_id: data.business_id,
          user_id: data.user_id,
          role_id: data.role_id,
          removed_at: null,
          created_at: new Date(),
          business: biz,
          role: memberRole,
          user: usr,
        };
        state.businessMembers.push(newMember);
        return newMember;
      }),
      update: jest.fn(async ({ where, data }: { where: { id: string }; data: any }) => {
        const member = state.businessMembers.find((m) => m.id === where.id);
        if (!member) throw new Error("Member not found");
        Object.assign(member, data);
        if (data.role_id) {
          const r = state.roles.find((rl) => rl.id === data.role_id);
          if (r) member.role = r;
        }
        return member;
      }),
      updateMany: jest.fn(async ({ where, data }: { where: any; data: any }) => {
        let count = 0;
        for (const m of state.businessMembers) {
          if (where.business_id && m.business_id !== where.business_id) continue;
          if (where.user_id && m.user_id !== where.user_id) continue;
          Object.assign(m, data);
          count++;
        }
        return { count };
      }),
    },

    role: {
      findFirst: jest.fn(async ({ where }: { where: any }) => {
        return (
          state.roles.find((r) => {
            if (where.name && r.name !== where.name) return false;
            return true;
          }) || null
        );
      }),
      findUnique: jest.fn(async ({ where }: { where: { id: string } }) => {
        return state.roles.find((r) => r.id === where.id) || null;
      }),
      findMany: jest.fn(async () => state.roles),
      create: jest.fn(async ({ data }: { data: any }) => {
        const newRole = {
          id: data.id || crypto.randomUUID(),
          name: data.name,
          business_id: data.business_id || null,
        };
        state.roles.push(newRole);
        return newRole;
      }),
    },

    refreshToken: {
      findUnique: jest.fn(async ({ where }: { where: { token_hash?: string; id?: string } }) => {
        if (where.token_hash) {
          return state.refreshTokens.find((r) => r.token_hash === where.token_hash) || null;
        }
        if (where.id) {
          return state.refreshTokens.find((r) => r.id === where.id) || null;
        }
        return null;
      }),
      findFirst: jest.fn(async ({ where }: { where: any }) => {
        return (
          state.refreshTokens.find((r) => {
            if (where.family_id && r.family_id !== where.family_id) return false;
            if (where.token_hash && r.token_hash !== where.token_hash) return false;
            return true;
          }) || null
        );
      }),
      create: jest.fn(async ({ data }: { data: any }) => {
        const newTok = {
          id: data.id || crypto.randomUUID(),
          user_id: data.user_id,
          family_id: data.family_id,
          token_hash: data.token_hash,
          revoked_at: data.revoked_at || null,
          expires_at: data.expires_at || new Date(Date.now() + 14 * 86400 * 1000),
          created_at: new Date(),
        };
        state.refreshTokens.push(newTok);
        return newTok;
      }),
      update: jest.fn(async ({ where, data }: { where: { id: string }; data: any }) => {
        const t = state.refreshTokens.find((tok) => tok.id === where.id);
        if (!t) throw new Error("Refresh token not found");
        Object.assign(t, data);
        return t;
      }),
      updateMany: jest.fn(async ({ where, data }: { where: any; data: any }) => {
        let count = 0;
        for (const t of state.refreshTokens) {
          if (where.family_id && t.family_id !== where.family_id) continue;
          if (where.user_id && t.user_id !== where.user_id) continue;
          Object.assign(t, data);
          count++;
        }
        return { count };
      }),
    },

    invitation: {
      findUnique: jest.fn(async ({ where }: { where: { token_hash?: string; id?: string } }) => {
        if (where.token_hash) {
          return state.businessInvitations.find((i) => i.token_hash === where.token_hash) || null;
        }
        if (where.id) {
          return state.businessInvitations.find((i) => i.id === where.id) || null;
        }
        return null;
      }),
      findFirst: jest.fn(async ({ where }: { where: any }) => {
        return (
          state.businessInvitations.find((inv) => {
            if (where.token_hash && inv.token_hash !== where.token_hash) return false;
            if (where.business_id && inv.business_id !== where.business_id) return false;
            if (where.email && inv.email.toLowerCase() !== where.email.toLowerCase()) return false;
            return true;
          }) || null
        );
      }),
      findMany: jest.fn(async ({ where }: { where?: any } = {}) => {
        return state.businessInvitations.filter((inv) => {
          if (!where) return true;
          if (where.business_id && inv.business_id !== where.business_id) return false;
          if (where.accepted_at === null && inv.accepted_at !== null) return false;
          return true;
        });
      }),
      count: jest.fn(async ({ where }: { where?: any } = {}) => {
        return state.businessInvitations.filter((inv) => {
          if (!where) return true;
          if (where.business_id && inv.business_id !== where.business_id) return false;
          if (where.accepted_at === null && inv.accepted_at !== null) return false;
          return true;
        }).length;
      }),
      create: jest.fn(async ({ data }: { data: any }) => {
        const r = state.roles.find((rl) => rl.id === data.role_id) || {
          id: data.role_id,
          name: "employee",
        };
        const b = state.businesses.find((biz) => biz.id === data.business_id);
        const newInv = {
          id: data.id || crypto.randomUUID(),
          business_id: data.business_id,
          email: data.email.toLowerCase(),
          role_id: data.role_id,
          token_hash: data.token_hash,
          invited_by: data.invited_by,
          expires_at: data.expires_at,
          accepted_at: null,
          created_at: new Date(),
          role: r,
          business: b,
        };
        state.businessInvitations.push(newInv);
        return newInv;
      }),
      upsert: jest.fn(async ({ where, update, create }: any) => {
        const existing = state.businessInvitations.find(
          (i) =>
            i.business_id === where.business_id_email?.business_id &&
            i.email === where.business_id_email?.email,
        );
        if (existing) {
          Object.assign(existing, update);
          return existing;
        }
        const r = state.roles.find((rl) => rl.id === create.role_id) || {
          id: create.role_id,
          name: "employee",
        };
        const b = state.businesses.find((biz) => biz.id === create.business_id);
        const newInv = {
          id: crypto.randomUUID(),
          business_id: create.business_id,
          email: create.email.toLowerCase(),
          role_id: create.role_id,
          token_hash: create.token_hash,
          invited_by: create.invited_by,
          expires_at: create.expires_at,
          accepted_at: null,
          created_at: new Date(),
          role: r,
          business: b,
        };
        state.businessInvitations.push(newInv);
        return newInv;
      }),
      update: jest.fn(async ({ where, data }: { where: { id: string }; data: any }) => {
        const inv = state.businessInvitations.find((i) => i.id === where.id);
        if (!inv) throw new Error("Invitation not found");
        Object.assign(inv, data);
        return inv;
      }),
      delete: jest.fn(async ({ where }: { where: { id: string } }) => {
        const idx = state.businessInvitations.findIndex((i) => i.id === where.id);
        if (idx >= 0) state.businessInvitations.splice(idx, 1);
        return {};
      }),
    },

    businessInvitation: {
      findFirst: jest.fn(async ({ where }: { where: any }) => {
        return (
          state.businessInvitations.find((inv) => {
            if (where.token_hash && inv.token_hash !== where.token_hash) return false;
            if (where.business_id && inv.business_id !== where.business_id) return false;
            if (where.email && inv.email.toLowerCase() !== where.email.toLowerCase()) return false;
            return true;
          }) || null
        );
      }),
      findMany: jest.fn(async ({ where }: { where?: any } = {}) => {
        return state.businessInvitations.filter((inv) => {
          if (!where) return true;
          if (where.business_id && inv.business_id !== where.business_id) return false;
          if (where.accepted_at === null && inv.accepted_at !== null) return false;
          return true;
        });
      }),
      create: jest.fn(async ({ data }: { data: any }) => {
        const r = state.roles.find((rl) => rl.id === data.role_id) || {
          id: data.role_id,
          name: "employee",
        };
        const b = state.businesses.find((biz) => biz.id === data.business_id);
        const newInv = {
          id: data.id || crypto.randomUUID(),
          business_id: data.business_id,
          email: data.email.toLowerCase(),
          role_id: data.role_id,
          token_hash: data.token_hash,
          invited_by: data.invited_by,
          expires_at: data.expires_at,
          accepted_at: null,
          created_at: new Date(),
          role: r,
          business: b,
        };
        state.businessInvitations.push(newInv);
        return newInv;
      }),
      update: jest.fn(async ({ where, data }: { where: { id: string }; data: any }) => {
        const inv = state.businessInvitations.find((i) => i.id === where.id);
        if (!inv) throw new Error("Invitation not found");
        Object.assign(inv, data);
        return inv;
      }),
    },

    featureFlag: {
      findMany: jest.fn(async ({ where }: { where: any }) => {
        return state.businessFeatureFlags.filter((f) => {
          if (where.business_id !== undefined && f.business_id !== where.business_id) return false;
          return true;
        });
      }),
      upsert: jest.fn(async ({ where, update, create }: any) => {
        const featureKey =
          where.business_id_feature?.feature ||
          where.business_id_key?.key ||
          create.feature ||
          create.key;
        const bizId =
          where.business_id_feature?.business_id ||
          where.business_id_key?.business_id ||
          create.business_id;
        const existing = state.businessFeatureFlags.find(
          (f: any) => f.business_id === bizId && (f.feature === featureKey || f.key === featureKey),
        );
        if (existing) {
          Object.assign(existing, update, { updated_at: new Date() });
          return existing;
        }
        const newFlag = {
          id: crypto.randomUUID(),
          business_id: bizId,
          key: featureKey,
          feature: featureKey,
          enabled: create.enabled,
          created_at: new Date(),
          updated_at: new Date(),
        };
        state.businessFeatureFlags.push(newFlag);
        return newFlag;
      }),
    },

    subscription: {
      findFirst: jest.fn(async () => ({
        id: "sub-1",
        status: "active",
        plan: {
          id: "plan-pro",
          name: "Pro Plan",
          limits: {
            seats: 5,
          },
        },
      })),
    },

    product: {
      findFirst: jest.fn(async () => null),
    },

    channelAccount: {
      findFirst: jest.fn(async () => null),
    },

    conversationAssignment: {
      updateMany: jest.fn(async () => ({ count: 0 })),
    },

    idempotencyKey: {
      findFirst: jest.fn(async ({ where }: { where: any }) => {
        return (
          state.idempotencyKeys.find((k) => {
            if (where.key && k.key !== where.key) return false;
            if (where.user_id && k.user_id !== where.user_id) return false;
            return true;
          }) || null
        );
      }),
      create: jest.fn(async ({ data }: { data: any }) => {
        const newKey = {
          id: data.id || crypto.randomUUID(),
          key: data.key,
          user_id: data.user_id,
          business_id: data.business_id || null,
          request_path: data.request_path,
          request_hash: data.request_hash || null,
          response_status: data.response_status,
          response_body: data.response_body,
          created_at: new Date(),
          expires_at: data.expires_at || new Date(Date.now() + 86400 * 1000),
        };
        state.idempotencyKeys.push(newKey);
        return newKey;
      }),
    },

    aiAgent: {
      findFirst: jest.fn(async ({ where }: { where: any }) => {
        return (
          state.aiAgents.find((a) => {
            if (where.business_id && a.business_id !== where.business_id) return false;
            if (where.id && a.id !== where.id) return false;
            return true;
          }) || null
        );
      }),
      findMany: jest.fn(async ({ where }: { where: any }) => {
        return state.aiAgents.filter((a) => a.business_id === where.business_id);
      }),
      create: jest.fn(async ({ data }: { data: any }) => {
        const newAgent = {
          id: data.id || crypto.randomUUID(),
          business_id: data.business_id,
          name: data.name || "AI Sales Agent",
          status: data.status || "active",
          model_id: data.model_id || "claude-3-5-sonnet",
          temperature: data.temperature ?? 0.2,
          system_prompt: data.system_prompt || "You are an AI sales assistant.",
          created_at: new Date(),
          updated_at: new Date(),
        };
        state.aiAgents.push(newAgent);
        return newAgent;
      }),
      update: jest.fn(async ({ where, data }: { where: { id: string }; data: any }) => {
        const agent = state.aiAgents.find((a) => a.id === where.id);
        if (!agent) throw new Error("AI Agent not found");
        Object.assign(agent, data, { updated_at: new Date() });
        return agent;
      }),
    },

    aiSettings: {
      findUnique: jest.fn(async ({ where }: { where: any }) => {
        return (
          state.aiSettings.find((s) => {
            if (where.business_id && s.business_id !== where.business_id) return false;
            if (where.id && s.id !== where.id) return false;
            return true;
          }) || null
        );
      }),
      findFirst: jest.fn(async ({ where }: { where: any }) => {
        return (
          state.aiSettings.find((s) => {
            if (where.business_id && s.business_id !== where.business_id) return false;
            return true;
          }) || null
        );
      }),
      create: jest.fn(async ({ data }: { data: any }) => {
        const newSettings = {
          id: data.id || crypto.randomUUID(),
          business_id: data.business_id,
          mode: data.mode || "approval_required",
          max_turns: data.max_turns || 10,
          auto_handoff_minutes: data.auto_handoff_minutes || 15,
          created_at: new Date(),
          updated_at: new Date(),
        };
        state.aiSettings.push(newSettings);
        return newSettings;
      }),
      update: jest.fn(async ({ where, data }: { where: any; data: any }) => {
        const settings = state.aiSettings.find(
          (s) => s.business_id === where.business_id || s.id === where.id,
        );
        if (!settings) throw new Error("AI Settings not found");
        Object.assign(settings, data, { updated_at: new Date() });
        return settings;
      }),
    },

    businessRule: {
      findMany: jest.fn(async ({ where }: { where: any }) => {
        return state.businessRules.filter((r) => r.business_id === where.business_id);
      }),
      createMany: jest.fn(async ({ data }: { data: any[] }) => {
        for (const item of data) {
          state.businessRules.push({
            id: item.id || crypto.randomUUID(),
            business_id: item.business_id,
            name: item.name,
            rule_type: item.rule_type,
            content: item.content,
            created_at: new Date(),
          });
        }
        return { count: data.length };
      }),
    },

    businessOnboarding: {
      findUnique: jest.fn(async ({ where }: { where: any }) => {
        return (
          state.businessOnboardings.find((o) => {
            if (where.business_id && o.business_id !== where.business_id) return false;
            if (where.id && o.id !== where.id) return false;
            return true;
          }) || null
        );
      }),
      findFirst: jest.fn(async ({ where }: { where: any }) => {
        return (
          state.businessOnboardings.find((o) => {
            if (where.business_id && o.business_id !== where.business_id) return false;
            if (where.id && o.id !== where.id) return false;
            return true;
          }) || null
        );
      }),
      create: jest.fn(async ({ data }: { data: any }) => {
        const newOnboarding = {
          id: data.id || crypto.randomUUID(),
          business_id: data.business_id,
          catalog_seeded: data.catalog_seeded || false,
          channel_connected: data.channel_connected || false,
          handoff_acknowledged: data.handoff_acknowledged || false,
          ai_activated: data.ai_activated || false,
          unmet_gates: data.unmet_gates || [
            "catalog_seeded",
            "channel_connected",
            "handoff_acknowledged",
          ],
          created_at: new Date(),
          updated_at: new Date(),
        };
        state.businessOnboardings.push(newOnboarding);
        return newOnboarding;
      }),
      upsert: jest.fn(async ({ where, update, create }: any) => {
        const existing = state.businessOnboardings.find(
          (o) => o.business_id === where.business_id || o.id === where.id,
        );
        if (existing) {
          Object.assign(existing, update, { updated_at: new Date() });
          return existing;
        }
        const newOnboarding = {
          id: crypto.randomUUID(),
          business_id: create.business_id,
          catalog_seeded: create.catalog_seeded || false,
          channel_connected: create.channel_connected || false,
          handoff_acknowledged: create.handoff_acknowledged || false,
          ai_activated: create.ai_activated || false,
          unmet_gates: create.unmet_gates || [],
          created_at: new Date(),
          updated_at: new Date(),
        };
        state.businessOnboardings.push(newOnboarding);
        return newOnboarding;
      }),
      update: jest.fn(async ({ where, data }: { where: any; data: any }) => {
        const onboarding = state.businessOnboardings.find(
          (o) => o.business_id === where.business_id || o.id === where.id,
        );
        if (!onboarding) throw new Error("Onboarding not found");
        Object.assign(onboarding, data, { updated_at: new Date() });
        return onboarding;
      }),
    },

    businessFeatureFlag: {
      findMany: jest.fn(async ({ where }: { where: any }) => {
        return state.businessFeatureFlags.filter((f) => f.business_id === where.business_id);
      }),
      upsert: jest.fn(async ({ where, update, create }: any) => {
        const existing = state.businessFeatureFlags.find(
          (f) =>
            f.business_id === where.business_id_key?.business_id &&
            f.key === where.business_id_key?.key,
        );
        if (existing) {
          Object.assign(existing, update, { updated_at: new Date() });
          return existing;
        }
        const newFlag = {
          id: crypto.randomUUID(),
          business_id: create.business_id,
          key: create.key,
          enabled: create.enabled,
          created_at: new Date(),
          updated_at: new Date(),
        };
        state.businessFeatureFlags.push(newFlag);
        return newFlag;
      }),
    },

    organization: {
      findUnique: jest.fn(async ({ where }: { where: { id?: string; slug?: string } }) => {
        const b = state.businesses.find((biz) => biz.id === where.id);
        if (b) return { id: b.id, name: b.name, slug: b.name.toLowerCase() };
        return null;
      }),
      findFirst: jest.fn(async () => null),
      create: jest.fn(async ({ data }: any) => ({
        id: data.id || crypto.randomUUID(),
        name: data.name,
        slug: data.slug || null,
        createdAt: new Date(),
        updatedAt: new Date(),
      })),
      upsert: jest.fn(async ({ create, update, where }: any) => ({
        id: where.id || create.id || crypto.randomUUID(),
        name: update.name || create.name,
        slug: create.slug || null,
        createdAt: new Date(),
        updatedAt: new Date(),
      })),
    },

    member: {
      findFirst: jest.fn(async () => null),
      findMany: jest.fn(async () => []),
      create: jest.fn(async ({ data }: any) => ({
        id: crypto.randomUUID(),
        organizationId: data.organizationId,
        userId: data.userId,
        role: data.role,
        createdAt: new Date(),
        updatedAt: new Date(),
      })),
      updateMany: jest.fn(async () => ({ count: 1 })),
      deleteMany: jest.fn(async () => ({ count: 1 })),
      upsert: jest.fn(async ({ create, update, where }: any) => ({
        id: crypto.randomUUID(),
        organizationId: where.organizationId_userId?.organizationId || create.organizationId,
        userId: where.organizationId_userId?.userId || create.userId,
        role: update.role || create.role,
        createdAt: new Date(),
        updatedAt: new Date(),
      })),
    },

    session: {
      findUnique: jest.fn(async () => null),
      findFirst: jest.fn(async () => null),
      create: jest.fn(async ({ data }: any) => ({
        id: crypto.randomUUID(),
        ...data,
      })),
      delete: jest.fn(async () => ({})),
    },

    auditLog: {
      findMany: jest.fn(async ({ where }: { where: any }) => {
        return state.auditLogs.filter((l) => l.business_id === where.business_id);
      }),
      create: jest.fn(async ({ data }: { data: any }) => {
        const newLog = {
          id: data.id || crypto.randomUUID(),
          business_id: data.business_id,
          actor_user_id: data.actor_user_id || null,
          action: data.action,
          target_type: data.target_type,
          target_id: data.target_id,
          payload: data.payload || null,
          ip_address: data.ip_address || null,
          created_at: new Date(),
        };
        state.auditLogs.push(newLog);
        return newLog;
      }),
    },
  };

  return { prisma: mockClient as unknown as PrismaClient, state };
}

export function generateTestAccessToken(userId: string, secret = TEST_BETTER_AUTH_SECRET): string {
  return signJwt({ sub: userId, typ: "access" }, secret, {
    expiresInSeconds: 900,
    issuer: "aisales",
    audience: "access",
  });
}

export async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password);
}
