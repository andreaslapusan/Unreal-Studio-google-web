// @ts-nocheck — Deno runtime
// Collaboration agreement PDF (item 18), built from the portal's contract texts (contract_texts.ts,
// generated from locales by scripts/gen-agency-contract-texts.mjs) + the agency's details and rates.
import { PDFDocument, StandardFonts, rgb } from "https://esm.sh/pdf-lib@1.17.1";
import { C } from "./contract_texts.ts";
import { PDF_T, L } from "./texts.ts";

// shortcut: standard Helvetica is WinAnsi only, so ș/ț/ă etc. are folded to ASCII; embed a TTF if a client complains.
const WIN = /[^\x20-\x7E -ÿ–—‘’“”•€]/g;
const fold = (s: string) => String(s ?? "").normalize("NFC")
  .replace(/[șş]/g, "s").replace(/[ȘŞ]/g, "S").replace(/[țţ]/g, "t").replace(/[ȚŢ]/g, "T").replace(/ă/g, "a").replace(/Ă/g, "A")
  .replace(/„/g, "\"").replace(WIN, "");

const pct = (s: string, close: number, referral: number) =>
  String(s).replace(/\{\{close\}\}/g, String(close)).replace(/\{\{referral\}\}/g, String(referral));

export async function agreementPdf(p: {
  lang: string; agency: string; email: string; country?: string | null; close: number; referral: number;
  acceptedAt?: string | null; version?: string | null;
}): Promise<Uint8Array> {
  const lang = L(p.lang);
  const c = C[lang] ?? C.en;
  const t = PDF_T[lang] ?? PDF_T.en;
  const doc = await PDFDocument.create({ updateMetadata: false }); // no metadata, ever (house rule)
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const brown = rgb(0.247, 0.137, 0.02);
  const W = 595, H = 842, M = 56, maxW = W - 2 * M;
  let page = doc.addPage([W, H]);
  let y = H - M;

  const wrap = (text: string, f, size: number) => {
    const out: string[] = [];
    for (const para of fold(text).split("\n")) {
      let line = "";
      for (const w of para.split(/\s+/)) {
        const next = line ? `${line} ${w}` : w;
        if (f.widthOfTextAtSize(next, size) > maxW && line) { out.push(line); line = w; } else line = next;
      }
      out.push(line);
    }
    return out;
  };
  const write = (text: string, f = font, size = 10.5, gap = 4) => {
    for (const ln of wrap(text, f, size)) {
      if (y < M + size) { page = doc.addPage([W, H]); y = H - M; }
      page.drawText(ln, { x: M, y, size, font: f, color: brown });
      y -= size + gap;
    }
    y -= gap;
  };

  write("Unreal Studio Bali", bold, 18);
  write(t.title, bold, 14, 8);
  write(`${t.parties}: ${t.unreal} · ${t.agency}: ${p.agency} (${p.email}${p.country ? ", " + p.country : ""})`);
  write(`${t.date}: ${new Date().toISOString().slice(0, 10)} · ${t.version}: ${p.version ?? "-"}`);
  if (p.acceptedAt) write(`${t.accepted} ${String(p.acceptedAt).slice(0, 16).replace("T", " ")} UTC`);
  y -= 6;
  for (const i of [1, 2, 3, 4, 5]) {
    write(c[`c${i}t`], bold, 11.5, 3);
    write(pct(c[`c${i}`], p.close, p.referral));
  }
  write(t.you, bold, 11.5, 3); write(pct(c.you, p.close, p.referral));
  write(t.us, bold, 11.5, 3); write(c.us);
  y -= 6;
  write(t.prevail, font, 9);
  return await doc.save();
}
