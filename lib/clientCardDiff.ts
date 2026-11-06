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

/** Titulares tal como los muestra la ficha: los de la fila o, si no tiene, uno con nombre/email/teléfono/idioma + uno por email extra. */
export const cardHolders = (cc: Row): Row[] => (Array.isArray(cc.holders) && cc.holders.length ? cc.holders : [
  { name: cc.name || '', email: cc.email || '', phone: cc.phone || '', lang: cc.preferred_language || 'es' },
  ...((cc.extra_emails as string[] | null) || []).map((e) => ({ name: '', email: e, phone: '', lang: cc.preferred_language || 'es' })),
]);

const isObj = (x: unknown): x is Row => !!x && typeof x === 'object' && !Array.isArray(x);
const mailOf = (h: unknown): string => (isObj(h) && typeof h.email === 'string' ? h.email.trim().toLowerCase() : '');

// Fusión a 3 vías: sobre el valor actual (fresh) solo se reaplica lo que el usuario cambió (base → mine), hasta el
// subcampo: cada permiso y cada dato de cada titular (emparejados por email; altas/bajas/orden = los del usuario,
// un titular que añadió otro se conserva). Si ambos cambiaron lo mismo gana lo tecleado (es lo que promete el aviso).
export function mergeEdit(base: unknown, mine: unknown, fresh: unknown): unknown {
  if (canon(base) === canon(mine)) return fresh;
  if (isObj(mine) && isObj(fresh) && (isObj(base) || base == null)) {
    const b: Row = isObj(base) ? base : {};
    return Object.fromEntries([...new Set([...Object.keys(b), ...Object.keys(mine), ...Object.keys(fresh)])]
      .map((k) => [k, mergeEdit(b[k], mine[k], fresh[k])]).filter(([, v]) => v !== undefined));
  }
  if (Array.isArray(base) && Array.isArray(mine) && Array.isArray(fresh)) {
    // un titular sin email no se puede emparejar: queda tal cual lo tiene el usuario
    const find = (list: unknown[], h: unknown) => (mailOf(h) ? list.find((x) => mailOf(x) === mailOf(h)) : undefined);
    return [...mine.map((m) => { const b = find(base, m); const f = find(fresh, m); return b && f ? mergeEdit(b, m, f) : m; }),
      ...fresh.filter((f) => mailOf(f) && !find(base, f) && !find(mine, f))];
  }
  return mine;
}

/** «Recargar» tras un conflicto: la fila actual + encima lo que el usuario cambió desde que abrió la ficha (fusionado).
 *  Reaplicar el campo entero devolvía, al guardar, el teléfono viejo de otro titular o el permiso que otro quitó. */
export const reloadedClientCard = (base: Row, current: Row, fresh: Row): Row => ({
  ...fresh,
  ...Object.fromEntries(changedClientFields(base, current).map((k) => [k, k === 'holders'
    ? mergeEdit(cardHolders(base), current.holders, cardHolders(fresh))
    : mergeEdit(base[k], current[k], fresh[k])])),
});
