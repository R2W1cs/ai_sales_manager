import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import pg from "pg";

import { env } from "@app/shared/server";

export interface BackfillSummary {
  accountsCreated: number;
  organizationsCreated: number;
  businessesLinked: number;
  membersCreated: number;
  membersUpdated: number;
}

/**
 * Repeatable, strictly additive pre-cutover backfill for Better Auth v1.7.27.
 *
 * Safe to rerun while legacy auth is still live:
 * - Never deletes sessions, refresh tokens, or existing Better Auth accounts.
 * - Creates missing credential `Account` rows from `User.password_hash` (supporting
 *   `$argon2id$` hashes via Better Auth's compatibility verifier).
 * - Creates 1:1 `Organization` rows (`id = business.id`) and `Member` rows from active
 *   `BusinessMember` rows.
 *
 * NOTE: Run ONLY pre-cutover. Post-cutover reconciliation must run one-way from
 * `Member` -> `BusinessMember` (`reconcile-business-member.ts`) so stale projections
 * can never restore revoked access.
 */
export async function runBetterAuthBackfill(prisma: PrismaClient): Promise<BackfillSummary> {
  const summary: BackfillSummary = {
    accountsCreated: 0,
    organizationsCreated: 0,
    businessesLinked: 0,
    membersCreated: 0,
    membersUpdated: 0,
  };

  // 1. Backfill emailVerified (from legacy email_verified_at) and credential Account rows
  const usersToVerify = await prisma.user.findMany({
    where: {
      email_verified_at: { not: null },
      emailVerified: false,
    },
    select: { id: true },
  });
  if (usersToVerify.length > 0) {
    await prisma.user.updateMany({
      where: { id: { in: usersToVerify.map((u) => u.id) } },
      data: { emailVerified: true },
    });
  }

  const users = await prisma.user.findMany({
    where: {
      password_hash: { not: null },
    },
    include: {
      accounts: {
        where: { providerId: "credential" },
      },
    },
  });

  for (const user of users) {
    if (!user.password_hash) continue;
    const hasCredential = user.accounts.some(
      (a) => a.providerId === "credential" && a.accountId === user.id,
    );
    if (!hasCredential) {
      await prisma.account.create({
        data: {
          userId: user.id,
          providerId: "credential",
          accountId: user.id,
          password: user.password_hash,
        },
      });
      summary.accountsCreated += 1;
    }
  }

  // 2. Backfill 1:1 Organization rows (Organization.id === Business.id)
  const businesses = await prisma.business.findMany({
    where: { deleted_at: null },
  });

  for (const business of businesses) {
    const existingOrg = await prisma.organization.findUnique({
      where: { id: business.id },
    });

    if (!existingOrg) {
      const slugBase = business.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");
      const slug = `${slugBase || "workspace"}-${business.id.slice(0, 8)}`;

      await prisma.organization.create({
        data: {
          id: business.id,
          name: business.name,
          slug,
        },
      });
      summary.organizationsCreated += 1;
    }

    if (business.organization_id !== business.id) {
      await prisma.business.update({
        where: { id: business.id },
        data: { organization_id: business.id },
      });
      summary.businessesLinked += 1;
    }
  }

  // 3. Backfill Better Auth Member rows from active BusinessMember rows
  const activeMemberships = await prisma.businessMember.findMany({
    where: {
      removed_at: null,
      business: { deleted_at: null },
    },
    include: {
      role: true,
    },
  });

  for (const bm of activeMemberships) {
    const existingMember = await prisma.member.findUnique({
      where: {
        organizationId_userId: {
          organizationId: bm.business_id,
          userId: bm.user_id,
        },
      },
    });

    if (!existingMember) {
      await prisma.member.create({
        data: {
          organizationId: bm.business_id,
          userId: bm.user_id,
          role: bm.role.name,
        },
      });
      summary.membersCreated += 1;
    } else if (existingMember.role !== bm.role.name) {
      await prisma.member.update({
        where: { id: existingMember.id },
        data: { role: bm.role.name },
      });
      summary.membersUpdated += 1;
    }
  }

  return summary;
}

async function main() {
  const pool = new pg.Pool({ connectionString: env.DATABASE_URL });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });

  try {
    const summary = await runBetterAuthBackfill(prisma);
    console.log("Better Auth pre-cutover backfill complete:", summary);
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  void main();
}
