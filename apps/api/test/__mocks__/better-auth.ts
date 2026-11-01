export interface MockBetterAuthApi {
  getSession: (opts?: unknown) => Promise<{ user: unknown; session: unknown } | null>;
  signInEmail: (opts?: unknown) => Promise<{ user: unknown; session: unknown }>;
  signUpEmail: (opts?: unknown) => Promise<{ user: unknown; session: unknown }>;
  signOut: (opts?: unknown) => Promise<{ success: boolean }>;
  createOrganization: (opts?: unknown) => Promise<{ id: string; name: string }>;
  setActiveOrganization: (opts?: unknown) => Promise<{ success: boolean }>;
  listOrganizations: (opts?: unknown) => Promise<unknown[]>;
  createInvitation: (opts?: unknown) => Promise<{ id: string }>;
  acceptInvitation: (opts?: unknown) => Promise<{ success: boolean }>;
  rejectInvitation: (opts?: unknown) => Promise<{ success: boolean }>;
  cancelInvitation: (opts?: unknown) => Promise<{ success: boolean }>;
}

export interface MockBetterAuthInstance {
  options: unknown;
  handler: (req: Request) => Promise<Response>;
  api: MockBetterAuthApi;
}

export function betterAuth(config: unknown): MockBetterAuthInstance {
  return {
    options: config,
    handler: async (_req: Request): Promise<Response> =>
      Promise.resolve(
        new Response(JSON.stringify({ status: "ok" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    api: {
      getSession: async (_opts?: unknown) => {
        return Promise.resolve(null);
      },
      signInEmail: async (_opts?: unknown) => {
        return Promise.resolve({ user: null, session: null });
      },
      signUpEmail: async (_opts?: unknown) => {
        return Promise.resolve({ user: null, session: null });
      },
      signOut: async (_opts?: unknown) => {
        return Promise.resolve({ success: true });
      },
      createOrganization: async (_opts?: unknown) => {
        return Promise.resolve({ id: "test-org", name: "Test Org" });
      },
      setActiveOrganization: async (_opts?: unknown) => {
        return Promise.resolve({ success: true });
      },
      listOrganizations: async (_opts?: unknown) => {
        return Promise.resolve([]);
      },
      createInvitation: async (_opts?: unknown) => {
        return Promise.resolve({ id: "test-inv" });
      },
      acceptInvitation: async (_opts?: unknown) => {
        return Promise.resolve({ success: true });
      },
      rejectInvitation: async (_opts?: unknown) => {
        return Promise.resolve({ success: true });
      },
      cancelInvitation: async (_opts?: unknown) => {
        return Promise.resolve({ success: true });
      },
    },
  };
}
