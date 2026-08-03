-- Endurecimiento 2026-08-03: impedir que una agencia (partner) autenticada
-- se auto-asigne proyectos o se auto-apruebe cambiando columnas privilegiadas
-- de su propia fila (la policy partners_self_update_branding permitía UPDATE de
-- toda la fila; el nombre "branding" no se cumplía). Fail-safe: solo restringe a
-- 'authenticated' NO admin; service_role/postgres/edge-fns y admins pasan.
create or replace function public.protect_partner_privileged_cols()
returns trigger
language plpgsql
as $$
begin
  if current_user = 'authenticated' and coalesce(public."current_role"(),'') <> 'admin' then
    if NEW.projects_assigned is distinct from OLD.projects_assigned
       or NEW.status is distinct from OLD.status
       or NEW.approved_at is distinct from OLD.approved_at
       or NEW.approved_by is distinct from OLD.approved_by
       or NEW.user_id is distinct from OLD.user_id
       or NEW.email is distinct from OLD.email
       or NEW.ghl_contact_id is distinct from OLD.ghl_contact_id then
      raise exception 'No autorizado: una agencia no puede modificar proyectos asignados, estado ni datos de aprobacion.';
    end if;
  end if;
  return NEW;
end;
$$;

drop trigger if exists trg_protect_partner_privileged on public.listing_partners;
create trigger trg_protect_partner_privileged
  before update on public.listing_partners
  for each row execute function public.protect_partner_privileged_cols();

-- Higiene: anon no debe escribir en partners (RLS ya lo bloquea, pero el grant sobraba).
revoke insert, update, delete on public.listing_partners from anon;
