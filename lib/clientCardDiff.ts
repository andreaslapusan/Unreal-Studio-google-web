// Ficha de cliente del admin → p_client de admin_save_client al EDITAR un cliente existente.
// Solo viajan los campos que el usuario cambió desde que abrió la ficha, con sus valores de partida
// (base) y la versión de fila que cargó: así una ficha abierta hace rato no pisa lo cambiado mientras
// tanto por otra vía (pausa de correos, contraseñas del portal, otro admin…) y la RPC responde
// error 'conflict' si alguien cambió justo uno de esos campos (6-nov-2026).

type Row = Record<string, unknown>;

/** Lo que la ficha puede editar. Contraseñas, accesos, proyectos… nunca salen de la ficha. */
export const CLIENT_CARD_FIELDS = ['holders', 'name', 'email', 'phone', 'preferred_language', 'notes', 'drive_folder_url', 'status', 'is_active', 'auto_emails_enabled', 'feature_overrides'];

// admin_save_client deriva nombre/email/emails extra de holders e is_active de status:
// viajan (y se comprueban contra conflictos) junto a ellos.
const IMPLIED: Record<string, string[]> = { holders: ['name', 'email', 'extra_emails'], status: ['is_active'] };

// Igualdad por valor: '' / null / undefined = vacío; objetos sin depender del orden de sus claves.
const canon = (v: unknown): string => JSON.stringify(v === '' || v === undefined ? null : v, (_k, x) =>
  x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) : x);

export const changedClientFields = (base: Row, current: Row): string[] =>
  CLIENT_CARD_FIELDS.filter((k) => canon(base[k]) !== canon(current[k]));

export function clientSavePayload(base: Row, current: Row): Row {
  const keys = [...new Set(changedClientFields(base, current).flatMap((k) => [k, ...(IMPLIED[k] || [])]))];
  const pick = (o: Row) => Object.fromEntries(keys.map((k) => [k, o[k] ?? null]));
  return { id: base.id, expected_updated_at: base.updated_at ?? null, base: pick(base), ...pick(current) };
}
