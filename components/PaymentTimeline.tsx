/**
 * Visual timeline of payments for one investor_unit row.
 * Renders a horizontal stepper with status (paid / due / pending) and amounts.
 */
import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { supabase } from "../lib/supabase";

interface Payment {
  id: string;
  label: string;
  amount: number;
  currency: string;
  due_date: string | null;
  paid_at: string | null;
  position: number;
}

interface Props {
  investorUnitId: string;
}

const fmt = (n: number, c: string) =>
  new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency: c,
    maximumFractionDigits: 0,
  }).format(n);

export default function PaymentTimeline({ investorUnitId }: Props) {
  const { t, i18n } = useTranslation();
  const [items, setItems] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);

  const dateLocale = i18n.language === "en" ? "en-GB" : i18n.language === "ro" ? "ro-RO" : "es-ES";
  const fmtDate = (s: string | null) => {
    if (!s) return null;
    try {
      return new Date(s).toLocaleDateString(dateLocale, { day: "2-digit", month: "short", year: "2-digit" });
    } catch {
      return s;
    }
  };

  useEffect(() => {
    void (async () => {
      const { data } = await supabase
        .from("investor_payments")
        .select("id, label, amount, currency, due_date, paid_at, position")
        .eq("investor_unit_id", investorUnitId)
        .order("position");
      setItems((data ?? []) as Payment[]);
      setLoading(false);
    })();
  }, [investorUnitId]);

  if (loading) return <div className="text-xs text-primary/60">{t("paymentTimeline.loading")}</div>;
  if (items.length === 0) {
    return (
      <p className="text-xs text-primary/60 italic">
        {t("paymentTimeline.empty")}
      </p>
    );
  }

  const total = items.reduce((s, i) => s + i.amount, 0);
  const paid = items.filter((i) => i.paid_at).reduce((s, i) => s + i.amount, 0);
  const pct = total > 0 ? Math.round((paid / total) * 100) : 0;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-xs text-primary/70">
        <span>{t("paymentTimeline.title")}</span>
        <span className="font-bold text-primary">{t("paymentTimeline.summary", { pct, paid: fmt(paid, items[0]?.currency ?? "EUR"), total: fmt(total, items[0]?.currency ?? "EUR") })}</span>
      </div>
      <div className="h-2 bg-primary/10 rounded-full overflow-hidden">
        <div className="h-full bg-green-500 transition-all" style={{ width: `${pct}%` }} />
      </div>
      <ul className="space-y-2 mt-3">
        {items.map((p) => {
          const isPaid = !!p.paid_at;
          const isOverdue = !isPaid && p.due_date && new Date(p.due_date) < new Date();
          return (
            <li
              key={p.id}
              className={`flex items-center justify-between gap-3 rounded-lg p-3 text-sm ${
                isPaid
                  ? "bg-green-50 border border-green-200"
                  : isOverdue
                  ? "bg-red-50 border border-red-200"
                  : "bg-white/60 border border-primary/10"
              }`}
            >
              <div className="flex items-center gap-3 min-w-0">
                <span className={`text-xl ${isPaid ? "" : isOverdue ? "" : "opacity-30"}`}>
                  {isPaid ? "✅" : isOverdue ? "⚠️" : "⏳"}
                </span>
                <div className="min-w-0">
                  <div className="font-medium truncate">{p.label}</div>
                  <div className="text-xs text-primary/60">
                    {p.due_date && <>{t("paymentTimeline.due", { date: fmtDate(p.due_date) })}</>}
                    {isPaid && <>{t("paymentTimeline.paidOn", { date: fmtDate(p.paid_at) })}</>}
                  </div>
                </div>
              </div>
              <div className="text-right shrink-0">
                <div className="font-bold">{fmt(p.amount, p.currency ?? "EUR")}</div>
                <div className="text-xs text-primary/60">
                  {isPaid ? t("paymentTimeline.statusPaid") : isOverdue ? t("paymentTimeline.statusOverdue") : t("paymentTimeline.statusPending")}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
