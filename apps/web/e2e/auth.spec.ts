import { execSync } from "node:child_process";
import * as crypto from "node:crypto";
import { resolve } from "node:path";

import { expect, test } from "@playwright/test";
import { signJWT } from "better-auth/crypto";
import dotenv from "dotenv";

dotenv.config({ path: resolve(process.cwd(), ".env") });
dotenv.config({ path: resolve(process.cwd(), "apps/api/.env") });
dotenv.config({ path: resolve(process.cwd(), "../../apps/api/.env") });

test.describe.configure({ mode: "serial" });

const BETTER_AUTH_SECRET =
  process.env.BETTER_AUTH_SECRET || "local-better-auth-secret-min-32-chars-long!";

function base32Decode(encoded: string): Buffer {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const cleaned = encoded.toUpperCase().replace(/=+$/, "").replace(/\s+/g, "");
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];

  for (const ch of cleaned) {
    const idx = alphabet.indexOf(ch);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

function generateTotp(secretBase32: string): string {
  const counter = Math.floor(Date.now() / 1000 / 30);
  const counterBuf = Buffer.alloc(8);
  counterBuf.writeBigUInt64BE(BigInt(counter), 0);
  const hmac = crypto.createHmac("sha1", base32Decode(secretBase32)).update(counterBuf).digest();
  const offset = hmac[hmac.length - 1]! & 0x0f;
  const binary =
    ((hmac[offset]! & 0x7f) << 24) |
    ((hmac[offset + 1]! & 0xff) << 16) |
    ((hmac[offset + 2]! & 0xff) << 8) |
    (hmac[offset + 3]! & 0xff);
  return String(binary % 1_000_000).padStart(6, "0");
}

function runSql(sql: string): string {
  return execSync(
    `docker exec -i ai-sales-postgres psql -U postgres -d ai_sales -t -A -v ON_ERROR_STOP=1`,
    { input: sql, encoding: "utf8" },
  ).trim();
}

function clearAuthRateLimits() {
  try {
    execSync(
      `docker exec ai-sales-redis redis-cli eval "for _,k in ipairs(redis.call('keys','rate_limit:auth:*')) do redis.call('del',k) end" 0`,
      { shell: "/bin/bash", stdio: "ignore" },
    );
  } catch {
    // Ignore if docker/redis isn't available
  }
}

test.describe("Web Authentication Flow (Better Auth 1.7.27)", () => {
  const runId = `${Date.now()}_${crypto.randomBytes(3).toString("hex")}`;
  const bizId = crypto.randomUUID();
  const planId = crypto.randomUUID();
  const inviterId = crypto.randomUUID();
  const repEmail = `e2e_rep_${runId}@example.com`;
  const ownerEmail = `e2e_owner_${runId}@example.com`;
  const password = "Password123!Secure";
  const newPassword = "Rotated!Password123";
  const repInviteId = crypto.randomUUID();
  const ownerInviteId = crypto.randomUUID();

  test.beforeAll(async () => {
    clearAuthRateLimits();
    for (let i = 0; i < 30; i++) {
      try {
        const res = await fetch("http://localhost:3000/api/v1/health");
        if (res.ok) break;
      } catch {
        // waiting for backend to boot
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    runSql(`
      INSERT INTO plans (id, code, name, limits, created_at, updated_at)
      VALUES ('${planId}', 'e2e_plan_${runId}', 'E2E Plan', '{"seats":5,"ai_messages":1000,"channels":3}'::jsonb, NOW(), NOW());
      INSERT INTO organizations (id, name, slug, "createdAt")
      VALUES ('${bizId}', 'E2E Boutique ${runId}', 'e2e-boutique-${runId}', NOW());
      INSERT INTO businesses (id, name, organization_id, created_at, updated_at)
      VALUES ('${bizId}', 'E2E Boutique ${runId}', '${bizId}', NOW(), NOW());
      INSERT INTO subscriptions (id, business_id, plan_id, status, period_start, period_end, provider, created_at, updated_at)
      VALUES ('${crypto.randomUUID()}', '${bizId}', '${planId}', 'active', NOW() - interval '1 day', NOW() + interval '30 days', 'manual', NOW(), NOW());
      INSERT INTO users (id, name, email, "emailVerified", "createdAt", "updatedAt")
      VALUES ('${inviterId}', 'E2E Inviter', 'e2e_inviter_${runId}@example.com', true, NOW(), NOW());
      INSERT INTO invitations (id, "organizationId", email, role, status, "expiresAt", "inviterId")
      VALUES
        ('${repInviteId}', '${bizId}', '${repEmail}', 'employee', 'pending', NOW() + interval '2 days', '${inviterId}'),
        ('${ownerInviteId}', '${bizId}', '${ownerEmail}', 'admin', 'pending', NOW() + interval '2 days', '${inviterId}');
    `);
  });

  test.beforeEach(() => {
    clearAuthRateLimits();
  });

  test.afterAll(() => {
    clearAuthRateLimits();
    try {
      runSql(`
        DELETE FROM subscriptions WHERE business_id = '${bizId}';
        DELETE FROM invitations WHERE "organizationId" = '${bizId}';
        DELETE FROM members WHERE "organizationId" = '${bizId}';
        DELETE FROM business_members WHERE business_id = '${bizId}';
        DELETE FROM businesses WHERE id = '${bizId}';
        DELETE FROM organizations WHERE id = '${bizId}';
        DELETE FROM plans WHERE id = '${planId}';
        DELETE FROM sessions WHERE "userId" IN (SELECT id FROM users WHERE email IN ('${repEmail}', '${ownerEmail}', 'e2e_inviter_${runId}@example.com'));
        DELETE FROM accounts WHERE "userId" IN (SELECT id FROM users WHERE email IN ('${repEmail}', '${ownerEmail}', 'e2e_inviter_${runId}@example.com'));
        DELETE FROM two_factors WHERE "userId" IN (SELECT id FROM users WHERE email IN ('${repEmail}', '${ownerEmail}', 'e2e_inviter_${runId}@example.com'));
        DELETE FROM users WHERE email IN ('${repEmail}', '${ownerEmail}', 'e2e_inviter_${runId}@example.com');
      `);
    } catch {
      // ignore teardown errors
    }
  });

  test("1. Register page is invite-only and direct signup without invite returns 403", async ({
    page,
  }) => {
    await page.goto("/register");
    await expect(page.getByText("Invitation requise")).toBeVisible();
    await expect(page.getByRole("button", { name: "Créer mon compte" })).toHaveCount(0);

    const directStatus = await page.evaluate(async () => {
      const res = await fetch("/api/auth/sign-up/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "uninvited_attacker@example.com",
          name: "Attacker",
          password: "Password123!Secure",
        }),
      });
      return res.status;
    });
    expect(directStatus).toBe(403);
  });

  test("2. Invited signup requires email verification before login and acceptance", async ({
    page,
    context,
  }) => {
    await page.goto(`/invite?token=${repInviteId}`);
    await page.getByLabel("Adresse e-mail").fill(repEmail);
    await page.getByLabel("Nom complet").fill("Invited Sales Rep");
    await page.getByLabel(/Mot de passe/i).fill(password);

    const signupPromise = page.waitForResponse(
      (res) => res.url().includes("/api/auth/sign-up/email") && res.request().method() === "POST",
    );
    await page.getByRole("button", { name: "Créer mon compte" }).click();
    const signupRes = await signupPromise;
    expect(signupRes.status()).toBe(200);

    await expect(page.getByText("Vérifiez votre adresse e-mail")).toBeVisible();

    const cookiesBeforeVerify = await context.cookies();
    expect(cookiesBeforeVerify.some((c) => c.name.includes("session_token"))).toBe(false);

    // Unverified login returns 403
    await page.goto("/login");
    await page.getByLabel("Adresse e-mail").fill(repEmail);
    await page.getByLabel("Mot de passe").fill(password);
    const blockedLoginPromise = page.waitForResponse(
      (res) => res.url().includes("/api/auth/sign-in/email") && res.request().method() === "POST",
    );
    await page.getByRole("button", { name: "Se connecter" }).click();
    expect((await blockedLoginPromise).status()).toBe(403);
    await expect(page.getByText("Vérification de l'e-mail requise")).toBeVisible();

    // Verify email via Better Auth token
    const userId = runSql(`SELECT id FROM users WHERE email = '${repEmail}' LIMIT 1;`);
    const verifyJwt = await signJWT({ email: repEmail, userId }, BETTER_AUTH_SECRET, 3600);
    await page.goto(
      `/verify-email?token=${encodeURIComponent(verifyJwt)}&redirect=${encodeURIComponent(`/invite?token=${repInviteId}`)}`,
    );
    await expect(page.getByText("E-mail vérifié")).toBeVisible();

    // Login -> preserves /invite continuation -> accept invite -> /inbox (employee needs no MFA)
    await page.getByRole("button", { name: "Se connecter" }).click();
    await page.waitForURL(/.*\/login.*/, { timeout: 10000 });
    await page.getByLabel("Adresse e-mail").fill(repEmail);
    await page.getByLabel("Mot de passe").fill(password);
    await page.getByRole("button", { name: "Se connecter" }).click();

    await page.waitForURL(new RegExp(`/invite\\?token=${repInviteId}`), { timeout: 10000 });
    await page.getByRole("button", { name: "Accepter l'invitation" }).click();
    await page.waitForURL(/.*\/inbox.*/, { timeout: 15000 });

    const cookiesAfterLogin = await context.cookies();
    const sessionCookie = cookiesAfterLogin.find((c) => c.name.includes("session_token"));
    expect(sessionCookie).toBeDefined();
    expect(sessionCookie?.httpOnly).toBe(true);

    const lsKeys = await page.evaluate(() => Object.keys(localStorage));
    expect(lsKeys.some((k) => k.toLowerCase().includes("token"))).toBe(false);
  });

  test("3. Owner onboarding enforces mandatory 2FA setup and 2FA challenge on next login", async ({
    page,
  }) => {
    await page.goto(`/invite?token=${ownerInviteId}`);
    await page.getByLabel("Adresse e-mail").fill(ownerEmail);
    await page.getByLabel("Nom complet").fill("Invited Owner");
    await page.getByLabel(/Mot de passe/i).fill(password);
    await page.getByRole("button", { name: "Créer mon compte" }).click();
    await expect(page.getByText("Vérifiez votre adresse e-mail")).toBeVisible();

    const ownerId = runSql(`SELECT id FROM users WHERE email = '${ownerEmail}' LIMIT 1;`);
    const verifyJwt = await signJWT(
      { email: ownerEmail, userId: ownerId },
      BETTER_AUTH_SECRET,
      3600,
    );
    await page.goto(
      `/verify-email?token=${encodeURIComponent(verifyJwt)}&redirect=${encodeURIComponent(`/invite?token=${ownerInviteId}`)}`,
    );
    await expect(page.getByText("E-mail vérifié")).toBeVisible();

    await page.getByRole("button", { name: "Se connecter" }).click();
    await page.getByLabel("Adresse e-mail").fill(ownerEmail);
    await page.getByLabel("Mot de passe").fill(password);
    await page.getByRole("button", { name: "Se connecter" }).click();

    await page.waitForURL(new RegExp(`/invite\\?token=${ownerInviteId}`), { timeout: 10000 });
    await page.getByRole("button", { name: "Accepter l'invitation" }).click();

    // Admin lacks MFA -> routed to /2fa/setup
    await page.waitForURL(/.*\/2fa\/setup.*/, { timeout: 15000 });
    await page.locator("#mfa-setup-password").fill(password);
    await page.getByRole("button", { name: "Générer la clé" }).click();

    const secretInput = page.locator("#mfa-secret");
    await expect(secretInput).toBeVisible();
    const secret = await secretInput.inputValue();
    expect(secret.length).toBeGreaterThanOrEqual(16);

    const code1 = generateTotp(secret);
    await page.locator("#mfa-confirm-code").fill(code1);
    await page.getByRole("button", { name: "Vérifier et continuer" }).click();

    await expect(page.getByText("Enregistrez vos codes de secours")).toBeVisible();
    await page.getByRole("button", { name: "Accéder à l'entreprise" }).click();
    await page.waitForURL(/.*\/(inbox|onboarding).*/, { timeout: 15000 });

    // Sign out cleanly via Better Auth & verify /2fa challenge on next login (no trustDevice UI)
    await page.evaluate(async () => {
      await fetch("/api/auth/sign-out", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
        credentials: "include",
      });
    });

    await page.goto("/login");
    await page.getByLabel("Adresse e-mail").fill(ownerEmail);
    await page.getByLabel("Mot de passe").fill(password);
    await page.getByRole("button", { name: "Se connecter" }).click();

    await page.waitForURL(/.*\/2fa$/, { timeout: 10000 });
    expect(await page.locator('input[type="checkbox"]').count()).toBe(0);

    await page.locator("#two-factor-code").fill(generateTotp(secret));
    await page.getByRole("button", { name: "Vérifier et continuer" }).click();
    await page.waitForURL(/.*\/(inbox|onboarding).*/, { timeout: 15000 });
  });

  test("4. Password reset flow and URL credential sanitization", async ({ page }) => {
    await page.goto("/login?email=sanitized_user%40example.com&password=secretLeakedPassword123");
    await expect.poll(() => page.url()).not.toContain("password=");
    await expect(page.getByLabel("Adresse e-mail")).toHaveValue("sanitized_user@example.com");
    await expect(page.getByLabel("Mot de passe")).toHaveValue("");

    await page.goto("/forgot-password");
    await page.locator("#forgot-email").fill(repEmail);
    await page.getByRole("button", { name: "Envoyer le lien" }).click();
    await expect(page.getByText("Consultez vos e-mails")).toBeVisible();

    const identifier = runSql(
      `SELECT identifier FROM verifications WHERE identifier LIKE 'reset-password:%' ORDER BY "createdAt" DESC LIMIT 1;`,
    );
    const resetToken = identifier.replace(/^reset-password:/, "");
    expect(resetToken.length).toBeGreaterThan(8);

    await page.goto(`/reset-password?token=${encodeURIComponent(resetToken)}`);
    await page.locator("#reset-password").fill(newPassword);
    await page.locator("#reset-confirm-password").fill(newPassword);
    await page.getByRole("button", { name: "Mettre à jour le mot de passe" }).click();
    await expect(page.getByText("Mot de passe mis à jour")).toBeVisible();

    // Sign in with rotated password succeeds
    await page.goto("/login");
    await page.getByLabel("Adresse e-mail").fill(repEmail);
    await page.getByLabel("Mot de passe").fill(newPassword);
    await page.getByRole("button", { name: "Se connecter" }).click();
    await page.waitForURL(/.*\/inbox.*/, { timeout: 15000 });
  });

  test("5. Missing invite token shows friendly error card", async ({ page }) => {
    await page.goto("/invite");
    await expect(page.getByText("Lien d'invitation invalide")).toBeVisible();
    await page.getByRole("button", { name: "Retourner à la connexion" }).click();
    await page.waitForURL(/.*\/login.*/, { timeout: 5000 });
  });
});
