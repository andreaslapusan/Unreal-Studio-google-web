-- GHL sync — store ghl_contact_id on each row that needs to be tracked in GHL CRM.
-- Idempotent: ALTER TABLE IF NOT EXISTS not standard; use ADD COLUMN IF NOT EXISTS.

alter table public.listing_partner_applications
  add column if not exists ghl_contact_id text;
create index if not exists lpa_ghl_idx on public.listing_partner_applications (ghl_contact_id);

alter table public.listing_partners
  add column if not exists ghl_contact_id text;
create index if not exists lp_ghl_idx on public.listing_partners (ghl_contact_id);

alter table public.investors
  add column if not exists ghl_contact_id text;
create index if not exists inv_ghl_idx on public.investors (ghl_contact_id);
