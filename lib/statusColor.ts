/**
 * Map a free-text project status (see statusI18n.ts) to a coloured badge.
 * Uses the same normalization so it stays in sync with translateStatus.
 * Returns Tailwind classes for background + text so listing cards can show
 * a status colour the way the big Bali agencies do (green = ready/delivered,
 * blue = under construction, amber = pre-sale, orange = last units, red = sold).
 */
function normalize(raw: string): string {
  return raw
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function statusBadgeClass(raw: string | null | undefined): string {
  const n = normalize(raw || "");
  // Completed / delivered / ready to move in → green
  if (n.startsWith("obra_finalizada") || n.startsWith("entregado") || n.startsWith("listo_para_entrar") || n.startsWith("finalizado") || n.includes("terminad"))
    return "bg-emerald-600 text-white";
  // Sold / waiting list → red
  if (n.startsWith("vendido") || n === "sold")
    return "bg-red-600 text-white";
  // Off plan / pre-sale / pre-construction → amber
  if (n.startsWith("off_plan") || n.startsWith("sobre_plano") || n.startsWith("pre_venta") || n.startsWith("en_pre_venta") || n.startsWith("pre_construccion"))
    return "bg-amber-500 text-white";
  // Last units → orange (urgency)
  if (n.startsWith("ultimas_unidades"))
    return "bg-orange-500 text-white";
  // Under construction / structure complete → teal
  if (n.startsWith("en_construccion") || n.startsWith("estructura_completa"))
    return "bg-teal-600 text-white";
  // Co-investment opportunity → indigo
  if (n.startsWith("oportunidad"))
    return "bg-indigo-600 text-white";
  // Fallback → brand primary
  return "bg-primary/90 text-white";
}
