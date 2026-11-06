// Unit test (sin navegador) del diff de la ficha de cliente → admin_save_client.
// npx playwright test tests/client-card-diff.spec.ts --project=chromium-desktop
import { test, expect } from '@playwright/test';
import { changedClientFields, clientSavePayload, reloadedClientCard } from '../lib/clientCardDiff';

// Ficha tal como se cargó al abrirla (admin_list_clients); superadmin → también trae contraseñas.
const opened = {
  id: 'c1', updated_at: '2026-11-06T17:00:00.123456+00:00', name: 'Ana', email: 'ana@x.com', phone: '+34 600',
  notes: null, auto_emails_enabled: true, password_plain: 'pw-old', temp_password: 'pw-old', must_change_password: false,
  holders: [{ name: 'Ana', email: 'ana@x.com', phone: '+34 600', lang: 'es', password_hash: 'h' }], extra_emails: [],
  feature_overrides: { drive: true, brochure: false }, status: 'active', is_active: true, preferred_language: 'es',
  last_login: '2026-11-06T10:00:00+00:00', logins_7d: 3, projects: [{ id: 'cp1' }],
};

test('only what the user changed travels, with the loaded value and row version', () => {
  expect(clientSavePayload(opened, { ...opened, notes: 'llamar el lunes' })).toEqual({
    id: 'c1', expected_updated_at: opened.updated_at, base: { notes: null }, notes: 'llamar el lunes',
  });
});

test('fields changed elsewhere (auto emails, passwords, phone) never travel if untouched in the card', () => {
  const p = clientSavePayload(opened, { ...opened, drive_folder_url: 'https://drive.google.com/x' });
  for (const k of ['auto_emails_enabled', 'password_plain', 'temp_password', 'must_change_password', 'phone', 'holders', 'status', 'projects']) {
    expect(p).not.toHaveProperty(k);
  }
});

test('the pause switch travels when the user flips it', () => {
  const p = clientSavePayload(opened, { ...opened, auto_emails_enabled: false });
  expect(p).toMatchObject({ auto_emails_enabled: false, base: { auto_emails_enabled: true } });
});

test('holders bring the fields admin_save_client derives from them; status brings is_active', () => {
  const holders = [{ ...opened.holders[0], phone: '+34 699' }];
  const p = clientSavePayload(opened, { ...opened, holders, phone: '+34 699', status: 'draft', is_active: false });
  expect(Object.keys(p).sort()).toEqual(['base', 'email', 'expected_updated_at', 'extra_emails', 'holders', 'id', 'is_active', 'name', 'phone', 'status']);
  expect(p.base).toEqual({ holders: opened.holders, name: 'Ana', email: 'ana@x.com', extra_emails: [], phone: '+34 600', status: 'active', is_active: true });
});

test('no-op edits are not changes (empty = null, key order, toggled back)', () => {
  expect(changedClientFields(opened, {
    ...opened, notes: '', feature_overrides: { brochure: false, drive: true },
    holders: opened.holders.map((h) => ({ ...h })), auto_emails_enabled: true,
  })).toEqual([]);
});

// «Recargar» tras un conflicto = fila actual + SOLO lo que el usuario cambió, hasta el subcampo. Reaplicar el campo
// entero (titulares, permisos) devolvía al guardar el teléfono viejo de un titular que otro había cambiado.
const two = {
  ...opened, name: 'Ana & Bo', extra_emails: ['bo@x.com'], feature_overrides: { drive: true },
  holders: [opened.holders[0], { name: 'Bo', email: 'bo@x.com', phone: '+34 700', lang: 'ro', password_hash: 'h-old' }],
};

test('Reload keeps what the user typed AND what others changed in other holders / permissions', () => {
  // ficha: renombra a Bo, añade a Cy, apaga la calculadora
  const typed = { ...two, name: 'Ana & Bob & Cy', feature_overrides: { drive: true, calculator: false },
    holders: [two.holders[0], { ...two.holders[1], name: 'Bob' }, { name: 'Cy', email: 'cy@x.com', phone: '', lang: 'id' }] };
  // mientras: otro admin cambió el teléfono de Ana, Bo cambió su contraseña del portal y alguien quitó el folleto
  const fresh = { ...two, updated_at: '2026-11-06T18:00:00.000001+00:00', phone: '+34 699', feature_overrides: { drive: true, brochure: false },
    holders: [{ ...two.holders[0], phone: '+34 699' }, { ...two.holders[1], password_hash: 'h-new' }] };
  const card = reloadedClientCard(two, typed, fresh);
  expect(card.holders).toEqual([fresh.holders[0], { ...fresh.holders[1], name: 'Bob' }, typed.holders[2]]);
  expect(card.feature_overrides).toEqual({ drive: true, brochure: false, calculator: false });
  expect(card).toMatchObject({ phone: '+34 699', name: 'Ana & Bob & Cy', updated_at: fresh.updated_at });
  const p = clientSavePayload(fresh, card);
  expect(p).toMatchObject({ expected_updated_at: fresh.updated_at, holders: card.holders, feature_overrides: card.feature_overrides });
  expect(p).not.toHaveProperty('phone');
});

test('Reload on a client without holders (card builds them from name/email/phone): the newer phone survives', () => {
  const bare = { ...opened, holders: [], phone: '', preferred_language: 'en' };
  const typed = { ...bare, name: 'Ana Renamed', holders: [{ name: 'Ana Renamed', email: 'ana@x.com', phone: '', lang: 'en' }] };
  const fresh = { ...bare, updated_at: '2026-11-06T18:00:00+00:00', phone: '+00 1', holders: [{ name: 'Ana', email: 'ana@x.com', phone: '+00 1', lang: 'en' }] };
  expect(reloadedClientCard(bare, typed, fresh)).toMatchObject({ phone: '+00 1', name: 'Ana Renamed',
    holders: [{ name: 'Ana Renamed', email: 'ana@x.com', phone: '+00 1', lang: 'en' }] });
});

test('Reload matches holders by email (user reordered), keeps a holder someone else added, and a value both changed = what the user typed', () => {
  const typed = { ...two, holders: [{ ...two.holders[1], phone: '+34 777' }, two.holders[0]] };
  const di = { name: 'Di', email: 'di@x.com', phone: '', lang: 'es' };
  const fresh = { ...two, updated_at: '2026-11-06T18:00:00+00:00', holders: [{ ...two.holders[0], phone: '+34 699' }, { ...two.holders[1], phone: '+34 711' }, di] };
  expect(reloadedClientCard(two, typed, fresh).holders).toEqual([{ ...two.holders[1], phone: '+34 777' }, { ...two.holders[0], phone: '+34 699' }, di]);
  // el usuario quitó a Bo mientras otro le cambiaba el teléfono → se respeta la baja
  expect(reloadedClientCard(two, { ...two, holders: [two.holders[0]] }, fresh).holders).toEqual([fresh.holders[0], di]);
  // fila nueva aún sin email: no impide fusionar a los demás
  const noMail = { name: 'Eva', email: '', phone: '', lang: 'es' };
  expect(reloadedClientCard(two, { ...two, holders: [...two.holders, noMail] }, fresh).holders).toEqual([...fresh.holders.slice(0, 2), noMail, di]);
});
