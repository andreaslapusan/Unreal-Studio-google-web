-- Public FAQ section.
--
-- Andreas asked for a /faq page on the site so prospects (Yolanda, Sandra,
-- and the long tail) can self-serve answers to the recurring questions
-- without bouncing back to Mark. Pipeline:
--
--   1. Andreas/Mark/AI propose a FAQ → status='draft'
--   2. Andreas reviews + edits in /admin/portal → publishes (is_published=true)
--   3. Public /faq page reads all is_published=true rows
--   4. (future) weekly cron mines WhatsApp + Fathom for new candidates
--
-- Categories are deliberately a loose enum (text + check) instead of an
-- ENUM type so we can add new ones without migrations. Same for language —
-- we expect ES/EN/ID, EN/ID linked back to the ES source via parent_faq_id.

create table if not exists public.faqs (
  id              uuid primary key default gen_random_uuid(),
  question        text not null,
  answer          text not null,
  category        text not null check (category in (
                    'compra', 'leasehold', 'construccion',
                    'alquiler', 'fiscalidad', 'legal', 'general'
                  )),
  tags            text[] default '{}',
  project_filter  text[] default '{}',         -- empty = applies to all projects
  language        text not null default 'es' check (language in ('es','en','id')),
  parent_faq_id   uuid references public.faqs(id) on delete cascade,
  is_published    boolean not null default false,
  sort_order      int not null default 100,
  source          text,                         -- 'manual' | 'whatsapp_mining' | 'fathom_mining' | etc.
  created_at      timestamptz default now(),
  updated_at      timestamptz default now(),
  published_at    timestamptz
);

create index if not exists faqs_category_idx on public.faqs (category);
create index if not exists faqs_published_idx on public.faqs (is_published, sort_order);
create index if not exists faqs_language_idx on public.faqs (language);
create index if not exists faqs_parent_idx on public.faqs (parent_faq_id);

-- Touch updated_at on every change. published_at sticks to first publish.
create or replace function public.faqs_touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  if new.is_published and old.is_published is distinct from true then
    new.published_at := now();
  end if;
  return new;
end;
$$;
drop trigger if exists trg_faqs_touch on public.faqs;
create trigger trg_faqs_touch
  before update on public.faqs
  for each row execute function public.faqs_touch_updated_at();

-- RLS
alter table public.faqs enable row level security;

drop policy if exists faqs_public_read on public.faqs;
create policy faqs_public_read on public.faqs
  for select using (is_published = true);

drop policy if exists faqs_admin_all on public.faqs;
create policy faqs_admin_all on public.faqs
  for all using (public.current_role() = 'admin');
