-- Security phase 2 (part B): logged-in users read only the public web columns of projects
-- (same 63 as anon = PUBLIC_PROJECT_COLS) and no hidden rows except their own client project.
-- Staff/agency screens read the rest via staff_projects_list / agency_projects_list / agency_pack_get.
-- RULE: adding a column to PUBLIC_PROJECT_COLS => grant it to anon AND authenticated in the same batch.
-- Only SELECT is narrowed (insert/update/delete stay as before: RLS has no write policy).
revoke select on public.projects from authenticated;
grant select (id,name,slug,location,zone,property_type,description,distance_beach,available_units,total_units,completion_percent,years_contract,years_extension,market_price,investor_price,price_currency,roi,investor_tiers,image,gallery,is_featured,status,sort_order,created_at,updated_at,bedrooms,bathrooms,area_m2,has_pool,amenities,furnishing,annual_rental_projection,completion_date,brochure_url,google_maps_url,floor_plans,construction_gallery,furnishing_items,is_hidden,visibility_status,land_size_m2,video_url,description_en,description_id,distance_beach_en,distance_beach_id,furnishing_en,furnishing_id,completion_date_en,completion_date_id,description_ro,distance_beach_ro,furnishing_ro,brochures,tenure,land_area_m2,area_m2_label,land_m2_label,view_type,walkthrough_url,already_rented,rent_currency,extension_years) on public.projects to authenticated;

drop policy if exists projects_auth_read on public.projects;
create policy projects_auth_read on public.projects for select to authenticated
  using (coalesce(is_hidden, false) = false or public.is_admin_or_team() or public.client_owns_project(id));
