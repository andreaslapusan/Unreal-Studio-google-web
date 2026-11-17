-- Short links for WhatsApp (/a/<code> -> long agency signup URL). Insert: service role only.
create table if not exists public.short_links (
  code text primary key check (code ~ '^[A-Za-z0-9]{4,16}$'),
  target text not null check (target like 'https://unrealstudiobali.com/%'),
  created_at timestamptz not null default now(),
  hits int not null default 0
);
alter table public.short_links enable row level security;  -- no policies: anon/authenticated cannot read the table
revoke all on public.short_links from anon, authenticated;
grant select, insert, update, delete on public.short_links to service_role;

create or replace function public.resolve_short_link(p_code text)
returns text language sql security definer set search_path = public as $$
  update public.short_links set hits = hits + 1 where code = p_code returning target;
$$;
revoke all on function public.resolve_short_link(text) from public;
grant execute on function public.resolve_short_link(text) to anon, authenticated, service_role;
