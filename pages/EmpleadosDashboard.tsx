/**
 * /empleados/dashboard — Fichaje diario del empleado.
 *
 * Diseño deliberadamente MÍNIMO (regla de Andreas): el empleado solo pulsa
 * Check-in / Check-out, hace UNA foto y se sube. El resto (ubicación GPS,
 * timestamp) lo capturamos del dispositivo automáticamente. Sin selección de
 * sitio, sin pasos extra. Pensado para iPhone (Safari iOS, HTTPS).
 *
 * Almacenamiento (Supabase):
 *   - foto → bucket privado `attendance` en `${user.id}/...`
 *   - registro → tabla `attendance` (RLS: solo el propio empleado inserta)
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth-context';
import { hasPermission } from '../lib/permissions';
import VacationCalendar from '../components/VacationCalendar';
import Footer from '../components/Footer';

type FichajeType = 'check_in' | 'break_start' | 'break_end' | 'check_out';

const FICHAJE_LABEL: Record<FichajeType, string> = {
  check_in: 'Entrada',
  break_start: 'Inicio pausa',
  break_end: 'Fin pausa',
  check_out: 'Salida',
};
const FICHAJE_MSG: Record<FichajeType, string> = {
  check_in: '¡Entrada registrada! Buen trabajo 👷',
  break_start: 'Pausa iniciada 🍽️ Buen provecho',
  break_end: 'Pausa terminada, a seguir 💪',
  check_out: '¡Salida registrada! Hasta luego 👋',
};

interface TodayRow {
  type: FichajeType;
  created_at: string;
}

function fmtTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '--:--';
  }
}

const EmpleadosDashboard: React.FC = () => {
  const navigate = useNavigate();
  const { user, loading, signOut } = useAuth();

  const [today, setToday] = useState<TodayRow[]>([]);
  const [canUploadReports, setCanUploadReports] = useState(false);
  const [employee, setEmployee] = useState<{ id: string; full_name: string | null } | null>(null);
  const [showInstructions, setShowInstructions] = useState(false);
  const [capture, setCapture] = useState<FichajeType | null>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{ ok: boolean; msg: string } | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const geoRef = useRef<{ latitude: number | null; longitude: number | null; accuracy: number | null }>({
    latitude: null,
    longitude: null,
    accuracy: null,
  });

  useEffect(() => {
    if (!loading && !user) navigate('/empleados', { replace: true });
  }, [user, loading, navigate]);

  const loadToday = useCallback(async () => {
    if (!user) return;
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const { data } = await supabase
      .from('attendance')
      .select('type, created_at')
      .eq('user_id', user.id)
      .gte('created_at', start.toISOString())
      .order('created_at', { ascending: true });
    setToday((data as TodayRow[]) ?? []);
  }, [user]);

  useEffect(() => {
    void loadToday();
  }, [loadToday]);

  // Permisos del empleado (p.ej. subir reportes de obra — solo el PM).
  useEffect(() => {
    if (!user?.email) return;
    void (async () => {
      const { data } = await supabase
        .from('employees')
        .select('id, full_name, can_upload_reports, permissions')
        .eq('email', user.email)
        .maybeSingle();
      setCanUploadReports(hasPermission(data, 'upload_reports'));
      if (data?.id) setEmployee({ id: data.id as string, full_name: (data.full_name as string) ?? null });
    })();
  }, [user]);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  // Pulsar Check-in/out → pide GPS (en paralelo) y abre la cámara.
  const startCapture = async (type: FichajeType) => {
    setCapture(type);
    navigator.geolocation?.getCurrentPosition(
      (pos) => {
        geoRef.current = {
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        };
      },
      () => {
        geoRef.current = { latitude: null, longitude: null, accuracy: null };
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
    } catch {
      setToast({ ok: false, msg: 'No se pudo abrir la cámara. Da permiso y reintenta.' });
      setCapture(null);
    }
  };

  const cancelCapture = useCallback(() => {
    stopCamera();
    setCapture(null);
  }, [stopCamera]);

  // Capturar foto del vídeo en vivo y subir directamente (sin pasos extra).
  const captureAndSubmit = async () => {
    const video = videoRef.current;
    if (!video || !user || !capture) return;
    // La foto solo sirve para identificar el sitio (no calidad): la reducimos a
    // máx 720px de ancho y calidad baja para que ocupe poquísimo en Supabase.
    const canvas = document.createElement('canvas');
    const MAX_W = 720;
    const vw = video.videoWidth || 720;
    const vh = video.videoHeight || 960;
    const scale = Math.min(1, MAX_W / vw);
    canvas.width = Math.round(vw * scale);
    canvas.height = Math.round(vh * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const blob: Blob | null = await new Promise((res) => canvas.toBlob((b) => res(b), 'image/jpeg', 0.45));
    if (!blob) {
      setToast({ ok: false, msg: 'No se pudo capturar la foto. Reintenta.' });
      return;
    }
    stopCamera();
    setBusy(true);
    try {
      const now = new Date();
      const path = `${user.id}/${capture}-${now.getTime()}.jpg`;
      const up = await supabase.storage.from('attendance').upload(path, blob, {
        contentType: 'image/jpeg',
        upsert: false,
      });
      if (up.error) throw up.error;
      const { error } = await supabase.from('attendance').insert({
        user_id: user.id,
        employee_email: user.email,
        type: capture,
        photo_path: path,
        latitude: geoRef.current.latitude,
        longitude: geoRef.current.longitude,
        accuracy: geoRef.current.accuracy,
        client_timestamp: now.toISOString(),
      });
      if (error) throw error;
      setToast({ ok: true, msg: FICHAJE_MSG[capture] });
      setCapture(null);
      await loadToday();
    } catch {
      setToast({ ok: false, msg: 'No se pudo guardar el fichaje. Reintenta.' });
      setCapture(null);
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => () => stopCamera(), [stopCamera]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  const lastOf = (t: FichajeType) => [...today].reverse().find((r) => r.type === t);
  const lastIn = lastOf('check_in');
  const lastOut = lastOf('check_out');
  const lastBreakStart = lastOf('break_start');
  const lastBreakEnd = lastOf('break_end');
  // Si hay inicio de pausa más reciente que su fin (o no hay fin), está EN pausa.
  const onBreak = !!lastBreakStart && (!lastBreakEnd || new Date(lastBreakStart.created_at) > new Date(lastBreakEnd.created_at));

  if (loading || !user) {
    return (
      <div className="min-h-screen bg-almond flex items-center justify-center">
        <span className="material-symbols-outlined animate-spin text-3xl text-primary">refresh</span>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-almond px-5 py-6 md:py-10">
      <div className="max-w-md mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-widest text-primary/40">Team</p>
            <h1 className="text-xl font-serif text-primary leading-tight truncate">{user.email}</h1>
          </div>
          <div className="flex gap-2 shrink-0">
            <button
              onClick={() => setShowInstructions(true)}
              aria-label="Instrucciones"
              className="w-10 h-10 rounded-full bg-white border border-primary/10 text-primary flex items-center justify-center shadow-sm hover:bg-primary hover:text-white transition"
            >
              <span className="material-symbols-outlined">info</span>
            </button>
            <button
              onClick={async () => { try { await signOut(); } catch { /* ignore */ } window.location.href = '/empleados'; }}
              aria-label="Salir"
              className="w-10 h-10 rounded-full bg-white border border-primary/10 text-primary/60 flex items-center justify-center shadow-sm hover:bg-gray-100 transition"
            >
              <span className="material-symbols-outlined">logout</span>
            </button>
          </div>
        </div>

        <div className="bg-white rounded-3xl p-5 shadow-sm border border-primary/5 mb-6">
          <div className="flex items-center justify-between mb-3">
            <p className="text-[10px] font-black uppercase tracking-widest text-primary/40">Hoy</p>
            {onBreak && (
              <span className="text-[10px] font-black uppercase tracking-widest text-amber-600 bg-amber-50 px-2 py-1 rounded-full">En pausa 🍽️</span>
            )}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-primary/50 font-bold mb-1">Entrada</p>
              <p className="text-2xl font-serif text-primary">{lastIn ? fmtTime(lastIn.created_at) : '—'}</p>
            </div>
            <div>
              <p className="text-xs text-primary/50 font-bold mb-1">Salida</p>
              <p className="text-2xl font-serif text-primary">{lastOut ? fmtTime(lastOut.created_at) : '—'}</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4 mt-4 pt-4 border-t border-primary/5">
            <div>
              <p className="text-xs text-primary/50 font-bold mb-1">Inicio pausa</p>
              <p className="text-lg font-serif text-primary">{lastBreakStart ? fmtTime(lastBreakStart.created_at) : '—'}</p>
            </div>
            <div>
              <p className="text-xs text-primary/50 font-bold mb-1">Fin pausa</p>
              <p className="text-lg font-serif text-primary">{lastBreakEnd ? fmtTime(lastBreakEnd.created_at) : '—'}</p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3">
          <button
            onClick={() => startCapture('check_in')}
            className="bg-green-600 text-white rounded-3xl py-6 font-bold uppercase tracking-widest text-sm shadow-lg hover:bg-green-700 transition flex items-center justify-center gap-3"
          >
            <span className="material-symbols-outlined text-2xl">login</span>
            Check-in (Entrada)
          </button>
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => startCapture('break_start')}
              className="bg-amber-500 text-white rounded-2xl py-4 font-bold uppercase tracking-widest text-xs shadow hover:bg-amber-600 transition flex items-center justify-center gap-2"
            >
              <span className="text-base">🍽️</span>
              Inicio pausa
            </button>
            <button
              onClick={() => startCapture('break_end')}
              className="bg-amber-600 text-white rounded-2xl py-4 font-bold uppercase tracking-widest text-xs shadow hover:bg-amber-700 transition flex items-center justify-center gap-2"
            >
              <span className="text-base">▶️</span>
              Fin pausa
            </button>
          </div>
          <button
            onClick={() => startCapture('check_out')}
            className="bg-primary text-white rounded-3xl py-6 font-bold uppercase tracking-widest text-sm shadow-lg hover:bg-black transition flex items-center justify-center gap-3"
          >
            <span className="material-symbols-outlined text-2xl">logout</span>
            Check-out (Salida)
          </button>
        </div>

        <p className="text-center text-xs text-primary/40 mt-5">
          Pulsa, haz una foto de dónde estás y listo. La hora y la ubicación se guardan solas. Si olvidas marcar algo, puedes ficharlo igualmente cuando quieras.
        </p>

        {/* Calendario de vacaciones del equipo (visible para todos) */}
        {employee && (
          <div className="mt-8">
            <VacationCalendar
              employeeId={employee.id}
              employeeEmail={user.email ?? ''}
              employeeName={employee.full_name ?? user.email ?? ''}
            />
          </div>
        )}

        {/* Hub Team: secciones según permisos del empleado */}
        {canUploadReports && (
          <div className="mt-8 grid grid-cols-1 gap-3">
            <button
              onClick={() => navigate('/equipo/upload')}
              className="bg-white rounded-2xl p-4 shadow-sm border border-primary/5 flex items-center gap-3 text-left hover:border-primary/20 transition"
            >
              <span className="material-symbols-outlined text-primary">construction</span>
              <span className="flex-1">
                <span className="block font-bold text-primary text-sm">Reportes de obra</span>
                <span className="block text-xs text-primary/50">Sube el avance por proyecto</span>
              </span>
              <span className="material-symbols-outlined text-primary/30">chevron_right</span>
            </button>
          </div>
        )}
      </div>

      {/* Cámara a pantalla completa */}
      {capture && (
        <div className="fixed inset-0 z-50 bg-black flex flex-col">
          <div className="flex items-center justify-between p-4 text-white">
            <span className="font-bold uppercase tracking-widest text-xs">
              {FICHAJE_LABEL[capture]} · Haz la foto
            </span>
            <button onClick={cancelCapture} aria-label="Cerrar" disabled={busy}>
              <span className="material-symbols-outlined">close</span>
            </button>
          </div>
          <div className="flex-1 flex items-center justify-center overflow-hidden">
            <video ref={videoRef} playsInline muted className="max-h-full max-w-full object-contain" />
          </div>
          <div className="p-8 flex items-center justify-center">
            <button
              onClick={captureAndSubmit}
              disabled={busy}
              className="w-20 h-20 rounded-full bg-white border-4 border-white/40 shadow-xl active:scale-95 transition disabled:opacity-60 flex items-center justify-center"
              aria-label="Hacer foto y fichar"
            >
              {busy && <span className="material-symbols-outlined animate-spin text-2xl text-primary">refresh</span>}
            </button>
          </div>
          {busy && <p className="text-center text-white/80 text-sm pb-6">Guardando fichaje…</p>}
        </div>
      )}

      {/* Instrucciones */}
      {showInstructions && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-end md:items-center justify-center p-4" onClick={() => setShowInstructions(false)}>
          <div className="bg-white rounded-3xl p-6 max-w-md w-full" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-serif text-primary">Cómo fichar</h2>
              <button onClick={() => setShowInstructions(false)} aria-label="Cerrar">
                <span className="material-symbols-outlined text-primary/50">close</span>
              </button>
            </div>
            <ul className="space-y-3 text-sm text-primary/70">
              <li className="flex gap-2"><span className="material-symbols-outlined text-green-600 text-base">login</span> Al llegar a tu lugar de trabajo (oficina, obra, proyecto, cliente o primera reunión del día) pulsa <b>Check-in</b> y haz una foto del sitio.</li>
              <li className="flex gap-2"><span className="material-symbols-outlined text-primary text-base">logout</span> Al terminar (salir de la oficina o de la última obra) pulsa <b>Check-out</b> y haz otra foto.</li>
              <li className="flex gap-2"><span className="material-symbols-outlined text-base">bolt</span> Es de 2 segundos: pulsas, foto y ya. La hora y la ubicación se guardan automáticamente.</li>
              <li className="flex gap-2"><span className="text-base">⏰</span> Horario habitual 10:00–18:00. Hazlo cada día que trabajes (también sábados/domingos si vas).</li>
            </ul>
          </div>
        </div>
      )}

      {toast && (
        <div className={`fixed bottom-5 left-1/2 -translate-x-1/2 z-[60] px-5 py-3 rounded-2xl text-white font-bold text-sm shadow-xl ${toast.ok ? 'bg-green-600' : 'bg-red-600'}`}>
          {toast.msg}
        </div>
      )}

      {/* Footer compartido (rompe el padding lateral del contenedor con -mx-5) */}
      <div className="-mx-5 mt-12">
        <Footer />
      </div>
    </div>
  );
};

export default EmpleadosDashboard;
