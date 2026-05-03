import { test, expect } from "@playwright/test";

const BASE = "https://unrealstudiobali.com";
const MAGIC = process.env.PW_MAGIC_LINK || "";

test("Admin marketing — login real con magic link y carga datos", async ({ page }) => {
  test.skip(!MAGIC, "PW_MAGIC_LINK requerida");
  page.on('console', m => console.log(`[${m.type()}]`, m.text().slice(0, 200)));
  page.on('pageerror', e => console.log('[ERROR]', e.message));

  await page.goto(MAGIC, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(4000);
  console.log("Tras magic link URL:", page.url());

  const sessionCheck = await page.evaluate(() => {
    const t = localStorage.getItem('sb-rnielxgackkshnatvagj-auth-token');
    return t ? { has: true, email: JSON.parse(t).user?.email, exp: JSON.parse(t).expires_at } : { has: false };
  });
  console.log("Session in localStorage:", JSON.stringify(sessionCheck));

  await page.goto(`${BASE}/admin/marketing`, { waitUntil: "load" });
  let resolvedAt = -1;
  for (let i = 0; i < 30; i++) {
    await page.waitForTimeout(1000);
    const t = await page.locator('body').innerText().catch(() => '');
    if (t && !t.includes('Cargando')) { resolvedAt = i + 1; break; }
  }
  console.log("Resolved (no Cargando) at:", resolvedAt, "s");
  console.log("Final URL:", page.url());

  const text = await page.locator('body').innerText();
  console.log("Body (300 chars):", text.slice(0, 300).replace(/\n+/g, ' | '));

  await page.screenshot({ path: "test-results/admin-marketing-real.png", fullPage: true });

  // Check edge function call
  const edgeResult = await page.evaluate(async () => {
    const item = localStorage.getItem('sb-rnielxgackkshnatvagj-auth-token');
    if (!item) return { err: 'no token' };
    const tok = JSON.parse(item).access_token;
    const r = await fetch('https://rnielxgackkshnatvagj.supabase.co/functions/v1/ghl-dashboard', {
      headers: { 'Authorization': 'Bearer ' + tok }
    });
    const body = await r.text();
    let parsed: any = null;
    try { parsed = JSON.parse(body); } catch {}
    return {
      status: r.status,
      pipelines: parsed?.pipelines?.length,
      stageBuckets: parsed?.stageBuckets?.length,
      leads: parsed?.leads?.length,
      conversations: parsed?.conversations?.length,
      preview: body.slice(0, 200),
    };
  });
  console.log("Edge function call:", JSON.stringify(edgeResult, null, 2));
});
