-- Notas de clientes de agencia: toda nota cuelga de un cliente de SU agencia, también las del
-- Equipo Unreal (admin). Antes el admin podía guardar lead de A con agency_id de B y la nota
-- quedaba visible para la agencia B. Las agencias siguen escribiendo solo author='agency'.
-- Comprobación: supabase/checks/agency_lead_notes_rls.sql
drop policy if exists aln_insert on public.agency_lead_notes;
create policy aln_insert on public.agency_lead_notes
  for insert with check (
    exists (select 1 from public.agency_leads l where l.id = lead_id and l.agency_id = agency_lead_notes.agency_id)
    and (
      public.current_role() = 'admin'
      or (author = 'agency' and agency_id in (select id from public.listing_partners where user_id = auth.uid()))
    )
  );
