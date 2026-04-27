-- Investor payments: timeline of payments per investor_unit (reserva, mes 0, mes 3, ...)
-- Used in InversoresDashboard to render a visual progress bar of the payment plan.
create table if not exists public.investor_payments (
  id                 uuid primary key default gen_random_uuid(),
  investor_unit_id   uuid references public.investor_units(id) on delete cascade,
  label              text not null,                  -- 'Reserva', 'Mes 0', 'Mes 3', etc.
  amount             numeric not null,
  currency           text default 'EUR',
  due_date           date,
  paid_at            timestamptz,
  payment_method     text,                           -- 'transfer', 'card', 'crypto'
  reference          text,                           -- proof reference / wire id
  position           int default 0,                  -- order in the timeline
  created_at         timestamptz default now()
);
create index if not exists ip_iu_idx on public.investor_payments (investor_unit_id);
create index if not exists ip_position_idx on public.investor_payments (investor_unit_id, position);

alter table public.investor_payments enable row level security;

-- Investor sees own payments only
drop policy if exists ip_self on public.investor_payments;
create policy ip_self on public.investor_payments
  for select using (
    investor_unit_id in (
      select iu.id from public.investor_units iu
      join public.investors i on i.id = iu.investor_id
      where i.user_id = auth.uid()
    )
    or public.current_role() = 'admin'
  );

drop policy if exists ip_admin_write on public.investor_payments;
create policy ip_admin_write on public.investor_payments
  for all using (public.current_role() = 'admin');
