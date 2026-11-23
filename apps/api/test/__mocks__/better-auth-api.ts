export class APIError extends Error {
  constructor(
    public status: string,
    public body?: { code?: string; message?: string },
  ) {
    super(body?.message ?? status);
    this.name = "APIError";
  }
}

export function createAuthMiddleware<T>(fn: T): T {
  return fn;
}
