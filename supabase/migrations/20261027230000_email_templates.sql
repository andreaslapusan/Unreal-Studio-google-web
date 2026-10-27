create table if not exists public.email_templates (
  key text primary key,
  html text not null,
  meta jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.email_templates enable row level security;
drop policy if exists email_templates_admin_read on public.email_templates;
create policy email_templates_admin_read on public.email_templates for select to authenticated using (public.is_admin());
revoke all on public.email_templates from anon;
grant select on public.email_templates to authenticated;
