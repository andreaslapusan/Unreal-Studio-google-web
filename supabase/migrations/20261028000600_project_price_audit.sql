-- Audit de cambios de precio en projects (Nook market_price volvía a 165000 sin causa conocida, 28-oct).
create table if not exists public.project_price_audit (
  id bigserial primary key, project_id uuid, at timestamptz default now(),
  old_market numeric, new_market numeric, old_investor numeric, new_investor numeric,
  db_role text, jwt jsonb, app text
);
alter table public.project_price_audit enable row level security;
create or replace function public.audit_project_price() returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.market_price is distinct from old.market_price or new.investor_price is distinct from old.investor_price then
    insert into project_price_audit(project_id,old_market,new_market,old_investor,new_investor,db_role,jwt,app)
    values (new.id, old.market_price, new.market_price, old.investor_price, new.investor_price, current_user,
            nullif(current_setting('request.jwt.claims', true),'')::jsonb, current_setting('application_name', true));
  end if;
  return new;
end $$;
drop trigger if exists trg_audit_project_price on public.projects;
create trigger trg_audit_project_price after update on public.projects for each row execute function public.audit_project_price();
