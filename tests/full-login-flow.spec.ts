import { test, expect } from "@playwright/test";

const BASE = "https://unrealstudiobali.com";
const MAGIC = process.env.PW_MAGIC_LINK || "";

test("Full flow: linomolamucho login → marketing dashboard → navbar icon", async ({ page }) => {
  test.skip(!MAGIC, "PW_MAGIC_LINK requerida");
  page.on('pageerror', e => console.log('[ERROR]', e.message));

  // 1. Visit landing logged-out — confirm "login" icon visible
  await page.goto(BASE + "/", { waitUntil: "networkidle" });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: "test-results/01-logged-out-home.png", fullPage: false, clip: { x: 0, y: 0, width: 1280, height: 200 } });

  // 2. Consume magic link
  await page.goto(MAGIC, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(4000);

  // 3. Check session
  const sess = await page.evaluate(() => {
    const t = localStorage.getItem('sb-rnielxgackkshnatvagj-auth-token');
    return t ? JSON.parse(t).user?.email : null;
  });
  console.log("Sesión activa para:", sess);

  // 4. Visit landing again — confirm account_circle visible (icon, not text)
  await page.goto(BASE + "/", { waitUntil: "networkidle" });
  await page.waitForTimeout(3000);
  await page.screenshot({ path: "test-results/02-logged-in-home.png", fullPage: false, clip: { x: 0, y: 0, width: 1280, height: 200 } });

  // Check the navbar icon — verify it's NOT showing literal text "account_circle"
  const navText = await page.locator('header').first().innerText().catch(() => '');
  console.log("Header text:", navText.slice(0, 200).replace(/\n+/g, ' | '));
  const showsLiteralText = navText.toLowerCase().includes('account_circle');
  console.log("Muestra texto literal 'account_circle' (mal):", showsLiteralText);

  // 5. Visit /admin/marketing
  await page.goto(BASE + "/admin/marketing", { waitUntil: "networkidle" });
  // Wait for dashboard to load (auth + data)
  let resolved = -1;
  for (let i = 0; i < 25; i++) {
    await page.waitForTimeout(1000);
    const t = await page.locator('body').innerText().catch(() => '');
    if (t.includes('Embudo') || t.includes('Refresh') || t.includes('Acceso')) { resolved = i + 1; break; }
  }
  console.log("Marketing dashboard resuelto en:", resolved, "s");
  await page.screenshot({ path: "test-results/03-admin-marketing.png", fullPage: true });

  // 6. Check dashboard content
  const html = await page.content();
  const has = {
    embudo: html.includes('Embudo'),
    leads: html.includes('Leads recientes') || html.includes('Total leads'),
    refresh: html.includes('Refresh'),
    pipelinTabs: html.includes('FUNNEL') || html.includes('pipelines'),
    accesoRestringido: html.includes('Acceso restringido'),
  };
  console.log("Estado dashboard:", JSON.stringify(has, null, 2));

  // 7. Verify featured project visible on home (logged in)
  await page.goto(BASE + "/", { waitUntil: "networkidle" });
  await page.waitForTimeout(3000);
  const homeHtml = await page.content();
  const hasFeatured = homeHtml.includes('home.featuredTag') || /destacado|featured/i.test(homeHtml);
  // Better check: is there a project image in the featured area?
  const featuredImg = await page.locator('img[fetchpriority="high"]').count();
  console.log("Home logueado: imagen destacada visible:", featuredImg > 0);

  expect(showsLiteralText).toBeFalsy();
  expect(featuredImg).toBeGreaterThan(0);
});
