import { Inject } from "@nestjs/common";
import type { PrismaClient } from "@prisma/client";

/**
 * Injection token for the shared `PrismaClient`.
 *
 * The client cannot be injected by its class, because every consumer imports
 * `PrismaClient` with `import type`. TypeScript erases that, so
 * `emitDecoratorMetadata` records `Object` and Nest silently resolves nothing —
 * constructors fell back to the module singleton and `PlatformModule`'s
 * provider was inert.
 *
 * A value token makes the dependency explicit and substitutable in tests.
 */
export const PRISMA_CLIENT = "PRISMA_CLIENT";

/** Injects the shared `PrismaClient`. */
export const InjectPrisma = () => Inject(PRISMA_CLIENT);

export type { PrismaClient };
