-- Rollback of 20261115120000_agency_funnel_prod + 20261115120050_agency_funnel_helpers (+ phase2 if applied).
-- Data-preserving: new columns/tables stay (harmless); gates, triggers and grants go back to the 14-nov state.
begin;
update public.agency_config set value = 'false' where key = 'auto_approve';
drop trigger if exists trg_lpa_hooks on public.listing_partner_applications;
drop trigger if exists trg_agency_leads_event on public.agency_leads;
drop trigger if exists trg_agency_requests_event on public.agency_requests;
drop trigger if exists trg_agency_commissions_event on public.agency_commissions;
drop trigger if exists trg_agency_collisions_event on public.agency_lead_collisions;
drop trigger if exists trg_lp_to_ghl_ins on public.listing_partners;
drop trigger if exists trg_lp_to_ghl on public.listing_partners;
create trigger trg_lp_to_ghl after update on public.listing_partners for each row
  when (old.status is distinct from new.status) execute function public.notify_ghl_sync();
create trigger trg_lpa_to_ghl after insert on public.listing_partner_applications for each row execute function public.notify_ghl_sync();

-- grants back (phase 2 + phase 1)
grant insert on public.agency_leads to authenticated;
grant insert on public.lead_attributions to anon, authenticated;
create policy la_anon_insert on public.lead_attributions for insert with check ((event_type = any (array['visit','form_submit'])) and investor_id is null);
grant select on public.property_units to authenticated;
grant insert on public.listing_partner_applications to anon, authenticated;
drop policy if exists lpa_anon_insert on public.listing_partner_applications;
create policy lpa_anon_insert on public.listing_partner_applications for insert with check (true);
grant select on public.listing_partners to anon;

-- RLS back to "has a partner row" (status not checked)
drop policy if exists al_agency_insert on public.agency_leads;
create policy al_agency_insert on public.agency_leads for insert with check (agency_id in (select id from public.listing_partners where user_id = auth.uid()) or public.current_role() = 'admin');
drop policy if exists al_read on public.agency_leads;
create policy al_read on public.agency_leads for select using (public.current_role() = 'admin' or agency_id in (select id from public.listing_partners where user_id = auth.uid()));
drop policy if exists ar_read on public.agency_requests;
create policy ar_read on public.agency_requests for select using (public.current_role() = 'admin' or agency_id in (select id from public.listing_partners where user_id = auth.uid()));
drop policy if exists aln_read on public.agency_lead_notes;
create policy aln_read on public.agency_lead_notes for select using (public.current_role() = 'admin' or agency_id in (select id from public.listing_partners where user_id = auth.uid()));
drop policy if exists la_partner_read on public.lead_attributions;
create policy la_partner_read on public.lead_attributions for select using (public.current_role() = 'admin' or partner_id in (select id from public.listing_partners where user_id = auth.uid()));
drop policy if exists units_authenticated_read on public.property_units;
create policy units_authenticated_read on public.property_units for select using (available = true and public.current_role() = any (array['lister','investor','admin','team']));

-- FKs back to cascade
alter table public.agency_leads drop constraint agency_leads_agency_id_fkey, add constraint agency_leads_agency_id_fkey foreign key (agency_id) references public.listing_partners(id) on delete cascade;
alter table public.agency_requests drop constraint agency_requests_agency_id_fkey, add constraint agency_requests_agency_id_fkey foreign key (agency_id) references public.listing_partners(id) on delete cascade;
alter table public.agency_lead_notes drop constraint agency_lead_notes_agency_id_fkey, add constraint agency_lead_notes_agency_id_fkey foreign key (agency_id) references public.listing_partners(id) on delete cascade;
commit;
-- Not reverted on purpose: lower(email) unique index, status CHECK, new columns/tables/RPCs (unused by the old frontend).
