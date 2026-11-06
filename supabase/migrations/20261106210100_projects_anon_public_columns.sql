-- PART 2 (apply ONLY after the web with the new PUBLIC_PROJECT_COLS is live and verified).
-- Allow-list for anonymous visitors. REVOKE ALL on the table also drops every column-level privilege anon holds
-- (PostgreSQL docs), then anon gets back exactly the 63 columns in constants.ts PUBLIC_PROJECT_COLS.
-- One transaction: no moment where anon has fewer columns than the live web needs.
begin;
set local lock_timeout = '5s';
revoke all on public.projects from anon;  -- also drops the leftover table-level MAINTAIN (anon=m); anon never writes projects
grant select (
  id, name, slug, location, zone, property_type, description, distance_beach, available_units,
  completion_percent, years_contract, years_extension, market_price, investor_price, price_currency,
  roi, investor_tiers, image, gallery, is_featured, status, sort_order, created_at, updated_at,
  bedrooms, bathrooms, area_m2, has_pool, amenities, furnishing, annual_rental_projection,
  completion_date, brochure_url, google_maps_url, floor_plans, construction_gallery,
  furnishing_items, is_hidden, land_size_m2, video_url, description_en, description_id,
  distance_beach_en, distance_beach_id, furnishing_en, furnishing_id, completion_date_en,
  completion_date_id, description_ro, distance_beach_ro, furnishing_ro, brochures, tenure,
  land_area_m2, view_type, walkthrough_url, already_rented, rent_currency, visibility_status,
  total_units, area_m2_label, land_m2_label, extension_years
) on public.projects to anon;
do $chk$
declare n int; bad text;
begin
  select count(*) filter (where has_column_privilege('anon', a.attrelid, a.attnum, 'SELECT')),
         string_agg(a.attname, ',') filter (where has_column_privilege('anon', a.attrelid, a.attnum, 'SELECT')
           and a.attname in ('owner_name','extensions','timeline','land_ratio','extension_cost_usd',
             'furnishing_pack_cost_usd','agency_pack_status','drive_legal_url','drive_permits_url',
             'drive_renders_url','drive_2d_plans_url','drive_brochure_folder_url','construction_update_url',
             'construction_update_date','payment_plan_off_plan','lease_end_date','zoning_type',
             'building_permit_status','lease_years_paid','booking_widget_url'))
    into n, bad
    from pg_attribute a
   where a.attrelid = 'public.projects'::regclass and a.attnum > 0 and not a.attisdropped;
  if n <> 63 or bad is not null or has_table_privilege('anon', 'public.projects', 'SELECT')
     or has_table_privilege('anon', 'public.projects', 'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN') then
    raise exception 'anon allow-list check failed: % readable columns (want 63), internal readable: %', n, bad;
  end if;
end
$chk$;
commit;
