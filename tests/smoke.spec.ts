/**
 * Playwright smoke tests for the deployed Unreal Studio Bali portal.
 *
 * Run locally: `npx playwright test tests/smoke.spec.ts`
 * In CI:        configured via .github/workflows/e2e.yml (next batch)
 *
 * Goal: catch regressions in core public flows before they reach prod.
 * Each test is independent and uses live Firebase Hosting URL.
 */
import { test, expect, type Page } from "@playwright/test";

// Base URL is overridden via PW_BASE_URL env in CI when testing custom domain.
const BASE = process.env.PW_BASE_URL ?? "https://gen-lang-client-0678977822.web.app";

async function open(page: Page, path: string) {
  // SPA uses hash routing → must keep "#" prefix
  await page.goto(`${BASE}/#${path}`, { waitUntil: "domcontentloaded" });
}

test.describe("public pages render", () => {
  test("home loads with title", async ({ page }) => {
    await page.goto(BASE);
    await expect(page).toHaveTitle(/Unreal Studio.*Bali/i);
    await expect(page.locator("h1, h2, h3").first()).toBeVisible();
  });

  test("projects list page", async ({ page }) => {
    await open(page, "/proyectos");
    await expect(page.locator("h1, h2").first()).toBeVisible();
  });

  test("agencias landing — partnership program", async ({ page }) => {
    await open(page, "/agencias");
    // Hero CTA renders via i18n. Both "Aplicar ahora" hero link and
    // "Aplicar al programa →" footer CTA match — assert the first one.
    await expect(page.getByRole("link", { name: /aplicar/i }).first()).toBeVisible();
  });

  test("agencias registrar form", async ({ page }) => {
    await open(page, "/agencias/registrar");
    await expect(page.getByLabel(/email/i)).toBeVisible();
    // Submit button is disabled until required fields are filled
    await expect(page.getByRole("button", { name: /enviar/i })).toBeVisible();
  });

  test("agencias login (magic link form)", async ({ page }) => {
    await open(page, "/agencias/login");
    await expect(page.getByLabel(/email/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /enlace mágico|magic link|tautan/i })).toBeVisible();
  });

  test("inversores landing — investor program", async ({ page }) => {
    await open(page, "/inversores");
    // Hero "Hablar con un asesor" + footer "Agendar llamada con un asesor →"
    // both match — assert the first.
    await expect(page.getByRole("link", { name: /asesor|advisor|penasihat/i }).first()).toBeVisible();
  });

  test("inversores login", async ({ page }) => {
    await open(page, "/inversores/login");
    await expect(page.getByLabel(/email/i)).toBeVisible();
  });
});

test.describe("static SEO assets", () => {
  test("robots.txt has rules and sitemap reference", async ({ request }) => {
    const r = await request.get(`${BASE}/robots.txt`);
    expect(r.status()).toBe(200);
    const body = await r.text();
    expect(body).toContain("User-agent:");
    expect(body).toContain("Sitemap:");
    expect(body).toMatch(/unrealstudiobali|unrealstudio/);
  });

  test("sitemap.xml is well-formed", async ({ request }) => {
    const r = await request.get(`${BASE}/sitemap.xml`);
    expect(r.status()).toBe(200);
    const body = await r.text();
    expect(body).toContain("<?xml");
    expect(body).toContain("<urlset");
    expect(body).toContain("</urlset>");
  });
});

test.describe("i18n switcher", () => {
  test("language can be switched to English", async ({ page }) => {
    await open(page, "/agencias");
    // The compact switcher shows ES / EN / ID buttons. Click EN.
    const en = page.getByRole("button", { name: "EN", exact: true });
    if (await en.isVisible()) {
      await en.click();
      // After switching, the apply CTA should match the English copy
      await expect(page.getByText(/apply/i).first()).toBeVisible({ timeout: 5000 });
    }
  });

  test("language can be switched to Bahasa", async ({ page }) => {
    await open(page, "/agencias");
    const id = page.getByRole("button", { name: "ID", exact: true });
    if (await id.isVisible()) {
      await id.click();
      await expect(page.getByText(/daftar|listing|villa/i).first()).toBeVisible({ timeout: 5000 });
    }
  });
});

test.describe("auth flows do not leak", () => {
  test("admin portal redirects unauthenticated user", async ({ page }) => {
    await open(page, "/admin/portal");
    // The page should either show "Cargando…" loading or eventually redirect
    // to /admin/login. We just assert we are not seeing the admin CRUD.
    await page.waitForTimeout(1500);
    const adminCrudVisible = await page.getByText(/Admin Portal Manager/i).isVisible().catch(() => false);
    expect(adminCrudVisible).toBeFalsy();
  });

  test("agencias dashboard redirects without auth", async ({ page }) => {
    await open(page, "/agencias/dashboard");
    await page.waitForTimeout(1500);
    // AgenciasDashboard <Navigate to="/agencias" /> when no user. Confirm the
    // partner-only UI ("Mis proyectos asignados") is NOT rendered.
    const dashboardOnly = page.getByText(/Mis proyectos asignados|Mi panel|Salir de la cuenta/i);
    await expect(dashboardOnly).toHaveCount(0);
    // And the public partnership CTA is visible (proves the redirect landed).
    await expect(page.getByRole("link", { name: /aplicar/i }).first()).toBeVisible();
  });
});
