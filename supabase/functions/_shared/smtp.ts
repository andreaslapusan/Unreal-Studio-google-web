/**
 * Shared SMTP sender for client-facing mail (kwitansi + payment reminders).
 *
 * Transport is env-driven so we can point it at the hello@unrealstudiobali.com
 * mailbox without code changes. Set these as Supabase function secrets:
 *   SMTP_HOST   e.g. smtp.ionos.com   (IONOS) / smtp.gmail.com (interim)
 *   SMTP_PORT   465 (SSL) | 587 (STARTTLS)   — default 465
 *   SMTP_USER   hello@unrealstudiobali.com
 *   SMTP_PASS   <mailbox app password>        — NEVER commit; secret only
 *   MAIL_FROM   "Unreal Studio <hello@unrealstudiobali.com>"  (optional)
 *
 * Until SMTP_* are set, send() throws a clear, catchable error so callers can
 * report "transport not configured" instead of failing silently.
 */
// @ts-nocheck — Deno runtime types not in the Vite tsconfig
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

export const FROM_DEFAULT = "Unreal Studio <hello@unrealstudiobali.com>";

export function smtpConfigured(): boolean {
  return Boolean(Deno.env.get("SMTP_HOST") && Deno.env.get("SMTP_USER") && Deno.env.get("SMTP_PASS"));
}

export interface MailMsg {
  to: string;
  subject: string;
  html: string;
  replyTo?: string;
}

export async function sendMail(msg: MailMsg): Promise<void> {
  const host = Deno.env.get("SMTP_HOST");
  const user = Deno.env.get("SMTP_USER");
  const pass = Deno.env.get("SMTP_PASS");
  if (!host || !user || !pass) {
    throw new Error("SMTP not configured (set SMTP_HOST / SMTP_USER / SMTP_PASS secrets for hello@unrealstudiobali.com)");
  }
  const port = Number(Deno.env.get("SMTP_PORT") ?? "465");
  const from = Deno.env.get("MAIL_FROM") ?? FROM_DEFAULT;

  const client = new SMTPClient({
    connection: {
      hostname: host,
      port,
      tls: port === 465,
      auth: { username: user, password: pass },
    },
  });
  try {
    await client.send({
      from,
      to: msg.to,
      replyTo: msg.replyTo ?? "hello@unrealstudiobali.com",
      subject: msg.subject,
      html: msg.html,
    });
  } finally {
    await client.close();
  }
}
