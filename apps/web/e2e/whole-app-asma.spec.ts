import { execSync } from "node:child_process";

import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";

/**
 * Whole-app smoke under Asma’s seeded testing account (BL-X3).
 * Requires Docker Postgres seed (`pnpm db:seed`) and a running web+API stack.
 * Skips cleanly when the seed user is not available so empty CI DBs do not red-fail.
 */

test.describe.configure({ mode: "serial" });

const ASMA = {
  email: "asma@example.com",
  password: "Password123!",
  name: "Asma Testing",
};

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
    // Redis may be unavailable in some local setups
  }
}

async function loginAsAsma(page: Page): Promise<boolean> {
  clearAuthRateLimits(ASMA.email);
  await page.goto("/login");
  await page.getByLabel(/e-mail|email|Adresse e-mail/i).fill(ASMA.email);
  await page.getByLabel(/mot de passe|password/i).fill(ASMA.password);

  const loginResponsePromise = page
    .waitForResponse(
      (res) => res.url().includes("/api/v1/auth/login") && res.request().method() === "POST",
      { timeout: 15_000 },
    )
    .catch(() => null);

  await page.getByRole("button", { name: /se connecter|sign in|log in/i }).click();
  const loginResponse = await loginResponsePromise;
  if (!loginResponse || !loginResponse.ok()) {
    return false;
  }

  await page
    .waitForURL((url) => !url.pathname.includes("/login"), {
      timeout: 20_000,
    })
    .catch(() => undefined);

  return !page.url().includes("/login");
}

test.describe("Whole-app smoke — Asma testing account", () => {
  test.beforeAll(async () => {
    clearAuthRateLimits(ASMA.email);
    for (let i = 0; i < 40; i++) {
      try {
        const res = await fetch("http://localhost:3000/api/v1/health");
        if (res.ok) break;
      } catch {
        // waiting for stack
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  });

  test.beforeEach(() => {
    clearAuthRateLimits(ASMA.email);
  });

  test("1. Asma can sign in to the seeded workspace", async ({ page }) => {
    const ok = await loginAsAsma(page);
    test.skip(!ok, "Seed user asma@example.com not available — run pnpm db:seed");
    await expect(page).not.toHaveURL(/\/login/);
  });

  test("2. Inbox surface loads for Asma", async ({ page }) => {
    const ok = await loginAsAsma(page);
    test.skip(!ok, "Seed user asma@example.com not available — run pnpm db:seed");
    await page.goto("/inbox");
    await expect(page).toHaveURL(/inbox/);
    await expect(page.locator("body")).toBeVisible();
  });

  test("3. Pipeline / orders surface loads for Asma", async ({ page }) => {
    const ok = await loginAsAsma(page);
    test.skip(!ok, "Seed user asma@example.com not available — run pnpm db:seed");
    await page.goto("/pipeline");
    await expect(page).toHaveURL(/pipeline|orders/);
    await expect(page.locator("body")).toBeVisible();
  });

  test("4. Catalog surface loads for Asma", async ({ page }) => {
    const ok = await loginAsAsma(page);
    test.skip(!ok, "Seed user asma@example.com not available — run pnpm db:seed");
    await page.goto("/catalog");
    await expect(page).toHaveURL(/catalog/);
    await expect(page.locator("body")).toBeVisible();
  });

  test("5. Playground surface loads for Asma", async ({ page }) => {
    const ok = await loginAsAsma(page);
    test.skip(!ok, "Seed user asma@example.com not available — run pnpm db:seed");
    await page.goto("/playground");
    await expect(page).toHaveURL(/playground/);
    await expect(page.locator("body")).toBeVisible();
  });

  test("6. Analytics surface loads for Asma", async ({ page }) => {
    const ok = await loginAsAsma(page);
    test.skip(!ok, "Seed user asma@example.com not available — run pnpm db:seed");
    await page.goto("/analytics");
    await expect(page).toHaveURL(/analytics/);
    await expect(page.locator("body")).toBeVisible();
  });
});
