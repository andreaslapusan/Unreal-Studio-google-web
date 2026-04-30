-- Team field reports: daily updates from the on-site team with photo + comment.
-- Each row links to a project so admin can filter by project on review.

create table if not exists field_reports (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references team_members(id) on delete cascade,
  project_slug text,                          -- nullable for general office updates
  comment text not null,
  photo_path text,                            -- supabase storage path inside images bucket
  weather text,                               -- snapshot at submission time
  created_at timestamptz not null default now()
);
create index if not exists idx_field_reports_member on field_reports(member_id);
create index if not exists idx_field_reports_project on field_reports(project_slug);
create index if not exists idx_field_reports_date on field_reports(created_at desc);

alter table field_reports enable row level security;

-- Any authed team member can insert their own report. Reads: own + admin sees all.
drop policy if exists field_reports_insert_own on field_reports;
create policy field_reports_insert_own on field_reports for insert to authenticated with check (
  exists (
    select 1 from team_members m
    where m.id = field_reports.member_id and m.user_id = auth.uid()
  )
);

drop policy if exists field_reports_select on field_reports;
create policy field_reports_select on field_reports for select to authenticated using (
  exists (
    select 1 from team_members m
    where m.id = field_reports.member_id
      and (m.user_id = auth.uid() or
           exists (select 1 from team_members me where me.user_id = auth.uid() and me.role = 'admin'))
  )
);

drop policy if exists field_reports_admin_modify on field_reports;
create policy field_reports_admin_modify on field_reports for all to authenticated using (
  exists (select 1 from team_members me where me.user_id = auth.uid() and me.role = 'admin')
);
