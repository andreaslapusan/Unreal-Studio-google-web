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
import { uiLocale, weekdaysFor } from '../lib/dateLocale';
import { realEmailOf } from '../lib/portalAuth';
import { baliTime, baliToday, baliDayStartISO } from '../lib/timezone';
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
  return baliTime(iso) || '--:--';
}

// Frase del día para el equipo (humor/Murphy/motivación). MISMA frase cada día en
// los 4 idiomas (es/en/ro/id) — es la misma cita traducida, no una distinta por idioma.
type Quote = { es: string; en: string; ro: string; id: string };
const TEAM_QUOTES: Quote[] = [
  { es: 'Ley de Murphy: si algo puede salir mal, esperará a que el cliente esté mirando.', en: "Murphy's law: if it can go wrong, it'll wait until the client is watching.", ro: 'Legea lui Murphy: dacă ceva poate merge prost, va aștepta să se uite clientul.', id: 'Hukum Murphy: kalau bisa salah, ia menunggu sampai klien melihat.' },
  { es: 'El café es el puente entre "no puedo" y "ya está hecho".', en: 'Coffee: the bridge between "I can\'t" and "it\'s done".', ro: 'Cafeaua: puntea dintre "nu pot" și "gata".', id: 'Kopi: jembatan antara "tidak bisa" dan "selesai".' },
  { es: 'Trabajar en equipo divide el trabajo y multiplica los memes.', en: 'Teamwork divides the work and multiplies the memes.', ro: 'Munca în echipă împarte munca și înmulțește meme-urile.', id: 'Kerja tim membagi pekerjaan dan melipatgandakan meme.' },
  { es: 'Si funciona a la primera, desconfía: revísalo dos veces.', en: 'If it works on the first try, be suspicious. Check it twice.', ro: 'Dacă merge din prima, fii suspicios: verifică de două ori.', id: 'Kalau berhasil sekali coba, curigai. Periksa dua kali.' },
  { es: 'La reunión que pudo ser un email… hoy igual sí es un email.', en: 'The meeting that could have been an email… today maybe it is one.', ro: 'Ședința care putea fi un email… azi poate chiar este.', id: 'Rapat yang seharusnya cukup email… hari ini mungkin memang email.' },
  { es: 'Nada motiva más que una fecha de entrega de ayer.', en: 'Nothing motivates like a deadline that was yesterday.', ro: 'Nimic nu motivează ca un termen care era ieri.', id: 'Tidak ada yang lebih memotivasi dari tenggat kemarin.' },
  { es: 'El plan perfecto dura hasta el primer mensaje de WhatsApp.', en: 'The perfect plan lasts until the first WhatsApp message.', ro: 'Planul perfect ține până la primul mesaj de WhatsApp.', id: 'Rencana sempurna bertahan sampai pesan WhatsApp pertama.' },
  { es: 'Hazlo bien una vez y serás el responsable para siempre.', en: 'Do it well once and you own it forever.', ro: 'Fă-o bine o dată și ești responsabil pe veci.', id: 'Lakukan dengan baik sekali, jadi tanggung jawabmu selamanya.' },
  { es: 'Hoy es un buen día para ser un poco leyenda.', en: 'Today is a good day to be a bit of a legend.', ro: 'Azi e o zi bună să fii un pic legendă.', id: 'Hari ini hari yang baik untuk jadi sedikit legenda.' },
  { es: 'Sonríe: gasta menos calorías que quejarse.', en: 'Smile: it burns fewer calories than complaining.', ro: 'Zâmbește: arde mai puține calorii decât plânsul.', id: 'Tersenyumlah: lebih hemat kalori daripada mengeluh.' },
  { es: 'Cada gran obra empezó con un "¿y si lo probamos?".', en: 'Every great build started with "what if we try it?".', ro: 'Orice lucrare mare a început cu "dacă am încerca?".', id: 'Setiap karya besar dimulai dari "bagaimana kalau dicoba?".' },
  { es: 'Si todo está bajo control, vas demasiado lento. 😉', en: "If everything is under control, you're going too slow. 😉", ro: 'Dacă totul e sub control, mergi prea încet. 😉', id: 'Kalau semua terkendali, kamu terlalu lambat. 😉' },
  { es: 'No hay problema que un buen plan (y un café) no mejore.', en: "No problem a good plan (and a coffee) can't improve.", ro: 'Nicio problemă pe care un plan bun (și o cafea) să n-o îmbunătățească.', id: 'Tidak ada masalah yang tak membaik dengan rencana bagus (dan kopi).' },
  { es: 'Equipo Unreal: convertimos el caos en villas.', en: 'Team Unreal: we turn chaos into villas.', ro: 'Echipa Unreal: transformăm haosul în vile.', id: 'Tim Unreal: kami mengubah kekacauan jadi vila.' },
  { es: 'Recuerda: tú haces que esto funcione. Gracias por ello.', en: 'Remember: you make this work. Thank you for that.', ro: 'Ține minte: tu faci ca asta să meargă. Mulțumim.', id: 'Ingat: kamu yang membuat ini berjalan. Terima kasih.' },
];
function quoteLang(l: string): keyof Quote { return (['es', 'en', 'ro', 'id'].includes(l) ? l : 'es') as keyof Quote; }
// Frases de la cámara de fichaje. Se generan combinando una BASE de frases por
// idioma (~42) con una rotación de emojis (24) → 1.008 combinaciones DISTINTAS.
// Salen EN ORDEN (índice global del servidor; local si offline), así no se repiten
// ni entre personas hasta agotar las 1.000+.
const SMILE_CORE_ES = ['¡Sonríe!', 'Di "Bali"', 'Cara de crack', 'Hoy lo petas', 'Buen rollito', 'A brillar', 'Equipo Unreal', '¡Guapo/a!', 'Energía top', 'Sonrisa de campeón', 'Modo leyenda', 'Pura vibra', 'A por todas', 'Crack del fichaje', 'Marca de la casa', 'Hoy construyes villas', 'Café y a darlo todo', 'Mírate, qué arte', 'Día de 10', '¡Sales en la foto!', 'Vibras de isla', 'Motor del equipo', 'Pura actitud', 'Nivel pro', 'Hoy se brilla', 'El mejor del turno', 'Imparable', 'Pura buena onda', 'Sonríe a la cámara', 'Actitud Unreal', 'Más cerca de la villa', 'Profesional y con flow', 'Buenos días, fenómeno', 'Tu mejor versión', 'Energía de obra', 'Sonrisa de portada', '¡Vamos, equipo!', 'A comerse el día', 'Eres clave', 'Crack total', 'Bali te espera', 'Sonríe, que mola'];
const SMILE_CORE_EN = ['Smile!', 'Say "Bali"', 'Looking great', "You've got this", 'Good vibes', 'Shine on', 'Team Unreal', "Lookin' good!", 'Top energy', "Champion's smile", 'Legend mode', 'Pure vibes', "Let's go", 'Clock-in champ', 'Signature look', 'Building villas today', 'Coffee and crush it', 'Look at that style', 'A perfect 10', "You're on camera", 'Island vibes', 'You drive this team', 'Pure attitude', 'Pro level', 'Time to shine', 'Best of the shift', 'Unstoppable', 'Good energy only', 'Smile for the cam', 'Unreal attitude', 'Closer to the villa', 'Pro with flow', 'Hey there, star', 'Your best self', 'Build-site energy', 'Cover-shot smile', "Let's go, team!", 'Own the day', "You're key", 'Total legend', 'Bali awaits', 'Smile, it rules'];
const SMILE_CORE_RO = ['Zâmbește!', 'Zi "Bali"', 'Arăți grozav', 'Poți s-o faci', 'Vibe bun', 'Strălucește', 'Echipa Unreal', 'Arăți bine!', 'Energie de top', 'Zâmbet de campion', 'Mod legendă', 'Vibe pur', "Hai s-o facem", 'Campion la pontaj', 'Marca casei', 'Azi construim vile', 'Cafea și spor', 'Ce stil', 'Zi de 10', 'Ești în poză', 'Vibe de insulă', 'Tu miști echipa', 'Pură atitudine', 'Nivel pro', 'Azi străluciți', 'Cel mai bun din tură', 'De neoprit', 'Numai energie bună', 'Zâmbește la cameră', 'Atitudine Unreal', 'Mai aproape de vilă', 'Profesionist cu stil', 'Salut, vedetă', 'Cea mai bună versiune', 'Energie de șantier', 'Zâmbet de copertă', 'Hai, echipă!', 'Cucerește ziua', 'Ești esențial', 'Legendă totală', 'Bali te așteaptă', 'Zâmbește, e tare'];
const SMILE_CORE_ID = ['Senyum!', 'Bilang "Bali"', 'Keren banget', 'Kamu pasti bisa', 'Vibes positif', 'Bersinar', 'Tim Unreal', 'Ganteng/cantik!', 'Energi top', 'Senyum juara', 'Mode legenda', 'Vibes murni', 'Ayo gas', 'Jagoan absen', 'Ciri khas', 'Hari ini bangun vila', 'Kopi dulu, gas', 'Lihat gayanya', 'Hari nilai 10', 'Lagi difoto!', 'Vibes pulau', 'Penggerak tim', 'Penuh sikap', 'Level pro', 'Saatnya bersinar', 'Terbaik di shift', 'Tak terhentikan', 'Energi positif aja', 'Senyum ke kamera', 'Sikap Unreal', 'Makin dekat ke vila', 'Profesional dan keren', 'Halo, bintang', 'Versi terbaikmu', 'Energi proyek', 'Senyum sampul', 'Ayo, tim!', 'Taklukkan hari ini', 'Kamu kunci', 'Legenda total', 'Bali menanti', 'Senyum, mantap'];
const SMILE_EMOJIS = ['😄', '🌴', '😎', '🔥', '✨', '☀️', '💪', '😍', '⚡', '🏆', '🦸', '🌊', '🚀', '⏱️', '🏠', '🏗️', '☕', '🎨', '🔟', '📸', '🏝️', '🔧', '😏', '🤩'];
function smileCores(lang: string): string[] {
  const l = (lang || 'es').slice(0, 2);
  if (l === 'es') return SMILE_CORE_ES;
  if (l === 'ro') return SMILE_CORE_RO;
  if (l === 'id') return SMILE_CORE_ID;
  return SMILE_CORE_EN;
}
// Frase nº `idx` (en orden): cambia la base en cada paso y el emoji cada ~42 → 1.008
// combinaciones distintas antes de repetir.
function smilePhrase(lang: string, idx: number): string {
  const cores = smileCores(lang);
  if (!cores.length) return '';
  const i = ((Math.floor(idx) % (cores.length * SMILE_EMOJIS.length)) + (cores.length * SMILE_EMOJIS.length)) % (cores.length * SMILE_EMOJIS.length);
  const core = cores[i % cores.length];
  const emoji = SMILE_EMOJIS[Math.floor(i / cores.length) % SMILE_EMOJIS.length];
  return `${core} ${emoji}`;
}
// Contador LOCAL por dispositivo (fallback si el global del servidor no responde).
const SMILE_IDX_KEY = 'unreal_smile_idx';
function nextLocalSmileIdx(): number {
  let n = 0;
  try { n = parseInt(localStorage.getItem(SMILE_IDX_KEY) || '0', 10) || 0; } catch { n = 0; }
  const next = n + 1;
  try { localStorage.setItem(SMILE_IDX_KEY, String(next)); } catch { /* noop */ }
  return next;
}

