-- Partner self-branding: each listing partner gets a logo (uploaded by them)
-- and a stable personal_link_slug used for short share URLs and UTM tagging.
--
-- Why a stored slug instead of partner.id:
--   - Short and shareable (e.g. /p/madrid-realty) instead of a UUID
--   - Stable: agencies use the same link in their print/IG/email collateral
--   - Indexable for fast lookups when resolving inbound short links
--
-- The slug is generated server-side at INSERT time so we never depend on the
-- client to set it; uniqueness is enforced and a numeric suffix is appended
-- on collisions.

alter table public.listing_partners
  add column if not exists logo_url text,
  add column if not exists personal_link_slug text;

create unique index if not exists listing_partners_personal_link_slug_key
  on public.listing_partners (personal_link_slug)
  where personal_link_slug is not null;

-- slugify(): lowercase, ASCII-only, dash-separated. Pure SQL, no extensions.
create or replace function public.slugify(input text)
returns text
language sql
immutable
as $$
  select regexp_replace(
    regexp_replace(
      lower(coalesce(input, '')),
      '[^a-z0-9]+', '-', 'g'
    ),
    '(^-+|-+$)', '', 'g'
  );
$$;

create or replace function public.set_partner_personal_link_slug()
returns trigger
language plpgsql
as $$
declare
  base text;
  candidate text;
  suffix int := 0;
begin
  if new.personal_link_slug is not null and new.personal_link_slug <> '' then
    return new;
  end if;

  base := nullif(public.slugify(new.agency_name), '');
  if base is null then
    base := 'partner';
  end if;

  candidate := base;
  while exists (
    select 1 from public.listing_partners
    where personal_link_slug = candidate
      and id is distinct from new.id
  ) loop
    suffix := suffix + 1;
    candidate := base || '-' || suffix::text;
  end loop;

  new.personal_link_slug := candidate;
  return new;
end;
$$;

drop trigger if exists trg_listing_partners_set_slug on public.listing_partners;
create trigger trg_listing_partners_set_slug
  before insert on public.listing_partners
  for each row
  execute function public.set_partner_personal_link_slug();

-- Backfill existing rows that don't have a slug yet
update public.listing_partners
set personal_link_slug = public.slugify(agency_name)
where personal_link_slug is null
  and agency_name is not null
  and agency_name <> '';

-- Resolve any backfill collisions by appending row number
with dupes as (
  select id, personal_link_slug,
         row_number() over (partition by personal_link_slug order by created_at) as rn
  from public.listing_partners
  where personal_link_slug is not null
)
update public.listing_partners lp
set personal_link_slug = lp.personal_link_slug || '-' || (d.rn - 1)::text
from dupes d
where lp.id = d.id and d.rn > 1;

-- Allow the partner to update only their own logo + slug (RLS already ensures
-- they can only see their row; this opens the write surface narrowly).
drop policy if exists partners_self_update_branding on public.listing_partners;
create policy partners_self_update_branding on public.listing_partners
  for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
