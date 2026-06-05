import { test, expect } from "@playwright/test";

test("GTM-NHNQM6VG loads and dataLayer is initialized", async ({ page }) => {
  const gtmRequests: string[] = [];
  page.on('request', req => {
    const u = req.url();
    if (u.includes('googletagmanager.com/gtm.js') || u.includes('googletagmanager.com/ns.html')) {
      gtmRequests.push(u);
    }
  });

  await page.goto("https://unrealstudiobali.com/", { waitUntil: "load" });
  await page.waitForTimeout(4000);

  // Check dataLayer was created and has gtm.start
  const dataLayer = await page.evaluate(() => {
    const dl = (window as any).dataLayer;
    if (!Array.isArray(dl)) return { ok: false, reason: 'dataLayer not array', value: typeof dl };
    const start = dl.find((e: any) => e['gtm.start']);
    return { ok: !!start, length: dl.length, hasStart: !!start, sample: dl.slice(0, 3) };
  });
  console.log("dataLayer:", JSON.stringify(dataLayer, null, 2));

  // Check GTM script was actually loaded
  const gtmLoaded = await page.evaluate(() => {
    const scripts = Array.from(document.scripts);
    const gtmScript = scripts.find(s => s.src?.includes('googletagmanager.com/gtm.js?id=GTM-NHNQM6VG'));
    return { found: !!gtmScript, src: gtmScript?.src };
  });
  console.log("GTM script tag:", JSON.stringify(gtmLoaded, null, 2));

  console.log("\nGTM network requests:");
  for (const r of gtmRequests) console.log("  ", r.slice(0, 100));

  // Verify noscript iframe present in DOM
  const noscriptIframe = await page.evaluate(() => {
    const noscripts = Array.from(document.querySelectorAll('noscript'));
    return noscripts.some(n => n.innerHTML.includes('GTM-NHNQM6VG'));
  });
  console.log("Noscript iframe present:", noscriptIframe);

  expect(dataLayer.ok).toBeTruthy();
  expect(gtmLoaded.found).toBeTruthy();
  expect(noscriptIframe).toBeTruthy();
});
