import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import pg from "pg";

import { env } from "@app/shared/server";

export interface CutoverInvalidationSummary {
  deletedSessions: number;
  deletedRefreshTokens: number;
}

/**
 * Destructive cutover step (run once during cutover maintenance window with auth writes paused).
 *
 * Purges all pre-cutover `Session` and `RefreshToken` rows so all users re-authenticate into
 * MFA-tracked Better Auth sessions (`Session.mfaVerified`).
 */
export async function runCutoverSessionInvalidation(
  prisma: PrismaClient,
): Promise<CutoverInvalidationSummary> {
  const [sessionsRes, refreshRes] = await prisma.$transaction([
    prisma.session.deleteMany({}),
    prisma.refreshToken.deleteMany({}),
  ]);

  return {
    deletedSessions: sessionsRes.count,
    deletedRefreshTokens: refreshRes.count,
  };
}

async function main() {
  if (process.env.CONFIRM_CUTOVER_INVALIDATION !== "true") {
    throw new Error(
      "Refusing to purge sessions without CONFIRM_CUTOVER_INVALIDATION=true environment guard.",
    );
  }

  const pool = new pg.Pool({ connectionString: env.DATABASE_URL });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });

  try {
    const summary = await runCutoverSessionInvalidation(prisma);
    console.log("Cutover session invalidation complete:", summary);
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  void main();
}
