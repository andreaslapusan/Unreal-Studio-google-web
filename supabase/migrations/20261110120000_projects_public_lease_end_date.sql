-- Web (ProjectDetail): "hasta mayo 2045" under the leasehold card (Golf Bay Lofts only, Andreas 10-nov).
-- lease_end_date* are not sensitive -> public like the other 63 PUBLIC_PROJECT_COLS (anon AND authenticated, same batch).
grant select (lease_end_date, lease_end_date_en, lease_end_date_id) on public.projects to anon, authenticated;
