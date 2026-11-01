import "dotenv/config";
import * as crypto from "node:crypto";

import { PrismaPg } from "@prisma/adapter-pg";
import {
  Prisma,
  PrismaClient,
  Channel,
  ChannelAccountStatus,
  ContentType,
  ConversationSource,
  ConversationStatus,
  EvaluatorType,
  FeedbackRating,
  HandoffPriority,
  LeadTemperature,
  LifecycleStage,
  MessageDeliveryStatus,
  MessageDirection,
  NotificationType,
  OrderStatus,
  PaymentStatus,
  PromptType,
  ReplyMode,
  ReservationStatus,
  RuleType as PrismaRuleType,
  SenderType,
} from "@prisma/client";
import * as argon2 from "argon2";
import pg from "pg";

import { CANONICAL_PLANS } from "@app/shared";
import { env } from "@app/shared/server";

const connectionString = env.DATABASE_URL;
const pool = new pg.Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

// Deterministic 1536-dimensional unit vector for pgvector
function generateDeterministicVector(text: string): number[] {
  const hash = crypto.createHash("sha256").update(text).digest();
  const vector: number[] = Array.from<number>({ length: 1536 }).fill(0);
  let sumSq = 0;

  for (let i = 0; i < 1536; i++) {
    const byte = hash[i % hash.length] ?? 0;
    const val = (byte - 128) / 128 + Math.sin(i * 0.1) * 0.05;
    vector[i] = val;
    sumSq += val * val;
  }

  const norm = Math.sqrt(sumSq) || 1;
  for (let i = 0; i < 1536; i++) {
    const v = vector[i] ?? 0;
    vector[i] = Number((v / norm).toFixed(6));
  }

  return vector;
}

function sha256(content: string): string {
  return crypto.createHash("sha256").update(content, "utf8").digest("hex");
}

