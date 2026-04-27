-- Security hardening migration. Tightens RLS policies flagged by the audit.
-- Apply AFTER the base portal schema migration.

-- ─── M-1 fix: update_assets visibility check inherits parent rules ────────
drop policy if exists assets_read on public.update_assets;
create policy assets_read on public.update_assets
  for select using (
    public.current_role() = 'admin'
    or update_id in (
      select id from public.property_updates
      where visibility = 'all'
        or (public.current_role() = 'lister' and visibility = 'listers-only')
        or (public.current_role() = 'investor' and visibility = 'investors-only')
    )
  );

-- ─── H-4 fix: restrict price_inversor / price_agencia from anon ────────────
-- Strategy: keep the table-level public read for non-pricing columns,
-- but expose a public view that strips the sensitive prices for anon users.
-- Authenticated users with the right role go directly to the table.

-- Tighten the table-level policy: anon (no role) can only read public-safe columns
-- via a view. Authenticated users with a role get full row.
drop policy if exists units_public_read on public.property_units;
create policy units_authenticated_read on public.property_units
  for select using (
    available = true and public.current_role() in ('lister','investor','admin','team')
  );

-- Public-safe view that anon can hit for catalogue browsing.
create or replace view public.property_units_public as
select
  id,
  property_id,
  unit_name,
  price_publico,
  furnishing,
  payment_plan,
  location,
  google_pin,
  lease_end_date,
  year_built_or_delivery,
  extension_option,
  building_size_sqm,
  land_size_sqm,
  rooftop,
  bedrooms,
  bathrooms,
  pool_size,
  parking,
  view_text,
  highlights,
  available,
  reserved,
  sold,
  created_at,
  updated_at
from public.property_units
where available = true;

grant select on public.property_units_public to anon, authenticated;

-- ─── C-3 fix: restrict anon insert on lead_attributions to safe events ───
drop policy if exists la_anon_insert on public.lead_attributions;
create policy la_anon_insert on public.lead_attributions
  for insert with check (
    -- Anonymous visitors can only log low-stakes engagement events.
    -- Reservations and sales must come from authenticated server-side flows.
    event_type in ('visit', 'form_submit')
    -- And cannot directly link to an investor record
    and investor_id is null
  );

-- Authenticated admins/team can insert any event type
drop policy if exists la_admin_insert on public.lead_attributions;
create policy la_admin_insert on public.lead_attributions
  for insert with check (public.current_role() in ('admin','team'));
