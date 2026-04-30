/**
 * /equipo/dashboard — employee self-service for time off.
 *
 * Flow:
 *   1. Match auth user → team_members row by email. Sync user_id back if missing.
 *   2. Show: total days available, days already taken (from approved requests),
 *      remaining days, list of upcoming/past requests.
 *   3. Calendar of the year, click-and-drag (or two date pickers) to request.
 *   4. Submit inserts into time_off_requests with status='approved' (auto-policy
 *      per Marcelino). DB trigger fires email to Andreas.
 */
import React, { useEffect, useMemo, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useAuth } from "../lib/auth-context";

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

interface Holiday {
  date: string;
  name: string;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function diffDaysInclusive(a: string, b: string): number {
  const ms = new Date(b).getTime() - new Date(a).getTime();
  return Math.floor(ms / 86_400_000) + 1;
}

export default function EquipoDashboard() {
  const { user, loading: authLoading, signOut } = useAuth();
  const navigate = useNavigate();
  const [member, setMember] = useState<TeamMember | null>(null);
  const [requests, setRequests] = useState<TimeOffRequest[]>([]);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  // Form state
  const [startDate, setStartDate] = useState(todayIso());
  const [endDate, setEndDate] = useState(todayIso());
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitErr, setSubmitErr] = useState("");

  useEffect(() => {
    if (authLoading) return;
    if (!user) return;
    void loadAll();
  }, [authLoading, user]);

  const loadAll = async () => {
    setLoading(true);
    try {
      const email = user?.email;
      if (!email) {
        setNotFound(true);
        return;
      }
      const { data: m } = await supabase
        .from("team_members")
        .select("*")
        .eq("email", email)
        .maybeSingle();
      if (!m) {
        setNotFound(true);
        return;
      }
      // Backfill user_id once on first login.
      if (!m.user_id && user?.id) {
        await supabase
          .from("team_members")
          .update({ user_id: user.id, updated_at: new Date().toISOString() })
          .eq("id", m.id);
        m.user_id = user.id;
      }
      setMember(m as TeamMember);

      const [reqRes, holRes] = await Promise.all([
        supabase
          .from("time_off_requests")
          .select("*")
          .eq("member_id", m.id)
          .order("start_date", { ascending: false }),
        supabase.from("holidays").select("date,name").order("date"),
      ]);
      setRequests((reqRes.data ?? []) as TimeOffRequest[]);
      setHolidays((holRes.data ?? []) as Holiday[]);
    } finally {
      setLoading(false);
    }
  };

  const daysTaken = useMemo(() => {
    if (!member) return 0;
    const year = new Date().getFullYear();
    return requests
      .filter((r) => r.status === "approved" && r.start_date.slice(0, 4) === String(year))
      .reduce((sum, r) => sum + r.days, 0);
  }, [requests, member]);

