-- Team time-off portal.
-- Three tables: team_members, time_off_requests, holidays.
-- Auto-approves requests. Sends email to Andreas via GHL on insert through
-- a pg_net trigger (same pattern as ghl-sync).

create table if not exists team_members (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  email text unique,
  role text not null default 'employee',     -- employee | admin
  total_days_per_year int not null default 60,
  active boolean not null default true,
  user_id uuid,                               -- supabase auth.users.id once they sign in
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists time_off_requests (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references team_members(id) on delete cascade,
  start_date date not null,
  end_date date not null,
  days int not null,                          -- working days requested (computed client-side, validated server-side)
  reason text,
  status text not null default 'approved',    -- always 'approved' (auto), kept as column for future workflow
  notification_sent boolean default false,
  created_at timestamptz not null default now(),
  constraint date_order check (end_date >= start_date),
  constraint positive_days check (days > 0)
);
create index if not exists idx_time_off_member on time_off_requests(member_id);
create index if not exists idx_time_off_dates on time_off_requests(start_date, end_date);

create table if not exists holidays (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  name text not null,
  country text not null default 'ID',
  unique(date, country)
);

-- Indonesian public holidays 2026 (verified — Bali team needs these). Admins
-- can add/edit per year via the Equipo tab. Nyepi is Bali-specific.
insert into holidays(date, name, country) values
  ('2026-01-01', 'Tahun Baru Masehi', 'ID'),
  ('2026-01-29', 'Isra Mi''raj Nabi Muhammad', 'ID'),
  ('2026-02-17', 'Tahun Baru Imlek', 'ID'),
  ('2026-03-21', 'Hari Raya Nyepi (Bali)', 'ID'),
  ('2026-04-02', 'Wafat Isa Almasih', 'ID'),
  ('2026-04-10', 'Hari Raya Idul Fitri', 'ID'),
  ('2026-04-11', 'Hari Raya Idul Fitri', 'ID'),
  ('2026-05-01', 'Hari Buruh', 'ID'),
  ('2026-05-14', 'Kenaikan Isa Almasih', 'ID'),
  ('2026-06-01', 'Hari Lahir Pancasila', 'ID'),
  ('2026-06-04', 'Hari Raya Waisak', 'ID'),
  ('2026-06-17', 'Hari Raya Idul Adha', 'ID'),
  ('2026-07-09', 'Tahun Baru Hijriah', 'ID'),
  ('2026-08-17', 'Hari Kemerdekaan', 'ID'),
  ('2026-09-17', 'Maulid Nabi Muhammad', 'ID'),
  ('2026-12-25', 'Hari Raya Natal', 'ID'),
  ('2026-12-26', 'Cuti Bersama Natal', 'ID')
on conflict (date, country) do nothing;

-- Initial team roster. Emails are placeholders for the 3 Bali team members
-- — they sign in with whatever email they actually use; the row matches by
-- user_id once they auth. Marc/Andreas/Raul use their Unreal emails.
insert into team_members(full_name, email, role) values
  ('Agun', null, 'employee'),
  ('Adam', null, 'employee'),
  ('Paris', null, 'employee'),
  ('Marc Xikota', 'mark@unrealstudiobali.com', 'employee'),
  ('Andreas', 'andreas@unrealstudiobali.com', 'admin'),
  ('Marcelino', null, 'admin'),
  ('Luis Mestre', null, 'employee'),
  ('Raul Campoy', 'raul@unrealstudiobali.com', 'employee')
on conflict (email) do nothing;

alter table team_members enable row level security;
alter table time_off_requests enable row level security;
alter table holidays enable row level security;

-- Anyone authenticated can read the roster + holidays + own requests.
-- Admins can do anything. Employees can insert their own requests.
drop policy if exists team_members_read on team_members;
create policy team_members_read on team_members for select to authenticated using (true);

drop policy if exists holidays_read on holidays;
create policy holidays_read on holidays for select to authenticated using (true);

drop policy if exists time_off_select_own on time_off_requests;
create policy time_off_select_own on time_off_requests for select to authenticated using (
  exists (
    select 1 from team_members m
    where m.id = time_off_requests.member_id
      and (m.user_id = auth.uid() or m.role = 'admin' or
           exists (select 1 from team_members me where me.user_id = auth.uid() and me.role = 'admin'))
  )
);

drop policy if exists time_off_insert_own on time_off_requests;
create policy time_off_insert_own on time_off_requests for insert to authenticated with check (
  exists (
    select 1 from team_members m
    where m.id = time_off_requests.member_id
      and (m.user_id = auth.uid() or
           exists (select 1 from team_members me where me.user_id = auth.uid() and me.role = 'admin'))
  )
);

drop policy if exists time_off_admin_modify on time_off_requests;
create policy time_off_admin_modify on time_off_requests for all to authenticated using (
  exists (select 1 from team_members me where me.user_id = auth.uid() and me.role = 'admin')
);

drop policy if exists team_admin_modify on team_members;
create policy team_admin_modify on team_members for all to authenticated using (
  exists (select 1 from team_members me where me.user_id = auth.uid() and me.role = 'admin')
);

drop policy if exists holidays_admin_modify on holidays;
create policy holidays_admin_modify on holidays for all to authenticated using (
  exists (select 1 from team_members me where me.user_id = auth.uid() and me.role = 'admin')
);

-- Email Andreas via GHL when a new request lands. Same pg_net pattern as
-- ghl-sync — call the existing edge function which knows how to talk to
-- GHL's outbound conversations API.
create or replace function notify_time_off_request()
returns trigger
language plpgsql
security definer
as $$
declare
  member_name text;
  member_email text;
  payload jsonb;
begin
  select full_name, email into member_name, member_email
  from team_members where id = NEW.member_id;

  payload := jsonb_build_object(
    'event', 'time_off_request',
    'member_name', coalesce(member_name, 'Unknown'),
    'member_email', member_email,
    'start_date', NEW.start_date,
    'end_date', NEW.end_date,
    'days', NEW.days,
    'reason', coalesce(NEW.reason, '(sin motivo indicado)')
  );

  perform net.http_post(
    url := 'https://rnielxgackkshnatvagj.supabase.co/functions/v1/team-notify',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := payload
  );

  return NEW;
exception when others then
  -- Never block the insert if the webhook fails. The request still records;
  -- Andreas can poll the Equipo tab.
  return NEW;
end;
$$;

drop trigger if exists trg_notify_time_off on time_off_requests;
create trigger trg_notify_time_off
  after insert on time_off_requests
  for each row execute function notify_time_off_request();
