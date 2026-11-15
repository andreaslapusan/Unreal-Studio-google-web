-- Agency funnel, PHASE 2 — apply TOGETHER with the web deploy of branch agency-funnel-prod (needs the new frontend).
-- Then, only after ~/jobs/smoke/agency-cycle.spec.js passes against production, turn auto-approval on (last line).

-- item 12: agencies register clients only through agency_register_lead (first one wins)
revoke insert on public.agency_leads from authenticated;

-- item 3: attribution only through record_attribution (partner resolved server-side, rate-limited)
drop policy if exists la_anon_insert on public.lead_attributions;
revoke insert on public.lead_attributions from anon, authenticated;

-- item 2: the signup form only goes through agency_apply
revoke insert on public.listing_partner_applications from anon, authenticated;

-- item 7: nobody reads other agencies' negotiated rates (agencies use agency_units_list / my_unit_commission)
revoke select on public.property_units from authenticated;
do $$
declare cols text;
begin
  select string_agg(quote_ident(column_name), ', ') into cols
    from information_schema.columns
   where table_schema = 'public' and table_name = 'property_units' and column_name <> 'commission_per_partner';
  execute format('grant select (%s) on public.property_units to authenticated', cols);
end $$;

-- item 6 (LAST, after the production E2E passes):
-- update public.agency_config set value = 'true', updated_at = now() where key = 'auto_approve';
