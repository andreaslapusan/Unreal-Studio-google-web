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
import { useTranslation } from 'react-i18next';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth-context';
import { hasPermission } from '../lib/permissions';
import VacationCalendar from '../components/VacationCalendar';
import Footer from '../components/Footer';
import PortalHeader from '../components/PortalHeader';
import ConstructionReportModal from '../components/ConstructionReportModal';

type FichajeType = 'check_in' | 'break_start' | 'break_end' | 'check_out';

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
  const { t } = useTranslation();
  const { user, loading, signOut } = useAuth();
  const fichajeLabel = (type: FichajeType) => t(`empleados.fichaje.label.${type}`);
  const fichajeMsg = (type: FichajeType) => t(`empleados.fichaje.msg.${type}`);

  const [today, setToday] = useState<TodayRow[]>([]);
  const [canUploadReports, setCanUploadReports] = useState(false);
  const [canEditProperties, setCanEditProperties] = useState(false);
  const [employee, setEmployee] = useState<{ id: string; full_name: string | null; work_start_time: string | null; work_end_time: string | null; work_days: number[] | null } | null>(null);
  const [showInstructions, setShowInstructions] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [capture, setCapture] = useState<FichajeType | null>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{ ok: boolean; msg: string } | null>(null);
  // Error de cámara persistente (con instrucciones para re-permitir + reintentar).
  const [cameraError, setCameraError] = useState<{ type: FichajeType; title: string; body: string } | null>(null);

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
        .select('id, full_name, can_upload_reports, permissions, work_start_time, work_end_time, work_days')
        .eq('email', user.email)
        .maybeSingle();
      setCanUploadReports(hasPermission(data, 'upload_reports'));
      setCanEditProperties(hasPermission(data, 'edit_properties'));
      if (data?.id) setEmployee({
        id: data.id as string,
        full_name: (data.full_name as string) ?? null,
        work_start_time: (data.work_start_time as string) ?? null,
        work_end_time: (data.work_end_time as string) ?? null,
        work_days: (data.work_days as number[]) ?? null,
      });
    })();
  }, [user]);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  // Pulsar Check-in/out → pide GPS (en paralelo) y abre la cámara.
  const startCapture = async (type: FichajeType) => {
    setCameraError(null);
    // Libera cualquier stream que quedara abierto de un intento anterior — si no,
    // la cámara queda "ocupada" y getUserMedia falla en el 2º intento.
    stopCamera();
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
    } catch (err) {
      // Mensaje según el motivo: permiso bloqueado vs sin cámara.
      const name = (err as { name?: string })?.name ?? '';
      if (name === 'NotAllowedError' || name === 'SecurityError') {
        setCameraError({
          type,
          title: t('empleados.camera.errors.blockedTitle'),
          body: t('empleados.camera.errors.blockedBody'),
        });
      } else if (name === 'NotReadableError' || name === 'AbortError') {
        setCameraError({
          type,
          title: t('empleados.camera.errors.busyTitle'),
          body: t('empleados.camera.errors.busyBody'),
        });
      } else if (name === 'NotFoundError' || name === 'OverconstrainedError') {
        setCameraError({
          type,
          title: t('empleados.camera.errors.notFoundTitle'),
          body: t('empleados.camera.errors.notFoundBody'),
        });
      } else {
        setCameraError({
          type,
          title: t('empleados.camera.errors.genericTitle'),
          body: t('empleados.camera.errors.genericBody'),
        });
      }
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
      setToast({ ok: false, msg: t('empleados.toast.photoFailed') });
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
      setToast({ ok: true, msg: fichajeMsg(capture) });
      setCapture(null);
      await loadToday();
    } catch {
      setToast({ ok: false, msg: t('empleados.toast.saveFailed') });
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
    <div className="min-h-screen bg-almond">
      <PortalHeader
        subtitle={user.email ?? t('empleados.header.subtitleFallback')}
        onLogout={async () => { try { await signOut(); } catch { /* ignore */ } window.location.href = '/empleados'; }}
        extra={
          <button
            onClick={() => setShowInstructions(true)}
            aria-label={t('empleados.header.instructions')}
            className="w-9 h-9 rounded-full bg-white border border-primary/10 text-primary flex items-center justify-center shadow-sm hover:bg-primary hover:text-white transition"
          >
            <span className="material-symbols-outlined text-[20px]">info</span>
          </button>
        }
      />
      <div className="px-5 py-6 md:py-10">
      <div className="max-w-md mx-auto">
        <div className="bg-white rounded-3xl p-5 shadow-sm border border-primary/5 mb-6">
          <div className="flex items-center justify-between mb-3">
            <p className="text-[10px] font-black uppercase tracking-widest text-primary/40">{t('empleados.today.title')}</p>
            {onBreak && (
              <span className="text-[10px] font-black uppercase tracking-widest text-amber-600 bg-amber-50 px-2 py-1 rounded-full">{t('empleados.today.onBreak')}</span>
            )}
          </div>
          {employee?.work_start_time && (
            <div className="mb-3 flex items-center gap-2 text-[11px] text-primary/50">
              <span className="material-symbols-outlined text-[14px]">schedule</span>
              <span>
                {t('empleados.yourSchedule', 'Tu horario')}: <b className="text-primary/70">{(employee.work_start_time || '').slice(0,5)}{employee.work_end_time ? `–${(employee.work_end_time||'').slice(0,5)}` : ''}</b>
                {employee.work_days && employee.work_days.length > 0 && (
                  <> · {employee.work_days.map((d) => ['','L','M','X','J','V','S','D'][d]).join(' ')}</>
                )}
              </span>
            </div>
          )}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-primary/50 font-bold mb-1">{t('empleados.today.checkIn')}</p>
              <p className="text-2xl font-serif text-primary">{lastIn ? fmtTime(lastIn.created_at) : '—'}</p>
            </div>
            <div>
              <p className="text-xs text-primary/50 font-bold mb-1">{t('empleados.today.checkOut')}</p>
              <p className="text-2xl font-serif text-primary">{lastOut ? fmtTime(lastOut.created_at) : '—'}</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4 mt-4 pt-4 border-t border-primary/5">
            <div>
              <p className="text-xs text-primary/50 font-bold mb-1">{t('empleados.today.breakStart')}</p>
              <p className="text-lg font-serif text-primary">{lastBreakStart ? fmtTime(lastBreakStart.created_at) : '—'}</p>
            </div>
            <div>
              <p className="text-xs text-primary/50 font-bold mb-1">{t('empleados.today.breakEnd')}</p>
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
            {t('empleados.buttons.checkIn')}
          </button>
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => startCapture('break_start')}
              className="bg-amber-500 text-white rounded-2xl py-4 font-bold uppercase tracking-widest text-xs shadow hover:bg-amber-600 transition flex items-center justify-center gap-2"
            >
              <span className="material-symbols-outlined text-[20px]">lunch_dining</span>
              {t('empleados.buttons.breakStart')}
            </button>
            <button
              onClick={() => startCapture('break_end')}
              className="bg-amber-600 text-white rounded-2xl py-4 font-bold uppercase tracking-widest text-xs shadow hover:bg-amber-700 transition flex items-center justify-center gap-2"
            >
              <span className="material-symbols-outlined text-[20px]">play_arrow</span>
              {t('empleados.buttons.breakEnd')}
            </button>
          </div>
          <button
            onClick={() => startCapture('check_out')}
            className="bg-primary text-white rounded-3xl py-6 font-bold uppercase tracking-widest text-sm shadow-lg hover:bg-black transition flex items-center justify-center gap-3"
          >
            <span className="material-symbols-outlined text-2xl">logout</span>
            {t('empleados.buttons.checkOut')}
          </button>
        </div>

        <p className="text-center text-xs text-primary/40 mt-5">
          {t('empleados.help')}
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

        {/* Hub Team: solo subir reportes de obra (editar fichas se quitó: mala idea) */}
        {canUploadReports && (
          <div className="mt-8 grid grid-cols-1 gap-3">
            <button
              onClick={() => setShowReportModal(true)}
              className="bg-white rounded-2xl p-4 shadow-sm border border-primary/5 flex items-center gap-3 text-left hover:border-primary/20 transition"
            >
              <span className="material-symbols-outlined text-primary">construction</span>
              <span className="flex-1">
                <span className="block font-bold text-primary text-sm">{t('empleados.reports.title')}</span>
                <span className="block text-xs text-primary/50">{t('empleados.reports.subtitle')}</span>
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
              {fichajeLabel(capture)} · {t('empleados.camera.takePhotoSuffix')}
            </span>
            <button onClick={cancelCapture} aria-label={t('empleados.camera.close')} disabled={busy}>
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
              aria-label={t('empleados.camera.takePhotoAria')}
            >
              {busy && <span className="material-symbols-outlined animate-spin text-2xl text-primary">refresh</span>}
            </button>
          </div>
          {busy && <p className="text-center text-white/80 text-sm pb-6">{t('empleados.camera.saving')}</p>}
        </div>
      )}

      {/* Instrucciones */}
      {showInstructions && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-end md:items-center justify-center p-4" onClick={() => setShowInstructions(false)}>
          <div className="bg-white rounded-3xl p-6 max-w-md w-full" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-serif text-primary">{t('empleados.instructions.title')}</h2>
              <button onClick={() => setShowInstructions(false)} aria-label={t('empleados.instructions.close')}>
                <span className="material-symbols-outlined text-primary/50">close</span>
              </button>
            </div>
            <ul className="space-y-3 text-sm text-primary/70">
              {(t('empleados.instructions.items', { returnObjects: true }) as string[]).map((item, i) => {
                const icons = [
                  <span key="i" className="material-symbols-outlined text-green-600 text-base">login</span>,
                  <span key="i" className="material-symbols-outlined text-primary text-base">logout</span>,
                  <span key="i" className="material-symbols-outlined text-base">bolt</span>,
                  <span key="i" className="text-base">⏰</span>,
                ];
                return (
                  <li key={i} className="flex gap-2">
                    {icons[i]}{' '}
                    <span dangerouslySetInnerHTML={{ __html: item }} />
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      )}

      {showReportModal && (
        <ConstructionReportModal postedBy={user.email ?? user.id} onClose={() => setShowReportModal(false)} />
      )}

      {toast && (
        <div className={`fixed bottom-5 left-1/2 -translate-x-1/2 z-[60] px-5 py-3 rounded-2xl text-white font-bold text-sm shadow-xl ${toast.ok ? 'bg-green-600' : 'bg-red-600'}`}>
          {toast.msg}
        </div>
      )}

      {/* Error de cámara: tarjeta persistente con instrucciones + reintentar */}
      {cameraError && (
        <div className="fixed inset-0 z-[70] bg-black/60 flex items-center justify-center px-6" onClick={() => setCameraError(null)}>
          <div className="bg-white rounded-3xl p-7 max-w-sm w-full shadow-2xl text-center" onClick={(e) => e.stopPropagation()}>
            <div className="text-5xl mb-3">📷</div>
            <h3 className="text-xl font-serif text-primary mb-2">{cameraError.title}</h3>
            <p className="text-sm text-primary/70 leading-relaxed mb-6">{cameraError.body}</p>
            <div className="flex flex-col gap-2">
              <button
                onClick={() => { const t = cameraError.type; setCameraError(null); void startCapture(t); }}
                className="bg-primary text-white py-3 rounded-xl font-bold uppercase tracking-widest text-xs hover:bg-black transition"
              >
                Reintentar
              </button>
              <button
                onClick={() => setCameraError(null)}
                className="text-primary/50 py-2 text-xs font-bold uppercase tracking-widest hover:text-primary transition"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Footer compartido (rompe el padding lateral del contenedor con -mx-5) */}
      <div className="-mx-5 mt-12">
        <Footer />
      </div>
      </div>
    </div>
  );
};

export default EmpleadosDashboard;