const EmpleadosDashboard: React.FC = () => {
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const { user, loading, signOut } = useAuth();
  const fichajeLabel = (type: FichajeType) => t(`empleados.fichaje.label.${type}`);
  const fichajeMsg = (type: FichajeType) => t(`empleados.fichaje.msg.${type}`);

  const [today, setToday] = useState<TodayRow[]>([]);
  const [canUploadReports, setCanUploadReports] = useState(false);
  const [canEditProperties, setCanEditProperties] = useState(false);
  const [canViewCalendar, setCanViewCalendar] = useState(true);
  const [canRequestVacation, setCanRequestVacation] = useState(true);
  const [employee, setEmployee] = useState<{ id: string; full_name: string | null; work_start_time: string | null; work_end_time: string | null; work_days: number[] | null } | null>(null);
  const [showInstructions, setShowInstructions] = useState(false);
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [pw, setPw] = useState({ newPass: '', confirm: '' });
  const [pwErr, setPwErr] = useState('');
  const [pwOk, setPwOk] = useState('');
  const [pwBusy, setPwBusy] = useState(false);
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
    // "Hoy" = día de Bali (UTC+8), no del dispositivo/servidor.
    const startISO = baliDayStartISO(baliToday());
    const { data } = await supabase
      .from('attendance')
      .select('type, created_at')
      .eq('user_id', user.id)
      .gte('created_at', startISO)
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
        .select('id, full_name, active, can_upload_reports, permissions, work_start_time, work_end_time, work_days, preferred_language')
        .eq('email', realEmailOf(user))
        .maybeSingle();
      // SEGURIDAD: si el empleado ha sido marcado inactivo (o ya no existe),
      // cerramos su sesión en el acto — no debe seguir dentro al refrescar.
      if (!data || data.active === false) {
        try { await signOut(); } catch { /* ignore */ }
        navigate('/empleados', { replace: true });
        return;
      }
      setCanUploadReports(hasPermission(data, 'upload_reports'));
      setCanEditProperties(hasPermission(data, 'edit_properties'));
      setCanViewCalendar(hasPermission(data, 'view_team_calendar'));
      setCanRequestVacation(hasPermission(data, 'request_vacation'));
      // Idioma del empleado: al entrar, mostrar el portal en SU idioma preferido.
      const elang = (data as any).preferred_language;
      if (elang && ['es', 'en', 'ro', 'id'].includes(elang)) {
        try { localStorage.setItem('_unreal_lang', elang); } catch { /* ignore */ }
        if (i18n.language !== elang) void i18n.changeLanguage(elang);
      }
      if (data?.id) setEmployee({
        id: data.id as string,
        full_name: (data.full_name as string) ?? null,
        work_start_time: (data.work_start_time as string) ?? null,
        work_end_time: (data.work_end_time as string) ?? null,
        work_days: (data.work_days as number[]) ?? null,
      });
    })();
  }, [user]);

  // Si el empleado cambia el idioma (selector del portal), se guarda en su perfil
  // para que la próxima vez (y sus emails) salgan en ese idioma.
  useEffect(() => {
    if (!employee?.id) return;
    void supabase.rpc('employee_set_language', { p_lang: i18n.language });
  }, [i18n.language, employee?.id]);

  // Frase divertida en pantalla mientras hacen la foto. Se elige una NUEVA (sin repetir
  // las últimas) cada vez que se abre la cámara, en startCapture().
  const [smileMsg, setSmileMsg] = useState('');

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwErr(''); setPwOk('');
    if (pw.newPass !== pw.confirm) { setPwErr(t('fix.empd.passMismatch')); return; }
    if (pw.newPass.length < 6) { setPwErr(t('fix.empd.passMinLength')); return; }
    setPwBusy(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: pw.newPass });
      if (error) { setPwErr(t('fix.empd.passChangeFailed')); return; }
      if (employee?.id) await supabase.from('employees').update({ password: pw.newPass }).eq('id', employee.id);
      setPwOk(t('fix.empd.passUpdated'));
      setPw({ newPass: '', confirm: '' });
      setTimeout(() => { setShowChangePassword(false); setPwOk(''); }, 1800);
    } finally { setPwBusy(false); }
  };

  // Pulsar Check-in/out → pide GPS (en paralelo) y abre la cámara.
  const startCapture = async (type: FichajeType) => {
    setCameraError(null);
    // Libera cualquier stream que quedara abierto de un intento anterior — si no,
    // la cámara queda "ocupada" y getUserMedia falla en el 2º intento.
    stopCamera();
    setCapture(type);
    // Frase EN ORDEN sin repetir: pide el índice GLOBAL al servidor (no se repite ni
    // entre personas); si tarda >800ms o no hay red, usa el contador local. No bloquea
    // la apertura de la cámara.
    (async () => {
      let idx: number | null = null;
      try {
        const to = new Promise<null>((res) => setTimeout(() => res(null), 800));
        const r: any = await Promise.race([supabase.rpc('next_smile_index'), to]);
        const n = r && r.data != null ? Number(r.data) : NaN;
        if (Number.isFinite(n)) idx = n;
      } catch { /* offline */ }
      if (idx == null) idx = nextLocalSmileIdx();
      setSmileMsg(smilePhrase(i18n.language, idx));
    })();
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
      // El <video> puede no estar montado todavía cuando llega el stream (setCapture
      // dispara el render en el siguiente frame). Reintentamos enganchar hasta que exista,
      // si no la cámara sale en negro (el stream nunca se asigna al elemento).
      const attach = (tries = 0) => {
        const v = videoRef.current;
        if (v) {
          v.srcObject = streamRef.current;
          v.play().catch(() => { /* iOS a veces rechaza; el autoPlay lo cubre */ });
        } else if (tries < 60 && streamRef.current) {
          requestAnimationFrame(() => attach(tries + 1));
        }
      };
      attach();
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
    // Marco de marca Unreal grabado en la foto: borde finito redondeado + barra
    // inferior con "Unreal Studio" y la frase divertida.
    const W = canvas.width, H = canvas.height;
    const BR = '#3F2305', CREAM = '#F3E5D8';
    const pad = Math.max(4, Math.round(W * 0.018));
    const rad = Math.round(W * 0.05);
    const rr = (x: number, y: number, w: number, h: number, r: number) => {
      ctx.beginPath();
      if ((ctx as any).roundRect) (ctx as any).roundRect(x, y, w, h, r);
      else { ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
    };
    ctx.strokeStyle = CREAM; ctx.lineWidth = Math.max(3, Math.round(W * 0.01));
    rr(pad, pad, W - pad * 2, H - pad * 2, rad); ctx.stroke();
    const barH = Math.round(H * 0.075);
    ctx.save(); rr(pad, H - pad - barH, W - pad * 2, barH, rad); ctx.clip();
    ctx.fillStyle = 'rgba(63,35,5,0.66)'; ctx.fillRect(pad, H - pad - barH, W - pad * 2, barH); ctx.restore();
    ctx.fillStyle = CREAM; ctx.textBaseline = 'middle';
    ctx.font = `800 ${Math.round(barH * 0.4)}px Manrope, Arial, sans-serif`;
    ctx.textAlign = 'left'; ctx.fillText('Unreal Studio', pad + Math.round(W * 0.045), H - pad - barH / 2);
    ctx.textAlign = 'right'; ctx.font = `700 ${Math.round(barH * 0.36)}px Manrope, Arial, sans-serif`;
    ctx.fillText(smileMsg || '', W - pad - Math.round(W * 0.045), H - pad - barH / 2);
    const blob: Blob | null = await new Promise((res) => canvas.toBlob((b) => res(b), 'image/jpeg', 0.5));
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
        // Email REAL (no el sintético del portal) para que el reporte de admin
        // lo agrupe bajo el empleado correcto (Fase B).
        employee_email: realEmailOf(user),
        employee_name: employee?.full_name ?? realEmailOf(user),
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
        subtitle={employee?.full_name || realEmailOf(user) || user.email || t('empleados.header.subtitleFallback')}
        onLogout={async () => { try { await signOut(); } catch { /* ignore */ } window.location.href = '/empleados'; }}
        extra={
          <>
            <button
              onClick={() => setShowInstructions(true)}
              aria-label={t('empleados.header.instructions')}
              className="w-9 h-9 rounded-full bg-white border border-primary/10 text-primary flex items-center justify-center shadow-sm hover:bg-primary hover:text-white transition"
            >
              <span className="material-symbols-outlined text-[20px]">info</span>
            </button>
            <button
              onClick={() => setShowChangePassword(true)}
              className="text-[10px] font-black uppercase tracking-widest text-primary/40 hover:text-primary transition flex items-center gap-1"
            >
              <span className="material-symbols-outlined text-xs">lock</span> {t('fix.empd.passwordBtn')}
            </button>
          </>
        }
      />

      {showChangePassword && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={(e) => { if (e.target === e.currentTarget) setShowChangePassword(false); }}>
          <div className="bg-white w-full max-w-md rounded-3xl p-7 shadow-2xl max-h-[90vh] overflow-y-auto overscroll-contain">
            <h2 className="text-xl font-serif text-primary mb-6">{t('fix.empd.changePasswordTitle')}</h2>
            <form onSubmit={handleChangePassword} className="space-y-4">
              <input type="password" autoComplete="new-password" required placeholder={t('fix.empd.newPasswordPlaceholder')} value={pw.newPass}
                onChange={(e) => setPw({ ...pw, newPass: e.target.value })} className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm" />
              <input type="password" autoComplete="new-password" required placeholder={t('fix.empd.repeatPasswordPlaceholder')} value={pw.confirm}
                onChange={(e) => setPw({ ...pw, confirm: e.target.value })} className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm" />
              {pwErr && <p className="text-red-600 text-sm">{pwErr}</p>}
              {pwOk && <p className="text-green-600 text-sm">{pwOk}</p>}
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowChangePassword(false)} className="flex-1 py-3 rounded-xl border border-gray-200 text-gray-400 text-xs font-black uppercase tracking-widest hover:bg-gray-50">{t('fix.empd.cancel')}</button>
                <button type="submit" disabled={pwBusy} className="flex-1 py-3 rounded-xl bg-primary text-white text-xs font-black uppercase tracking-widest hover:bg-black transition disabled:opacity-50 inline-flex items-center justify-center gap-1.5">
                  {pwBusy && <span className="material-symbols-outlined text-sm animate-spin">progress_activity</span>}{pwBusy ? t('fix.empd.saving') : t('fix.empd.save')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      <div className="px-5 py-6 md:py-10">
      <div className="max-w-md mx-auto">
        {(() => {
          const q = TEAM_QUOTES[Math.floor(Date.now() / 86400000) % TEAM_QUOTES.length];
          const phrase = q[quoteLang(i18n.language)];
          return (
            <div className="bg-primary text-almond rounded-3xl px-5 py-4 mb-6 flex items-start gap-3 shadow-sm">
              <span className="material-symbols-outlined text-[20px] shrink-0 opacity-80">emoji_objects</span>
              <p className="text-sm leading-relaxed font-medium italic">{phrase}</p>
            </div>
          );
        })()}
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
                  <> · {employee.work_days.map((d) => weekdaysFor(uiLocale())[d-1]).join(' ')}</>
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

        {/* Calendario de vacaciones del equipo (respeta el permiso view_team_calendar;
            el formulario de solicitar respeta request_vacation). */}
        {employee && canViewCalendar && (
          <div className="mt-8">
            <VacationCalendar
              employeeId={employee.id}
              employeeEmail={realEmailOf(user)}
              employeeName={employee.full_name ?? realEmailOf(user)}
              canRequest={canRequestVacation}
            />
          </div>
        )}

        {/* Hub Team: accesos según permisos (subir reportes de obra, editar fichas) */}
        {(canUploadReports || canEditProperties) && (
          <div className="mt-8 grid grid-cols-1 gap-3">
            {canUploadReports && (
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
            )}
            {canEditProperties && (
              <button
                onClick={() => navigate('/empleados/propiedades')}
                className="bg-white rounded-2xl p-4 shadow-sm border border-primary/5 flex items-center gap-3 text-left hover:border-primary/20 transition"
              >
                <span className="material-symbols-outlined text-primary">home_work</span>
                <span className="flex-1">
                  <span className="block font-bold text-primary text-sm">{t('empleados.props.title', { defaultValue: 'Editar propiedades' })}</span>
                  <span className="block text-xs text-primary/50">{t('empleados.props.subtitle', { defaultValue: 'Actualiza fichas, fotos y datos de los proyectos.' })}</span>
                </span>
                <span className="material-symbols-outlined text-primary/30">chevron_right</span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* Cámara a pantalla completa — marco moderno de marca Unreal */}
      {capture && (
        <div className="fixed inset-0 z-50 flex flex-col" style={{ background: 'linear-gradient(160deg,#3F2305 0%,#5a3a14 55%,#F3E5D8 100%)' }}>
          <div className="flex items-center justify-between px-4 py-3">
            <span className="bg-white/15 backdrop-blur text-almond font-black uppercase tracking-widest text-[11px] px-4 py-2 rounded-full">
              {fichajeLabel(capture)}
            </span>
            <button onClick={cancelCapture} aria-label={t('empleados.camera.close')} disabled={busy} className="w-9 h-9 rounded-full bg-white/15 backdrop-blur text-almond flex items-center justify-center hover:bg-white/25 transition disabled:opacity-50">
              <span className="material-symbols-outlined">close</span>
            </button>
          </div>
          <div className="flex-1 flex items-center justify-center overflow-hidden px-4 pb-2 min-h-0">
            <div className="relative w-full max-w-md h-full max-h-[68vh] rounded-[2rem] overflow-hidden border-[3px] border-almond/80 shadow-2xl bg-black">
              <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
              {/* Frase divertida en pantalla (no se graba en la foto) */}
              {smileMsg && (
                <div className="absolute top-3 left-1/2 -translate-x-1/2 bg-primary/75 backdrop-blur text-almond text-sm font-bold px-4 py-1.5 rounded-full shadow-lg whitespace-nowrap">{smileMsg}</div>
              )}
              <div className="absolute bottom-3 left-1/2 -translate-x-1/2 text-almond/90 text-[10px] font-black uppercase tracking-[0.2em]">Unreal Studio</div>
            </div>
          </div>
          <div className="pb-8 pt-3 flex flex-col items-center gap-3">
            {busy ? (
              <p className="text-almond/90 text-sm font-medium">{t('empleados.camera.saving')}</p>
            ) : (
              <p className="text-almond/80 text-xs font-medium">{t('empleados.camera.takePhotoSuffix')}</p>
            )}
            <button
              onClick={captureAndSubmit}
              disabled={busy}
              className="w-[72px] h-[72px] rounded-full bg-almond ring-4 ring-almond/30 shadow-xl active:scale-95 transition disabled:opacity-60 flex items-center justify-center"
              aria-label={t('empleados.camera.takePhotoAria')}
            >
              {busy ? <span className="material-symbols-outlined animate-spin text-2xl text-primary">progress_activity</span> : <span className="w-14 h-14 rounded-full border-2 border-primary/30" />}
            </button>
          </div>
        </div>
      )}

      {/* Instrucciones */}
      {showInstructions && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-end md:items-center justify-center p-4" onClick={() => setShowInstructions(false)}>
          <div className="bg-white rounded-3xl p-6 max-w-md w-full max-h-[90vh] overflow-y-auto overscroll-contain" onClick={(e) => e.stopPropagation()}>
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
        <ConstructionReportModal postedBy={realEmailOf(user) || user.id} onClose={() => setShowReportModal(false)} />
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
                {t('fix.empd.retry')}
              </button>
              <button
                onClick={() => setCameraError(null)}
                className="text-primary/50 py-2 text-xs font-bold uppercase tracking-widest hover:text-primary transition"
              >
                {t('fix.empd.close')}
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
