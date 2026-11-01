import { execSync } from "node:child_process";

import { test, expect } from "@playwright/test";

test.describe.configure({ mode: "serial" });

function clearAuthRateLimits(email?: string) {
  try {
    const keys = [
      "rate_limit:auth:ip:127.0.0.1",
      "rate_limit:auth:ip:::1",
      "rate_limit:auth:ip:::ffff:127.0.0.1",
    ];
    if (email) {
      keys.push(`rate_limit:auth:email:${email.toLowerCase()}`);
    }
    execSync(`docker exec ai-sales-redis redis-cli del ${keys.join(" ")}`, {
      shell: "/bin/bash",
      stdio: "ignore",
    });
  } catch {
    // Ignore if docker/redis isn't available
  }
}

function cleanupTestUser(email: string) {
  try {
    const escapedEmail = email.toLowerCase().replace(/'/g, "''");
    execSync(
      `docker exec ai-sales-postgres psql -U postgres -d ai_sales -c "DELETE FROM users WHERE email = '${escapedEmail}';"`,
      { shell: "/bin/bash", stdio: "ignore" },
    );
  } catch {
    // Ignore if docker/postgres isn't available
  }
}

test.describe("Web Authentication Flow", () => {
  const testUser = {
    name: "E2E Test Merchant",
    email: `e2e_merchant_${Date.now()}@example.com`,
    password: "Password123!Secure",
  };

  test.beforeAll(async () => {
    clearAuthRateLimits(testUser.email);
    for (let i = 0; i < 30; i++) {
      try {
        const res = await fetch("http://localhost:3000/api/v1/health");
        if (res.ok) break;
      } catch {
        // waiting for API backend to boot
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  });

  test.beforeEach(() => {
    clearAuthRateLimits(testUser.email);
  });

  test.afterAll(() => {
    clearAuthRateLimits(testUser.email);
    cleanupTestUser(testUser.email);
  });

  test("1. Form validation and password strength reactivity on register page", async ({ page }) => {
    await page.goto("/register");

    // Title & description
    await expect(
      page.locator('[data-slot="card-title"]').filter({ hasText: "Créer un compte" }),
    ).toBeVisible();
    await expect(page.getByText("Démarrez avec votre assistant commercial IA")).toBeVisible();

    // Click submit empty
    await page.getByRole("button", { name: "Créer mon compte" }).click();

    // Check client-side Zod validation errors
    await expect(page.getByText("Veuillez renseigner votre nom complet.")).toBeVisible();
    await expect(page.getByText("Veuillez renseigner votre adresse e-mail.")).toBeVisible();
    await expect(
      page.getByText("Le mot de passe doit comporter au moins 10 caractères."),
    ).toBeVisible();

    // Test password strength meter reactivity
    const passwordInput = page.getByLabel(/Mot de passe/i);
    await passwordInput.fill("short");
    await expect(page.getByText(/Faible|Très faible/i)).toBeVisible();

    await passwordInput.fill("Password123!Secure");
    await expect(page.getByText(/Fort|Excellent/i)).toBeVisible();
  });

  test("2. Successful registration, cookies, and zero localStorage check", async ({
    page,
    context,
  }) => {
    await page.goto("/register");

    await page.getByLabel("Nom complet").fill(testUser.name);
    await page.getByLabel("Adresse e-mail").fill(testUser.email);
    await page.getByLabel(/Mot de passe/i).fill(testUser.password);

    // Intercept register API request
    const registerResponsePromise = page.waitForResponse(
      (res) => res.url().includes("/api/v1/auth/register") && res.request().method() === "POST",
    );

    await page.getByRole("button", { name: "Créer mon compte" }).click();

    const registerResponse = await registerResponsePromise;
    expect(registerResponse.status()).toBe(201);
    const body = await registerResponse.json();
    expect(body.user.email).toBe(testUser.email.toLowerCase());
    expect(body.accessToken).toBeTruthy();

    // Wait for redirect towards onboarding
    await page.waitForURL(/.*onboarding.*/, { timeout: 10000 });

    // Verify cookies: HTTP-only refresh cookie is present
    const cookies = await context.cookies();
    const refreshCookie = cookies.find((c) => c.name === "aisales_refresh");
    expect(refreshCookie).toBeDefined();
    expect(refreshCookie?.httpOnly).toBe(true);

    // Verify Zero LocalStorage tokens invariant
    const storageItems = await page.evaluate(() => {
      const items: Record<string, string> = {};
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key) items[key] = localStorage.getItem(key) || "";
      }
      return items;
    });

    // Ensure no token or secret is stored in localStorage
    expect(storageItems["access_token"]).toBeUndefined();
    expect(storageItems["token"]).toBeUndefined();
    expect(storageItems["auth"]).toBeUndefined();
    expect(Object.keys(storageItems).some((k) => k.toLowerCase().includes("token"))).toBe(false);
  });

  test("3. Registration duplicate email shows conflict error", async ({ page }) => {
    await page.goto("/register");

    await page.getByLabel("Nom complet").fill(testUser.name);
    await page.getByLabel("Adresse e-mail").fill(testUser.email);
    await page.getByLabel(/Mot de passe/i).fill(testUser.password);

    await page.getByRole("button", { name: "Créer mon compte" }).click();

    // Expect conflict error alert
    const alert = page.locator('[role="alert"]:not(#__next-route-announcer__)');
    await expect(alert).toBeVisible();
    await expect(alert).toContainText("Un compte existe déjà avec cette adresse e-mail.");
  });

  test("4. Login page: invalid credentials error handling", async ({ page }) => {
    await page.goto("/login");

    await expect(
      page.locator('[data-slot="card-title"]').filter({ hasText: "Connexion" }),
    ).toBeVisible();

    await page.getByLabel("Adresse e-mail").fill(testUser.email);
    await page.getByLabel("Mot de passe").fill("IncorrectPassword123!");

    const loginResponsePromise = page.waitForResponse(
      (res) => res.url().includes("/api/v1/auth/login") && res.request().method() === "POST",
    );

    await page.getByRole("button", { name: "Se connecter" }).click();

    const loginResponse = await loginResponsePromise;
    expect(loginResponse.status()).toBe(401);

    // Expect generic error message
    const alert = page.locator('[role="alert"]:not(#__next-route-announcer__)');
    await expect(alert).toBeVisible();
    await expect(alert).toContainText("Adresse e-mail ou mot de passe incorrect.");

    // Ensure credentials never leak into the URL query
    expect(page.url()).not.toContain("password=");
    expect(page.url()).not.toContain("IncorrectPassword123!");
  });

  test("4b. Login page: sanitizes contaminated URL containing plaintext credentials", async ({
    page,
  }) => {
    await page.goto("/login?email=sanitized_user%40example.com&password=secretLeakedPassword123");

    // Sensitive credentials must be stripped immediately from the address bar
    await expect.poll(() => page.url()).not.toContain("password=");
    expect(page.url()).not.toContain("secretLeakedPassword123");

    // Email is prefilled for convenience
    await expect(page.getByLabel("Adresse e-mail")).toHaveValue("sanitized_user@example.com");
    // Password input remains empty
    await expect(page.getByLabel("Mot de passe")).toHaveValue("");
  });

  test("5. Login page: valid credentials login and session restoration", async ({
    page,
    context,
  }) => {
    await page.goto("/login");

    await page.getByLabel("Adresse e-mail").fill(testUser.email);
    await page.getByLabel("Mot de passe").fill(testUser.password);

    const loginResponsePromise = page.waitForResponse(
      (res) => res.url().includes("/api/v1/auth/login") && res.request().method() === "POST",
    );

    await page.getByRole("button", { name: "Se connecter" }).click();

    const loginResponse = await loginResponsePromise;
    expect(loginResponse.status()).toBe(200);
    const body = await loginResponse.json();
    expect(body.user.email).toBe(testUser.email.toLowerCase());
    expect(body.accessToken).toBeTruthy();

    // User without memberships redirects to onboarding
    await page.waitForURL(/.*onboarding.*/, { timeout: 10000 });

    // Verify refresh cookie set
    const cookies = await context.cookies();
    const refreshCookie = cookies.find((c) => c.name === "aisales_refresh");
    expect(refreshCookie).toBeDefined();
    expect(refreshCookie?.httpOnly).toBe(true);

    // Verify session restoration across silent refresh via HttpOnly cookie
    const result = await page.evaluate(async () => {
      try {
        const res = await fetch("/api/v1/auth/refresh", {
          method: "POST",
          headers: { Accept: "application/json" },
          credentials: "include",
        });
        const text = await res.text();
        return { ok: res.ok, status: res.status, text };
      } catch (e: any) {
        return { error: e.message };
      }
    });
    expect(result.status).toBe(200);
    const restoredBody = JSON.parse(result.text || "{}");
    expect(restoredBody.user?.email).toBe(testUser.email.toLowerCase());
    expect(restoredBody.accessToken).toBeTruthy();
  });

  test("6. Invite page: missing token displays friendly error", async ({ page }) => {
    await page.goto("/invite");

    await expect(page.getByText("Lien d'invitation invalide")).toBeVisible();
    await expect(page.getByText("Le jeton d'invitation est manquant ou incomplet.")).toBeVisible();

    // Click return to login
    await page.getByRole("button", { name: "Retourner à la connexion" }).click();
    await page.waitForURL(/.*login.*/, { timeout: 5000 });
  });

  test("7. Invite page: invalid token displays not-found error", async ({ page }) => {
    await page.goto("/invite?token=non-existent-token-123");

    await expect(
      page.locator('[data-slot="card-title"]').filter({ hasText: "Rejoindre l'équipe" }),
    ).toBeVisible();

    await page.getByLabel("Votre nom complet").fill("Invited Staff");
    await page.getByLabel(/Créer un mot de passe/i).fill("Password123!Secure");

    const acceptResponsePromise = page.waitForResponse(
      (res) =>
        res.url().includes("/api/v1/auth/invitations/accept") && res.request().method() === "POST",
    );

    await page.getByRole("button", { name: /Accepter l'invitation/i }).click();

    const acceptResponse = await acceptResponsePromise;
    expect(acceptResponse.status()).toBe(404);

    const alert = page.locator('[role="alert"]:not(#__next-route-announcer__)');
    await expect(alert).toBeVisible();
    await expect(alert).toContainText("Cette invitation est introuvable ou a déjà expiré.");
  });

  test("8. Logout: clears refresh cookie and session", async ({ page, context }) => {
    // First login to establish session
    await page.goto("/login");
    await page.getByLabel("Adresse e-mail").fill(testUser.email);
    await page.getByLabel("Mot de passe").fill(testUser.password);
    await page.getByRole("button", { name: "Se connecter" }).click();
    await page.waitForURL(/.*onboarding.*/, { timeout: 10000 });

    // Call logout endpoint via browser page
    clearAuthRateLimits(testUser.email);
    const logoutStatus = await page.evaluate(async () => {
      const res = await fetch("/api/v1/auth/logout", {
        method: "POST",
        credentials: "include",
      });
      return res.status;
    });
    expect(logoutStatus).toBe(204);

    // Verify refresh cookie is cleared
    const cookies = await context.cookies();
    const refreshCookie = cookies.find((c) => c.name === "aisales_refresh");
    expect(!refreshCookie || refreshCookie.expires <= Date.now() / 1000).toBe(true);
  });
});
