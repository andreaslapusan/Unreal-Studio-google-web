-- Security phase 2 (part A, additive): session-gated RPCs so logged-in users stop
-- reading sensitive projects columns (owner_name, drive_legal/permits, costs...) straight
-- from the table. Part B (20261109010100) then narrows the authenticated grant + RLS.
-- Column lists mirror what each screen renders today (grep 9-nov-2026):
--   PUBLIC  = constants.ts PUBLIC_PROJECT_COLS (== anon grant, 63 cols)
--   agency catalog = components/agency/useAgencyData.ts WEB_COLS (+ sort_order)
--   agency pack    = pages/AgencyPack.tsx (incl. owner_name/permits/legal: shown today, Andreas decides)

-- Row with only the given columns (others NULL). Internal: callers are SECURITY DEFINER.
create or replace function public.project_only_cols(p public.projects, cols text[])
returns public.projects language sql immutable set search_path = public as $$
  select jsonb_populate_record(null::public.projects,
           (select coalesce(jsonb_object_agg(k, v), '{}'::jsonb) from jsonb_each(to_jsonb(p)) e(k, v) where k = any(cols)))
$$;
revoke all on function public.project_only_cols(public.projects, text[]) from public, anon, authenticated;

-- Lets a client see the row of a project they own even if it is hidden (DEMO App Review villa).
create or replace function public.client_owns_project(p_project_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.app_email() is not null and exists (
    select 1 from client_projects cp join clients c on c.id = cp.client_id
     where cp.project_id::text = p_project_id::text and c.is_active
       and (lower(c.email) = public.app_email() or public.app_email() = any(c.extra_emails)));
$$;
revoke all on function public.client_owns_project(uuid) from public, anon;
grant execute on function public.client_owns_project(uuid) to authenticated, service_role;

-- Admin/team screens (AdminDashboard, AdminAgencias, AdminPortalManager, EquipoProperties,
-- ConstructionReportModal): full row for admin/team; employees get only what EquipoProperties
-- edits (public + construction report); demo admin gets the public web view; anyone else 42501.
create or replace function public.staff_projects_list()
returns setof public.projects language plpgsql stable security definer set search_path = public as $$
declare
  pub constant text[] := array['id','name','slug','location','zone','property_type','description','distance_beach','available_units','total_units','completion_percent','years_contract','years_extension','market_price','investor_price','price_currency','roi','investor_tiers','image','gallery','is_featured','status','sort_order','created_at','updated_at','bedrooms','bathrooms','area_m2','has_pool','amenities','furnishing','annual_rental_projection','completion_date','brochure_url','google_maps_url','floor_plans','construction_gallery','furnishing_items','is_hidden','visibility_status','land_size_m2','video_url','description_en','description_id','distance_beach_en','distance_beach_id','furnishing_en','furnishing_id','completion_date_en','completion_date_id','description_ro','distance_beach_ro','furnishing_ro','brochures','tenure','land_area_m2','area_m2_label','land_m2_label','view_type','walkthrough_url','already_rented','rent_currency','extension_years'];
begin
  if public.is_admin() or public.is_admin_or_team() then
    return query select * from projects;
  elsif public.is_staff_uploader() then
    return query select (public.project_only_cols(p, pub || array['construction_update_url','construction_update_date'])).* from projects p;
  elsif public."current_role"() = 'demo' then
    return query select (public.project_only_cols(p, pub)).* from projects p where coalesce(p.is_hidden, false) = false;
  else
    raise exception 'forbidden' using errcode = '42501';
  end if;
end $$;
revoke all on function public.staff_projects_list() from public, anon;
grant execute on function public.staff_projects_list() to authenticated, service_role;

-- Agency portal catalog (useAgencyData): same rows as /proyectos (no hidden) + the Drive/report links it shows.
create or replace function public.agency_projects_list()
returns setof public.projects language sql stable security definer set search_path = public as $$
  select (public.project_only_cols(p, array['id','slug','name','image','investor_price','price_currency','bedrooms','completion_date',
           'is_hidden','visibility_status','status','location','completion_percent','updated_at','construction_update_url',
           'construction_update_date','brochure_url','brochures','drive_renders_url','drive_2d_plans_url',
           'drive_brochure_folder_url','video_url','walkthrough_url','tenure','years_contract','sort_order'])).*
    from projects p
   where public.is_admin_or_team()
      or (coalesce(p.is_hidden, false) = false
          and (exists (select 1 from listing_partners lp where lp.user_id = auth.uid())
               or exists (select 1 from profiles pr where pr.user_id = auth.uid() and pr.role = 'lister')));
$$;
revoke all on function public.agency_projects_list() from public, anon;
grant execute on function public.agency_projects_list() to authenticated, service_role;

-- Agency pack: same gate and signature as before, but only the columns AgencyPack.tsx renders (was p.*).
create or replace function public.agency_pack_get(p_slug text)
returns setof public.projects language sql stable security definer set search_path = public as $$
  select (public.project_only_cols(p, array['id','name','slug','location','zone','property_type','description','completion_percent',
           'years_contract','years_extension','investor_price','price_currency','gallery','status','bedrooms','bathrooms','area_m2',
           'furnishing','completion_date','brochure_url','construction_update_url','construction_update_date','google_maps_url',
           'floor_plans','owner_name','lease_end_date','extension_cost_usd','payment_plan_off_plan','zoning_type',
           'building_permit_status','lease_years_paid','structural_warranty','water_supply','land_size_m2','pool_size_m2','parking',
           'view','living_room_style','has_powder_room','has_rooftop','furnishing_pack_cost_usd','video_url','drive_renders_url',
           'drive_2d_plans_url','drive_permits_url','drive_legal_url','drive_brochure_folder_url','description_en','description_id',
           'payment_plan_off_plan_en','payment_plan_off_plan_id','view_en','view_id','living_room_style_en','living_room_style_id',
           'parking_en','parking_id','water_supply_en','water_supply_id','structural_warranty_en','structural_warranty_id',
           'zoning_type_en','zoning_type_id','building_permit_status_en','building_permit_status_id','furnishing_en','furnishing_id',
           'completion_date_en','completion_date_id','lease_end_date_en','lease_end_date_id','description_ro',
           'building_permit_status_ro','furnishing_ro','living_room_style_ro','parking_ro','payment_plan_off_plan_ro',
           'structural_warranty_ro','view_ro','water_supply_ro','zoning_type_ro','visibility_status','area_m2_label',
           'land_m2_label'])).*
    from projects p
   where p.slug = p_slug
     and ( public.is_admin_or_team()
           or exists (select 1 from listing_partners lp where lp.user_id = auth.uid())
           or exists (select 1 from profiles pr where pr.user_id = auth.uid() and pr.role = 'lister') );
$$;
