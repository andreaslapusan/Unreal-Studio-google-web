import { test, expect } from "@playwright/test";

const BASE = "https://unrealstudiobali.com";
const MAGIC = process.env.PW_MAGIC_LINK || "";

test("Debug session state in AdminMarketing", async ({ page }) => {
  test.skip(!MAGIC, "PW_MAGIC_LINK requerida");
  page.on('console', m => console.log(`[${m.type()}]`, m.text()));

  // 1. Login
  await page.goto(MAGIC, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(4000);
  console.log("After magic link URL:", page.url());

  // 2. Check session in page
  const session = await page.evaluate(() => {
    const item = localStorage.getItem('sb-rnielxgackkshnatvagj-auth-token');
    if (!item) return null;
    try {
      const parsed = JSON.parse(item);
      return {
        has_access_token: !!parsed.access_token,
        user_email: parsed.user?.email || null,
        user_id: parsed.user?.id || null,
        expires_at: parsed.expires_at,
        expires_in: parsed.expires_at ? parsed.expires_at - Math.floor(Date.now()/1000) : null,
      };
    } catch (e) { return { err: String(e) }; }
  });
  console.log("Session check:", JSON.stringify(session, null, 2));

  // 3. Navigate to marketing
  await page.goto(`${BASE}/admin/marketing`, { waitUntil: "load" });
  await page.waitForTimeout(8000);
  console.log("Final URL:", page.url());
  
  // 4. Check what's rendered
  const text = await page.locator('body').innerText();
  console.log("Body text (200 chars):", text.slice(0, 200).replace(/\n/g, ' | '));

  // 5. Try to fetch the edge function from the page to test
  const edgeResult = await page.evaluate(async () => {
    const item = localStorage.getItem('sb-rnielxgackkshnatvagj-auth-token');
    if (!item) return { err: 'no token' };
    const parsed = JSON.parse(item);
    try {
      const r = await fetch('https://rnielxgackkshnatvagj.supabase.co/functions/v1/ghl-dashboard', {
        headers: { 'Authorization': 'Bearer ' + parsed.access_token, 'Content-Type': 'application/json' }
      });
      return { status: r.status, body: (await r.text()).slice(0, 200) };
    } catch (e) { return { err: String(e) }; }
  });
  console.log("Edge function call from browser:", JSON.stringify(edgeResult, null, 2));
});
