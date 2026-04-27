-- Portal schema for Listing Agencies + Investors + Construction Updates
-- Run this once against the Supabase project.
-- Idempotent: uses CREATE TABLE IF NOT EXISTS and checks before adding.

-- ─── Profiles (links auth.users to a role) ────────────────────────────────

create table if not exists public.profiles (
  user_id   uuid primary key references auth.users(id) on delete cascade,
  email     text,
  role      text check (role in ('admin','team','lister','investor')),
  partner_id uuid,
  investor_id uuid,
  created_at timestamptz default now()
);
create index if not exists profiles_email_idx on public.profiles (email);

-- ─── Properties ───────────────────────────────────────────────────────────

create table if not exists public.properties (
  id              uuid primary key default gen_random_uuid(),
  slug            text unique not null,
  name            text not null,
  short_pitch     text,
  full_description text,
  area            text,
  pin_url         text,
  status          text,
  pct_progress    int,
  delivery_date   text,
  hero_image_url  text,
  drone_video_url text,
  walkthrough_url text,
  brand_pdf_url   text,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

-- ─── Property units (listing detail per unit) ─────────────────────────────

create table if not exists public.property_units (
  id                       uuid primary key default gen_random_uuid(),
  property_id              uuid references public.properties(id) on delete cascade,
  unit_name                text not null,
  -- Pricing differentiated by channel (Marcelino requirement)
  price_publico            numeric,
  price_inversor           numeric,
  price_agencia            numeric,
  commission_default_pct   numeric default 5,
  commission_per_partner   jsonb default '{}'::jsonb,
  currency                 text default 'EUR',
  -- 30 fields from listing detail xlsx
  furnishing               text,
  furnishing_optional_eur  numeric,
  payment_plan             text,
  location                 text,
  google_pin               text,
  lease_end_date           text,
  year_built_or_delivery   text,
  extension_option         text,
  lease_years_paid         boolean,
  renderings_url           text,
  plans_2d_url             text,
  zoning_type              text,
  building_permit          text,
  building_size_sqm        numeric,
  land_size_sqm            numeric,
  rooftop                  boolean,
  bedrooms                 int,
  bathrooms                int,
  guest_toilet             boolean,
  others_text              text,
  pool_size                text,
  parking                  boolean,
  view_text                text,
  living_room_style        text,
  structural_warranty      text,
  water_supply             text,
  highlights               text,
  available                boolean default true,
  reserved                 boolean default false,
  sold                     boolean default false,
  created_at               timestamptz default now(),
  updated_at               timestamptz default now()
);
create index if not exists property_units_property_idx on public.property_units (property_id);

-- ─── Listing partners (agencies) ──────────────────────────────────────────

create table if not exists public.listing_partners (
  id                 uuid primary key default gen_random_uuid(),
  ghl_contact_id     text unique,
  agency_name        text not null,
  manager_name       text,
  email              text unique,
  phone              text,
  whatsapp           text,
  website            text,
  country            text,
  status             text default 'pending',
  projects_assigned  uuid[] default '{}',
  user_id            uuid references auth.users(id),
  approved_at        timestamptz,
  approved_by        text,
  created_at         timestamptz default now()
);
create index if not exists listing_partners_user_idx on public.listing_partners (user_id);
create index if not exists listing_partners_email_idx on public.listing_partners (email);

-- Public-facing application form for prospective listing partners.
-- Anyone can insert (anon role policy below); only admins can read/update.
create table if not exists public.listing_partner_applications (
  id                    uuid primary key default gen_random_uuid(),
  agency_name           text not null,
  manager_name          text,
  email                 text not null,
  phone                 text,
  whatsapp              text,
  website               text,
  country               text,
  projects_interested   text[] default '{}',
  experience            text,
  monthly_volume        text,
  source                text,
  notes                 text,
  status                text default 'pending' check (status in ('pending','approved','rejected','contacted')),
  reviewed_by           text,
  reviewed_at           timestamptz,
  created_at            timestamptz default now()
);
create index if not exists lpa_status_idx on public.listing_partner_applications (status);

-- ─── Investors ────────────────────────────────────────────────────────────

create table if not exists public.investors (
  id              uuid primary key default gen_random_uuid(),
  ghl_contact_id  text unique,
  full_name       text,
  email           text unique,
  phone           text,
  country         text,
  user_id         uuid references auth.users(id),
  kyc_status      text default 'pending',
  created_at      timestamptz default now()
);

create table if not exists public.investor_units (
  id                 uuid primary key default gen_random_uuid(),
  investor_id        uuid references public.investors(id) on delete cascade,
  unit_id            uuid references public.property_units(id) on delete cascade,
  price_paid         numeric,
  contract_signed_at timestamptz,
  reservation_paid   boolean default false,
  full_paid          boolean default false,
  created_at         timestamptz default now(),
  unique (investor_id, unit_id)
);

-- ─── Property updates ─────────────────────────────────────────────────────

create table if not exists public.property_updates (
  id                       uuid primary key default gen_random_uuid(),
  property_id              uuid references public.properties(id) on delete cascade,
  title                    text not null,
  summary                  text,
  pct_progress_at_update   int,
  posted_by                text,
  posted_at                timestamptz default now(),
  visibility               text default 'all' check (visibility in ('all','investors-only','listers-only'))
);
create index if not exists property_updates_property_idx on public.property_updates (property_id);

create table if not exists public.update_assets (
  id              uuid primary key default gen_random_uuid(),
  update_id       uuid references public.property_updates(id) on delete cascade,
  asset_type      text check (asset_type in ('image','video','pdf','link','other')),
  storage_path    text,
  external_url    text,
  file_name       text,
  file_size       bigint,
  mime_type       text,
  caption         text,
  position        int default 0
);

-- ─── Row-Level Security ───────────────────────────────────────────────────

alter table public.profiles                       enable row level security;
alter table public.properties                     enable row level security;
alter table public.property_units                 enable row level security;
alter table public.listing_partners               enable row level security;
alter table public.listing_partner_applications   enable row level security;
alter table public.investors                      enable row level security;
alter table public.investor_units                 enable row level security;
alter table public.property_updates               enable row level security;
alter table public.update_assets                  enable row level security;

-- Helper: read role from profiles
create or replace function public.current_role() returns text
language sql security definer stable
as $$
  select role from public.profiles where user_id = auth.uid()
$$;

-- Properties: public read, admin write
drop policy if exists properties_public_read on public.properties;
create policy properties_public_read on public.properties
  for select using (true);

drop policy if exists properties_admin_write on public.properties;
create policy properties_admin_write on public.properties
  for all using (public.current_role() = 'admin');

-- property_units: public read of available; admin write
drop policy if exists units_public_read on public.property_units;
create policy units_public_read on public.property_units
  for select using (available = true);
drop policy if exists units_admin_write on public.property_units;
create policy units_admin_write on public.property_units
  for all using (public.current_role() = 'admin');

-- Listing partners: lister sees own, admin sees all
drop policy if exists partners_self on public.listing_partners;
create policy partners_self on public.listing_partners
  for select using (user_id = auth.uid() or public.current_role() = 'admin');
drop policy if exists partners_admin_write on public.listing_partners;
create policy partners_admin_write on public.listing_partners
  for all using (public.current_role() = 'admin');

-- Listing partner applications: anyone can submit, only admins read
drop policy if exists lpa_anon_insert on public.listing_partner_applications;
create policy lpa_anon_insert on public.listing_partner_applications
  for insert with check (true);
drop policy if exists lpa_admin_read on public.listing_partner_applications;
create policy lpa_admin_read on public.listing_partner_applications
  for select using (public.current_role() = 'admin');
drop policy if exists lpa_admin_modify on public.listing_partner_applications;
create policy lpa_admin_modify on public.listing_partner_applications
  for update using (public.current_role() = 'admin');

-- Investors
drop policy if exists investors_self on public.investors;
create policy investors_self on public.investors
  for select using (user_id = auth.uid() or public.current_role() = 'admin');
drop policy if exists investors_admin_write on public.investors;
create policy investors_admin_write on public.investors
  for all using (public.current_role() = 'admin');

-- investor_units: investor sees own units only, admin all
drop policy if exists iu_self on public.investor_units;
create policy iu_self on public.investor_units
  for select using (
    investor_id in (select id from public.investors where user_id = auth.uid())
    or public.current_role() = 'admin'
  );
drop policy if exists iu_admin_write on public.investor_units;
create policy iu_admin_write on public.investor_units
  for all using (public.current_role() = 'admin');

-- Property updates: visibility-based read, team/admin write
drop policy if exists updates_visibility_read on public.property_updates;
create policy updates_visibility_read on public.property_updates
  for select using (
    public.current_role() = 'admin'
    or visibility = 'all'
    or (public.current_role() = 'lister' and visibility = 'listers-only')
    or (public.current_role() = 'investor' and visibility = 'investors-only')
  );
drop policy if exists updates_team_write on public.property_updates;
create policy updates_team_write on public.property_updates
  for insert with check (public.current_role() in ('admin','team'));
drop policy if exists updates_admin_modify on public.property_updates;
create policy updates_admin_modify on public.property_updates
  for update using (public.current_role() = 'admin');

drop policy if exists assets_read on public.update_assets;
create policy assets_read on public.update_assets
  for select using (
    update_id in (select id from public.property_updates)  -- inherits parent policy
  );
drop policy if exists assets_team_write on public.update_assets;
create policy assets_team_write on public.update_assets
  for insert with check (public.current_role() in ('admin','team'));
