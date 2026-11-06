-- Agencias: que lo que hoy solo se podía meter por BD funcione desde la web.
-- 1) Atribución: el link personal usa personal_link_slug, pero anon no puede leer
--    listing_partners (RLS) → las visitas llegaban con partner_id NULL. RPC mínima.
create or replace function public.resolve_partner_slug(p_slug text)
returns uuid language sql stable security definer set search_path = public as $$
  select id from public.listing_partners where personal_link_slug = p_slug limit 1;
$$;
revoke all on function public.resolve_partner_slug(text) from public;
grant execute on function public.resolve_partner_slug(text) to anon, authenticated;

-- 2) Vincular la cuenta: al aprobar se manda magic link, pero nadie rellenaba
--    listing_partners.user_id → el portal decía "cuenta no vinculada".
--    Se vincula por email en ambos sentidos (alta de usuario / alta o cambio de email de agencia).
create or replace function public.link_partner_user(p_partner uuid, p_user uuid, p_email text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_partner is null or p_user is null then return; end if;
  update public.listing_partners set user_id = p_user where id = p_partner and user_id is null;
  insert into public.profiles (user_id, role, partner_id, email)
  values (p_user, 'lister', p_partner, lower(p_email))
  on conflict (user_id) do nothing; -- nunca degradar un admin/team existente
end;
$$;
revoke all on function public.link_partner_user(uuid, uuid, text) from public, anon, authenticated;

create or replace function public.trg_partner_link_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.user_id is null and new.email is not null then
    perform public.link_partner_user(new.id,
      (select u.id from auth.users u where lower(u.email) = lower(new.email) limit 1), new.email);
  end if;
  return null;
end;
$$;
drop trigger if exists trg_listing_partners_link_user on public.listing_partners;
create trigger trg_listing_partners_link_user after insert or update of email on public.listing_partners
  for each row execute function public.trg_partner_link_user();

create or replace function public.trg_auth_user_link_partner()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.email is not null then
    perform public.link_partner_user(
      (select lp.id from public.listing_partners lp where lp.user_id is null and lower(lp.email) = lower(new.email) limit 1),
      new.id, new.email);
  end if;
  return new;
exception when others then
  return new; -- jamás bloquear un alta de usuario por esto
end;
$$;
drop trigger if exists trg_auth_user_link_partner on auth.users;
create trigger trg_auth_user_link_partner after insert on auth.users
  for each row execute function public.trg_auth_user_link_partner();

-- Backfill: agencias aprobadas cuyo usuario ya existe.
select public.link_partner_user(lp.id, u.id, lp.email)
from public.listing_partners lp join auth.users u on lower(u.email) = lower(lp.email)
where lp.user_id is null;

-- 3) El admin ya puede editar el link personal: que no se repita (resolve_partner_slug usa limit 1).
create unique index if not exists listing_partners_personal_link_slug_key
  on public.listing_partners (personal_link_slug) where personal_link_slug is not null;