  const daysRemaining = (member?.total_days_per_year ?? 0) - daysTaken;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!member) return;
    setSubmitErr("");
    if (endDate < startDate) {
      setSubmitErr("La fecha fin debe ser igual o posterior a la inicial.");
      return;
    }
    const days = diffDaysInclusive(startDate, endDate);
    if (days > daysRemaining) {
      setSubmitErr(`Solo te quedan ${daysRemaining} días disponibles.`);
      return;
    }
    setSubmitting(true);
    try {
      const { error } = await supabase.from("time_off_requests").insert({
        member_id: member.id,
        start_date: startDate,
        end_date: endDate,
        days,
        reason: reason || null,
        status: "approved",
      });
      if (error) throw error;
      setReason("");
      await loadAll();
    } catch (err) {
      setSubmitErr(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  const remove = async (id: string) => {
    if (!confirm("¿Cancelar esta solicitud?")) return;
    await supabase.from("time_off_requests").delete().eq("id", id);
    await loadAll();
  };

  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-almond flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }
  if (!user) return <Navigate to="/equipo" replace />;
  if (notFound) {
    return (
      <div className="min-h-screen bg-almond flex items-center justify-center px-6 text-center">
        <div className="max-w-md">
          <h1 className="text-2xl font-serif text-primary mb-4">No estás en la lista</h1>
          <p className="text-sm text-primary/70 mb-6">
            Tu email <b>{user.email}</b> no coincide con ningún miembro del
            equipo. Pídele a Andreas o Marcelino que te añadan.
          </p>
          <button
            onClick={() => signOut()}
            className="bg-primary text-white px-6 py-3 rounded-full text-sm font-bold"
          >
            Cerrar sesión
          </button>
        </div>
      </div>
    );
  }

  // Yearly calendar grid: list of months with days, marking taken days + holidays.
  const year = new Date().getFullYear();
  const takenDays = new Set<string>();
  for (const r of requests.filter((r) => r.status === "approved")) {
    let d = new Date(r.start_date);
    const end = new Date(r.end_date);
    while (d <= end) {
      takenDays.add(d.toISOString().slice(0, 10));
      d = new Date(d.getTime() + 86_400_000);
    }
  }
  const holidayMap = new Map(holidays.map((h) => [h.date, h.name]));

  return (
    <div className="min-h-screen bg-almond pb-20">
      <header className="bg-primary text-white px-8 py-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-serif">Hola, {member?.full_name}</h1>
          <p className="text-xs opacity-70">Portal Equipo · {year}</p>
        </div>
        <button onClick={() => signOut()} className="text-xs uppercase tracking-widest underline">
          Cerrar sesión
        </button>
      </header>

      <div className="max-w-5xl mx-auto px-6 py-10 space-y-10">
        {/* Stats cards */}
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-white rounded-2xl p-6 shadow-sm border border-primary/5">
            <p className="text-xs uppercase tracking-widest text-primary/50">Días totales</p>
            <p className="text-4xl font-serif text-primary mt-2">{member?.total_days_per_year}</p>
          </div>
          <div className="bg-white rounded-2xl p-6 shadow-sm border border-primary/5">
            <p className="text-xs uppercase tracking-widest text-primary/50">Días tomados</p>
            <p className="text-4xl font-serif text-primary mt-2">{daysTaken}</p>
          </div>
          <div className="bg-white rounded-2xl p-6 shadow-sm border border-primary/5">
            <p className="text-xs uppercase tracking-widest text-primary/50">Disponibles</p>
            <p className={`text-4xl font-serif mt-2 ${daysRemaining < 0 ? "text-red-600" : "text-green-700"}`}>
              {daysRemaining}
            </p>
          </div>
        </div>

        {/* Request form */}
        <section className="bg-white rounded-2xl p-8 shadow-sm border border-primary/5">
          <h2 className="text-xl font-serif text-primary mb-6">Solicitar días libres</h2>
          <form onSubmit={submit} className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="text-xs text-primary/60 block mb-1">Desde</label>
              <input
                type="date"
                required
                min={todayIso()}
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full border border-primary/20 rounded-lg px-3 py-2"
              />
            </div>
            <div>
              <label className="text-xs text-primary/60 block mb-1">Hasta</label>
              <input
                type="date"
                required
                min={startDate}
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full border border-primary/20 rounded-lg px-3 py-2"
              />
            </div>
            <div className="md:col-span-2">
              <label className="text-xs text-primary/60 block mb-1">Motivo (opcional)</label>
              <input
                type="text"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Ej: Boda hermano"
                className="w-full border border-primary/20 rounded-lg px-3 py-2"
              />
            </div>
            <div className="md:col-span-4 flex items-center justify-between gap-4">
              <p className="text-xs text-primary/60">
                Total a pedir: <b>{diffDaysInclusive(startDate, endDate)}</b> días.
                Auto-aprobado, Andreas recibe notificación por email.
              </p>
              <button
                type="submit"
                disabled={submitting}
                className="bg-primary text-white px-6 py-2 rounded-full font-bold text-sm disabled:opacity-50"
              >
                {submitting ? "Enviando…" : "Solicitar"}
              </button>
            </div>
            {submitErr && <p className="md:col-span-4 text-red-600 text-sm">{submitErr}</p>}
          </form>
        </section>

        {/* Year calendar */}
        <section className="bg-white rounded-2xl p-6 shadow-sm border border-primary/5">
          <h2 className="text-xl font-serif text-primary mb-6">Calendario {year}</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
            {Array.from({ length: 12 }).map((_, mIdx) => {
              const first = new Date(year, mIdx, 1);
              const monthName = first.toLocaleDateString("es-ES", { month: "long" });
              const daysInMonth = new Date(year, mIdx + 1, 0).getDate();
              const startWeekday = (first.getDay() + 6) % 7; // Mon=0
              return (
                <div key={mIdx} className="border border-primary/10 rounded-xl p-3">
                  <p className="text-sm font-bold text-primary capitalize mb-2">{monthName}</p>
                  <div className="grid grid-cols-7 gap-1 text-[10px] text-primary/40 mb-1">
                    {["L", "M", "X", "J", "V", "S", "D"].map((d) => (
                      <span key={d} className="text-center">{d}</span>
                    ))}
                  </div>
                  <div className="grid grid-cols-7 gap-1">
                    {Array.from({ length: startWeekday }).map((_, i) => (
                      <span key={`b${i}`} />
                    ))}
                    {Array.from({ length: daysInMonth }).map((_, i) => {
                      const day = i + 1;
                      const iso = `${year}-${String(mIdx + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
                      const isHoliday = holidayMap.has(iso);
                      const isTaken = takenDays.has(iso);
                      return (
                        <span
                          key={day}
                          title={
                            isHoliday
                              ? `${holidayMap.get(iso)} (festivo)`
                              : isTaken
                              ? "Día solicitado"
                              : iso
                          }
                          className={`text-center text-[10px] py-1 rounded ${
                            isTaken
                              ? "bg-primary text-white"
                              : isHoliday
                              ? "bg-red-100 text-red-700"
                              : "text-primary/70"
                          }`}
                        >
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

        {/* Request history */}
        <section className="bg-white rounded-2xl p-6 shadow-sm border border-primary/5">
          <h2 className="text-xl font-serif text-primary mb-4">Mis solicitudes</h2>
          {requests.length === 0 ? (
            <p className="text-sm text-primary/50">Aún no tienes solicitudes.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-xs uppercase tracking-widest text-primary/50">
                <tr>
                  <th className="text-left py-2">Desde</th>
                  <th className="text-left py-2">Hasta</th>
                  <th className="text-left py-2">Días</th>
                  <th className="text-left py-2">Motivo</th>
                  <th className="text-left py-2">Estado</th>
                  <th />
                </tr>
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
                        {!isPast && (
                          <button onClick={() => remove(r.id)} className="text-xs text-red-600 underline">
                            Cancelar
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </section>
      </div>
    </div>
  );
}
