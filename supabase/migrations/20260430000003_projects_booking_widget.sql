-- Per-project booking widget URL (GHL / Neo Software / Calendly / any iframe).
-- When set, ProjectDetail renders an embedded "agendar llamada" calendar
-- inside the project page. The component appends UTM + property_slug as
-- query params so the booking lands attributed in GHL.

alter table public.projects
  add column if not exists booking_widget_url text;

-- Seed: the GHL widget Marcelino sent on Deseo + Golf Bay Lofts.
update public.projects
set booking_widget_url = 'https://api.neo.software/widget/booking/KdAikEYhZVPgMylze6lO'
where slug in (
  'golf-bay-lofts-1bd',
  'deseo-studio-tipo-a-1bd',
  'deseo-studio-tipo-b-1bd'
);
