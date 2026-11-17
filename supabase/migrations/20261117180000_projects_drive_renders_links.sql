-- 17-nov-2026 (Andreas): one Drive photos folder per unit type (Deseo Type A/B/C).
-- [{"label":"Type A","url":"https://drive..."}]; null/empty = portal falls back to drive_renders_url.
-- Not public: anon grant untouched (like drive_renders_url); agencies read it via the two RPCs below.
alter table public.projects add column if not exists drive_renders_links jsonb;

CREATE OR REPLACE FUNCTION public.agency_pack_get(p_slug text)
 RETURNS SETOF projects
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select (public.project_only_cols(p, array['id','name','slug','location','zone','property_type','description','completion_percent',
           'years_contract','years_extension','investor_price','price_currency','gallery','status','bedrooms','bathrooms','area_m2',
           'furnishing','completion_date','brochure_url','construction_update_url','construction_update_date','google_maps_url',
           'floor_plans','owner_name','lease_end_date','extension_cost_usd','payment_plan_off_plan','zoning_type',
           'building_permit_status','lease_years_paid','structural_warranty','water_supply','land_size_m2','pool_size_m2','parking',
           'view','living_room_style','has_powder_room','has_rooftop','furnishing_pack_cost_usd','video_url','drive_renders_url','drive_renders_links',
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
           or (public.my_active_partner_id() is not null and public.agency_project_ok(p.name)) );
$function$;

CREATE OR REPLACE FUNCTION public.agency_projects_list()
 RETURNS SETOF projects
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select (public.project_only_cols(p, array['id','slug','name','image','investor_price','price_currency','bedrooms','completion_date',
           'is_hidden','visibility_status','status','location','completion_percent','updated_at','construction_update_url',
           'construction_update_date','brochure_url','brochures','drive_renders_url','drive_renders_links','drive_2d_plans_url',
           'drive_brochure_folder_url','video_url','walkthrough_url','tenure','years_contract','sort_order',
           'completion_date_en','completion_date_id','description','description_en','description_ro','description_id'])).*
    from projects p
   where public.is_admin_or_team()
      or (public.my_active_partner_id() is not null
          and coalesce(p.is_hidden, false) = false
          and coalesce(p.visibility_status, '') <> 'sold_out'
          and public.agency_project_ok(p.name));
$function$;

