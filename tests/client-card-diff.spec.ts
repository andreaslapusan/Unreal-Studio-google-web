// Unit test (sin navegador) del diff de la ficha de cliente → admin_save_client.
// npx playwright test tests/client-card-diff.spec.ts --project=chromium-desktop
import { test, expect } from '@playwright/test';
import { changedClientFields, clientSavePayload } from '../lib/clientCardDiff';

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