async function main() {
  console.log("🌱 Seeding comprehensive database for AI Sales Manager...");

  // --------------------------------------------------------------------------
  // 1. Roles & Permissions (13 §2.11 Canonical List)
  // --------------------------------------------------------------------------
  const allPermissions = [
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
  ];

  const adminPermissions = allPermissions.filter(
    (p) => !["billing.manage", "business.delete", "usage.read"].includes(p),
  );

  const employeePermissions = [
    "analytics.read",
    "inbox.read",
    "inbox.write",
    "orders.write",
    "customers.write",
  ];

  console.log("  → Upserting permissions...");
  const permissionRecords = await Promise.all(
    allPermissions.map((code) =>
      prisma.permission.upsert({
        where: { code },
        update: {},
        create: { code },
      }),
    ),
  );
  const permMap = new Map(permissionRecords.map((p) => [p.code, p.id]));

  console.log("  → Upserting system roles (owner, admin, employee)...");
  // Role lookup with null business_id
  async function upsertSystemRole(name: string) {
    const existing = await prisma.role.findFirst({
      where: { name, business_id: null },
    });
    if (existing) return existing;
    return prisma.role.create({
      data: { name, business_id: null },
    });
  }

  const ownerRole = await upsertSystemRole("owner");
  const adminRole = await upsertSystemRole("admin");
  const employeeRole = await upsertSystemRole("employee");

  // Link permissions to roles
  async function linkRolePermissions(roleId: string, codes: string[]) {
    for (const code of codes) {
      const permId = permMap.get(code);
      if (!permId) continue;
      await prisma.rolePermission.upsert({
        where: {
          role_id_permission_id: {
            role_id: roleId,
            permission_id: permId,
          },
        },
        update: {},
        create: {
          role_id: roleId,
          permission_id: permId,
        },
      });
    }
  }

  await linkRolePermissions(ownerRole.id, allPermissions);
  await linkRolePermissions(adminRole.id, adminPermissions);
  await linkRolePermissions(employeeRole.id, employeePermissions);

  // --------------------------------------------------------------------------
  // 2. Organization & Users (Better Auth & Native Auth Compatibility)
  // --------------------------------------------------------------------------
  console.log("  → Creating users and Better Auth organization...");
  const passwordHash = await argon2.hash("Password123!", {
    type: argon2.argon2id,
  });

  const organization = await prisma.organization.upsert({
    where: { id: "a0000000-0000-0000-0000-000000000000" },
    update: { name: "Maison Alyssa Tunis", slug: "maison-alyssa-tunis" },
    create: {
      id: "a0000000-0000-0000-0000-000000000000",
      name: "Maison Alyssa Tunis",
      slug: "maison-alyssa-tunis",
      logo: "https://images.unsplash.com/photo-1543087903-1ac2ec7aa8c5?w=150&auto=format&fit=crop&q=80",
    },
  });

  const usersData = [
    {
      id: "a1000000-0000-0000-0000-000000000001",
      email: "demo@example.com",
      name: "Karim Ben Salem",
      role: ownerRole,
      orgRole: "owner",
    },
    {
      id: "a1000000-0000-0000-0000-000000000002",
      email: "admin@example.com",
      name: "Sarra Mansour",
      role: adminRole,
      orgRole: "admin",
    },
    {
      id: "a1000000-0000-0000-0000-000000000003",
      email: "agent@example.com",
      name: "Yassine Trabelsi",
      role: employeeRole,
      orgRole: "employee",
    },
    {
      id: "a1000000-0000-0000-0000-000000000004",
      email: "nour@example.com",
      name: "Nour Karray",
      role: employeeRole,
      orgRole: "employee",
    },
  ];

  const seededUsers = await Promise.all(
    usersData.map(async (u) => {
      // Ensure canonical ID matches in database if user previously existed with a legacy ID
      await prisma.$executeRaw`UPDATE users SET id = ${u.id} WHERE email = ${u.email} AND id <> ${u.id};`;

      const user = await prisma.user.upsert({
        where: { email: u.email },
        update: {
          name: u.name,
          password_hash: passwordHash,
          email_verified_at: new Date(),
          emailVerified: true,
        },
        create: {
          id: u.id,
          email: u.email,
          name: u.name,
          password_hash: passwordHash,
          email_verified_at: new Date(),
          emailVerified: true,
        },
      });

      // Better Auth Account
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

      // Better Auth Organization Member
      await prisma.member.upsert({
        where: {
          organizationId_userId: {
            organizationId: organization.id,
            userId: user.id,
          },
        },
        update: { role: u.orgRole },
        create: {
          id: `mem-${user.id}`,
          organizationId: organization.id,
          userId: user.id,
          role: u.orgRole,
        },
      });

      return { ...user, roleRecord: u.role };
    }),
  );

  const ownerUser = seededUsers[0]!;
  const adminUser = seededUsers[1]!;
  const agentUser = seededUsers[2]!;
  const nourUser = seededUsers[3]!;

  await prisma.user.upsert({
    where: { email: "operator@example.com" },
    update: {
      name: "Platform Operator",
      password_hash: passwordHash,
      email_verified_at: new Date(),
      emailVerified: true,
      platform_admin: true,
    },
    create: {
      id: "a1000000-0000-0000-0000-000000000099",
      email: "operator@example.com",
      name: "Platform Operator",
      password_hash: passwordHash,
      email_verified_at: new Date(),
      emailVerified: true,
      platform_admin: true,
    },
  });
  const operatorUser = await prisma.user.findUniqueOrThrow({
    where: { email: "operator@example.com" },
  });
  await prisma.account.upsert({
    where: { id: `acc-${operatorUser.id}` },
    update: { password: passwordHash },
    create: {
      id: `acc-${operatorUser.id}`,
      userId: operatorUser.id,
      providerId: "credential",
      accountId: operatorUser.id,
      password: passwordHash,
    },
  });

  // --------------------------------------------------------------------------
  // 3. Demo Business & Onboarding
  // --------------------------------------------------------------------------
  console.log("  → Upserting primary business...");
  const demoBusiness = await prisma.business.upsert({
    where: { id: "a0000000-0000-0000-0000-000000000001" },
    update: {
      name: "Maison Alyssa Tunis",
      industry: "fashion",
      country: "TN",
      default_language: "fr",
      timezone: "Africa/Tunis",
      currency: "TND",
      organization_id: organization.id,
      settings: {},
    },
    create: {
      id: "a0000000-0000-0000-0000-000000000001",
      name: "Maison Alyssa Tunis",
      industry: "fashion",
      country: "TN",
      default_language: "fr",
      timezone: "Africa/Tunis",
      currency: "TND",
      organization_id: organization.id,
      settings: {},
    },
  });

  // Business Memberships
  for (const u of seededUsers) {
    await prisma.businessMember.upsert({
      where: {
        business_id_user_id: {
          business_id: demoBusiness.id,
          user_id: u.id,
        },
      },
      update: {
        role_id: u.roleRecord.id,
        removed_at: null,
      },
      create: {
        business_id: demoBusiness.id,
        user_id: u.id,
        role_id: u.roleRecord.id,
        joined_at: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      },
    });
  }

  // Business Onboarding (All gates unlocked & passed)
  await prisma.businessOnboarding.upsert({
    where: { business_id: demoBusiness.id },
    update: {
      business_created: true,
      channel_connected: true,
      products_imported: true,
      ai_configured: true,
      playground_passed: true,
      approval_trial_passed: true,
      handoff_acknowledged: true,
      ai_activated: true,
    },
    create: {
      business_id: demoBusiness.id,
      business_created: true,
      channel_connected: true,
      products_imported: true,
      ai_configured: true,
      playground_passed: true,
      approval_trial_passed: true,
      handoff_acknowledged: true,
      ai_activated: true,
    },
  });

  // Pending team invitation
  await prisma.invitation.upsert({
    where: {
      business_id_email: {
        business_id: demoBusiness.id,
        email: "chaima@example.com",
      },
    },
    update: {},
    create: {
      id: "a1100000-0000-0000-0000-000000000001",
      organizationId: organization.id,
      email: "chaima@example.com",
      role: "employee",
      status: "pending",
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      inviterId: ownerUser.id,
      business_id: demoBusiness.id,
      role_id: employeeRole.id,
    },
  });

  // --------------------------------------------------------------------------
  // 4. Plans, Subscriptions & Usage
  // --------------------------------------------------------------------------
  console.log("  → Setting up canonical plans and subscription...");
  for (const plan of Object.values(CANONICAL_PLANS)) {
    await prisma.plan.upsert({
      where: { code: plan.code },
      update: {
        name: plan.name,
        limits: plan.limits,
      },
      create: {
        code: plan.code,
        name: plan.name,
        limits: plan.limits,
      },
    });
  }

  const growthPlan = await prisma.plan.findUniqueOrThrow({
    where: { code: "growth" },
  });

  await prisma.subscription.upsert({
    where: { business_id: demoBusiness.id },
    update: {
      plan_id: growthPlan.id,
      status: "active",
      period_start: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
      period_end: new Date(Date.now() + 20 * 24 * 60 * 60 * 1000),
    },
    create: {
      business_id: demoBusiness.id,
      plan_id: growthPlan.id,
      status: "active",
      period_start: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
      period_end: new Date(Date.now() + 20 * 24 * 60 * 60 * 1000),
      provider: "manual",
      provider_ref: "sub_growth_tn_001",
    },
  });

  // Usage aggregates
  const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const endOfMonth = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0);

  await prisma.usageAggregate.upsert({
    where: {
      business_id_period_start_metric: {
        business_id: demoBusiness.id,
        period_start: startOfMonth,
        metric: "messages_out_ai",
      },
    },
    update: { quantity: 640 },
    create: {
      business_id: demoBusiness.id,
      period_start: startOfMonth,
      period_end: endOfMonth,
      metric: "messages_out_ai",
      quantity: 640,
    },
  });

  await prisma.usageAggregate.upsert({
    where: {
      business_id_period_start_metric: {
        business_id: demoBusiness.id,
        period_start: startOfMonth,
        metric: "orders_created",
      },
    },
    update: { quantity: 48 },
    create: {
      business_id: demoBusiness.id,
      period_start: startOfMonth,
      period_end: endOfMonth,
      metric: "orders_created",
      quantity: 48,
    },
  });

  // --------------------------------------------------------------------------
  // 5. Business Rules (12 §14.8 Canonical Shapes)
  // --------------------------------------------------------------------------
  console.log("  → Seeding Tunisian e-commerce business rules...");
  await prisma.businessRule.deleteMany({ where: { business_id: demoBusiness.id } });

  await prisma.businessRule.createMany({
    data: [
      {
        id: "b1000000-0000-0000-0000-000000000001",
        business_id: demoBusiness.id,
        rule_type: PrismaRuleType.delivery,
        priority: 1,
        enabled: true,
        effective_from: new Date("2026-01-01"),
        payload: {
          zones: [
            {
              name: "Grand Tunis (Tunis, Ariana, Ben Arous, Manouba)",
              fee: 7,
              currency: "TND",
              eta_hours: 24,
            },
            {
              name: "Sahel & Cap Bon (Sousse, Monastir, Nabeul)",
              fee: 8.5,
              currency: "TND",
              eta_hours: 48,
            },
            { name: "Sfax & Centre", fee: 9, currency: "TND", eta_hours: 48 },
            {
              name: "Sud & Intérieur (Gabès, Gafsa, Bizerte, etc.)",
              fee: 10,
              currency: "TND",
              eta_hours: 72,
            },
          ],
        },
      },
      {
        id: "b1000000-0000-0000-0000-000000000002",
        business_id: demoBusiness.id,
        rule_type: PrismaRuleType.payment,
        priority: 1,
        enabled: true,
        effective_from: new Date("2026-01-01"),
        payload: {
          methods: [
            { code: "cod", label: "Paiement à la livraison (Espèces à la réception)" },
            { code: "bank_transfer", label: "Virement bancaire / D17 / Flouci avant expédition" },
          ],
        },
      },
      {
        id: "b1000000-0000-0000-0000-000000000003",
        business_id: demoBusiness.id,
        rule_type: PrismaRuleType.returns,
        priority: 1,
        enabled: true,
        effective_from: new Date("2026-01-01"),
        payload: {
          window_days: 7,
          conditions:
            "Échange possible sous 7 jours. Article non porté, non lavé, avec étiquette d'origine intacte.",
        },
      },
      {
        id: "b1000000-0000-0000-0000-000000000004",
        business_id: demoBusiness.id,
        rule_type: PrismaRuleType.working_hours,
        priority: 1,
        enabled: true,
        effective_from: new Date("2026-01-01"),
        payload: {
          timezone: "Africa/Tunis",
          weekly: {
            mon: { open: "08:30", close: "19:30" },
            tue: { open: "08:30", close: "19:30" },
            wed: { open: "08:30", close: "19:30" },
            thu: { open: "08:30", close: "19:30" },
            fri: { open: "08:30", close: "19:30" },
            sat: { open: "09:00", close: "18:00" },
            sun: null,
          },
          human_callback: "next_working_day",
        },
      },
      {
        id: "b1000000-0000-0000-0000-000000000005",
        business_id: demoBusiness.id,
        rule_type: PrismaRuleType.discount,
        priority: 1,
        enabled: true,
        effective_from: new Date("2026-01-01"),
        payload: {
          ai_may_offer: false,
          max_percent: null,
        },
      },
      {
        id: "b1000000-0000-0000-0000-000000000006",
        business_id: demoBusiness.id,
        rule_type: PrismaRuleType.min_order,
        priority: 1,
        enabled: true,
        effective_from: new Date("2026-01-01"),
        payload: {
          amount: 30,
          currency: "TND",
        },
      },
      {
        id: "b1000000-0000-0000-0000-000000000007",
        business_id: demoBusiness.id,
        rule_type: PrismaRuleType.free_shipping,
        priority: 1,
        enabled: true,
        effective_from: new Date("2026-01-01"),
        payload: {
          threshold: 150,
          currency: "TND",
        },
      },
    ],
  });

  // --------------------------------------------------------------------------
  // 6. AI Agent, Settings & Prompts
  // --------------------------------------------------------------------------
  console.log("  → Configuring AI sales agent & prompts...");
  await prisma.aiAgent.upsert({
    where: { business_id: demoBusiness.id },
    update: {
      name: "Alyssa AI",
      personality: "Conseillère de vente experte, chaleureuse et persuasive",
      language: "fr",
      tone: "chaleureux, professionnel et raffiné",
      confidence_threshold: 0.65,
      enabled: true,
      sales_strategy: {
        upsell: true,
        cross_sell: true,
        aggressiveness: "medium",
      },
      greeting_template:
        "Bonjour ! Bienvenue chez Maison Alyssa Tunis 🌸 Comment puis-je vous sublimer aujourd'hui ?",
      fallback_template:
        "Je consulte immédiatement un conseiller de notre équipe pour vous assister au mieux. Un instant svp.",
    },
    create: {
      business_id: demoBusiness.id,
      name: "Alyssa AI",
      personality: "Conseillère de vente experte, chaleureuse et persuasive",
      language: "fr",
      tone: "chaleureux, professionnel et raffiné",
      confidence_threshold: 0.65,
      enabled: true,
      sales_strategy: {
        upsell: true,
        cross_sell: true,
        aggressiveness: "medium",
      },
      greeting_template:
        "Bonjour ! Bienvenue chez Maison Alyssa Tunis 🌸 Comment puis-je vous sublimer aujourd'hui ?",
      fallback_template:
        "Je consulte immédiatement un conseiller de notre équipe pour vous assister au mieux. Un instant svp.",
    },
  });

  await prisma.aiSettings.upsert({
    where: { business_id: demoBusiness.id },
    update: {
      model_primary: "gemini-3.5-flash",
      model_fallback: "gpt-5.6-terra",
      max_tokens: 1024,
      temperature: 0.2,
      rag_top_k: 5,
      include_product_images_in_context: true,
      blocked_topics: ["politique", "religion", "concurrents"],
      reply_mode: ReplyMode.auto_send,
      lead_hot_min: 80,
      lead_warm_min: 50,
      reservation_ttl_minutes: 30,
      inactivity_close_days: 30,
      monthly_ai_budget_usd: 50.0,
    },
    create: {
      business_id: demoBusiness.id,
      model_primary: "gemini-3.5-flash",
      model_fallback: "gpt-5.6-terra",
      max_tokens: 1024,
      temperature: 0.2,
      rag_top_k: 5,
      include_product_images_in_context: true,
      blocked_topics: ["politique", "religion", "concurrents"],
      reply_mode: ReplyMode.auto_send,
      lead_hot_min: 80,
      lead_warm_min: 50,
      reservation_ttl_minutes: 30,
      inactivity_close_days: 30,
      monthly_ai_budget_usd: 50.0,
    },
  });

  const promptConfigs = [
    {
      type: PromptType.system,
      content:
        "Tu es Alyssa, la conseillère de vente officielle de Maison Alyssa Tunis. Réponds avec élégance, clarté et précision en français ou en dialecte tunisien selon la langue du client. Guide toujours le client vers la validation de sa commande avec paiement à la livraison.",
    },
    {
      type: PromptType.sales,
      content:
        "Valorise la qualité des tissus tunisiens (soie lavée, lin peigné, finitions soignées). Propose toujours un article complémentaire (sac en cuir avec un blazer, ceinture assortie avec un palazzo) pour profiter de la livraison gratuite dès 150 DT.",
    },
    {
      type: PromptType.escalation,
      content:
        "Transfère immédiatement à un opérateur humain lorsque le client demande une personnalisation sur-mesure, signale un problème de paiement ou insiste pour parler à un responsable.",
    },
    {
      type: PromptType.handoff_summary,
      content:
        "Fournis un résumé concis au format standard: intention détectée, articles discutés, coordonnées collectées et action recommandée.",
    },
  ];

  for (const pc of promptConfigs) {
    await prisma.aiPrompt.upsert({
      where: {
        business_id_type_version: {
          business_id: demoBusiness.id,
          type: pc.type,
          version: 1,
        },
      },
      update: {
        content: pc.content,
        active: true,
      },
      create: {
        business_id: demoBusiness.id,
        type: pc.type,
        version: 1,
        active: true,
        content: pc.content,
        created_by_user_id: ownerUser.id,
      },
    });
  }

  // --------------------------------------------------------------------------
  // 7. Channels & Integrations
  // --------------------------------------------------------------------------
  console.log("  → Connecting social channels (Instagram, Messenger, WhatsApp)...");
  const igAccount = await prisma.channelAccount.upsert({
    where: {
      business_id_channel_external_account_id: {
        business_id: demoBusiness.id,
        channel: Channel.instagram,
        external_account_id: "ig_maison_alyssa_tn",
      },
    },
    update: { status: ChannelAccountStatus.active },
    create: {
      id: "c1000000-0000-0000-0000-000000000001",
      business_id: demoBusiness.id,
      channel: Channel.instagram,
      external_account_id: "ig_maison_alyssa_tn",
      display_name: "@maison.alyssa.tn (Instagram Direct)",
      status: ChannelAccountStatus.active,
      connected_at: new Date(Date.now() - 45 * 24 * 60 * 60 * 1000),
      last_inbound_at: new Date(Date.now() - 5 * 60 * 1000),
    },
  });

  const fbAccount = await prisma.channelAccount.upsert({
    where: {
      business_id_channel_external_account_id: {
        business_id: demoBusiness.id,
        channel: Channel.messenger,
        external_account_id: "fb_page_1092837465",
      },
    },
    update: { status: ChannelAccountStatus.active },
    create: {
      id: "c1000000-0000-0000-0000-000000000002",
      business_id: demoBusiness.id,
      channel: Channel.messenger,
      external_account_id: "fb_page_1092837465",
      page_id: "1092837465",
      display_name: "Maison Alyssa Tunis (Page Facebook)",
      status: ChannelAccountStatus.active,
      connected_at: new Date(Date.now() - 40 * 24 * 60 * 60 * 1000),
      last_inbound_at: new Date(Date.now() - 15 * 60 * 1000),
    },
  });

  const waAccount = await prisma.channelAccount.upsert({
    where: {
      business_id_channel_external_account_id: {
        business_id: demoBusiness.id,
        channel: Channel.whatsapp,
        external_account_id: "waba_21698123456",
      },
    },
    update: { status: ChannelAccountStatus.active },
    create: {
      id: "c1000000-0000-0000-0000-000000000003",
      business_id: demoBusiness.id,
      channel: Channel.whatsapp,
      external_account_id: "waba_21698123456",
      waba_id: "waba_21698123456",
      phone_number_id: "phone_waba_21698123456",
      display_name: "+216 98 123 456 (WhatsApp Business)",
      status: ChannelAccountStatus.active,
      connected_at: new Date(Date.now() - 35 * 24 * 60 * 60 * 1000),
      last_inbound_at: new Date(Date.now() - 2 * 60 * 1000),
    },
  });

  // --------------------------------------------------------------------------
  // 8. Catalog: Categories, Products, Variants, Images
  // --------------------------------------------------------------------------
  console.log("  → Seeding catalog (categories, products, variants, images)...");
  const categoriesData = [
    { id: "c2000000-0000-0000-0000-000000000001", name: "Robes & Combinaisons", sort_order: 1 },
    { id: "c2000000-0000-0000-0000-000000000002", name: "Vestes & Manteaux", sort_order: 2 },
    { id: "c2000000-0000-0000-0000-000000000003", name: "Hauts & Chemisiers", sort_order: 3 },
    { id: "c2000000-0000-0000-0000-000000000004", name: "Pantalons & Jupes", sort_order: 4 },
    {
      id: "c2000000-0000-0000-0000-000000000005",
      name: "Accessoires & Maroquinerie",
      sort_order: 5,
    },
  ];

  const categories = await Promise.all(
    categoriesData.map((c) =>
      prisma.productCategory.upsert({
        where: { id_business_id: { id: c.id, business_id: demoBusiness.id } },
        update: { name: c.name, sort_order: c.sort_order },
        create: {
          id: c.id,
          business_id: demoBusiness.id,
          name: c.name,
          sort_order: c.sort_order,
        },
      }),
    ),
  );

  const catRobes = categories[0]!;
  const catVestes = categories[1]!;
  const catHauts = categories[2]!;
  const catPantalons = categories[3]!;
  const catAccessoires = categories[4]!;

  const productsCatalog = [
    {
      id: "d1000000-0000-0000-0000-000000000001",
      category_id: catRobes.id,
      name: "Robe Soie Alyssa Émeraude",
      description:
        "Magnifique robe longue en soie lavée tunisienne de qualité supérieure, vert émeraude profond avec découpe fluide et ceinture amovible.",
      benefits: [
        "100% soie lavée naturelle respirante et douce au toucher",
        "Coupe empire sublimant toutes les morphologies",
        "Teinture artisanale grand teint résistante au lavage",
      ],
      selling_points: [
        "Confectionnée à la main dans notre atelier de La Marsa",
        "Livraison sous 24h sur le Grand Tunis, 48h sur le reste de la Tunisie",
        "Échange de taille garanti sous 7 jours sans frais",
      ],
      objections: [
        "Lavage en machine à froid programme délicat ou à la main",
        "Tissu opaque qui ne nécessite aucun fond de robe",
      ],
      faqs: [
        {
          q: "Quelle taille choisir si je fais du 38 ?",
          a: "La taille M convient parfaitement pour un 38-40 ajusté.",
        },
        {
          q: "Le tissu est-il transparent ?",
          a: "Non, la soie lavée 120g/m² est 100% opaque avec un tombé lourd.",
        },
      ],
      images: [
        {
          s3_key: "products/robe-emeraude-front.jpg",
          url: "https://images.unsplash.com/photo-1595777457583-95e059d581b8?w=800&auto=format&fit=crop&q=80",
          alt: "Robe Soie Alyssa Émeraude de face",
        },
      ],
      variants: [
        {
          id: "d2000000-0000-0000-0000-000000000001",
          sku: "ROBE-EME-S",
          attrs: { color: "Émeraude", size: "S" },
          price: 189.0,
          stock: 12,
          is_default: false,
        },
        {
          id: "d2000000-0000-0000-0000-000000000002",
          sku: "ROBE-EME-M",
          attrs: { color: "Émeraude", size: "M" },
          price: 189.0,
          stock: 18,
          is_default: true,
        },
        {
          id: "d2000000-0000-0000-0000-000000000003",
          sku: "ROBE-EME-L",
          attrs: { color: "Émeraude", size: "L" },
          price: 189.0,
          stock: 8,
          is_default: false,
        },
      ],
    },
    {
      id: "d1000000-0000-0000-0000-000000000002",
      category_id: catVestes.id,
      name: "Blazer Structuré Carthage Crème",
      description:
        "Blazer oversize cintré en crêpe lourd infroissable, doublure en satin de soie et boutons dorés gravés de motifs carthaginois.",
      benefits: [
        "Crêpe tailleur 380 GSM à tenue impeccable",
        "Épaulettes structurées modernes",
        "Doublure satinée respirante",
      ],
      selling_points: ["Pièce maîtresse chic de jour comme de soirée", "Boutons dorés inoxydables"],
      objections: ["Nettoyage à sec recommandé"],
      faqs: [
        {
          q: "Le blazer est-il très oversize ?",
          a: "Il a une coupe boyfriend légèrement ample. Prenez votre taille habituelle pour l'effet stylé.",
        },
      ],
      images: [
        {
          s3_key: "products/blazer-carthage-front.jpg",
          url: "https://images.unsplash.com/photo-1584273143981-41c073dfe8f8?w=800&auto=format&fit=crop&q=80",
          alt: "Blazer Structuré Carthage Crème",
        },
      ],
      variants: [
        {
          id: "d2000000-0000-0000-0000-000000000004",
          sku: "BLAZ-CRM-S",
          attrs: { color: "Crème", size: "S" },
          price: 220.0,
          discount: 195.0,
          stock: 10,
          is_default: false,
        },
        {
          id: "d2000000-0000-0000-0000-000000000005",
          sku: "BLAZ-CRM-M",
          attrs: { color: "Crème", size: "M" },
          price: 220.0,
          discount: 195.0,
          stock: 22,
          is_default: true,
        },
        {
          id: "d2000000-0000-0000-0000-000000000006",
          sku: "BLAZ-CRM-L",
          attrs: { color: "Crème", size: "L" },
          price: 220.0,
          discount: 195.0,
          stock: 14,
          is_default: false,
        },
      ],
    },
    {
      id: "d1000000-0000-0000-0000-000000000003",
      category_id: catHauts.id,
      name: "Chemise en Lin Naturel Sable",
      description:
        "Chemise intemporelle 100% lin naturel tissé en Tunisie, col officier, coupe décontractée et boutons en nacre véritable.",
      benefits: [
        "100% lin lavé naturel thermorégulateur",
        "Coupe respirante idéale pour le climat méditerranéen",
      ],
      selling_points: [
        "Tissage traditionnel tunisien",
        "Doux dès le premier porté grâce au pré-lavage",
      ],
      objections: ["Le lin acquiert sa souplesse au fil des lavages"],
      faqs: [
        {
          q: "Est-ce qu'elle rétrécit au lavage ?",
          a: "Non, le tissu est pré-lavé et stabilisé avant confection.",
        },
      ],
      images: [
        {
          s3_key: "products/chemise-lin-sable.jpg",
          url: "https://images.unsplash.com/photo-1598033129183-c4f50c736f10?w=800&auto=format&fit=crop&q=80",
          alt: "Chemise en Lin Naturel Sable",
        },
      ],
      variants: [
        {
          id: "d2000000-0000-0000-0000-000000000007",
          sku: "CHLIN-SAB-M",
          attrs: { color: "Sable", size: "M" },
          price: 110.0,
          stock: 30,
          is_default: true,
        },
        {
          id: "d2000000-0000-0000-0000-000000000008",
          sku: "CHLIN-SAB-L",
          attrs: { color: "Sable", size: "L" },
          price: 110.0,
          stock: 25,
          is_default: false,
        },
        {
          id: "d2000000-0000-0000-0000-000000000009",
          sku: "CHLIN-SAB-XL",
          attrs: { color: "Sable", size: "XL" },
          price: 110.0,
          stock: 15,
          is_default: false,
        },
      ],
    },
    {
      id: "d1000000-0000-0000-0000-000000000004",
      category_id: catPantalons.id,
      name: "Pantalon Large Palazzo Noir",
      description:
        "Pantalon taille haute palazzo en crêpe stretch noir profond avec poches italiennes et tombé ultra-fluide.",
      benefits: [
        "Allonge la silhouette avec sa coupe palazzo évasée",
        "Ceinture haute gainante ultra-confortable",
      ],
      selling_points: ["S'accorde parfaitement avec nos blazers et chemises en soie"],
      objections: [],
      faqs: [],
      images: [
        {
          s3_key: "products/palazzo-noir.jpg",
          url: "https://images.unsplash.com/photo-1509551388413-e18d0ac5d495?w=800&auto=format&fit=crop&q=80",
          alt: "Pantalon Large Palazzo Noir",
        },
      ],
      variants: [
        {
          id: "d2000000-0000-0000-0000-000000000010",
          sku: "PALAZ-BLK-38",
          attrs: { color: "Noir", size: "38" },
          price: 135.0,
          stock: 20,
          is_default: true,
        },
        {
          id: "d2000000-0000-0000-0000-000000000011",
          sku: "PALAZ-BLK-40",
          attrs: { color: "Noir", size: "40" },
          price: 135.0,
          stock: 15,
          is_default: false,
        },
        {
          id: "d2000000-0000-0000-0000-000000000012",
          sku: "PALAZ-BLK-42",
          attrs: { color: "Noir", size: "42" },
          price: 135.0,
          stock: 9,
          is_default: false,
        },
      ],
    },
    {
      id: "d1000000-0000-0000-0000-000000000005",
      category_id: catAccessoires.id,
      name: "Sac Cabas Cuir Tannage Végétal Tan",
      description:
        "Cabas spacieux en cuir de vachette pleine fleur tanné naturellement à Sfax, anses renforcées et pochette zippée amovible.",
      benefits: [
        "Cuir véritable de première qualité qui se patine avec le temps",
        "Grand format pouvant accueillir un ordinateur portable 15 pouces",
      ],
      selling_points: [
        "Fait main par les maîtres maroquiniers de Sfax",
        "Garantie à vie sur les coutures",
      ],
      objections: [],
      faqs: [],
      images: [
        {
          s3_key: "products/cabas-cuir-tan.jpg",
          url: "https://images.unsplash.com/photo-1548036328-c9fa89d128fa?w=800&auto=format&fit=crop&q=80",
          alt: "Sac Cabas Cuir Tannage Végétal Tan",
        },
      ],
      variants: [
        {
          id: "d2000000-0000-0000-0000-000000000013",
          sku: "CABAS-CUIR-TAN",
          attrs: { color: "Tan", size: "Unique" },
          price: 260.0,
          stock: 7,
          is_default: true,
        },
      ],
    },
  ];

  const seededProducts = [];
  const variantMap = new Map();

  await prisma.productImage.deleteMany({ where: { business_id: demoBusiness.id } });

  for (const p of productsCatalog) {
    const prod = await prisma.product.upsert({
      where: { id_business_id: { id: p.id, business_id: demoBusiness.id } },
      update: {
        category_id: p.category_id,
        name: p.name,
        description: p.description,
        status: "active",
        currency: "TND",
        benefits: p.benefits,
        selling_points: p.selling_points,
        objections: p.objections,
        faqs: p.faqs,
      },
      create: {
        id: p.id,
        business_id: demoBusiness.id,
        category_id: p.category_id,
        name: p.name,
        description: p.description,
        status: "active",
        currency: "TND",
        benefits: p.benefits,
        selling_points: p.selling_points,
        objections: p.objections,
        faqs: p.faqs,
      },
    });

    seededProducts.push(prod);

    // Variants
    for (const v of p.variants) {
      const discountPrice = "discount" in v && typeof v.discount === "number" ? v.discount : null;
      const variant = await prisma.productVariant.upsert({
        where: { id_business_id: { id: v.id, business_id: demoBusiness.id } },
        update: {
          sku: v.sku,
          attributes: v.attrs,
          price: v.price,
          discount_price: discountPrice,
          stock: v.stock,
          is_default: v.is_default,
        },
        create: {
          id: v.id,
          business_id: demoBusiness.id,
          product_id: prod.id,
          sku: v.sku,
          attributes: v.attrs,
          price: v.price,
          discount_price: discountPrice,
          stock: v.stock,
          is_default: v.is_default,
        },
      });
      variantMap.set(v.sku, variant);
    }

    // Images
    for (let i = 0; i < p.images.length; i++) {
      const img = p.images[i]!;
      await prisma.productImage.create({
        data: {
          id: crypto.randomUUID(),
          business_id: demoBusiness.id,
          product_id: prod.id,
          s3_key: img.s3_key,
          url: img.url,
          alt_text: img.alt,
          sort_order: i + 1,
          is_primary: i === 0,
        },
      });
    }
  }

  // --------------------------------------------------------------------------
  // 9. Knowledge Documents & Vector Embeddings
  // --------------------------------------------------------------------------
  console.log("  → Creating merchant knowledge base & vector embeddings...");
  const knowledgeDocs = [
    {
      id: "e1000000-0000-0000-0000-000000000001",
      title: "Politique de Livraison et Délais en Tunisie",
      source_type: "policy",
      raw_text: `Maison Alyssa assure la livraison à domicile sur toute la Tunisie par transporteur privé express.
Grand Tunis (Tunis, Ariana, Ben Arous, Manouba) : tarif 7 DT, livraison sous 24 heures ouvrées.
Sahel, Cap Bon et Sfax : tarif 8.500 à 9 DT, livraison sous 24 à 48 heures.
Sud et régions intérieures : tarif 10 DT, livraison sous 48 à 72 heures.
La livraison est 100% gratuite pour toute commande d'un montant supérieur ou égal à 150 DT.
Le paiement se fait principalement en espèces à la livraison (Cash On Delivery). Le virement instantané via D17 ou Flouci est également accepté sur demande.`,
    },
    {
      id: "e1000000-0000-0000-0000-000000000002",
      title: "Guide des Tailles et Conseils de Morphologie",
      source_type: "guide",
      raw_text: `Guide officiel des tailles Maison Alyssa Tunis :
Taille S : correspond au 36 français / tunisien. Tour de poitrine 84-88 cm, tour de taille 64-68 cm.
Taille M : correspond au 38-40. Tour de poitrine 88-94 cm, tour de taille 68-74 cm.
Taille L : correspond au 42. Tour de poitrine 94-100 cm, tour de taille 74-80 cm.
Taille XL : correspond au 44-46.
Nos coupes sont étudiées pour offrir un tombé fluide et confortable. En cas d'hésitation entre deux tailles sur les robes en soie, nous conseillons la taille supérieure pour conserver l'effet fluide élégant.`,
    },
    {
      id: "e1000000-0000-0000-0000-000000000003",
      title: "Conditions d'Échange et Retours",
      source_type: "policy",
      raw_text: `Tout article commandé peut faire l'objet d'un échange sous un délai de 7 jours à compter de la réception du colis.
L'article doit être strictement neuf, non porté, non lavé, avec toutes ses étiquettes d'origine intactes et dans son emballage d'origine.
Le livreur passe récupérer l'article chez vous lors de la livraison de votre nouvelle taille ou nouveau modèle.
Les frais de transport pour le premier échange de taille sont pris en charge par Maison Alyssa.`,
    },
  ];

  for (const doc of knowledgeDocs) {
    const kDoc = await prisma.knowledgeDocument.upsert({
      where: { id: doc.id },
      update: {
        title: doc.title,
        source_type: doc.source_type,
        raw_text: doc.raw_text,
        content_hash: sha256(doc.raw_text),
        indexing_status: "ready",
      },
      create: {
        id: doc.id,
        business_id: demoBusiness.id,
        title: doc.title,
        source_type: doc.source_type,
        raw_text: doc.raw_text,
        content_hash: sha256(doc.raw_text),
        indexing_status: "ready",
      },
    });

    // Vector embedding upsert if pgvector exists
    try {
      const vector = generateDeterministicVector(doc.raw_text);
      const vectorString = `[${vector.join(",")}]`;
      await prisma.$executeRawUnsafe(
        `INSERT INTO embeddings (id, business_id, source_type, source_id, chunk_index, chunk_text, content_hash, embedding, created_at)
         VALUES (gen_random_uuid(), $1::uuid, 'knowledge_document'::"EmbeddingSource", $2::uuid, 0, $3, $4, $5::vector, NOW())
         ON CONFLICT (business_id, source_type, source_id, chunk_index)
         DO UPDATE SET
           chunk_text = EXCLUDED.chunk_text,
           content_hash = EXCLUDED.content_hash,
           embedding = EXCLUDED.embedding,
           created_at = NOW()`,
        demoBusiness.id,
        kDoc.id,
        doc.raw_text.substring(0, 500),
        sha256(doc.raw_text),
        vectorString,
      );
    } catch {
      // Ignored if pgvector extension / table is not present in local fallback
    }
  }

  // --------------------------------------------------------------------------
  // 10. Customers across Lifecycle Stages (VIP, Returning, Pending, Lead, Test)
  // --------------------------------------------------------------------------
  console.log("  → Creating rich customer profiles & social identities...");
  const customersData = [
    {
      id: "e2000000-0000-0000-0000-000000000001",
      name: "Syrine Bouazizi",
      phone: "+21698765432",
      email: "syrine.bouazizi@gmail.com",
      stage: LifecycleStage.vip,
      ordersCount: 4,
      lastOrderAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
      is_test: false,
      address: {
        line1: "14 Rue du Lac Léman, Berges du Lac 1",
        city: "Tunis",
        region: "Grand Tunis",
        postal_code: "1053",
        country: "TN",
      },
      preferences: { sizes: ["M", "38"], colors: ["Émeraude", "Crème"] },
      tags: ["VIP", "Fidèle", "Mode Soirée", "Grand Tunis"],
      notes:
        "Cliente très distinguée, commande régulièrement pour des événements diplomatiques. Toujours livrer l'après-midi.",
      identities: [
        { platform: Channel.instagram, platform_user_id: "ig_syrine_b", phone: null },
        { platform: Channel.whatsapp, platform_user_id: "+21698765432", phone: "+21698765432" },
      ],
    },
    {
      id: "e2000000-0000-0000-0000-000000000002",
      name: "Amine Khemir",
      phone: "+21622345678",
      email: "amine.khemir@topnet.tn",
      stage: LifecycleStage.returning_customer,
      ordersCount: 2,
      lastOrderAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
      is_test: false,
      address: {
        line1: "Avenue Hédi Chaker, Immeuble Alyssa",
        city: "Sfax",
        region: "Sfax",
        postal_code: "3000",
        country: "TN",
      },
      preferences: { sizes: ["M", "L"], colors: ["Sable", "Blanc"] },
      tags: ["Sfax", "Paiement COD"],
      notes: "Préfère les confirmations par WhatsApp. Réactif le matin.",
      identities: [
        { platform: Channel.messenger, platform_user_id: "fb_amine_khemir", phone: "+21622345678" },
      ],
    },
    {
      id: "e2000000-0000-0000-0000-000000000003",
      name: "Mariem Jaziri",
      phone: "+21655678901",
      email: "mariem.j@yahoo.com",
      stage: LifecycleStage.order_pending,
      ordersCount: 0,
      lastOrderAt: null,
      is_test: false,
      address: {
        line1: "Résidence Ennasr 2, Bloc B",
        city: "Ariana",
        region: "Grand Tunis",
        postal_code: "2037",
        country: "TN",
      },
      preferences: { sizes: ["M"], colors: ["Émeraude"] },
      tags: ["Nouveau", "Intérêt Robe Émeraude", "Chaud"],
      notes: "Demande la confirmation de la livraison avant ce weekend pour un mariage.",
      identities: [
        {
          platform: Channel.instagram,
          platform_user_id: "ig_mariem_jaziri",
          phone: "+21655678901",
        },
      ],
    },
    {
      id: "e2000000-0000-0000-0000-000000000004",
      name: "Inès Ben Amor",
      phone: "+21620112233",
      email: "ines.ba@gmail.com",
      stage: LifecycleStage.qualified_lead,
      ordersCount: 0,
      lastOrderAt: null,
      is_test: false,
      address: {
        line1: "Boulevard 14 Janvier, Kantaoui",
        city: "Sousse",
        region: "Sousse",
        postal_code: "4089",
        country: "TN",
      },
      preferences: { sizes: ["S", "M"], colors: ["Crème"] },
      tags: ["Sousse", "Demande Gros / Entreprise"],
      notes:
        "Souhaite équiper une équipe d'hôtesses avec le Blazer Carthage. Escalade requise pour offre tarifaire.",
      identities: [
        { platform: Channel.whatsapp, platform_user_id: "+21620112233", phone: "+21620112233" },
      ],
    },
    {
      id: "e2000000-0000-0000-0000-000000000005",
      name: "Karim Chahed",
      phone: "+21699887766",
      email: null,
      stage: LifecycleStage.interested,
      ordersCount: 0,
      lastOrderAt: null,
      is_test: false,
      address: null,
      preferences: {},
      tags: ["Demande Infos", "Cap Bon"],
      notes: "",
      identities: [
        { platform: Channel.whatsapp, platform_user_id: "+21699887766", phone: "+21699887766" },
      ],
    },
    {
      id: "e2000000-0000-0000-0000-000000000006",
      name: "Salma Mansouri",
      phone: "+21694556677",
      email: null,
      stage: LifecycleStage.unknown_visitor,
      ordersCount: 0,
      lastOrderAt: null,
      is_test: false,
      address: null,
      preferences: {},
      tags: ["Nouveau Visiteur"],
      notes: "",
      identities: [
        {
          platform: Channel.messenger,
          platform_user_id: "fb_salma_mansouri",
          phone: "+21694556677",
        },
      ],
    },
    {
      id: "e2000000-0000-0000-0000-000000000007",
      name: "Visiteur Test Playground",
      phone: "+21600000000",
      email: "test@playground.local",
      stage: LifecycleStage.unknown_visitor,
      ordersCount: 0,
      lastOrderAt: null,
      is_test: true, // Crucial: Playground test customer excluded from KPI rollups
      address: null,
      preferences: {},
      tags: ["Playground", "Test"],
      notes: "Utilisateur de test généré par le bac à sable commercial.",
      identities: [],
    },
  ];

  const seededCustomers = [];
  for (const c of customersData) {
    const cust = await prisma.customer.upsert({
      where: { id_business_id: { id: c.id, business_id: demoBusiness.id } },
      update: {
        name: c.name,
        phone: c.phone,
        email: c.email,
        lifecycle_stage: c.stage,
        confirmed_order_count: c.ordersCount,
        last_confirmed_order_at: c.lastOrderAt,
        address: (c.address as Prisma.InputJsonValue) ?? Prisma.JsonNull,
        preferences: c.preferences,
        is_test: c.is_test,
      },
      create: {
        id: c.id,
        business_id: demoBusiness.id,
        name: c.name,
        phone: c.phone,
        email: c.email,
        lifecycle_stage: c.stage,
        confirmed_order_count: c.ordersCount,
        last_confirmed_order_at: c.lastOrderAt,
        address: (c.address as Prisma.InputJsonValue) ?? Prisma.JsonNull,
        preferences: c.preferences,
        is_test: c.is_test,
      },
    });

    seededCustomers.push(cust);

    // Tags
    for (const tag of c.tags) {
      await prisma.customerTag.upsert({
        where: { customer_id_tag: { customer_id: cust.id, tag } },
        update: {},
        create: {
          id: crypto.randomUUID(),
          business_id: demoBusiness.id,
          customer_id: cust.id,
          tag,
          created_by_user_id: ownerUser.id,
        },
      });
    }

    // Notes
    if (c.notes) {
      const existingNote = await prisma.customerNote.findFirst({
        where: { customer_id: cust.id },
      });
      if (!existingNote) {
        await prisma.customerNote.create({
          data: {
            id: crypto.randomUUID(),
            business_id: demoBusiness.id,
            customer_id: cust.id,
            author_user_id: adminUser.id,
            body: c.notes,
          },
        });
      }
    }

    // Identities
    for (const idn of c.identities) {
      await prisma.customerIdentity.upsert({
        where: {
          business_id_platform_platform_user_id: {
            business_id: demoBusiness.id,
            platform: idn.platform,
            platform_user_id: idn.platform_user_id,
          },
        },
        update: { phone_number: idn.phone },
        create: {
          id: crypto.randomUUID(),
          business_id: demoBusiness.id,
          customer_id: cust.id,
          platform: idn.platform,
          platform_user_id: idn.platform_user_id,
          phone_number: idn.phone,
          verified_at: new Date(),
        },
      });
    }
  }

  const custSyrine = seededCustomers[0]!;
  const custAmine = seededCustomers[1]!;
  const custMariem = seededCustomers[2]!;
  const custInes = seededCustomers[3]!;
  const custKarim = seededCustomers[4]!;
  const custSalma = seededCustomers[5]!;
  const custPlayground = seededCustomers[6]!;

  // --------------------------------------------------------------------------
  // 11. Orders & Order Items
  // --------------------------------------------------------------------------
  console.log("  → Creating orders in all statuses (PENDING, CONFIRMED, COMPLETED, CANCELLED)...");

  // Variant helpers
  const varRobeEmeraudeM = variantMap.get("ROBE-EME-M")!;
  const varBlazerCarthageM = variantMap.get("BLAZ-CRM-M")!;
  const varChemiseLinSableM = variantMap.get("CHLIN-SAB-M")!;
  const varPalazzoNoir40 = variantMap.get("PALAZ-BLK-40")!;
  const varCabasCuirTan = variantMap.get("CABAS-CUIR-TAN")!;

  // Order 1: PENDING_CONFIRMATION (Mariem Jaziri, linked to upcoming conversation 1)
  const orderPending = await prisma.order.upsert({
    where: {
      id_business_id: { id: "f1000000-0000-0000-0000-000000000001", business_id: demoBusiness.id },
    },
    update: {},
    create: {
      id: "f1000000-0000-0000-0000-000000000001",
      business_id: demoBusiness.id,
      customer_id: custMariem.id,
      conversation_id: "f2000000-0000-0000-0000-000000000001",
      status: OrderStatus.PENDING_CONFIRMATION,
      payment_status: PaymentStatus.NOT_COMPLETED,
      currency: "TND",
      subtotal: 189.0,
      delivery_fee: 7.0,
      total: 196.0,
      customer_snapshot: {
        name: custMariem.name,
        phone: custMariem.phone,
        address: custMariem.address,
      } as Prisma.InputJsonObject,
      delivery_address: (custMariem.address as Prisma.InputJsonValue) ?? Prisma.JsonNull,
      created_by_type: "ai",
      idempotency_key: "idem-order-pending-001",
      is_test: false,
    },
  });

  await prisma.orderItem.deleteMany({ where: { order_id: orderPending.id } });
  await prisma.orderItem.create({
    data: {
      id: crypto.randomUUID(),
      business_id: demoBusiness.id,
      order_id: orderPending.id,
      variant_id: varRobeEmeraudeM.id,
      quantity: 1,
      unit_price: 189.0,
      name_snapshot: "Robe Soie Alyssa Émeraude",
      sku_snapshot: "ROBE-EME-M",
      attributes_snapshot: { color: "Émeraude", size: "M" },
    },
  });

  // Active stock reservation for pending order
  await prisma.stockReservation.upsert({
    where: { id: "f0000000-0000-0000-0000-000000000001" },
    update: {},
    create: {
      id: "f0000000-0000-0000-0000-000000000001",
      business_id: demoBusiness.id,
      variant_id: varRobeEmeraudeM.id,
      conversation_id: "f2000000-0000-0000-0000-000000000001",
      order_id: orderPending.id,
      quantity: 1,
      status: ReservationStatus.active,
      reserved_at: new Date(Date.now() - 10 * 60 * 1000),
      expires_at: new Date(Date.now() + 20 * 60 * 1000),
    },
  });

  // Order 2: CONFIRMED (Syrine Bouazizi - 455 DT, Free delivery)
  const orderConfirmed = await prisma.order.upsert({
    where: {
      id_business_id: { id: "f1000000-0000-0000-0000-000000000002", business_id: demoBusiness.id },
    },
    update: {},
    create: {
      id: "f1000000-0000-0000-0000-000000000002",
      business_id: demoBusiness.id,
      customer_id: custSyrine.id,
      conversation_id: "f2000000-0000-0000-0000-000000000004",
      status: OrderStatus.CONFIRMED,
      payment_status: PaymentStatus.NOT_COMPLETED,
      currency: "TND",
      subtotal: 455.0,
      delivery_fee: 0.0,
      total: 455.0,
      customer_snapshot: {
        name: custSyrine.name,
        phone: custSyrine.phone,
        address: custSyrine.address,
      } as Prisma.InputJsonObject,
      delivery_address: (custSyrine.address as Prisma.InputJsonValue) ?? Prisma.JsonNull,
      created_by_type: "human",
      created_by_user_id: adminUser.id,
      idempotency_key: "idem-order-confirmed-002",
      is_test: false,
      order_confirmed_at: new Date(Date.now() - 4 * 60 * 60 * 1000),
    },
  });

  await prisma.orderItem.deleteMany({ where: { order_id: orderConfirmed.id } });
  await prisma.orderItem.createMany({
    data: [
      {
        id: crypto.randomUUID(),
        business_id: demoBusiness.id,
        order_id: orderConfirmed.id,
        variant_id: varBlazerCarthageM.id,
        quantity: 1,
        unit_price: 195.0,
        name_snapshot: "Blazer Structuré Carthage Crème",
        sku_snapshot: "BLAZ-CRM-M",
        attributes_snapshot: { color: "Crème", size: "M" },
      },
      {
        id: crypto.randomUUID(),
        business_id: demoBusiness.id,
        order_id: orderConfirmed.id,
        variant_id: varCabasCuirTan.id,
        quantity: 1,
        unit_price: 260.0,
        name_snapshot: "Sac Cabas Cuir Tannage Végétal Tan",
        sku_snapshot: "CABAS-CUIR-TAN",
        attributes_snapshot: { color: "Tan", size: "Unique" },
      },
    ],
  });

  // Order 3: COMPLETED (Amine Khemir - 229 DT)
  const orderCompleted = await prisma.order.upsert({
    where: {
      id_business_id: { id: "f1000000-0000-0000-0000-000000000003", business_id: demoBusiness.id },
    },
    update: {},
    create: {
      id: "f1000000-0000-0000-0000-000000000003",
      business_id: demoBusiness.id,
      customer_id: custAmine.id,
      status: OrderStatus.COMPLETED,
      payment_status: PaymentStatus.COMPLETED,
      currency: "TND",
      subtotal: 220.0,
      delivery_fee: 9.0,
      total: 229.0,
      customer_snapshot: {
        name: custAmine.name,
        phone: custAmine.phone,
        address: custAmine.address,
      } as Prisma.InputJsonObject,
      delivery_address: (custAmine.address as Prisma.InputJsonValue) ?? Prisma.JsonNull,
      created_by_type: "human",
      idempotency_key: "idem-order-completed-003",
      is_test: false,
      order_confirmed_at: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
      completed_at: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
    },
  });

  await prisma.orderItem.deleteMany({ where: { order_id: orderCompleted.id } });
  await prisma.orderItem.create({
    data: {
      id: crypto.randomUUID(),
      business_id: demoBusiness.id,
      order_id: orderCompleted.id,
      variant_id: varChemiseLinSableM.id,
      quantity: 2,
      unit_price: 110.0,
      name_snapshot: "Chemise en Lin Naturel Sable",
      sku_snapshot: "CHLIN-SAB-M",
      attributes_snapshot: { color: "Sable", size: "M" },
    },
  });

  // Order 4: CANCELLED (Pantalon Palazzo 40)
  const orderCancelled = await prisma.order.upsert({
    where: {
      id_business_id: { id: "f1000000-0000-0000-0000-000000000004", business_id: demoBusiness.id },
    },
    update: {},
    create: {
      id: "f1000000-0000-0000-0000-000000000004",
      business_id: demoBusiness.id,
      customer_id: custKarim.id,
      status: OrderStatus.CANCELLED,
      payment_status: PaymentStatus.NOT_COMPLETED,
      currency: "TND",
      subtotal: 135.0,
      delivery_fee: 9.0,
      total: 144.0,
      customer_snapshot: {
        name: custKarim.name,
        phone: custKarim.phone,
        address: null,
      } as Prisma.InputJsonObject,
      delivery_address: Prisma.JsonNull,
      created_by_type: "human",
      idempotency_key: "idem-order-cancelled-004",
      is_test: false,
      cancelled_at: new Date(Date.now() - 12 * 24 * 60 * 60 * 1000),
    },
  });

  await prisma.orderItem.deleteMany({ where: { order_id: orderCancelled.id } });
  await prisma.orderItem.create({
    data: {
      id: crypto.randomUUID(),
      business_id: demoBusiness.id,
      order_id: orderCancelled.id,
      variant_id: varPalazzoNoir40.id,
      quantity: 1,
      unit_price: 135.0,
      name_snapshot: "Pantalon Fluide Palazzo Noir",
      sku_snapshot: "PALAZ-BLK-40",
      attributes_snapshot: { color: "Noir", size: "40" },
    },
  });

  // Order 5: PLAYGROUND SIMULATION (is_test: true)
  await prisma.order.upsert({
    where: {
      id_business_id: { id: "f1000000-0000-0000-0000-000000000005", business_id: demoBusiness.id },
    },
    update: {},
    create: {
      id: "f1000000-0000-0000-0000-000000000005",
      business_id: demoBusiness.id,
      customer_id: custPlayground.id,
      status: OrderStatus.PENDING_CONFIRMATION,
      payment_status: PaymentStatus.NOT_COMPLETED,
      currency: "TND",
      subtotal: 189.0,
      delivery_fee: 7.0,
      total: 196.0,
      customer_snapshot: {
        name: custPlayground.name,
        phone: custPlayground.phone,
        address: null,
      } as Prisma.InputJsonObject,
      delivery_address: (custPlayground.address as Prisma.InputJsonValue) ?? Prisma.JsonNull,
      created_by_type: "ai",
      idempotency_key: "idem-order-playground-005",
      is_test: true, // Playground order: excluded from analytics rollups
    },
  });

  // --------------------------------------------------------------------------
  // 12. Conversations, Messages & Handoff Contexts
  // --------------------------------------------------------------------------
  console.log("  → Seeding realistic multi-channel conversations & messages...");

  // Clean existing messages to avoid unique idempotency conflicts during re-seed
  await prisma.messageAttachment.deleteMany({ where: { business_id: demoBusiness.id } });
  await prisma.aiFeedback.deleteMany({ where: { business_id: demoBusiness.id } });
  await prisma.aiDecisionTrace.deleteMany({ where: { business_id: demoBusiness.id } });
  await prisma.aiUsage.deleteMany({ where: { business_id: demoBusiness.id } });
  await prisma.aiAction.deleteMany({ where: { business_id: demoBusiness.id } });
  await prisma.conversationNote.deleteMany({ where: { business_id: demoBusiness.id } });
  await prisma.conversationAssignment.deleteMany({ where: { business_id: demoBusiness.id } });
  await prisma.conversationStatusEvent.deleteMany({ where: { business_id: demoBusiness.id } });
  await prisma.message.deleteMany({ where: { business_id: demoBusiness.id } });

  // Conversation 1: ORDER_INTENT_DETECTED / Hot Lead 92 (Mariem Jaziri, Instagram)
  const conv1 = await prisma.conversation.upsert({
    where: {
      id_business_id: { id: "f2000000-0000-0000-0000-000000000001", business_id: demoBusiness.id },
    },
    update: {},
    create: {
      id: "f2000000-0000-0000-0000-000000000001",
      business_id: demoBusiness.id,
      customer_id: custMariem.id,
      channel_account_id: igAccount.id,
      source: ConversationSource.instagram,
      external_thread_id: "ig_thread_mariem_jaziri",
      status: ConversationStatus.ORDER_INTENT_DETECTED,
      ai_enabled: true,
      lead_score: 92,
      lead_temperature: LeadTemperature.hot,
      lead_score_factors: {
        purchase_intent: 40,
        pending_order: 30,
        product_discussed: 15,
        recency: 7,
      },
      lead_scored_at: new Date(),
      last_intent: "purchase_intent",
      collected_fields: ["name", "phone", "address", "city", "size", "color", "quantity"],
      summary: "Mariem commande la Robe Soie Émeraude en taille M pour livraison à Ariana.",
      last_message_at: new Date(Date.now() - 3 * 60 * 1000),
      last_message_preview:
        "Parfait ! J'ai bien noté votre commande pour la Robe Soie Émeraude en taille M...",
    },
  });

  const c1Messages = [
    {
      id: "f3000000-0000-0000-0000-000000000001",
      dir: MessageDirection.inbound,
      sender: SenderType.customer,
      content: "Bonjour ! Est-ce que la Robe Soie Émeraude en taille M est encore disponible svp ?",
      status: MessageDeliveryStatus.delivered,
      minutesAgo: 25,
    },
    {
      id: "f3000000-0000-0000-0000-000000000002",
      dir: MessageDirection.outbound,
      sender: SenderType.ai,
      content:
        "Bonjour Mariem ! 🌸 Oui, il nous reste exactement 18 pièces en stock pour la Robe Soie Alyssa Émeraude en taille M. Elle est au prix de 189 DT avec livraison express partout en Tunisie !",
      status: MessageDeliveryStatus.delivered,
      aiMeta: {
        intent: "stock_check",
        confidence: 0.98,
        tools_called: ["check_inventory"],
        model: "gemini-3.5-flash",
        latency_ms: 650,
        fallback_used: false,
      },
      minutesAgo: 24,
    },
    {
      id: "f3000000-0000-0000-0000-000000000003",
      dir: MessageDirection.inbound,
      sender: SenderType.customer,
      content: "Super ! Je fais du 38 généralement, le M convient bien ?",
      status: MessageDeliveryStatus.delivered,
      minutesAgo: 18,
    },
    {
      id: "f3000000-0000-0000-0000-000000000004",
      dir: MessageDirection.outbound,
      sender: SenderType.ai,
      content:
        "Parfaitement ! Notre taille M correspond précisément au 38-40 avec une coupe empire très fluide. Souhaitez-vous que je prenne vos coordonnées pour réserver votre pièce et préparer l'envoi ?",
      status: MessageDeliveryStatus.delivered,
      aiMeta: {
        intent: "product_inquiry",
        confidence: 0.94,
        tools_called: ["search_knowledge"],
        model: "gemini-3.5-flash",
        latency_ms: 720,
        fallback_used: false,
      },
      minutesAgo: 17,
    },
    {
      id: "f3000000-0000-0000-0000-000000000005",
      dir: MessageDirection.inbound,
      sender: SenderType.customer,
      content:
        "Oui je la prends ! Mon adresse : Résidence Ennasr 2, Bloc B, Ariana. Mon téléphone : 55 678 901.",
      status: MessageDeliveryStatus.delivered,
      minutesAgo: 8,
    },
    {
      id: "f3000000-0000-0000-0000-000000000006",
      dir: MessageDirection.outbound,
      sender: SenderType.ai,
      content:
        "Parfait ! J'ai bien noté votre commande pour la Robe Soie Émeraude en taille M (189 DT + 7 DT livraison Grand Tunis = 196 DT au total, paiement en espèces à la livraison). Notre équipe prépare votre colis pour expédition demain matin !",
      status: MessageDeliveryStatus.delivered,
      aiMeta: {
        intent: "purchase_intent",
        confidence: 0.97,
        tools_called: ["calculate_shipping", "create_pending_order", "reserve_stock"],
        model: "gemini-3.5-flash",
        latency_ms: 890,
        fallback_used: false,
      },
      minutesAgo: 3,
    },
  ];

  for (const m of c1Messages) {
    await prisma.message.create({
      data: {
        id: m.id,
        business_id: demoBusiness.id,
        conversation_id: conv1.id,
        channel_account_id: igAccount.id,
        direction: m.dir,
        sender_type: m.sender,
        content: m.content,
        content_type: ContentType.text,
        delivery_status: m.status,
        idempotency_key: `msg-idem-${m.id}`,
        ai_metadata: m.aiMeta ?? undefined,
        created_at: new Date(Date.now() - m.minutesAgo * 60 * 1000),
      },
    });
  }

  // Conversation 2: HUMAN_REQUIRED / Priority Critical / Hot Lead 85 (Inès Ben Amor, WhatsApp)
  const conv2 = await prisma.conversation.upsert({
    where: {
      id_business_id: { id: "f2000000-0000-0000-0000-000000000002", business_id: demoBusiness.id },
    },
    update: {},
    create: {
      id: "f2000000-0000-0000-0000-000000000002",
      business_id: demoBusiness.id,
      customer_id: custInes.id,
      channel_account_id: waAccount.id,
      source: ConversationSource.whatsapp,
      external_thread_id: "wa_thread_ines_ben_amor",
      status: ConversationStatus.HUMAN_REQUIRED,
      ai_enabled: false,
      handoff_priority: HandoffPriority.critical,
      escalation_reason: "bulk_order",
      handoff_at: new Date(Date.now() - 12 * 60 * 1000),
      lead_score: 85,
      lead_temperature: LeadTemperature.hot,
      lead_score_factors: {
        bulk_order_interest: 45,
        high_budget: 30,
        recency: 10,
      },
      collected_fields: ["name", "phone", "quantity", "product"],
      summary:
        "Inès souhaite commander 8 Blazers Carthage Crème pour un événement d'entreprise ce samedi. Demande tarif corporate.",
      handoff_context: {
        schema_version: 1,
        customer: {
          id: custInes.id,
          name: custInes.name,
          phone: custInes.phone,
          channel: "whatsapp",
          lifecycle_stage: custInes.lifecycle_stage,
        },
        summary:
          "Demande de commande groupée B2B (8 pièces Blazer Carthage) avec délai serré (ce samedi).",
        intent: "purchase_intent",
        confidence: 0.94,
        confidence_source: "llm",
        products_discussed: [
          {
            product_id: productsCatalog[1]!.id,
            variant_id: varBlazerCarthageM.id,
            name: "Blazer Structuré Carthage Crème",
            sku: "BLAZ-CRM-M",
            price: 195.0,
            currency: "TND",
          },
        ],
        collected_fields: ["name", "phone", "quantity", "product"],
        missing_fields: ["address", "payment_preference"],
        ai_recommendation:
          "Proposer un devis corporate à 175 DT/pièce avec livraison express offerte par coursier dédié.",
        action_required:
          "Appeler immédiatement la cliente au 20 112 233 pour confirmer la disponibilité des tailles et bloquer le stock.",
        escalation_reason: "bulk_order",
        handoff_priority: "critical",
        also_matched: ["negotiation"],
        pending_order: null,
      },
      last_message_at: new Date(Date.now() - 12 * 60 * 1000),
      last_message_preview: "Je transmets votre demande à notre direction commerciale...",
    },
  });

  const c2Messages = [
    {
      id: "f3000000-0000-0000-0000-000000000010",
      dir: MessageDirection.inbound,
      sender: SenderType.customer,
      content:
        "Bonjour, j'ai besoin de commander 8 Blazers Carthage Crème pour notre équipe lors d'un séminaire ce samedi à Sousse. Est-ce possible d'avoir un tarif de groupe ?",
      status: MessageDeliveryStatus.delivered,
      minutesAgo: 14,
    },
    {
      id: "f3000000-0000-0000-0000-000000000011",
      dir: MessageDirection.outbound,
      sender: SenderType.ai,
      content:
        "Bonjour Inès ! 🌟 C'est un honneur d'accompagner votre événement d'entreprise. Pour une commande corporate de 8 blazers avec livraison express avant samedi, je transmets immédiatement votre dossier à notre responsable commerciale qui vous contacte dans les 10 minutes !",
      status: MessageDeliveryStatus.delivered,
      aiMeta: {
        intent: "purchase_intent",
        confidence: 0.95,
        tools_called: ["escalate_to_human"],
        model: "gemini-3.5-flash",
        latency_ms: 540,
        fallback_used: false,
      },
      minutesAgo: 12,
    },
  ];

  for (const m of c2Messages) {
    await prisma.message.create({
      data: {
        id: m.id,
        business_id: demoBusiness.id,
        conversation_id: conv2.id,
        channel_account_id: waAccount.id,
        direction: m.dir,
        sender_type: m.sender,
        content: m.content,
        content_type: ContentType.text,
        delivery_status: m.status,
        idempotency_key: `msg-idem-${m.id}`,
        ai_metadata: m.aiMeta ?? undefined,
        created_at: new Date(Date.now() - m.minutesAgo * 60 * 1000),
      },
    });
  }

  // Notification for critical handoff
  await prisma.notification.upsert({
    where: {
      user_id_dedupe_key: {
        user_id: ownerUser.id,
        dedupe_key: `notif-handoff-${conv2.id}`,
      },
    },
    update: {},
    create: {
      id: crypto.randomUUID(),
      business_id: demoBusiness.id,
      user_id: ownerUser.id,
      type: NotificationType.HANDOFF,
      handoff_priority: HandoffPriority.critical,
      title: "Intervention urgente : Commande Corporate (Inès Ben Amor)",
      message: "Demande urgente de 8 blazers pour ce samedi. Client chaud avec potentiel élevé.",
      entity_type: "conversation",
      entity_id: conv2.id,
      dedupe_key: `notif-handoff-${conv2.id}`,
      read_at: null,
    },
  });

  await prisma.notification.upsert({
    where: {
      user_id_dedupe_key: {
        user_id: nourUser.id,
        dedupe_key: `notif-handoff-${conv2.id}-nour`,
      },
    },
    update: {},
    create: {
      id: crypto.randomUUID(),
      business_id: demoBusiness.id,
      user_id: nourUser.id,
      type: NotificationType.HANDOFF,
      handoff_priority: HandoffPriority.high,
      title: "Nouvelle opportunité : Commande Corporate",
      message: "Demande de 8 blazers par Inès Ben Amor en attente de réponse.",
      entity_type: "conversation",
      entity_id: conv2.id,
      dedupe_key: `notif-handoff-${conv2.id}-nour`,
      read_at: null,
    },
  });

  // Conversation 3: HUMAN_HANDLING (Amine Khemir, Messenger, Assigned to Yassine Trabelsi)
  const conv3 = await prisma.conversation.upsert({
    where: {
      id_business_id: { id: "f2000000-0000-0000-0000-000000000003", business_id: demoBusiness.id },
    },
    update: {},
    create: {
      id: "f2000000-0000-0000-0000-000000000003",
      business_id: demoBusiness.id,
      customer_id: custAmine.id,
      channel_account_id: fbAccount.id,
      source: ConversationSource.messenger,
      external_thread_id: "fb_thread_amine_khemir",
      status: ConversationStatus.HUMAN_HANDLING,
      ai_enabled: false,
      assigned_user_id: agentUser.id,
      lead_score: 70,
      lead_temperature: LeadTemperature.warm,
      summary: "Amine demande le suivi de son colis expédié vers Sfax.",
      last_message_at: new Date(Date.now() - 45 * 60 * 1000),
      last_message_preview: "Votre colis est bien en cours d'acheminement par Aramex...",
    },
  });

  await prisma.conversationAssignment.deleteMany({ where: { conversation_id: conv3.id } });
  await prisma.conversationAssignment.create({
    data: {
      id: crypto.randomUUID(),
      business_id: demoBusiness.id,
      conversation_id: conv3.id,
      user_id: agentUser.id,
      assigned_by_user_id: adminUser.id,
      status: "active",
      assigned_at: new Date(Date.now() - 60 * 60 * 1000),
    },
  });

  await prisma.conversationNote.deleteMany({ where: { conversation_id: conv3.id } });
  await prisma.conversationNote.create({
    data: {
      id: crypto.randomUUID(),
      business_id: demoBusiness.id,
      conversation_id: conv3.id,
      author_user_id: agentUser.id,
      body: "Numéro de bordereau Aramex communiqué : TN-90283471. Livraison prévue demain avant 14h.",
    },
  });

  // Conversation 4: ORDER_CONFIRMED (Syrine Bouazizi, Instagram Direct)
  await prisma.conversation.upsert({
    where: {
      id_business_id: { id: "f2000000-0000-0000-0000-000000000004", business_id: demoBusiness.id },
    },
    update: {},
    create: {
      id: "f2000000-0000-0000-0000-000000000004",
      business_id: demoBusiness.id,
      customer_id: custSyrine.id,
      channel_account_id: igAccount.id,
      source: ConversationSource.instagram,
      external_thread_id: "ig_thread_syrine_bouazizi",
      status: ConversationStatus.ORDER_CONFIRMED,
      ai_enabled: true,
      lead_score: 95,
      lead_temperature: LeadTemperature.hot,
      summary: "Commande confirmée pour Blazer Carthage Crème + Cabas Cuir Tan (455 DT).",
      last_message_at: new Date(Date.now() - 4 * 60 * 60 * 1000),
      last_message_preview: "Merci beaucoup Syrine ! Votre commande est validée.",
    },
  });

  // Conversation 5: AI_ACTIVE (Karim Chahed, WhatsApp)
  await prisma.conversation.upsert({
    where: {
      id_business_id: { id: "f2000000-0000-0000-0000-000000000005", business_id: demoBusiness.id },
    },
    update: {},
    create: {
      id: "f2000000-0000-0000-0000-000000000005",
      business_id: demoBusiness.id,
      customer_id: custKarim.id,
      channel_account_id: waAccount.id,
      source: ConversationSource.whatsapp,
      external_thread_id: "wa_thread_karim_chahed",
      status: ConversationStatus.AI_ACTIVE,
      ai_enabled: true,
      lead_score: 60,
      lead_temperature: LeadTemperature.warm,
      summary: "Karim se renseigne sur les délais de livraison pour Nabeul.",
      last_message_at: new Date(Date.now() - 25 * 60 * 1000),
      last_message_preview: "La livraison sur Nabeul prend entre 24 et 48h...",
    },
  });

  // Conversation 6: RESOLVED (Salma Mansouri, Messenger)
  await prisma.conversation.upsert({
    where: {
      id_business_id: { id: "f2000000-0000-0000-0000-000000000006", business_id: demoBusiness.id },
    },
    update: {},
    create: {
      id: "f2000000-0000-0000-0000-000000000006",
      business_id: demoBusiness.id,
      customer_id: custSalma.id,
      channel_account_id: fbAccount.id,
      source: ConversationSource.messenger,
      external_thread_id: "fb_thread_salma_mansouri",
      status: ConversationStatus.RESOLVED,
      ai_enabled: true,
      lead_score: 30,
      lead_temperature: LeadTemperature.cold,
      summary: "Demande générale sur l'emplacement de la boutique physique à La Marsa.",
      last_message_at: new Date(Date.now() - 24 * 60 * 60 * 1000),
      last_message_preview: "Avec grand plaisir ! Au plaisir de vous recevoir.",
    },
  });

  // Conversation 7: PLAYGROUND SIMULATION (is_test: true)
  await prisma.conversation.upsert({
    where: {
      id_business_id: { id: "f2000000-0000-0000-0000-000000000007", business_id: demoBusiness.id },
    },
    update: {},
    create: {
      id: "f2000000-0000-0000-0000-000000000007",
      business_id: demoBusiness.id,
      customer_id: custPlayground.id,
      source: ConversationSource.playground,
      status: ConversationStatus.RESOLVED,
      ai_enabled: true,
      is_test: true, // Crucial: Playground conversation excluded from analytics rollups
      lead_score: 50,
      lead_temperature: LeadTemperature.warm,
      summary: "Session de test dans le simulateur commercial.",
      last_message_at: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
      last_message_preview: "Test terminé avec succès.",
    },
  });

  // --------------------------------------------------------------------------
  // 13. Daily Analytics (14 Days of High-Fidelity Historical Data)
  // --------------------------------------------------------------------------
  console.log("  → Populating 14 days of realistic analytics data...");
  const analyticsDays = [];
  for (let i = 14; i >= 0; i--) {
    const dayDate = new Date();
    dayDate.setDate(dayDate.getDate() - i);
    dayDate.setHours(0, 0, 0, 0);

    const isWeekend = dayDate.getDay() === 0 || dayDate.getDay() === 6;
    const baseMessages = isWeekend ? 85 : 55;
    const handled = baseMessages + Math.floor(Math.sin(i) * 15);
    const aiMessages = Math.floor(handled * 0.78);
    const humanMessages = handled - aiMessages;
    const orders = Math.floor(handled * 0.08) + (isWeekend ? 2 : 1);
    const handoffs = Math.floor(handled * 0.12);

    analyticsDays.push({
      business_id: demoBusiness.id,
      day: dayDate,
      messages_handled: handled,
      messages_ai: aiMessages,
      messages_human: humanMessages,
      orders_created: orders,
      handoffs_total: handoffs,
      handoffs_by_reason: {
        purchase_handoff: Math.ceil(handoffs * 0.5),
        bulk_order: Math.floor(handoffs * 0.2),
        human_request: Math.floor(handoffs * 0.15),
        return_exchange: Math.floor(handoffs * 0.15),
      },
      conversion_confirmed: Math.max(1, Math.floor(orders * 0.85)),
      conversion_ai_pending: Math.max(0, orders - Math.floor(orders * 0.85)),
    });
  }

  for (const dayData of analyticsDays) {
    await prisma.analyticsDaily.upsert({
      where: {
        business_id_day: {
          business_id: dayData.business_id,
          day: dayData.day,
        },
      },
      update: dayData,
      create: dayData,
    });
  }

  // --------------------------------------------------------------------------
  // 14. Feature Flags, Notifications & Audit Logs
  // --------------------------------------------------------------------------
  console.log("  → Seeding feature flags, notifications & audit trail...");
  const featureFlags = [
    { feature: "ai_sales_agent", enabled: true },
    { feature: "catalog_import_csv", enabled: true },
    { feature: "advanced_analytics", enabled: true },
    { feature: "whatsapp_integration", enabled: true },
    { feature: "instagram_integration", enabled: true },
    { feature: "order_auto_confirmation", enabled: false },
  ];

  for (const ff of featureFlags) {
    await prisma.featureFlag.upsert({
      where: {
        business_id_feature: {
          business_id: demoBusiness.id,
          feature: ff.feature,
        },
      },
      update: { enabled: ff.enabled },
      create: {
        business_id: demoBusiness.id,
        feature: ff.feature,
        enabled: ff.enabled,
      },
    });
  }

  // Audit Logs (clean prior seed entries for idempotency)
  await prisma.auditLog.deleteMany({ where: { business_id: demoBusiness.id } });
  await prisma.auditLog.createMany({
    data: [
      {
        id: crypto.randomUUID(),
        business_id: demoBusiness.id,
        actor_user_id: ownerUser.id,
        action: "business.created",
        entity_type: "business",
        entity_id: demoBusiness.id,
        payload: { name: demoBusiness.name, country: "TN", currency: "TND" },
      },
      {
        id: crypto.randomUUID(),
        business_id: demoBusiness.id,
        actor_user_id: adminUser.id,
        action: "catalog.product_created",
        entity_type: "product",
        entity_id: productsCatalog[0]!.id,
        payload: { name: productsCatalog[0]!.name, category: "Robes & Combinaisons" },
      },
      {
        id: crypto.randomUUID(),
        business_id: demoBusiness.id,
        actor_user_id: ownerUser.id,
        action: "ai.settings_updated",
        entity_type: "ai_settings",
        entity_id: demoBusiness.id,
        payload: { model_primary: "gemini-3.5-flash", reply_mode: "auto_send" },
      },
      {
        id: crypto.randomUUID(),
        business_id: demoBusiness.id,
        actor_user_id: adminUser.id,
        action: "order.confirmed",
        entity_type: "order",
        entity_id: orderConfirmed.id,
        payload: { total: "455.000", customer: custSyrine.name },
      },
    ],
  });

  // AI Feedback & Evaluation Golden Set
  const feedbackMessage = await prisma.message.findFirst({
    where: { conversation_id: conv1.id, sender_type: SenderType.ai },
  });

  if (feedbackMessage) {
    await prisma.aiFeedback.upsert({
      where: {
        message_id_user_id: {
          message_id: feedbackMessage.id,
          user_id: adminUser.id,
        },
      },
      update: {},
      create: {
        id: crypto.randomUUID(),
        business_id: demoBusiness.id,
        message_id: feedbackMessage.id,
        user_id: adminUser.id,
        rating: FeedbackRating.positive,
        comment: "Excellente réponse, informations de stock et prix parfaitement exactes.",
      },
    });
  }

  await prisma.aiEvaluation.deleteMany({ where: { business_id: demoBusiness.id } });
  await prisma.aiEvaluation.create({
    data: {
      id: crypto.randomUUID(),
      business_id: demoBusiness.id,
      conversation_id: conv1.id,
      score: 95,
      dimension_scores: {
        correctness: 98,
        grounding: 96,
        language: 94,
        tools: 95,
        escalation: 92,
        conversion: 95,
      },
      evaluator_type: EvaluatorType.golden_set,
    },
  });

  console.log("\n✅ PERFECT SEED COMPLETED SUCCESSFULLY!");
  console.log("---------------------------------------------------------");
  console.log(`🏢 Business:        Maison Alyssa Tunis (${demoBusiness.id})`);
  console.log(`👤 Owner Account:   demo@example.com (Password: Password123!)`);
  console.log(`👤 Admin Account:   admin@example.com (Password: Password123!)`);
  console.log(`👤 Agent Account:   agent@example.com (Password: Password123!)`);
  console.log(`👤 Startup console: operator@example.com (Password: Password123!)`);
  console.log(
    `👗 Products:        ${seededProducts.length} high-fashion products with multiple variants`,
  );
  console.log(`👥 Customers:       ${seededCustomers.length} profiles across all lifecycle stages`);
  console.log(`💬 Conversations:   7 multi-channel threads (IG, WA, Messenger, Playground)`);
  console.log(
    `📦 Orders:          ${[orderPending, orderConfirmed, orderCompleted].length + 2} orders (Pending, Confirmed, Completed, Cancelled)`,
  );
  console.log(`📊 Analytics:       14 days of realistic daily metrics & conversion data`);
  console.log("---------------------------------------------------------\n");
}

main()
  .catch((e: unknown) => {
    console.error("❌ Seeding failed with error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
