/**
 * Seed three Tunisia design-partner tenants for the commercial launch gate.
 *
 * Verticals: fashion (Sara Stores), cosmetics (Azalee Rose), electronics (Magasin TPL).
 * Channel rows are created as DISCONNECTED placeholders — live Meta OAuth is required
 * in production (never commit real tokens).
 *
 * Usage (from repo root, DB up):
 *   pnpm pilot:seed
 */
import "dotenv/config";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import { PrismaPg } from "@prisma/adapter-pg";
import {
  Channel,
  ChannelAccountStatus,
  Prisma,
  PrismaClient,
  ProductStatus,
  RuleType as PrismaRuleType,
} from "@prisma/client";
import * as argon2 from "argon2";
import pg from "pg";

import { env } from "@app/shared/server";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../../..");

const pool = new pg.Pool({ connectionString: env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

type PartnerDef = {
  businessId: string;
  orgId: string;
  ownerId: string;
  slug: string;
  name: string;
  industry: string;
  email: string;
  ownerName: string;
  csvFile: string;
  igHandle: string;
};

const PARTNERS: PartnerDef[] = [
  {
    businessId: "c1000000-0000-4000-8000-000000000001",
    orgId: "c0000000-0000-4000-8000-000000000001",
    ownerId: "c2000000-0000-4000-8000-000000000001",
    slug: "sara-stores",
    name: "Sara Stores",
    industry: "fashion",
    email: "pilot.sara@example.com",
    ownerName: "Sara Stores Owner",
    csvFile: "sara-stores.csv",
    igHandle: "sara_stores.tn",
  },
  {
    businessId: "c1000000-0000-4000-8000-000000000002",
    orgId: "c0000000-0000-4000-8000-000000000002",
    ownerId: "c2000000-0000-4000-8000-000000000002",
    slug: "azalee-rose",
    name: "Azalee Rose",
    industry: "cosmetics",
    email: "pilot.azalee@example.com",
    ownerName: "Azalee Rose Owner",
    csvFile: "azalee-rose.csv",
    igHandle: "azalee.rose8",
  },
  {
    businessId: "c1000000-0000-4000-8000-000000000003",
    orgId: "c0000000-0000-4000-8000-000000000003",
    ownerId: "c2000000-0000-4000-8000-000000000003",
    slug: "magasin-tpl",
    name: "Magasin TPL",
    industry: "electronics",
    email: "pilot.tpl@example.com",
    ownerName: "Magasin TPL Owner",
    csvFile: "magasin-tpl.csv",
    igHandle: "magasin_tpl",
  },
];

type CsvRow = {
  sku: string;
  name: string;
  description: string;
  price_tnd: string;
  stock: string;
  size: string;
  color: string;
  category: string;
};

function parseCsv(filePath: string): CsvRow[] {
  const raw = fs.readFileSync(filePath, "utf8").trim();
  const lines = raw.split(/\r?\n/);
  const header = (lines.shift() ?? "").split(",");
  const required = [
    "sku",
    "name",
    "description",
    "price_tnd",
    "stock",
    "size",
    "color",
    "category",
  ];
  for (const col of required) {
    if (!header.includes(col)) {
      throw new Error(`CSV ${filePath} missing column: ${col}`);
    }
  }
  return lines
    .filter((l) => l.trim().length > 0)
    .map((line) => {
      const cols = line.split(",");
      const row: Record<string, string> = {};
      header.forEach((h, i) => {
        row[h] = (cols[i] ?? "").trim();
      });
      return row as CsvRow;
    });
}

async function ensureOwnerRole() {
  const ownerRole = await prisma.role.findFirst({
    where: { name: "owner", business_id: null },
  });
  if (!ownerRole) {
    throw new Error("System owner role missing — run `pnpm db:seed` once before pilot:seed");
  }
  return ownerRole;
}

async function seedPartner(partner: PartnerDef, ownerRoleId: string, passwordHash: string) {
  console.log(`\n→ ${partner.name} (${partner.industry})`);

  const organization = await prisma.organization.upsert({
    where: { id: partner.orgId },
    update: { name: partner.name, slug: partner.slug },
    create: {
      id: partner.orgId,
      name: partner.name,
      slug: partner.slug,
    },
  });

  const user = await prisma.user.upsert({
    where: { email: partner.email },
    update: {
      name: partner.ownerName,
      password_hash: passwordHash,
      email_verified_at: new Date(),
      emailVerified: true,
    },
    create: {
      id: partner.ownerId,
      email: partner.email,
      name: partner.ownerName,
      password_hash: passwordHash,
      email_verified_at: new Date(),
      emailVerified: true,
    },
  });

  await prisma.account.upsert({
    where: { id: `acc-${user.id}` },
    update: { password: passwordHash },
    create: {
      id: `acc-${user.id}`,
      userId: user.id,
      providerId: "credential",
      accountId: user.id,
      password: passwordHash,
    },
  });

  await prisma.member.upsert({
    where: {
      organizationId_userId: {
        organizationId: organization.id,
        userId: user.id,
      },
    },
    update: { role: "owner" },
    create: {
      id: `mem-${user.id}`,
      organizationId: organization.id,
      userId: user.id,
      role: "owner",
    },
  });

  const business = await prisma.business.upsert({
    where: { id: partner.businessId },
    update: {
      name: partner.name,
      industry: partner.industry,
      country: "TN",
      default_language: "fr",
      timezone: "Africa/Tunis",
      currency: "TND",
      organization_id: organization.id,
      settings: {
        pilot: true,
        vertical: partner.industry,
        launchGate: true,
      },
    },
    create: {
      id: partner.businessId,
      name: partner.name,
      industry: partner.industry,
      country: "TN",
      default_language: "fr",
      timezone: "Africa/Tunis",
      currency: "TND",
      organization_id: organization.id,
      settings: {
        pilot: true,
        vertical: partner.industry,
        launchGate: true,
      },
    },
  });

  await prisma.businessMember.upsert({
    where: {
      business_id_user_id: {
        business_id: business.id,
        user_id: user.id,
      },
    },
    update: { role_id: ownerRoleId, removed_at: null },
    create: {
      business_id: business.id,
      user_id: user.id,
      role_id: ownerRoleId,
    },
  });

  await prisma.businessOnboarding.upsert({
    where: { business_id: business.id },
    update: {
      business_created: true,
      products_imported: true,
      ai_configured: true,
      // Channels stay false until real Meta OAuth — no fake tokens in git
      channel_connected: false,
      playground_passed: false,
      approval_trial_passed: false,
      handoff_acknowledged: false,
      ai_activated: false,
    },
    create: {
      business_id: business.id,
      business_created: true,
      products_imported: true,
      ai_configured: true,
      channel_connected: false,
      playground_passed: false,
      approval_trial_passed: false,
      handoff_acknowledged: false,
      ai_activated: false,
    },
  });

  await prisma.businessRule.deleteMany({ where: { business_id: business.id } });
  await prisma.businessRule.createMany({
    data: [
      {
        business_id: business.id,
        rule_type: PrismaRuleType.delivery,
        priority: 1,
        enabled: true,
        effective_from: new Date("2026-01-01"),
        payload: {
          zones: [
            {
              name: "Grand Tunis (Tunis, Ariana, Ben Arous, Manouba)",
              governorates: ["Tunis", "Ariana", "Ben Arous", "Manouba"],
              fee: 7,
              currency: "TND",
              eta_hours: 24,
            },
            {
              name: "Sahel & Cap Bon (Sousse, Monastir, Nabeul)",
              governorates: ["Sousse", "Monastir", "Nabeul"],
              fee: 8.5,
              currency: "TND",
              eta_hours: 48,
            },
            {
              name: "Reste de la Tunisie",
              governorates: ["*"],
              fee: 10,
              currency: "TND",
              eta_hours: 72,
            },
          ],
          address_fields: ["governorate", "delegation", "phone"],
        },
      },
      {
        business_id: business.id,
        rule_type: PrismaRuleType.payment,
        priority: 1,
        enabled: true,
        effective_from: new Date("2026-01-01"),
        payload: {
          methods: [
            { code: "cod", label: "Paiement à la livraison (COD)" },
            { code: "bank_transfer", label: "Virement / D17 / Flouci" },
          ],
        },
      },
      {
        business_id: business.id,
        rule_type: PrismaRuleType.returns,
        priority: 1,
        enabled: true,
        effective_from: new Date("2026-01-01"),
        payload: {
          window_days: 7,
          conditions: "Échange sous 7 jours, article non utilisé, étiquette intacte.",
        },
      },
    ],
  });

  // Placeholder channel accounts — status DISCONNECTED until merchant OAuth
  for (const channel of [Channel.instagram, Channel.messenger] as const) {
    const externalId = `pilot-pending-${partner.slug}-${channel}`;
    const existing = await prisma.channelAccount.findFirst({
      where: { business_id: business.id, channel },
    });
    if (existing) {
      await prisma.channelAccount.update({
        where: { id: existing.id },
        data: {
          display_name: `${partner.name} (${channel}) — connect via OAuth`,
          status: ChannelAccountStatus.disconnected,
          external_account_id: externalId,
          ig_user_id: channel === Channel.instagram ? partner.igHandle : null,
        },
      });
    } else {
      await prisma.channelAccount.create({
        data: {
          business_id: business.id,
          channel,
          external_account_id: externalId,
          display_name: `${partner.name} (${channel}) — connect via OAuth`,
          status: ChannelAccountStatus.disconnected,
          ig_user_id: channel === Channel.instagram ? partner.igHandle : null,
        },
      });
    }
  }

  const csvPath = path.join(repoRoot, "fixtures", "pilot", partner.csvFile);
  const rows = parseCsv(csvPath);
  const byProduct = new Map<string, CsvRow[]>();
  for (const row of rows) {
    const key = row.name;
    const list = byProduct.get(key) ?? [];
    list.push(row);
    byProduct.set(key, list);
  }

  let variantCount = 0;
  for (const [productName, variants] of byProduct) {
    const categoryName = variants[0]?.category || "General";
    let category = await prisma.productCategory.findFirst({
      where: { business_id: business.id, name: categoryName },
    });
    if (!category) {
      category = await prisma.productCategory.create({
        data: { business_id: business.id, name: categoryName },
      });
    }

    let product = await prisma.product.findFirst({
      where: { business_id: business.id, name: productName },
    });
    if (!product) {
      product = await prisma.product.create({
        data: {
          business_id: business.id,
          category_id: category.id,
          name: productName,
          description: variants[0]?.description ?? null,
          status: ProductStatus.active,
          currency: "TND",
        },
      });
    } else {
      product = await prisma.product.update({
        where: { id: product.id },
        data: {
          category_id: category.id,
          description: variants[0]?.description ?? null,
          status: ProductStatus.active,
          currency: "TND",
        },
      });
    }

    for (const [index, row] of variants.entries()) {
      const attributes: Record<string, string> = {};
      if (row.size) attributes.size = row.size;
      if (row.color) attributes.color = row.color;

      const existingVariant = await prisma.productVariant.findFirst({
        where: { business_id: business.id, sku: row.sku },
      });
      const data = {
        product_id: product.id,
        sku: row.sku,
        attributes: attributes as Prisma.InputJsonValue,
        price: new Prisma.Decimal(row.price_tnd),
        stock: Number.parseInt(row.stock, 10) || 0,
        is_default: index === 0,
      };
      if (existingVariant) {
        await prisma.productVariant.update({
          where: { id: existingVariant.id },
          data,
        });
      } else {
        await prisma.productVariant.create({
          data: {
            business_id: business.id,
            ...data,
          },
        });
      }
      variantCount += 1;
    }
  }

  console.log(`  ✓ ${byProduct.size} products / ${variantCount} variants (TND)`);
  console.log(`  ✓ Owner login: ${partner.email} / PilotPartner123!`);
  console.log(`  ✓ IG+Messenger placeholders ready for Meta OAuth`);
}

async function main() {
  console.log("Seeding Tunisia design-partner merchants (commercial launch gate)...");
  const ownerRole = await ensureOwnerRole();
  const passwordHash = await argon2.hash("PilotPartner123!", { type: argon2.argon2id });

  for (const partner of PARTNERS) {
    await seedPartner(partner, ownerRole.id, passwordHash);
  }

  console.log("\nDone. Next:");
  console.log("  1. Each owner completes Meta OAuth in Settings → Canaux");
  console.log("  2. Run playground + live IG/Messenger purchase loop (META_LIVE_LOOP.md)");
  console.log("  3. Track ≥20 interactions/merchant: pnpm pilot:report");
  console.log("  4. Fill docs/30_execution/PILOT_GATE_TRACKER.md");
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
