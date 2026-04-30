-- Construction timeline per project, rendered on /proyecto/:slug.
--
-- Modeled after cocodevelopmentgroup.com/aura-wellness-resort — vertical
-- timeline with 3-5 milestones, each with title, date, payment % and
-- short description. Stored as jsonb so admin can edit phases freely
-- without schema migrations.
--
-- Shape:
--   timeline: [
--     { "title": "Inicio de obra", "date": "2026-05-01", "payment_pct": 20,
--       "description": "Pago de reserva + primer hito.", "status": "done" },
--     ...
--   ]

alter table public.projects
  add column if not exists timeline jsonb;

-- Seed Golf Bay Lofts so the live page shows the new component immediately.
update public.projects
set timeline = '[
  {
    "title": "Reserva y firma",
    "date": "2026-05",
    "payment_pct": 10,
    "description": "Reserva a firma + LOI. Bloqueas la unidad y comienzan trámites notariales remotos."
  },
  {
    "title": "Inicio de obra",
    "date": "2026-06",
    "payment_pct": 30,
    "description": "Cimentación y estructura primaria. Reportes semanales con foto + video."
  },
  {
    "title": "Estructura completada (50% obra)",
    "date": "2026-10",
    "payment_pct": 25,
    "description": "Cerrada la envolvente del edificio. Inicio de instalaciones y acabados."
  },
  {
    "title": "Acabados (90% obra)",
    "date": "2027-02",
    "payment_pct": 25,
    "description": "Pintura, carpinteria, mobiliario semi-furnished, piscina llena."
  },
  {
    "title": "Entrega y arranque alquiler",
    "date": "2027-04",
    "payment_pct": 10,
    "description": "Entrega de llaves al property manager. Listing en Airbnb + Booking."
  }
]'::jsonb
where slug = 'golf-bay-lofts-1bd' and (timeline is null or timeline = 'null'::jsonb);
