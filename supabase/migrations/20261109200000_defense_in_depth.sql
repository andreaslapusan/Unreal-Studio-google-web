-- Defense in depth, 2nd backend pass (planned 31-oct). None of these was exploitable on its own today.

-- (1) admin_mark_kwitansi_sent authorized ONLY by a forgeable p_user_id. Gate by the session like every other
-- admin_* RPC; service_role stays allowed because send-client-email calls it with the service key after it has
-- already checked the caller's session. p_user_id kept in the signature (callers still send it) but unused.
create or replace function public.admin_mark_kwitansi_sent(p_user_id text, p_id uuid, p_email text)
 returns json
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  if not (public.is_admin() or auth.role() = 'service_role') then
    return json_build_object('success', false, 'error', 'Unauthorized');
  end if;
  update kwitansis set sent_to_email = p_email, sent_at = now() where id = p_id;
  return json_build_object('success', true);
end; $function$;

-- (2) projects: authenticated had table-level write privileges with no write policy (inert). All writes go
-- through SECURITY DEFINER RPCs (admin_save_project*, team_save_project). Column SELECT grants are untouched
-- (do NOT revoke select here: a table-level revoke also drops the 63 column grants).
revoke insert, update, delete, truncate, references, trigger, maintain on public.projects from authenticated;

-- (3) images/partner-logos/: any logged-in user (clients included) could upload/overwrite there.
-- Now: admin/team, or the agency that owns the partner (path = partner-logos/<partner_id>-<ts>.<ext>,
-- see components/agency/partnerLogo.ts). Public read unchanged.
drop policy if exists partner_logos_authenticated_write on storage.objects;
create policy partner_logos_authenticated_write on storage.objects for insert to authenticated
  with check (bucket_id = 'images' and name like 'partner-logos/%' and (
    public.is_admin() or public.is_admin_or_team()
    or exists (select 1 from public.listing_partners lp
               where lp.user_id = auth.uid() and objects.name like 'partner-logos/' || lp.id::text || '-%')));

drop policy if exists partner_logos_authenticated_update on storage.objects;
create policy partner_logos_authenticated_update on storage.objects for update to authenticated
  using (bucket_id = 'images' and name like 'partner-logos/%' and (
    public.is_admin() or public.is_admin_or_team()
    or exists (select 1 from public.listing_partners lp
               where lp.user_id = auth.uid() and objects.name like 'partner-logos/' || lp.id::text || '-%')))
  with check (bucket_id = 'images' and name like 'partner-logos/%' and (
    public.is_admin() or public.is_admin_or_team()
    or exists (select 1 from public.listing_partners lp
               where lp.user_id = auth.uid() and objects.name like 'partner-logos/' || lp.id::text || '-%')));
