/**
 * Small badge that, when the user is logged in as lister / investor / admin,
 * shows the unit pricing relevant to their role.
 *
 * Use anywhere a unit is displayed (ProjectDetail, public proyecto pages, etc).
 *
 * Usage:
 *   <RolePricingBadge unitId="..."/>
 */
import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "../lib/auth-context";
import { supabase } from "../lib/supabase";
import { useCurrency } from "../App";

interface UnitPricing {
  price_publico: number | null;
  price_inversor: number | null;
  price_agencia: number | null;
  commission_default_pct: number | null;
  commission_per_partner: Record<string, number> | null;
}

interface Props {
  unitId: string;
  /** Precio de la web de este proyecto (investor_price): las agencias ven SIEMPRE el precio de la web. */
  webPrice?: number | null;
  webCurrency?: string | null;
}

const fmt = (n: number | null | undefined) =>
  typeof n === "number"
    ? new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n)
    : "—";

export default function RolePricingBadge({ unitId, webPrice, webCurrency }: Props) {
  const { t } = useTranslation();
  const { formatPrice } = useCurrency();
  const { user, role } = useAuth();
  const [pricing, setPricing] = useState<UnitPricing | null>(null);
  const [partnerId, setPartnerId] = useState<string | null>(null);

  useEffect(() => {
    if (!unitId) return;
    void (async () => {
      const { data } = await supabase
        .from("property_units")
        .select("price_publico, price_inversor, price_agencia, commission_default_pct, commission_per_partner")
        .eq("id", unitId)
        .maybeSingle();
      if (data) setPricing(data as UnitPricing);
    })();
  }, [unitId]);

  useEffect(() => {
    if (!user || role !== "lister") return;
    void (async () => {
      const { data } = await supabase
        .from("listing_partners")
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle();
      if (data) setPartnerId(data.id);
    })();
  }, [user, role]);

  if (!pricing || !user || !role) return null;

  if (role === "investor") {
    return (
      <div className="inline-flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-lg px-4 py-2 text-sm">
        <span className="font-bold text-blue-900">{t('fix.pricing.investorPrice')}:</span>
        <span className="font-serif text-lg text-blue-900">{fmt(pricing.price_inversor)}</span>
      </div>
    );
  }

  if (role === "lister") {
    const pct =
      (partnerId && pricing.commission_per_partner?.[partnerId]) ??
      pricing.commission_default_pct ??
      5;
    // Sin "precio agencia" aparte: la agencia vende al precio de la web (el que ya enseña esta ficha).
    const price = Number(webPrice) || 0;
    if (!price) return null;
    return (
      <div className="inline-flex flex-col gap-1 bg-green-50 border border-green-200 rounded-lg px-4 py-3 text-sm">
        <div className="text-xs text-green-800">
          {t('fix.pricing.commissionLabel', { pct })} = <strong>{formatPrice(Math.round((price * pct) / 100), (webCurrency || 'EUR') as any)}</strong> {t('fix.pricing.perClosedUnit')}
        </div>
      </div>
    );
  }

  if (role === "admin" || role === "team") {
    return (
      <div className="inline-flex flex-col gap-1 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-xs">
        <div className="font-bold text-amber-900 mb-1">{t('fix.pricing.adminAllChannels')}:</div>
        <div>{t('fix.pricing.public')}: {fmt(pricing.price_publico)}</div>
        <div>{t('fix.pricing.investor')}: {fmt(pricing.price_inversor)}</div>
        <div>
          {t('fix.pricing.agency')}: {fmt(pricing.price_agencia)} ({pricing.commission_default_pct ?? 5}% {t('fix.pricing.default')})
        </div>
      </div>
    );
  }

  return null;
}
