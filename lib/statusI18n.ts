/**
 * Translate free-text Spanish status strings stored in Supabase into the
 * active i18n locale at render time.
 *
 * The actual DB column (`projects.status`) is a free-text string that the
 * team edits from the admin panel. We don't migrate the data to status
 * codes — instead we normalize the Spanish source string to a stable key
 * and look it up in the `admin.statusBadge.*` namespace. Unknown statuses
 * fall through to the original string so nothing breaks if the admin adds
 * a brand-new label that hasn't been added to the catalogue yet.
 */
import type { TFunction } from "i18next";

function normalize(raw: string): string {
  return raw
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // strip accents
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

const KNOWN_STATUS_KEYS: Record<string, string> = {
  en_construccion: "en_construccion",
  pre_venta: "pre_venta",
  en_pre_venta: "en_pre_venta",
  pre_construccion: "pre_construccion",
  entregado: "entregado",
  estructura_completa_finishing_en_curso: "estructura_completa",
  ultimas_unidades: "ultimas_unidades",
  vendido_lista_de_espera: "vendido_lista_espera",
  oportunidad_de_co_inversion: "oportunidad_co_inversion",
  listo_para_entrar: "listo_para_entrar",
};

export function translateStatus(raw: string | null | undefined, t: TFunction): string {
  if (!raw) return "";
  const norm = normalize(raw);
  const key = KNOWN_STATUS_KEYS[norm];
  if (!key) return raw;
  const translated = t(`admin.statusBadge.${key}`);
  return translated === `admin.statusBadge.${key}` ? raw : translated;
}
