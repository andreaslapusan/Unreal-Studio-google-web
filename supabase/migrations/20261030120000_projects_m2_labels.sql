alter table public.projects add column if not exists area_m2_label text, add column if not exists land_m2_label text;
grant select (area_m2_label, land_m2_label) on public.projects to anon;
grant select, insert, update on public.projects to authenticated, service_role;
update public.projects set land_m2_label='60-100' where id='9674fe2c-8497-4043-b0e4-9e7294a0f779';
update public.projects set area_m2_label='70-110' where id='466deb5f-fb5b-4021-93d2-cb76614e2eba';
notify pgrst, 'reload schema';
CREATE OR REPLACE FUNCTION public.admin_save_project_extra(p_user_id text, p_project jsonb)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_ok boolean; v_id uuid;
begin
  select exists(select 1 from admin_users where is_active and (lower(trim(username))=lower(trim(coalesce(app_email(),''))))) into v_ok;
  if not v_ok then return json_build_object('success',false,'error','Unauthorized'); end if;
  v_id := nullif(p_project->>'id','')::uuid;
  if v_id is null then return json_build_object('success',true,'skipped','no id'); end if;
  update projects set
    zone = coalesce(p_project->>'zone', zone),
    timeline = case when jsonb_typeof(p_project->'timeline')='array' then p_project->'timeline' else timeline end,
    booking_widget_url = coalesce(p_project->>'booking_widget_url', booking_widget_url),
    owner_name = coalesce(p_project->>'owner_name', owner_name),
    lease_end_date = coalesce(p_project->>'lease_end_date', lease_end_date),
    extension_cost_usd = coalesce(nullif(p_project->>'extension_cost_usd','')::numeric, extension_cost_usd),
    payment_plan_off_plan = coalesce(p_project->>'payment_plan_off_plan', payment_plan_off_plan),
    zoning_type = coalesce(p_project->>'zoning_type', zoning_type),
    building_permit_status = coalesce(p_project->>'building_permit_status', building_permit_status),
    lease_years_paid = coalesce(nullif(p_project->>'lease_years_paid','')::boolean, lease_years_paid),
    structural_warranty = coalesce(p_project->>'structural_warranty', structural_warranty),
    water_supply = coalesce(p_project->>'water_supply', water_supply),
    land_size_m2 = coalesce(nullif(p_project->>'land_size_m2','')::numeric, land_size_m2),
    pool_size_m2 = coalesce(nullif(p_project->>'pool_size_m2','')::numeric, pool_size_m2),
    parking = coalesce(p_project->>'parking', parking),
    view = coalesce(p_project->>'view', view),
    living_room_style = coalesce(p_project->>'living_room_style', living_room_style),
    has_powder_room = coalesce((p_project->>'has_powder_room')::boolean, has_powder_room),
    has_rooftop = coalesce((p_project->>'has_rooftop')::boolean, has_rooftop),
    furnishing_pack_cost_usd = coalesce(nullif(p_project->>'furnishing_pack_cost_usd','')::numeric, furnishing_pack_cost_usd),
    video_url = coalesce(p_project->>'video_url', video_url),
    drive_renders_url = coalesce(p_project->>'drive_renders_url', drive_renders_url),
    drive_2d_plans_url = coalesce(p_project->>'drive_2d_plans_url', drive_2d_plans_url),
    drive_permits_url = coalesce(p_project->>'drive_permits_url', drive_permits_url),
    drive_legal_url = coalesce(p_project->>'drive_legal_url', drive_legal_url),
    drive_brochure_folder_url = coalesce(p_project->>'drive_brochure_folder_url', drive_brochure_folder_url),
    rent_currency = coalesce(nullif(p_project->>'rent_currency',''), rent_currency),
    already_rented = coalesce((p_project->>'already_rented')::boolean, already_rented),
    visibility_status = coalesce(nullif(p_project->>'visibility_status',''), visibility_status),
    area_m2_label = case when p_project ? 'area_m2_label' then nullif(trim(p_project->>'area_m2_label'),'') else area_m2_label end,
    land_m2_label = case when p_project ? 'land_m2_label' then nullif(trim(p_project->>'land_m2_label'),'') else land_m2_label end,
    extensions = case when p_project ? 'extensions' then p_project->'extensions' else extensions end,
    updated_at = now()
  where id = v_id;
  return json_build_object('success',true,'id',v_id);
end 
$function$

;
