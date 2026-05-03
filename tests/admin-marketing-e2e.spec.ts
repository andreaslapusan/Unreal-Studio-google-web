import { test, expect } from "@playwright/test";

const BASE = "https://unrealstudiobali.com";
const MAGIC = process.env.PW_MAGIC_LINK || "";

test("Admin marketing — login con magic link y carga datos", async ({ page }) => {
  test.skip(!MAGIC, "PW_MAGIC_LINK requerida");

  // 1. Verificar el magic link → Supabase devuelve access_token en hash
  await page.goto(MAGIC, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(3000);
  const afterUrl = page.url();
  console.log("Tras magic link:", afterUrl);

  // 2. Si terminó en /, navegar manualmente a /admin/marketing
  await page.goto(`${BASE}/admin/marketing`, { waitUntil: "networkidle" });
  await page.waitForTimeout(8000); // dar tiempo a que load() complete
  const url2 = page.url();
  console.log("Final URL:", url2);
  await page.screenshot({ path: "test-results/admin-marketing-loggedin.png", fullPage: true });

  // 3. Loggear consola para debug
  page.on('console', msg => console.log('PAGE LOG:', msg.text()));

  // 4. Buscar elementos del dashboard
  const html = await page.content();
  const has = {
    cargando: html.includes("Cargando"),
    embudo: html.includes("Embudo"),
    leads: html.includes("Total leads"),
    refresh: html.includes("Refresh"),
    accesoRestringido: html.includes("Acceso restringido"),
    sesionExpirada: html.includes("Sesión expirada"),
  };
  console.log("Página estado:", JSON.stringify(has, null, 2));

  // 5. Captura del localStorage (para entender la sesión)
  const sessionData = await page.evaluate(() => ({
    keys: Object.keys(localStorage).filter(k => k.includes('supabase') || k.includes('sb-')),
    user: localStorage.getItem('sb-rnielxgackkshnatvagj-auth-token')?.slice(0, 200) || null,
  }));
  console.log("LocalStorage Supabase:", JSON.stringify(sessionData, null, 2));
});
