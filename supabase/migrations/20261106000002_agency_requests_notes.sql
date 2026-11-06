-- Agency portal phase 2: requests to the Unreal team (call / Bali visit / online
-- presentation / contract) and a notes timeline per registered client.
-- Same access model as agency_leads: agency sees only its own rows, admin everything.

create table if not exists public.agency_requests (
  id              uuid primary key default gen_random_uuid(),
  agency_id       uuid not null references public.listing_partners(id) on delete cascade,
  created_at      timestamptz not null default now(),
  type            text not null check (type in ('call','visit','presentation','contract')),
  lead_id         uuid references public.agency_leads(id) on delete set null,
  preferred_date  date,
  notes           text check (notes is null or length(notes) <= 2000),
  status          text not null default 'pending' check (status in ('pending','scheduled','done','cancelled')),
  notified_at     timestamptz  -- for a future team ping (like agency_leads)
);
create index if not exists agency_requests_agency_idx on public.agency_requests (agency_id, created_at desc);

alter table public.agency_requests enable row level security;

drop policy if exists ar_agency_insert on public.agency_requests;
create policy ar_agency_insert on public.agency_requests
  for insert with check (
    public.current_role() = 'admin'
    or (
      agency_id in (select id from public.listing_partners where user_id = auth.uid())
      and (lead_id is null or exists (select 1 from public.agency_leads l where l.id = lead_id and l.agency_id = agency_requests.agency_id))
    )
  );

drop policy if exists ar_read on public.agency_requests;
create policy ar_read on public.agency_requests
  for select using (
    public.current_role() = 'admin'
    or agency_id in (select id from public.listing_partners where user_id = auth.uid())
  );

drop policy if exists ar_admin_update on public.agency_requests;
create policy ar_admin_update on public.agency_requests
  for update using (public.current_role() = 'admin');

drop policy if exists ar_admin_delete on public.agency_requests;
create policy ar_admin_delete on public.agency_requests
  for delete using (public.current_role() = 'admin');

revoke all on public.agency_requests from anon, authenticated;
grant select, delete on public.agency_requests to authenticated;
grant insert (agency_id, type, lead_id, preferred_date, notes) on public.agency_requests to authenticated;
grant update (status) on public.agency_requests to authenticated;
grant select, insert, update, delete on public.agency_requests to service_role;

-- Notes timeline per agency lead. Agency writes author='agency'; Unreal (admin) may write 'unreal'.
create table if not exists public.agency_lead_notes (
  id          uuid primary key default gen_random_uuid(),
  lead_id     uuid not null references public.agency_leads(id) on delete cascade,
  agency_id   uuid not null references public.listing_partners(id) on delete cascade,
  created_at  timestamptz not null default now(),
  author      text not null default 'agency' check (author in ('agency','unreal')),
  body        text not null check (length(trim(body)) > 0 and length(body) <= 2000)
);
create index if not exists agency_lead_notes_lead_idx on public.agency_lead_notes (lead_id, created_at);

alter table public.agency_lead_notes enable row level security;

drop policy if exists aln_insert on public.agency_lead_notes;
create policy aln_insert on public.agency_lead_notes
  for insert with check (
    public.current_role() = 'admin'
    or (
      author = 'agency'
      and agency_id in (select id from public.listing_partners where user_id = auth.uid())
      and exists (select 1 from public.agency_leads l where l.id = lead_id and l.agency_id = agency_lead_notes.agency_id)
    )
  );

drop policy if exists aln_read on public.agency_lead_notes;
create policy aln_read on public.agency_lead_notes
  for select using (
    public.current_role() = 'admin'
    or agency_id in (select id from public.listing_partners where user_id = auth.uid())
  );

drop policy if exists aln_admin_delete on public.agency_lead_notes;
create policy aln_admin_delete on public.agency_lead_notes
  for delete using (public.current_role() = 'admin');

revoke all on public.agency_lead_notes from anon, authenticated;
grant select, delete on public.agency_lead_notes to authenticated;
grant insert (lead_id, agency_id, author, body) on public.agency_lead_notes to authenticated;
grant select, insert, update, delete on public.agency_lead_notes to service_role;
