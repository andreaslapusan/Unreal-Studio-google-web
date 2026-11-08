-- Reportes de obra PRIVADOS (8-nov-2026, queja de Andreas: el enlace del reporte se podía reenviar).
-- Los PDF pasan del bucket PÚBLICO `images` (property-updates/…) al bucket PRIVADO `reports`
-- (misma ruta). La BD guarda la ruta pelada `property-updates/<project_id>/…` y el portal pide
-- a la edge fn `report-url` un enlace firmado de 10 min; la fn decide con can_read_report().

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('reports', 'reports', false, 52428800,
        array['application/pdf','image/jpeg','image/png','image/webp','image/heic','image/heif','video/mp4','video/quicktime'])
on conflict (id) do update set public = false;

-- ¿Puede quien llama ver este fichero? admin/equipo, empleados activos (no demo), agencias
-- aprobadas (ya lo veían en su kit) y clientes activos asignados a ESE proyecto (mismas reglas
-- que client_get_dashboard: titulares, reports_enabled y feature_overrides.construction).
create or replace function public.can_read_report(p_name text)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(p_name like 'property-updates/%' and p_name not like '%..%' and (
    public.is_admin() or public.is_admin_or_team()
    or (exists (select 1 from employees e where lower(e.email) = public.app_email() and e.active)
        and not public.is_demo_email(public.app_email()))
    or exists (select 1 from listing_partners lp where lp.user_id = auth.uid() and lp.status = 'approved')
    or exists (
      select 1 from clients c join client_projects cp on cp.client_id = c.id
       where (lower(c.email) = public.app_email() or public.app_email() = any(c.extra_emails))
         and c.is_active
         and cp.project_id::text = (storage.foldername(p_name))[2]
         and coalesce(cp.reports_enabled, true)
         and coalesce(c.feature_overrides->>'construction', '') <> 'false'
         and (jsonb_typeof(cp.holder_participants) is distinct from 'array'
              or jsonb_array_length(cp.holder_participants) = 0
              or exists (select 1 from jsonb_array_elements(cp.holder_participants) h
                          where lower(h->>'email') = public.app_email())))
  ), false);
$$;
revoke all on function public.can_read_report(text) from public, anon;
grant execute on function public.can_read_report(text) to authenticated, service_role;

-- Bucket privado: nadie lee por la API pública. Clientes/agencias NO tienen SELECT (si lo
-- tuvieran podrían firmarse enlaces de 1 año); solo la edge fn firma, a 10 min.
-- El equipo que sube necesita SELECT (upload devuelve la fila) y borrar el anterior.
drop policy if exists reports_staff_read on storage.objects;
drop policy if exists reports_staff_insert on storage.objects;
drop policy if exists reports_staff_update on storage.objects;
drop policy if exists reports_admin_delete on storage.objects;
create policy reports_staff_read on storage.objects for select to authenticated
  using (bucket_id = 'reports' and public.is_staff_uploader());
create policy reports_staff_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'reports' and name like 'property-updates/%' and public.is_staff_uploader());
create policy reports_staff_update on storage.objects for update to authenticated
  using (bucket_id = 'reports' and public.is_staff_uploader())
  with check (bucket_id = 'reports' and public.is_staff_uploader());
create policy reports_admin_delete on storage.objects for delete to authenticated
  using (bucket_id = 'reports' and public.is_admin_or_team());

-- Nada nuevo en el bucket público bajo property-updates/ (un bundle viejo cacheado fallaría
-- en vez de volver a publicar un reporte).
drop policy if exists images_staff_insert on storage.objects;
create policy images_staff_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'images' and name !~~ 'partner-logos/%' and name !~~ 'property-updates/%'
              and public.is_staff_uploader());
