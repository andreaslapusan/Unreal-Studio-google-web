-- Lead attributions: track which lister brought which lead.
-- Insert happens server-side or from form-submit handlers via Supabase.
create table if not exists public.lead_attributions (
  id              uuid primary key default gen_random_uuid(),
  -- Source contact identifiers (any combination of these may be present)
  contact_email   text,
  contact_phone   text,
  contact_name    text,
  -- Attribution
  utm_source      text,
  partner_id      uuid references public.listing_partners(id) on delete set null,
  property_slug   text,
  utm_campaign    text,
  utm_medium      text,
  -- Conversion stage
  event_type      text default 'visit' check (event_type in ('visit','form_submit','signup','reservation','sale')),
  -- Linked records once we know who they are
  ghl_contact_id  text,
  investor_id     uuid references public.investors(id) on delete set null,
  -- Audit
  user_agent      text,
  referrer        text,
  ip_country      text,
  created_at      timestamptz default now()
);
create index if not exists la_partner_idx on public.lead_attributions (partner_id);
create index if not exists la_property_idx on public.lead_attributions (property_slug);
create index if not exists la_email_idx on public.lead_attributions (contact_email);
create index if not exists la_event_idx on public.lead_attributions (event_type);

alter table public.lead_attributions enable row level security;

-- Anyone can insert (including anon users when capturing form submissions)
drop policy if exists la_anon_insert on public.lead_attributions;
create policy la_anon_insert on public.lead_attributions
  for insert with check (true);

-- Listers see their own attributions; admin sees all
drop policy if exists la_partner_read on public.lead_attributions;
create policy la_partner_read on public.lead_attributions
  for select using (
    public.current_role() = 'admin'
    or partner_id in (select id from public.listing_partners where user_id = auth.uid())
  );

drop policy if exists la_admin_modify on public.lead_attributions;
create policy la_admin_modify on public.lead_attributions
  for update using (public.current_role() = 'admin');
