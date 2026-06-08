/**
 * /manager/dashboard — employee self-service.
 *
 * Two tabs:
 *   - Vacaciones: pick dates, see remaining days, list of own requests.
 *   - Parte de obra: pick project, write comment, optionally attach a photo
 *     (auto-compressed client-side), submit. Auto-tagged with current weather.
 *
 * Auth: matches auth.user.email → team_members. Backfills user_id on first
 * login. Anyone whose email isn't in the roster sees "no estás en la lista".
 */
import React, { useEffect, useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { supabase, getImageUrl, uploadImage } from "../lib/supabase";
import { useAuth } from "../lib/auth-context";
import { compressImage } from "../lib/imageCompress";
import WeatherWidget, { getWeatherSummary } from "../components/WeatherWidget";
import PortalHeader from "../components/PortalHeader";
import Footer from "../components/Footer";

interface TeamMember {
  id: string;
  full_name: string;
  email: string | null;
  role: string;
  total_days_per_year: number;
  user_id: string | null;
}
interface TimeOffRequest {
  id: string;
  member_id: string;
  start_date: string;
  end_date: string;
  days: number;
  reason: string | null;
  status: string;
  created_at: string;
}
interface Holiday { date: string; name: string; }
interface ProjectMin { slug: string; name: string; }
interface FieldReport {
  id: string;
  member_id: string;
  project_slug: string | null;
  comment: string;
  photo_path: string | null;
  weather: string | null;
  created_at: string;
}

function todayIso() { return new Date().toISOString().slice(0, 10); }
function diffDaysInclusive(a: string, b: string) {
  return Math.floor((new Date(b).getTime() - new Date(a).getTime()) / 86_400_000) + 1;
}

type TabKey = "vacaciones" | "parte";

export default function EquipoDashboard() {
  const { t: tt } = useTranslation();
  const { user, loading: authLoading, signOut } = useAuth();
  const [member, setMember] = useState<TeamMember | null>(null);
  const [requests, setRequests] = useState<TimeOffRequest[]>([]);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [projects, setProjects] = useState<ProjectMin[]>([]);
  const [reports, setReports] = useState<FieldReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [tab, setTab] = useState<TabKey>("vacaciones");

  useEffect(() => {
    if (authLoading) return;
    if (!user) return;
    void loadAll();
  }, [authLoading, user]);

  const loadAll = async () => {
    setLoading(true);
    try {
      const email = user?.email;
      if (!email) { setNotFound(true); return; }
      const { data: m } = await supabase.from("team_members").select("*").eq("email", email).maybeSingle();
      if (!m) { setNotFound(true); return; }
      if (!m.user_id && user?.id) {
        await supabase.from("team_members").update({ user_id: user.id, updated_at: new Date().toISOString() }).eq("id", m.id);
        m.user_id = user.id;
      }
      setMember(m as TeamMember);

      const [reqRes, holRes, projRes, repRes] = await Promise.all([
        supabase.from("time_off_requests").select("*").eq("member_id", m.id).order("start_date", { ascending: false }),
        supabase.from("holidays").select("date,name").order("date"),
        supabase.from("projects").select("slug,name").eq("is_hidden", false).order("sort_order"),
        supabase.from("field_reports").select("*").eq("member_id", m.id).order("created_at", { ascending: false }).limit(20),
      ]);
      setRequests((reqRes.data ?? []) as TimeOffRequest[]);
      setHolidays((holRes.data ?? []) as Holiday[]);
      setProjects((projRes.data ?? []) as ProjectMin[]);
      setReports((repRes.data ?? []) as FieldReport[]);
    } finally {
      setLoading(false);
    }
  };

  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-almond flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }
  if (!user) return <Navigate to="/manager" replace />;
  if (notFound) {
    return (
      <div className="min-h-screen bg-almond flex items-center justify-center px-6 text-center">
        <div className="max-w-md">
          <h1 className="text-2xl font-serif text-primary mb-4">No estás en la lista</h1>
          <p className="text-sm text-primary/70 mb-6">
            Tu email <b>{user.email}</b> no coincide con ningún miembro del equipo. Pídele a Andreas o Marcelino que te añadan.
          </p>
          <button onClick={async () => { try { await signOut(); } catch { /* ignore */ } window.location.href = '/manager'; }} className="bg-primary text-white px-6 py-3 rounded-full text-sm font-bold">
            Cerrar sesión
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-almond pb-20">
      <PortalHeader
        subtitle={tt('admin.equipoDash.greeting', { name: member?.full_name })}
        onLogout={async () => { try { await signOut(); } catch { /* ignore */ } window.location.href = '/manager'; }}
      />

      <div className="max-w-5xl mx-auto px-6 py-8">
        <WeatherWidget />
      </div>

      <div className="max-w-5xl mx-auto px-6">
        <div className="flex gap-2 mb-6">
          {(["vacaciones", "parte"] as TabKey[]).map((k) => (
            <button
              key={k}
              onClick={() => setTab(k)}
              className={`px-4 py-2 rounded-full text-sm font-bold transition ${
                tab === k ? "bg-primary text-white" : "bg-white text-primary border border-primary/20"
              }`}
            >
              {k === "vacaciones" ? tt('admin.equipoDash.tabVacaciones') : tt('admin.equipoDash.tabParte')}
            </button>
          ))}
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 space-y-10">
        {tab === "vacaciones" && member && (
          <VacacionesTab member={member} requests={requests} holidays={holidays} reload={loadAll} />
        )}
        {tab === "parte" && member && (
          <ParteTab member={member} projects={projects} reports={reports} reload={loadAll} />
        )}
      </div>

      {/* Footer compartido (a lo ancho; el root no tiene padding lateral) */}
      <div className="mt-12">
        <Footer />
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────────── */
/* Vacaciones tab                                                            */
/* ──────────────────────────────────────────────────────────────────────── */

function VacacionesStats({ total, taken, remaining }: { total: number; taken: number; remaining: number }) {
  const { t: tt } = useTranslation();
  return (
    <div className="grid grid-cols-3 gap-4">
      <StatCard label={tt('admin.equipoDash.statTotalDays')} value={total} />
      <StatCard label={tt('admin.equipoDash.statTakenDays')} value={taken} />
      <StatCard label={tt('admin.equipoDash.statAvailable')} value={remaining} negative={remaining < 0} />
    </div>
  );
}

function VacacionesTab({
  member, requests, holidays, reload,
}: {
  member: TeamMember;
  requests: TimeOffRequest[];
  holidays: Holiday[];
  reload: () => Promise<void>;
}) {
  const [startDate, setStartDate] = useState(todayIso());
  const [endDate, setEndDate] = useState(todayIso());
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitErr, setSubmitErr] = useState("");

  const daysTaken = useMemo(() => {
    const year = String(new Date().getFullYear());
    return requests
      .filter((r) => r.status === "approved" && r.start_date.slice(0, 4) === year)
      .reduce((s, r) => s + r.days, 0);
  }, [requests]);
  const daysRemaining = member.total_days_per_year - daysTaken;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitErr("");
    if (endDate < startDate) { setSubmitErr("Fecha fin antes que la inicial."); return; }
    const days = diffDaysInclusive(startDate, endDate);
    if (days > daysRemaining) { setSubmitErr(`Solo quedan ${daysRemaining} días.`); return; }
    setSubmitting(true);
    try {
      const { error } = await supabase.from("time_off_requests").insert({
        member_id: member.id, start_date: startDate, end_date: endDate, days,
        reason: reason || null, status: "pending",
      });
      if (error) throw error;
      setReason("");
      await reload();
    } catch (err) {
      setSubmitErr(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  const remove = async (id: string) => {
    if (!confirm("¿Cancelar esta solicitud?")) return;
    await supabase.from("time_off_requests").delete().eq("id", id);
    await reload();
  };

  const year = new Date().getFullYear();
  const takenDays = new Set<string>();
  for (const r of requests.filter((r) => r.status === "approved")) {
    let d = new Date(r.start_date);
    const end = new Date(r.end_date);
    while (d <= end) { takenDays.add(d.toISOString().slice(0, 10)); d = new Date(d.getTime() + 86_400_000); }
  }
  const holidayMap = new Map(holidays.map((h) => [h.date, h.name]));

  return (
    <>
      <VacacionesStats total={member.total_days_per_year} taken={daysTaken} remaining={daysRemaining} />

      <section className="bg-white rounded-2xl p-8 shadow-sm border border-primary/5">
        <h2 className="text-xl font-serif text-primary mb-6">Solicitar días libres</h2>
        <form onSubmit={submit} className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <FormDate label="Desde" value={startDate} min={todayIso()} onChange={setStartDate} />
          <FormDate label="Hasta" value={endDate} min={startDate} onChange={setEndDate} />
          <div className="md:col-span-2">
            <label className="text-xs text-primary/60 block mb-1">Motivo (opcional)</label>
            <input type="text" value={reason} onChange={(e) => setReason(e.target.value)}
              placeholder="Ej: Boda hermano"
              className="w-full border border-primary/20 rounded-lg px-3 py-2" />
          </div>
          <div className="md:col-span-4 flex items-center justify-between gap-4">
            <p className="text-xs text-primary/60">
              Total a pedir: <b>{diffDaysInclusive(startDate, endDate)}</b> días. Auto-aprobado, Andreas recibe email.
            </p>
            <button type="submit" disabled={submitting}
              className="bg-primary text-white px-6 py-2 rounded-full font-bold text-sm disabled:opacity-50">
              {submitting ? "Enviando…" : "Solicitar"}
            </button>
          </div>
          {submitErr && <p className="md:col-span-4 text-red-600 text-sm">{submitErr}</p>}
        </form>
      </section>

      <section className="bg-white rounded-2xl p-6 shadow-sm border border-primary/5">
        <h2 className="text-xl font-serif text-primary mb-6">Calendario {year}</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
          {Array.from({ length: 12 }).map((_, mIdx) => {
            const first = new Date(year, mIdx, 1);
            const monthName = first.toLocaleDateString("es-ES", { month: "long" });
            const daysInMonth = new Date(year, mIdx + 1, 0).getDate();
            const startWeekday = (first.getDay() + 6) % 7;
            return (
              <div key={mIdx} className="border border-primary/10 rounded-xl p-3">
                <p className="text-sm font-bold text-primary capitalize mb-2">{monthName}</p>
                <div className="grid grid-cols-7 gap-1 text-[10px] text-primary/40 mb-1">
                  {["L", "M", "X", "J", "V", "S", "D"].map((d) => (<span key={d} className="text-center">{d}</span>))}
                </div>
                <div className="grid grid-cols-7 gap-1">
                  {Array.from({ length: startWeekday }).map((_, i) => (<span key={`b${i}`} />))}
                  {Array.from({ length: daysInMonth }).map((_, i) => {
                    const day = i + 1;
                    const iso = `${year}-${String(mIdx + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
                    const isHoliday = holidayMap.has(iso);
                    const isTaken = takenDays.has(iso);
                    return (
                      <span key={day}
                        title={isHoliday ? `${holidayMap.get(iso)} (festivo)` : isTaken ? "Día solicitado" : iso}
                        className={`text-center text-[10px] py-1 rounded ${
                          isTaken ? "bg-primary text-white" : isHoliday ? "bg-red-100 text-red-700" : "text-primary/70"
                        }`}>
                        {day}
                      </span>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
        <div className="flex gap-6 text-xs text-primary/60 mt-4">
          <span className="flex items-center gap-2"><span className="w-3 h-3 bg-primary rounded" /> Tus días libres</span>
          <span className="flex items-center gap-2"><span className="w-3 h-3 bg-red-100 rounded" /> Festivo Indonesia</span>
        </div>
      </section>

      <section className="bg-white rounded-2xl p-6 shadow-sm border border-primary/5">
        <h2 className="text-xl font-serif text-primary mb-4">Mis solicitudes</h2>
        {requests.length === 0 ? (
          <p className="text-sm text-primary/50">Aún no tienes solicitudes.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-xs uppercase tracking-widest text-primary/50">
              <tr><th className="text-left py-2">Desde</th><th className="text-left py-2">Hasta</th><th className="text-left py-2">Días</th><th className="text-left py-2">Motivo</th><th className="text-left py-2">Estado</th><th /></tr>
            </thead>
            <tbody>
              {requests.map((r) => {
                const isPast = r.end_date < todayIso();
                return (
                  <tr key={r.id} className="border-t border-primary/5">
                    <td className="py-2">{r.start_date}</td>
                    <td className="py-2">{r.end_date}</td>
                    <td className="py-2">{r.days}</td>
                    <td className="py-2 text-primary/60">{r.reason || "—"}</td>
                    <td className="py-2">
                      <span className={`px-2 py-1 rounded-full text-[10px] uppercase ${isPast ? "bg-gray-100 text-gray-500" : "bg-green-100 text-green-700"}`}>
                        {isPast ? "Pasada" : "Aprobada"}
                      </span>
                    </td>
                    <td className="py-2 text-right">
                      {!isPast && (<button onClick={() => remove(r.id)} className="text-xs text-red-600 underline">Cancelar</button>)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>
    </>
  );
}

/* ──────────────────────────────────────────────────────────────────────── */
/* Parte de obra tab                                                         */
/* ──────────────────────────────────────────────────────────────────────── */

function ParteTab({
  member, projects, reports, reload,
}: {
  member: TeamMember;
  projects: ProjectMin[];
  reports: FieldReport[];
  reload: () => Promise<void>;
}) {
  const [projectSlug, setProjectSlug] = useState<string>("");
  const [comment, setComment] = useState("");
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr("");
    if (!comment.trim()) { setErr("Escribe algo en el comentario."); return; }
    setSubmitting(true);
    try {
      let photo_path: string | null = null;
      if (photoFile) {
        const compressed = await compressImage(photoFile, { maxDim: 1600, quality: 0.82 }).catch(() => photoFile);
        photo_path = await uploadImage(compressed as File, "field-reports");
      }
      const { error } = await supabase.from("field_reports").insert({
        member_id: member.id,
        project_slug: projectSlug || null,
        comment: comment.trim(),
        photo_path,
        weather: getWeatherSummary(),
      });
      if (error) throw error;
      setComment("");
      setPhotoFile(null);
      setProjectSlug("");
      await reload();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <section className="bg-white rounded-2xl p-8 shadow-sm border border-primary/5">
        <h2 className="text-xl font-serif text-primary mb-6">Parte de obra</h2>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="text-xs text-primary/60 block mb-1">Proyecto (opcional)</label>
            <select value={projectSlug} onChange={(e) => setProjectSlug(e.target.value)}
              className="w-full border border-primary/20 rounded-lg px-3 py-2 bg-white">
              <option value="">— Sin proyecto / general —</option>
              {projects.map((p) => (<option key={p.slug} value={p.slug}>{p.name}</option>))}
            </select>
          </div>
          <div>
            <label className="text-xs text-primary/60 block mb-1">Comentario *</label>
            <textarea required rows={4} value={comment} onChange={(e) => setComment(e.target.value)}
              placeholder="Avance del día, incidencias, próximas tareas..."
              className="w-full border border-primary/20 rounded-lg px-3 py-2 resize-none" />
          </div>
          <div>
            <label className="text-xs text-primary/60 block mb-1">Foto (opcional)</label>
            <input type="file" accept="image/*" capture="environment"
              onChange={(e) => setPhotoFile(e.target.files?.[0] ?? null)}
              className="text-sm" />
            {photoFile && (
              <p className="text-[10px] text-primary/50 mt-1">{photoFile.name} · {(photoFile.size / 1024).toFixed(0)} KB → comprimida al subir</p>
            )}
          </div>
          <div className="flex items-center justify-between gap-4 pt-2">
            <p className="text-xs text-primary/60">El parte se guarda con la fecha y la temperatura actual.</p>
            <button type="submit" disabled={submitting}
              className="bg-primary text-white px-6 py-2 rounded-full font-bold text-sm disabled:opacity-50">
              {submitting ? "Subiendo…" : "Enviar parte"}
            </button>
          </div>
          {err && <p className="text-sm text-red-600">{err}</p>}
        </form>
      </section>

      <section className="bg-white rounded-2xl p-6 shadow-sm border border-primary/5">
        <h2 className="text-xl font-serif text-primary mb-4">Mis últimos partes</h2>
        {reports.length === 0 ? (
          <p className="text-sm text-primary/50">Aún no has enviado ningún parte.</p>
        ) : (
          <div className="space-y-4">
            {reports.map((r) => (
              <article key={r.id} className="border border-primary/5 rounded-xl p-4 flex gap-4">
                {r.photo_path && (
                  <img src={getImageUrl(r.photo_path)} alt="" className="w-24 h-24 object-cover rounded-lg flex-shrink-0" />
                )}
                <div className="flex-1 text-sm">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs uppercase tracking-widest text-primary/50">
                      {new Date(r.created_at).toLocaleString("es-ES", { dateStyle: "medium", timeStyle: "short" })}
                    </span>
                    {r.project_slug && <span className="text-[10px] bg-primary/10 text-primary px-2 py-0.5 rounded-full">{r.project_slug}</span>}
                  </div>
                  <p className="text-primary whitespace-pre-line">{r.comment}</p>
                  {r.weather && <p className="text-[10px] text-primary/40 mt-2">Tiempo: {r.weather}</p>}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </>
  );
}

/* ──────────────────────────────────────────────────────────────────────── */
/* Small UI bits                                                             */
/* ──────────────────────────────────────────────────────────────────────── */

function StatCard({ label, value, negative }: { label: string; value: number; negative?: boolean }) {
  return (
    <div className="bg-white rounded-2xl p-6 shadow-sm border border-primary/5">
      <p className="text-xs uppercase tracking-widest text-primary/50">{label}</p>
      <p className={`text-4xl font-serif mt-2 ${negative ? "text-red-600" : "text-primary"}`}>{value}</p>
    </div>
  );
}

function FormDate({ label, value, min, onChange }: { label: string; value: string; min?: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="text-xs text-primary/60 block mb-1">{label}</label>
      <input type="date" required min={min} value={value} onChange={(e) => onChange(e.target.value)}
        className="w-full border border-primary/20 rounded-lg px-3 py-2" />
    </div>
  );
}
