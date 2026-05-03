import { test } from "@playwright/test";
const MAGIC = process.env.PW_MAGIC_LINK || "";
test("Check profiles read with user JWT", async ({ page }) => {
  test.skip(!MAGIC, "MAGIC required");
  await page.goto(MAGIC, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(3000);
  await page.goto("https://unrealstudiobali.com/", { waitUntil: "load" });
  await page.waitForTimeout(2000);
  
  const result = await page.evaluate(async () => {
    const item = localStorage.getItem('sb-rnielxgackkshnatvagj-auth-token');
    if (!item) return { err: 'no token' };
    const parsed = JSON.parse(item);
    const tok = parsed.access_token;
    const userId = parsed.user.id;
    const ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJuaWVseGdhY2trc2huYXR2YWdqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA4MzE4NTEsImV4cCI6MjA4NjQwNzg1MX0.5X6k4TVLrH1AJMLw797l4LWTy3cROhh-Q4gAPl-GPJY";
    
    const start = Date.now();
    try {
      const r = await fetch(`https://rnielxgackkshnatvagj.supabase.co/rest/v1/profiles?user_id=eq.${userId}&select=role`, {
        headers: { 'apikey': ANON, 'Authorization': 'Bearer ' + tok }
      });
      const body = await r.text();
      return { status: r.status, body: body.slice(0, 500), ms: Date.now() - start };
    } catch (e) {
      return { err: String(e), ms: Date.now() - start };
    }
  });
  console.log("Profiles fetch:", JSON.stringify(result, null, 2));
});
