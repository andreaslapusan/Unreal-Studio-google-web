/**
 * /agencias/registrar — Public application form for new listing partners.
 * Anyone (no auth required) can submit. Creates a row in `listing_partner_applications`
 * which the admin reviews to approve into `listing_partners`.
 */
import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { recordFormSubmit } from "../lib/attribution";
import { trackLead } from "../lib/fbPixel";

interface FormState {
  agency_name: string;
  manager_name: string;
  email: string;
  phone: string;
  whatsapp: string;
  website: string;
  country: string;
  projects_interested: string[];
  experience: string;
  monthly_volume: string;
  source: string;
  notes: string;
}

const PROJECTS = [
  "Lofts Balangan",
  "Villa 3hab Balangan",
  "Apartments Balangan",
  "The Nook (Pererenan)",
  "Deseo Studio (Melasti)",
  "Mambo Villa (Melasti)",
  "Villa Crunchy (Tabanan)",
  "Otros",
];

export default function AgenciasRegistrar() {
  const [form, setForm] = useState<FormState>({
    agency_name: "",
    manager_name: "",
    email: "",
    phone: "",
    whatsapp: "",
    website: "",
    country: "",
    projects_interested: [],
    experience: "",
    monthly_volume: "",
    source: "",
    notes: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");
  const navigate = useNavigate();

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((p) => ({ ...p, [key]: value }));

  const toggleProject = (p: string) => {
    setForm((s) => {
      const exists = s.projects_interested.includes(p);
      return {
        ...s,
        projects_interested: exists
          ? s.projects_interested.filter((x) => x !== p)
          : [...s.projects_interested, p],
      };
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.agency_name || !form.email) return;
    setSubmitting(true);
    setError("");
    try {
      const { error: insertErr } = await supabase
        .from("listing_partner_applications")
        .insert({
          agency_name: form.agency_name.trim(),
          manager_name: form.manager_name.trim() || null,
          email: form.email.trim().toLowerCase(),
          phone: form.phone.trim() || null,
          whatsapp: form.whatsapp.trim() || null,
          website: form.website.trim() || null,
          country: form.country.trim() || null,
          projects_interested: form.projects_interested,
          experience: form.experience.trim() || null,
          monthly_volume: form.monthly_volume.trim() || null,
          source: form.source.trim() || null,
          notes: form.notes.trim() || null,
          status: "pending",
        });
      if (insertErr) throw insertErr;

      // Record attribution alongside the application so the partner who
      // referred this agency (if any) gets credit in their stats panel.
      void recordFormSubmit({
        email: form.email.trim().toLowerCase(),
        phone: form.phone.trim() || form.whatsapp.trim() || null,
        name: form.manager_name.trim() || form.agency_name.trim(),
      });

      // Meta Pixel — Lead event for the listing partner application.
      trackLead({ content_name: 'Listing Partner application', content_category: 'agencias_registrar' });

      setSubmitted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-almond px-6 py-16">
        <div className="max-w-md text-center glass-card rounded-2xl p-10 shadow-xl">
          <div className="text-5xl mb-4">✅</div>
          <h1 className="text-3xl font-serif text-primary mb-3">Solicitud recibida</h1>
          <p className="text-primary/70 mb-6">
            Hemos guardado tu solicitud. El equipo de Unreal Studio Bali revisará
            los datos y te contactará en las próximas 24-48h con los siguientes
            pasos.
          </p>
          <button
            onClick={() => navigate("/")}
            className="bg-primary text-white px-6 py-3 rounded-full font-bold"
          >
            Volver al inicio
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-almond px-6 py-16">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-4xl font-serif text-primary mb-3">Conviértete en Listing Partner</h1>
        <p className="text-primary/70 mb-8">
          ¿Tienes una agencia inmobiliaria en Bali, España, Australia, o donde sea?
          Lista nuestras propiedades en tu portfolio y gana <strong>5% de comisión</strong>{" "}
          por unidad cerrada. Acceso a renders, walkthroughs, dossiers actualizados,
          plan de pagos detallado, y videos drone para que vendas como si fueras parte
          del equipo.
        </p>

        <form onSubmit={handleSubmit} className="space-y-5 glass-card rounded-2xl p-8 shadow-sm">
          <div className="grid sm:grid-cols-2 gap-4">
            <label className="block">
              <span className="text-sm font-medium text-primary">Nombre agencia *</span>
              <input
                type="text" required value={form.agency_name}
                onChange={(e) => update("agency_name", e.target.value)}
                className="mt-1 block w-full rounded-lg border border-primary/20 px-4 py-2.5 outline-none focus:ring-2 focus:ring-primary/40"
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-primary">Manager / contacto principal</span>
              <input
                type="text" value={form.manager_name}
                onChange={(e) => update("manager_name", e.target.value)}
                className="mt-1 block w-full rounded-lg border border-primary/20 px-4 py-2.5 outline-none focus:ring-2 focus:ring-primary/40"
              />
            </label>
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <label className="block">
              <span className="text-sm font-medium text-primary">Email *</span>
              <input
                type="email" required value={form.email}
                onChange={(e) => update("email", e.target.value)}
                className="mt-1 block w-full rounded-lg border border-primary/20 px-4 py-2.5 outline-none focus:ring-2 focus:ring-primary/40"
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-primary">WhatsApp</span>
              <input
                type="tel" value={form.whatsapp}
                onChange={(e) => update("whatsapp", e.target.value)}
                placeholder="+62 812..."
                className="mt-1 block w-full rounded-lg border border-primary/20 px-4 py-2.5 outline-none focus:ring-2 focus:ring-primary/40"
              />
            </label>
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <label className="block">
              <span className="text-sm font-medium text-primary">País</span>
              <input
                type="text" value={form.country}
                onChange={(e) => update("country", e.target.value)}
                placeholder="Indonesia, España, Australia..."
                className="mt-1 block w-full rounded-lg border border-primary/20 px-4 py-2.5 outline-none focus:ring-2 focus:ring-primary/40"
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-primary">Web de la agencia</span>
              <input
                type="url" value={form.website}
                onChange={(e) => update("website", e.target.value)}
                placeholder="https://"
                className="mt-1 block w-full rounded-lg border border-primary/20 px-4 py-2.5 outline-none focus:ring-2 focus:ring-primary/40"
              />
            </label>
          </div>

          <div>
            <span className="text-sm font-medium text-primary block mb-2">¿Qué proyectos te interesan listar?</span>
            <div className="flex flex-wrap gap-2">
              {PROJECTS.map((p) => {
                const checked = form.projects_interested.includes(p);
                return (
                  <button
                    type="button"
                    key={p}
                    onClick={() => toggleProject(p)}
                    className={`text-xs px-3 py-2 rounded-full border transition ${
                      checked
                        ? "bg-primary text-white border-primary"
                        : "bg-white border-primary/20 text-primary hover:bg-primary/5"
                    }`}
                  >
                    {p}
                  </button>
                );
              })}
            </div>
          </div>

          <label className="block">
            <span className="text-sm font-medium text-primary">Volumen mensual aproximado</span>
            <select
              aria-label="Volumen mensual aproximado"
              value={form.monthly_volume}
              onChange={(e) => update("monthly_volume", e.target.value)}
              className="mt-1 block w-full rounded-lg border border-primary/20 px-4 py-2.5 outline-none"
            >
              <option value="">— Selecciona —</option>
              <option>1-2 unidades / mes</option>
              <option>3-5 unidades / mes</option>
              <option>6-10 unidades / mes</option>
              <option>10+ unidades / mes</option>
              <option>Ad-hoc, sin volumen fijo</option>
            </select>
          </label>

          <label className="block">
            <span className="text-sm font-medium text-primary">Experiencia previa con Bali / inversión inmobiliaria</span>
            <textarea
              value={form.experience}
              onChange={(e) => update("experience", e.target.value)}
              rows={3}
              className="mt-1 block w-full rounded-lg border border-primary/20 px-4 py-2.5 outline-none"
            />
          </label>

          <label className="block">
            <span className="text-sm font-medium text-primary">¿Cómo nos has conocido?</span>
            <input
              type="text" value={form.source}
              onChange={(e) => update("source", e.target.value)}
              placeholder="Instagram, referido, búsqueda Google, evento..."
              className="mt-1 block w-full rounded-lg border border-primary/20 px-4 py-2.5 outline-none"
            />
          </label>

          <label className="block">
            <span className="text-sm font-medium text-primary">Notas adicionales</span>
            <textarea
              value={form.notes}
              onChange={(e) => update("notes", e.target.value)}
              rows={2}
              className="mt-1 block w-full rounded-lg border border-primary/20 px-4 py-2.5 outline-none"
            />
          </label>

          <button
            type="submit"
            disabled={submitting || !form.agency_name || !form.email}
            className="w-full bg-primary text-white py-3 rounded-lg font-bold hover:translate-y-[-2px] transition disabled:opacity-50"
          >
            {submitting ? "Enviando…" : "Enviar solicitud"}
          </button>

          {error && <p className="text-red-600 text-sm">{error}</p>}

          <p className="text-xs text-primary/50 text-center">
            ¿Ya eres colaborador? <a href="/agencias" className="underline">Login aquí</a>.
          </p>
        </form>
      </div>
    </div>
  );
}
