import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import pg from "pg";

import { env } from "@app/shared/server";

export interface ReconciliationSummary {
  upsertedProjections: number;
  softRemovedProjections: number;
}

/**
 * Post-cutover strictly one-way reconciliation: `Member` (authoritative) -> `BusinessMember` (projection).
 *
 * Never creates or restores `Member` from `BusinessMember`.
 */
export async function reconcileMemberToBusinessMember(
  prisma: PrismaClient,
): Promise<ReconciliationSummary> {
  const summary: ReconciliationSummary = {
    upsertedProjections: 0,
    softRemovedProjections: 0,
  };

  const roles = await prisma.role.findMany({ where: { business_id: null } });
  const roleByName = new Map(roles.map((r) => [r.name, r.id]));

  const members = await prisma.member.findMany({
    include: {
      organization: {
        include: {
          businesses: {
            where: { deleted_at: null },
            select: { id: true },
          },
        },
      },
    },
  });

  const activePairs = new Set<string>();

  for (const m of members) {
    const roleId = roleByName.get(m.role);
    if (!roleId) continue;

    // Organization.id === Business.id in canonical setup
    const businessExists = await prisma.business.findFirst({
      where: { id: m.organizationId, deleted_at: null },
      select: { id: true },
    });
    if (!businessExists) continue;

    activePairs.add(`${m.organizationId}:${m.userId}`);

    const existing = await prisma.businessMember.findUnique({
      where: {
        business_id_user_id: {
          business_id: m.organizationId,
          user_id: m.userId,
        },
      },
    });

    if (!existing) {
      await prisma.businessMember.create({
        data: {
          business_id: m.organizationId,
          user_id: m.userId,
          role_id: roleId,
          joined_at: m.createdAt,
        },
      });
      summary.upsertedProjections += 1;
    } else if (existing.removed_at !== null || existing.role_id !== roleId) {
      await prisma.businessMember.update({
        where: { id: existing.id },
        data: {
          role_id: roleId,
          removed_at: null,
        },
      });
      summary.upsertedProjections += 1;
    }
  }

  const activeProjections = await prisma.businessMember.findMany({
    where: { removed_at: null },
    select: { id: true, business_id: true, user_id: true },
  });

  const now = new Date();
  for (const bm of activeProjections) {
    if (!activePairs.has(`${bm.business_id}:${bm.user_id}`)) {
      await prisma.businessMember.update({
        where: { id: bm.id },
        data: { removed_at: now },
      });
      summary.softRemovedProjections += 1;
    }
  }

  return summary;
}

async function main() {
  const pool = new pg.Pool({ connectionString: env.DATABASE_URL });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });

  try {
    const summary = await reconcileMemberToBusinessMember(prisma);
    console.log("One-way Member -> BusinessMember reconciliation complete:", summary);
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  void main();
}
