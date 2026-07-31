import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { uiLocale } from '../lib/dateLocale';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { DEFAULT_CONFIG, CURRENCIES } from '../constants';
import { Project, AppConfig, BlogPost, User, Client, ClientProject } from '../types';
import { useCurrency } from '../App';
import { supabase, uploadImage, getImageUrl, parseJsonField } from '../lib/supabase';
import Footer from '../components/Footer';
import LanguageSwitcher from '../components/LanguageSwitcher';
import AdminSidebar from '../components/AdminSidebar';
import { translateStatus } from '../lib/statusI18n';
import { EMPLOYEE_PERMISSIONS, hasPermission } from '../lib/permissions';
import EmployeeEditModal, { EmployeeRow } from '../components/admin/EmployeeEditModal';
import ClientPaymentsPanel from '../components/admin/ClientPaymentsPanel';
import EventsCalendar from '../components/admin/EventsCalendar';
import AsyncButton from '../components/AsyncButton';
import CobrosPanel from '../components/admin/CobrosPanel';
import NotificationsPanel from '../components/admin/NotificationsPanel';
import VacationManager from '../components/admin/VacationManager';
import AttendancePanel from '../components/admin/AttendancePanel';
import { useEscapeKey } from '../lib/useEscapeKey';
import { FaqsTab, TimelinesTab } from './AdminPortalManager';
import AgencyApplications from '../components/admin/AgencyApplications';
import DashboardOverview from '../components/admin/DashboardOverview';
import { SOCIAL_NETWORKS } from '../lib/socials';
import { welcomeEmailHtml } from '../lib/clientEmails';
import { portalPath } from '../lib/portalUrls';
import i18n from '../lib/i18n';
import BrandLogo from '../components/BrandLogo';

type AdminView = 'dashboard' | 'projects' | 'blogs' | 'config' | 'users' | 'clients' | 'cobros' | 'calendar' | 'agenda' | 'employees' | 'notifications' | 'faqs' | 'agencias' | 'arquitectura';
const ADMIN_VIEWS: AdminView[] = ['dashboard', 'projects', 'blogs', 'config', 'users', 'clients', 'cobros', 'calendar', 'agenda', 'employees', 'notifications', 'faqs', 'agencias', 'arquitectura'];

// Titulares que PARTICIPAN en una propiedad concreta (+ % opcional). Si la
// propiedad no tiene participantes definidos (null/[]), participan TODOS los
// titulares de la ficha (comportamiento histórico, no rompe clientes existentes).
// Devuelve los emails (lowercase) que participan, dado holder_participants y los
// titulares de la ficha.
const participantEmails = (holderParticipants: any, fichaHolders: any[]): string[] => {
  const hp = Array.isArray(holderParticipants) ? holderParticipants : null;
  if (hp && hp.length) return hp.map((x: any) => (x?.email || '').trim().toLowerCase()).filter(Boolean);
  return (fichaHolders || []).map((h: any) => (h?.email || '').trim().toLowerCase()).filter(Boolean);
};

// Selector de participantes de una propiedad: marca qué titulares de la ficha
// participan y con qué % (opcional). Si están todos marcados y sin %, guarda []
// (= "todos", sin gating) para no alterar el comportamiento por defecto.
const ParticipantsPicker: React.FC<{ holders: any[]; value: any; onChange: (v: any[]) => void; t: any }> = ({ holders, value, onChange, t }) => {
  const hs = (holders || []).filter((h: any) => (h?.email || '').trim());
  if (hs.length < 2) return null; // con un solo titular no hay nada que elegir
  const cur: any[] = Array.isArray(value) ? value : [];
  const allEmails = hs.map((h: any) => (h.email || '').trim().toLowerCase());
  // Si value vacío => todos participan (default).
  const checkedSet = new Set<string>(cur.length ? cur.map((x: any) => (x.email || '').trim().toLowerCase()) : allEmails);
  const pctOf = (em: string) => { const m = cur.find((x: any) => (x.email || '').trim().toLowerCase() === em); return m && m.pct != null ? m.pct : ''; };
  const emit = (nextChecked: Set<string>, pctMap: Record<string, any>) => {
    const arr = hs.filter((h: any) => nextChecked.has((h.email || '').trim().toLowerCase()))
      .map((h: any) => { const em = (h.email || '').trim(); const p = pctMap[em.toLowerCase()]; return p === '' || p == null ? { email: em } : { email: em, pct: Number(p) }; });
    // Todos marcados y sin ningún % => [] (todos, sin gating).
    const allChecked = arr.length === hs.length;
    const anyPct = arr.some((x: any) => x.pct != null);
    onChange(allChecked && !anyPct ? [] : arr);
  };
  const curPctMap: Record<string, any> = {}; for (const h of hs) curPctMap[(h.email || '').trim().toLowerCase()] = pctOf((h.email || '').trim().toLowerCase());
  return (
    <div>
      <label className="block text-[10px] font-black uppercase text-gray-400 mb-2">{t('admin.dash.participantsLabel', { defaultValue: 'Titulares que participan en esta propiedad' })}</label>
      <p className="text-[11px] text-gray-400 mb-2">{t('admin.dash.participantsHint', { defaultValue: 'Marca quién participa y, si quieres, su %. Solo verán esta propiedad y recibirán sus emails los marcados. Si dejas todos marcados, participan todos.' })}</p>
      <div className="space-y-2">
        {hs.map((h: any, i: number) => {
          const em = (h.email || '').trim(); const emL = em.toLowerCase(); const checked = checkedSet.has(emL);
          return (
            <div key={i} className="flex items-center gap-2 bg-gray-50 rounded-xl px-3 py-2 border border-gray-100">
              <input type="checkbox" checked={checked} onChange={() => { const n = new Set(checkedSet); if (n.has(emL)) { if (n.size <= 1) return; n.delete(emL); } else n.add(emL); emit(n, curPctMap); }} className="rounded" />
              <span className="flex-1 text-sm font-medium text-primary truncate">{(h.name || '').trim() || em}<span className="text-gray-400 font-normal"> · {em}</span></span>
              <div className="flex items-center gap-1">
                <input type="number" min="0" max="100" step="0.0001" value={checked ? (curPctMap[emL] ?? '') : ''} disabled={!checked} onChange={(e) => { const pm = { ...curPctMap, [emL]: e.target.value }; emit(new Set(checkedSet), pm); }} placeholder="%" className="w-20 px-2 py-1 bg-white rounded-lg border border-gray-200 text-sm font-bold text-right disabled:opacity-40" />
                <span className="text-xs text-gray-400">%</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// Nombre de titulares para saludos de email: deduplica las partes unidas por " & "
// (algunas fichas tienen el nombre repetido, p.ej. "Alberto & Alberto") sin tocar la BD.
const dedupeAmpNames = (raw: string | null | undefined): string => {
  const parts = String(raw || '').split('&').map((s) => s.trim()).filter(Boolean);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of parts) { const k = p.toLowerCase(); if (!seen.has(k)) { seen.add(k); out.push(p); } }
  return out.join(' & ');
};

// Resuelve el nombre del titular concreto por su email (para saludar a cada
// destinatario con SU nombre, no con el del titular principal). Si no hay match
// en holders, cae al nombre deduplicado de la ficha.
// Invoca la edge function de email con reintento si la PETICIÓN no llega
// (cold-start/red): "Failed to send a request to the Edge Function". NO reintenta
// errores de aplicación que devuelve la función (p.ej. transport_not_configured),
// que volverían a fallar igual. Devuelve { data, error } como supabase.invoke.
const invokeSendEmail = async (body: any): Promise<{ data: any; error: any }> => {
  let data: any = null, error: any = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    const r = await supabase.functions.invoke('send-client-email', { body });
    data = r.data; error = r.error;
    if (!error || data?.success) break; // llegó a la función → no reintentar
    await new Promise((res) => setTimeout(res, 800 * (attempt + 1)));
  }
  return { data, error };
};

const holderNameByEmail = (client: any, em: string): string => {
  const target = (em || '').trim().toLowerCase();
  const hs = client?.holders;
  if (target && Array.isArray(hs)) {
    const m = hs.find((h: any) => (h?.email || '').trim().toLowerCase() === target);
    if (m && (m.name || '').trim()) return (m.name || '').trim();
  }
  return dedupeAmpNames(client?.name);
};

// Idioma del titular concreto por su email (cada titular recibe en SU idioma).
// Fallback: idioma preferido de la ficha, o 'es'.
const holderLangByEmail = (client: any, em: string): 'es' | 'en' | 'ro' | 'id' => {
  const target = (em || '').trim().toLowerCase();
  const hs = client?.holders;
  if (target && Array.isArray(hs)) {
    const m = hs.find((h: any) => (h?.email || '').trim().toLowerCase() === target);
    const l = m && (m.lang || '').trim();
    if (l && ['es', 'en', 'ro', 'id'].includes(l)) return l as any;
  }
  const cl = (client?.preferred_language || 'es');
  return (['es', 'en', 'ro', 'id'].includes(cl) ? cl : 'es') as any;
};

const GUIDE_STEPS = [
  { titleKey: 'admin.dash.guide1Title', textKey: 'admin.dash.guide1Text' },
  { titleKey: 'admin.dash.guide2Title', textKey: 'admin.dash.guide2Text' },
  { titleKey: 'admin.dash.guide3Title', textKey: 'admin.dash.guide3Text' },
  { titleKey: 'admin.dash.guide4Title', textKey: 'admin.dash.guide4Text' },
  { titleKey: 'admin.dash.guide5Title', textKey: 'admin.dash.guide5Text' }
];

const AdminDashboard: React.FC = () => {
  const { t } = useTranslation();
const AMENITIES_LIST = [
  'Piscina privada', 'Piscina compartida', 'Gimnasio', 'Coworking',
  'Jardín tropical', 'Terraza', 'Parking', 'Seguridad 24h',
  'Cámaras de seguridad', 'WiFi', 'Aire acondicionado', 'Ventilador',
  'Cocina equipada', 'Lavandería', 'Zona barbacoa', 'Vistas al mar',
  'Cercano a la playa', 'Recepción', 'Bar', 'Almacén',
  'Spa', 'Sala de juegos', 'Servicio de limpieza', 'Alquiler de motos'
];
  const [projects, setProjects] = useState<Project[]>([]);
  const [blogs, setBlogs] = useState<BlogPost[]>([]);
  const [config, setConfig] = useState<AppConfig>(DEFAULT_CONFIG);
  // Firma PERSONAL del admin logueado (cada admin tiene la suya; no es de empresa).
  const [mySignature, setMySignature] = useState<string>('');
  const [users, setUsers] = useState<User[]>([]);
  
  const [clients, setClients] = useState<Client[]>([]);
  const [isEditingClient, setIsEditingClient] = useState(false);
  const [currentClient, setCurrentClient] = useState<Partial<Client>>({});
  const [clientSearch, setClientSearch] = useState('');
  // Herramientas de filtro/orden del listado de clientes.
  const [clientFilterProjects, setClientFilterProjects] = useState<string[]>([]); // multi-selección por proyecto
  const [projectFilterOpen, setProjectFilterOpen] = useState(false);
  const [clientFilterCurrency, setClientFilterCurrency] = useState(''); // por divisa cerrada en contrato
  const [clientSort, setClientSort] = useState<'name' | 'amount_desc' | 'amount_asc' | 'recent'>('name');
  const [clientFilterStatus, setClientFilterStatus] = useState(''); // '', active, inactive, draft
  const [clientFilterPerms, setClientFilterPerms] = useState<string[]>([]); // filtrar por permisos asignados (multi)
  const [selectedClientIds, setSelectedClientIds] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [assigningProject, setAssigningProject] = useState<{ clientId: string, clientName: string } | null>(null);
  const [editingAssignment, setEditingAssignment] = useState<{ clientId: string, clientName: string, assignment: any } | null>(null);
  const [assignForm, setAssignForm] = useState({ project_id: '', unit_number: '', investment_amount: 0, currency: 'EUR', purchase_date: '', status: 'Reserva', investment_type: 'compra', pool_total: 0, participants: [] });
  const [whatsappClient, setWhatsappClient] = useState<Client | null>(null);
  const [mailClient, setMailClient] = useState<Client | null>(null);
  const [mailEmployee, setMailEmployee] = useState<any | null>(null);
  const [mailBusy, setMailBusy] = useState(false);
  const [paymentsClient, setPaymentsClient] = useState<Client | null>(null);
  const [paymentsFilter, setPaymentsFilter] = useState<{ name: string; unit: string | null } | null>(null);
  // Preview de email antes de enviar (todos los correos pasan por aquí).
  const [emailPreview, setEmailPreview] = useState<null | { recipients: string[]; selected: string[]; previewEmail: string; subject: string; html: string; sentMsg: (emails: string[]) => string; userId: string; lang: string; sending: boolean; buildHtml?: (email: string) => string; buildSubject?: (email: string) => string }>(null);
  const [reportPicker, setReportPicker] = useState<null | { client: any; projs: any[]; selected: string[]; excluded: string[] }>(null); // elegir proyecto(s) y destinatarios del aviso de obra
  // Hasta que la sesión está verificada y los datos cargados, mostramos un spinner
  // de marca (evita la pantalla negra/vacía mientras carga, sobre todo en móvil/conexión lenta).
  const [booted, setBooted] = useState(false);
  // Cerrar con Escape los modales (accesibilidad — auditoría).
  useEscapeKey(() => setEmailPreview(null), !!emailPreview);
  useEscapeKey(() => setIsEditingClient(false), isEditingClient);
  useEscapeKey(() => setEditingAssignment(null), !!editingAssignment);
  useEscapeKey(() => setAssigningProject(null), !!assigningProject);
  useEscapeKey(() => setWhatsappClient(null), !!whatsappClient);
  useEscapeKey(() => setMailClient(null), !!mailClient);
  useEscapeKey(() => setPaymentsClient(null), !!paymentsClient);

  const [currentUserData, setCurrentUserData] = useState<User | null>(null);
  
  const { currency, setCurrency, formatPrice, formatMoney } = useCurrency();
  // La vista activa vive en la URL (?view=) para que el menú lateral (presente
  // en todas las páginas admin) navegue entre secciones de forma consistente.
  const [searchParams, setSearchParams] = useSearchParams();
  const viewParam = searchParams.get('view') as AdminView | null;
  const activeView: AdminView = viewParam && ADMIN_VIEWS.includes(viewParam) ? viewParam : 'dashboard';
  const setActiveView = (v: AdminView) => setSearchParams({ view: v });
  // Búsqueda pre-rellenada por URL (?q=): p.ej. desde Notificaciones "Ver cobro →"
  // auto-busca al cliente. Aplica el término y limpia el q de la URL.
  useEffect(() => {
    const q = searchParams.get('q');
    if (q) {
      setClientSearch(q);
      const sp = new URLSearchParams(searchParams);
      sp.delete('q');
      setSearchParams(sp, { replace: true });
    }
  }, [searchParams, setSearchParams]);
  const [employees, setEmployees] = useState<Array<{ id: string; email: string; full_name: string | null; password: string | null; active: boolean; can_upload_reports: boolean; permissions: Record<string, boolean> | null; work_start_time: string | null; work_end_time: string | null; work_days: number[] | null; late_margin_min: number | null; preferred_language?: string | null; welcomed_at?: string | null; phone?: string | null }>>([]);
  const loadEmployees = useCallback(async () => {
    const { data } = await supabase
      .from('employees')
      .select('id, email, full_name, password, active, can_upload_reports, permissions, work_start_time, work_end_time, work_days, late_margin_min, preferred_language, welcomed_at, phone')
      .order('full_name');
    setEmployees((data as typeof employees) ?? []);
  }, []);
  // Modal de alta/edición de empleado: null = cerrado, {emp:null} = nuevo, {emp:row} = editar.
  const [empModal, setEmpModal] = useState<{ emp: EmployeeRow | null } | null>(null);
  // Redactar correo manual al equipo (empleados), igual que a clientes: cada
  // destinatario recibe el correo EN SU IDIOMA (como los emails de cliente).
  // Plantillas multiidioma; al enviar, si hay plantilla elegida se renderiza en
  // el idioma de cada destinatario; si el admin edita el texto, se manda tal cual.
  const TEAM_TPLS: Record<string, { subject: Record<string, string>; body: Record<string, string> }> = {
    welcome: {
      subject: { es: 'Bienvenido/a al equipo de Unreal Studio', en: 'Welcome to the Unreal Studio team', ro: 'Bine ai venit în echipa Unreal Studio', id: 'Selamat datang di tim Unreal Studio' },
      body: {
        es: 'Te damos la bienvenida al equipo de Unreal Studio.\n\nTu portal de empleado está listo: https://unrealstudiobali.com/empleados\nDesde ahí fichas tu entrada/salida, ves tu horario y pides vacaciones.\n\nCualquier duda, aquí estamos. ¡Bienvenido/a!',
        en: 'Welcome to the Unreal Studio team.\n\nYour employee portal is ready: https://unrealstudiobali.com/empleados\nFrom there you can clock in/out, check your schedule and request time off.\n\nIf you have any questions, we\'re here. Welcome aboard!',
        ro: 'Bine ai venit în echipa Unreal Studio.\n\nPortalul tău de angajat este gata: https://unrealstudiobali.com/empleados\nDe acolo poți ponta intrarea/ieșirea, îți vezi programul și ceri concediu.\n\nDacă ai întrebări, suntem aici. Bine ai venit!',
        id: 'Selamat datang di tim Unreal Studio.\n\nPortal karyawan Anda sudah siap: https://unrealstudiobali.com/empleados\nDi sana Anda dapat mencatat kehadiran (masuk/keluar), melihat jadwal, dan mengajukan cuti.\n\nJika ada pertanyaan, kami siap membantu. Selamat bergabung!',
      },
    },
    checkin: {
      subject: { es: 'Recordatorio: ficha tu entrada y salida', en: 'Reminder: clock in and out', ro: 'Reminder: pontează intrarea și ieșirea', id: 'Pengingat: catat kehadiran masuk dan keluar' },
      body: {
        es: 'Un recordatorio rápido: acuérdate de fichar tu entrada, pausas y salida cada día desde el portal:\nhttps://unrealstudiobali.com/empleados\n\nSi un día olvidas fichar algo, puedes registrarlo igualmente cuando te acuerdes.\n\nGracias.',
        en: 'A quick reminder: remember to clock in, log your breaks and clock out every day from the portal:\nhttps://unrealstudiobali.com/empleados\n\nIf you forget to log something one day, you can still record it when you remember.\n\nThank you.',
        ro: 'Un scurt reminder: nu uita să pontezi intrarea, pauzele și ieșirea în fiecare zi din portal:\nhttps://unrealstudiobali.com/empleados\n\nDacă uiți să pontezi ceva într-o zi, poți înregistra oricând, când îți amintești.\n\nMulțumim.',
        id: 'Pengingat singkat: jangan lupa mencatat kehadiran masuk, istirahat, dan keluar setiap hari melalui portal:\nhttps://unrealstudiobali.com/empleados\n\nJika suatu hari lupa mencatat, Anda tetap bisa mencatatnya saat ingat.\n\nTerima kasih.',
      },
    },
    meeting: {
      subject: { es: 'Reunión de equipo', en: 'Team meeting', ro: 'Ședință de echipă', id: 'Rapat tim' },
      body: {
        es: 'Hola,\n\nConvocamos una reunión de equipo el [DÍA] a las [HORA] en [LUGAR / enlace].\n\nTemas a tratar:\n- \n- \n\nPor favor confirma tu asistencia. Gracias.',
        en: 'Hi,\n\nWe\'re calling a team meeting on [DAY] at [TIME] at [PLACE / link].\n\nTopics:\n- \n- \n\nPlease confirm your attendance. Thank you.',
        ro: 'Salut,\n\nConvocăm o ședință de echipă pe [ZIUA] la [ORA] la [LOC / link].\n\nSubiecte:\n- \n- \n\nTe rugăm să confirmi prezența. Mulțumim.',
        id: 'Halo,\n\nKami mengadakan rapat tim pada [HARI] pukul [JAM] di [TEMPAT / tautan].\n\nTopik:\n- \n- \n\nMohon konfirmasi kehadiran Anda. Terima kasih.',
      },
    },
    notice: {
      subject: { es: 'Aviso importante', en: 'Important notice', ro: 'Anunț important', id: 'Pemberitahuan penting' },
      body: {
        es: 'Hola,\n\nQueremos informarte de lo siguiente:\n\n[ESCRIBE AQUÍ EL AVISO]\n\nGracias por tu atención.',
        en: 'Hi,\n\nWe\'d like to inform you of the following:\n\n[WRITE THE NOTICE HERE]\n\nThank you for your attention.',
        ro: 'Salut,\n\nDorim să te informăm despre următoarele:\n\n[SCRIE AICI ANUNȚUL]\n\nÎți mulțumim pentru atenție.',
        id: 'Halo,\n\nKami ingin memberitahukan hal berikut:\n\n[TULIS PEMBERITAHUAN DI SINI]\n\nTerima kasih atas perhatian Anda.',
      },
    },
  };
  const teamTplNames: Record<string, string> = { welcome: 'Bienvenida', checkin: 'Fichaje', meeting: 'Reunión', notice: 'Aviso' };
  const [teamCompose, setTeamCompose] = useState<null | { recipients: { email: string; name: string; lang: string }[]; selected: string[]; subject: string; body: string; sending: boolean; tplKey: string | null }>(null);
  // Idioma de vista previa = el del primer destinatario seleccionado (así ves el correo tal como le llegará).
  const teamPreviewLang = (tc: { recipients: { email: string; lang: string }[]; selected: string[] }) => (tc.recipients.find((r) => r.email === tc.selected[0])?.lang || 'es');
  const openTeamCompose = (only?: { email: string; name: string }) => {
    const active = employees.filter((e) => e.active && (e.email || '').includes('@')).map((e) => ({ email: e.email, name: e.full_name || e.email, lang: (e.preferred_language || 'es') }));
    const recips = only ? active.filter((r) => r.email === only.email) : active;
    setTeamCompose({ recipients: recips, selected: recips.map((r) => r.email), subject: '', body: '', sending: false, tplKey: null });
  };
  const sendTeamCompose = async () => {
    if (!teamCompose) return;
    const tc = teamCompose;
    const userId = getAdminUserId();
    if (!userId) { alert(t('admin.dash.sessionExpired')); return; }
    if (!tc.subject.trim() || !tc.body.trim() || tc.selected.length === 0) { alert(t('admin.dash.teamComposeIncomplete', { defaultValue: 'Pon asunto, mensaje y al menos un destinatario.' })); return; }
    setTeamCompose((p) => p ? { ...p, sending: true } : p);
    const esc = (s: string) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c] as string));
    let ok = 0; let fail = 0;
    for (const to of tc.selected) {
      const r = tc.recipients.find((x) => x.email === to);
      const name = r?.name || ''; const lg = r?.lang || 'es';
      // Si hay plantilla elegida (y el admin no la ha editado), cada destinatario la recibe EN SU IDIOMA.
      const tp = tc.tplKey ? TEAM_TPLS[tc.tplKey] : null;
      const subj = tp ? (tp.subject[lg] || tp.subject.es) : tc.subject;
      const bodyText = tp ? (tp.body[lg] || tp.body.es) : tc.body;
      const html = `<p style="font-size:15px;line-height:1.7;margin:0 0 12px;color:#3F2305">${i18n.getFixedT(lg)('admin.dash.emailGreeting', { defaultValue: 'Hola {{name}},', name })}</p><div style="font-size:15px;line-height:1.7;color:#3F2305;white-space:pre-wrap">${esc(bodyText)}</div>`;
      try {
        const { data, error } = await invokeSendEmail({ adminUserId: userId, to, lang: lg, subject: subj, html });
        if (error || !data?.success) fail++; else ok++;
      } catch { fail++; }
    }
    setTeamCompose(null);
    alert(t('admin.dash.teamComposeSent', { defaultValue: 'Enviados: {{ok}}{{f}}', ok, f: fail ? ` · fallidos: ${fail}` : '' }));
  };
  // Submenú de Configuración (orden lógico): Etiquetas · Permisos · Marca y datos.
  const [configTab, setConfigTab] = useState<'etiquetas' | 'permisos' | 'marca'>('etiquetas');
  // Bocadillo de navegación en MÓVIL (sustituye la barra horizontal de menús).
  const [adminMenuOpen, setAdminMenuOpen] = useState(false);
  // Orden del menú móvil (incluye Marketing —que es una ruta— y Agencias, que antes no salían).
  const ADMIN_MOBILE_NAV: { key: string; view?: AdminView; to?: string }[] = [
    { key: 'dashboard', view: 'dashboard' },
    { key: 'notifications', view: 'notifications' },
    { key: 'cobros', view: 'cobros' },
    { key: 'projects', view: 'projects' },
    { key: 'agenda', view: 'agenda' },
    { key: 'calendar', view: 'calendar' },
    { key: 'clients', view: 'clients' },
    { key: 'arquitectura', view: 'arquitectura' },
    { key: 'employees', view: 'employees' },
    { key: 'users', view: 'users' },
    { key: 'blogs', view: 'blogs' },
    { key: 'faqs', view: 'faqs' },
    { key: 'marketing', to: '/admin/marketing' },
    { key: 'agencias', view: 'agencias' },
    { key: 'config', view: 'config' },
  ];
  // Solicitudes de vacaciones pendientes (se aprueban aquí, en Empleados).
  const [pendingVacations, setPendingVacations] = useState<Array<{ id: string; employee_name: string | null; employee_email: string; start_date: string; end_date: string; type: string; note: string | null }>>([]);
  const loadPendingVacations = useCallback(async () => {
    const { data } = await supabase
      .from('employee_vacations')
      .select('id, employee_name, employee_email, start_date, end_date, type, note')
      .in('status', ['pendiente', 'pending'])
      .order('start_date');
    setPendingVacations((data as typeof pendingVacations) ?? []);
  }, []);
  useEffect(() => {
    if (activeView !== 'employees') return;
    void loadPendingVacations();
  }, [activeView, loadPendingVacations]);
  const resolveVacation = async (id: string, status: 'aprobada' | 'rechazada') => {
    await supabase.from('employee_vacations').update({ status }).eq('id', id);
    await loadPendingVacations();
  };
  // FAQs y Timelines (movidos aquí desde el antiguo Portal Manager).
  const [faqsData, setFaqsData] = useState<any[]>([]);
  const loadFaqs = useCallback(async () => {
    const { data } = await supabase.from('faqs').select('id, question, answer, category, tags, project_filter, language, is_published, sort_order, source, updated_at').order('sort_order');
    setFaqsData(data ?? []);
  }, []);
  const [timelineProjects, setTimelineProjects] = useState<any[]>([]);
  const loadTimelineProjects = useCallback(async () => {
    const { data } = await supabase.from('projects').select('id, slug, name, status, completion_percent, timeline').order('sort_order');
    setTimelineProjects(data ?? []);
  }, []);
  useEffect(() => {
    if (activeView === 'faqs') void loadFaqs();
    if (activeView === 'timelines') void loadTimelineProjects();
  }, [activeView, loadFaqs, loadTimelineProjects]);
  useEffect(() => {
    if (activeView !== 'employees') return;
    void loadEmployees();
  }, [activeView, loadEmployees]);
  // Toggle del estado activo/inactivo del empleado.
  // Idioma del empleado (fallback 'es').
  const employeeLangOf = (emp: any) => (['es', 'en', 'ro', 'id'].includes(emp?.preferred_language || '') ? emp.preferred_language : 'es') as string;
  // Cuerpo INTERIOR del email de bienvenida al empleado (la marca la añade send-client-email),
  // igual estructura que el de clientes (welcomeEmailHtml): saludo + texto + credenciales + CTA.
  const employeeWelcomeInner = (emp: any, lg: string) => {
    const esc = (s: string) => (s || '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c] as string));
    const et = i18n.getFixedT(lg);
    const portalUrl = 'https://unrealstudiobali.com/empleados';
    const greeting = et('admin.dash.emailGreeting', { defaultValue: 'Hola {{name}},', name: emp.full_name || '' });
    const body = esc(TEAM_TPLS.welcome.body[lg] || TEAM_TPLS.welcome.body.es);
    const cellS = 'padding-right:14px;color:rgba(63,35,5,.55);vertical-align:top';
    const valS = 'word-break:break-all;overflow-wrap:anywhere';
    const creds = `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;margin:16px 0;font-size:14px;line-height:1.9;color:#3F2305"><tr><td style="${cellS}">${et('emails.welcome.access')}</td><td style="${valS}"><a href="${portalUrl}" style="color:#3F2305;font-weight:700;${valS}">${portalUrl}</a></td></tr><tr><td style="${cellS}">${et('emails.welcome.emailLabel')}</td><td style="${valS}"><b>${esc(emp.email)}</b></td></tr>${emp.password ? `<tr><td style="${cellS}">${et('emails.welcome.tempPassword')}</td><td style="${valS}"><b>${esc(emp.password)}</b></td></tr>` : ''}</table>`;
    const cta = `<p style="text-align:center;margin:22px 0 6px"><a href="${portalUrl}" style="background:#3F2305;color:#fff;text-decoration:none;font-weight:700;padding:13px 28px;border-radius:12px;display:inline-block;font-size:14px">${et('emails.welcome.cta')}</a></p>`;
    return `<p style="font-size:15px;line-height:1.7;margin:0 0 12px;color:#3F2305">${greeting}</p><div style="font-size:15px;line-height:1.7;color:#3F2305;white-space:pre-wrap;word-break:break-word">${body}</div>${creds}${cta}`;
  };
  // Bienvenida AUTOMÁTICA al activar/crear (una sola vez, welcomed_at). Manda directo (sin preview).
  const maybeSendEmployeeWelcome = async (emp?: { id: string; email: string; full_name: string | null; password: string | null; active: boolean; preferred_language?: string | null; welcomed_at?: string | null } | null) => {
    if (!emp || !emp.active || !(emp.email || '').includes('@') || emp.welcomed_at) return;
    const userId = getAdminUserId();
    if (!userId) return;
    const lg = employeeLangOf(emp);
    const subject = TEAM_TPLS.welcome.subject[lg] || TEAM_TPLS.welcome.subject.es;
    const { data, error } = await invokeSendEmail({ adminUserId: userId, to: emp.email, lang: lg, subject, html: employeeWelcomeInner(emp, lg) });
    if (!error && data?.success) await supabase.from('employees').update({ welcomed_at: new Date().toISOString() }).eq('id', emp.id);
  };
  // MAIL CENTER de empleado — MISMO flujo que clientes: abre la previsualización con marca (openEmailPreview).
  const sendEmployeeWelcome = (emp: any) => {
    const email = (emp.email || '').trim();
    if (!email) { alert(t('admin.dash.welcomeNoEmail')); return; }
    const userId = getAdminUserId();
    if (!userId) { alert(t('admin.dash.sessionExpired')); navigate('/admin/login'); return; }
    const lg = employeeLangOf(emp);
    openEmailPreview({ to: email, subject: TEAM_TPLS.welcome.subject[lg] || TEAM_TPLS.welcome.subject.es, html: employeeWelcomeInner(emp, lg), sentMsg: (ems) => t('admin.dash.welcomeSent', { email: ems.join(', ') }), userId, lang: lg });
  };
  const sendEmployeeReset = async (emp: any) => {
    const email = (emp.email || '').trim();
    if (!email) { alert(t('admin.dash.welcomeNoEmail')); return; }
    if (!window.confirm(t('admin.dash.resetConfirm', { email }))) return;
    const { data: sent, error: sErr } = await supabase.functions.invoke('send-password-reset', { body: { email, lang: employeeLangOf(emp), portal: 'empleados' } });
    if (sErr || !sent?.success) { alert(t('admin.dash.resetError', { error: sent?.error || sErr?.message || 'error' })); return; }
    alert(t('admin.dash.resetSent', { email }));
  };
  // Recordatorio de fichaje — email fijo (en su idioma) con la previsualización de marca.
  const sendEmployeeCheckin = (emp: any) => {
    const email = (emp.email || '').trim();
    if (!email) { alert(t('admin.dash.welcomeNoEmail')); return; }
    const userId = getAdminUserId();
    if (!userId) { alert(t('admin.dash.sessionExpired')); navigate('/admin/login'); return; }
    const lg = employeeLangOf(emp);
    const esc = (s: string) => (s || '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c] as string));
    const et = i18n.getFixedT(lg);
    const greeting = et('admin.dash.emailGreeting', { defaultValue: 'Hola {{name}},', name: emp.full_name || '' });
    const body = esc(TEAM_TPLS.checkin.body[lg] || TEAM_TPLS.checkin.body.es);
    const html = `<p style="font-size:15px;line-height:1.7;margin:0 0 12px;color:#3F2305">${greeting}</p><div style="font-size:15px;line-height:1.7;color:#3F2305;white-space:pre-wrap;word-break:break-word">${body}</div>`;
    openEmailPreview({ to: email, subject: TEAM_TPLS.checkin.subject[lg] || TEAM_TPLS.checkin.subject.es, html, sentMsg: (ems) => t('admin.dash.welcomeSent', { email: ems.join(', ') }), userId, lang: lg });
  };
  const toggleEmployeeActive = async (id: string, value: boolean) => {
    await supabase.from('employees').update({ active: value }).eq('id', id);
    if (value) {
      const { data: emp } = await supabase.from('employees').select('id, email, full_name, password, active, preferred_language, welcomed_at').eq('id', id).maybeSingle();
      await maybeSendEmployeeWelcome(emp as any);
    }
    await loadEmployees();
  };
  // Borrar empleado desde la tarjeta (mismo estándar que clientes: confirmar).
  const deleteEmployee = async (emp: { id: string; full_name: string | null; email: string }) => {
    if (!window.confirm(t('fix.emp.confirmDelete', { name: emp.full_name || emp.email, defaultValue: `¿Borrar a ${emp.full_name || emp.email}? No se puede deshacer.` }))) return;
    const { error } = await supabase.rpc('admin_delete_employee', { p_id: emp.id });
    if (error) { alert(error.message || t('fix.emp.errDelete', { defaultValue: 'No se pudo borrar.' })); return; }
    await loadEmployees();
  };
  // Toggle de un permiso granular: hace merge de la key en employees.permissions.
  // Para 'upload_reports' sincroniza la columna legacy can_upload_reports.
  const toggleEmployeePermission = async (
    emp: { id: string; permissions: Record<string, boolean> | null },
    key: string,
    value: boolean
  ) => {
    const nextPermissions = { ...(emp.permissions ?? {}), [key]: value };
    const update: Record<string, unknown> = { permissions: nextPermissions };
    if (key === 'upload_reports') update.can_upload_reports = value;
    await supabase.from('employees').update(update).eq('id', emp.id);
    await loadEmployees();
  };

  const [calendarYear, setCalendarYear] = useState(new Date().getFullYear());
  const [daysOff, setDaysOff] = useState<Record<string, string[]>>({});
  const [calendarAdminPassword, setCalendarAdminPassword] = useState('');
  const [calendarEditMode, setCalendarEditMode] = useState(false);
  const [calendarAuthError, setCalendarAuthError] = useState('');

  const LOGO_URL = "/img/Logos/logo-06.png";

  const [walkthroughStep, setWalkthroughStep] = useState<number | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [isEditingBlog, setIsEditingBlog] = useState(false);
  const [isEditingUser, setIsEditingUser] = useState(false);
  const [uploading, setUploading] = useState(false);
  
  const [currentProject, setCurrentProject] = useState<Partial<Project>>({});
  const [currentBlog, setCurrentBlog] = useState<Partial<BlogPost>>({});
  const [currentUser, setCurrentUser] = useState<Partial<User>>({});

  const [blogSearch, setBlogSearch] = useState('');
  const [blogTagFilter, setBlogTagFilter] = useState('Todos');
  const [blogSortOrder, setBlogSortOrder] = useState<'newest' | 'oldest'>('newest');
  
  const [galleryInput, setGalleryInput] = useState('');
  const [tiersInput, setTiersInput] = useState('');

  const [optionManager, setOptionManager] = useState<{ field: keyof AppConfig | null, title: string } | null>(null);
  const [newOptionValue, setNewOptionValue] = useState('');

  const blogContentRef = useRef<HTMLTextAreaElement>(null);
  const navigate = useNavigate();

  // Helper to format dates consistently
  const formatDate = (dateString: string | undefined) => {
    if (!dateString) return '';
    try {
        return new Date(dateString).toLocaleDateString(uiLocale(), { day: '2-digit', month: '2-digit', year: 'numeric' });
    } catch {
        return dateString;
    }
  };

  const adminIdRef = useRef<string | null>(null);
  const adminUsernameRef = useRef<string | null>(null);
  // Id del admin SIEMPRE desde la sesión Supabase Auth (admin_self()), nunca desde
  // un token localStorage falsificable.
  const getAdminUserId = (): string | null => adminIdRef.current;

  const loadDaysOff = async () => {
    const { data } = await supabase.from('app_config').select('value').eq('key', 'days_off').maybeSingle();
    if (data?.value) {
      try { setDaysOff(JSON.parse(data.value)); } catch { setDaysOff({}); }
    }
  };

  const saveDaysOff = async (newDaysOff: Record<string, string[]>) => {
    setDaysOff(newDaysOff);
    await supabase.from('app_config').upsert({ key: 'days_off', value: JSON.stringify(newDaysOff) });
  };

  const toggleDayOff = (userId: string, date: string) => {
    if (!calendarEditMode) return;
    const userDays = [...(daysOff[userId] || [])];
    const idx = userDays.indexOf(date);
    if (idx >= 0) userDays.splice(idx, 1); else userDays.push(date);
    const newDaysOff = { ...daysOff, [userId]: userDays };
    saveDaysOff(newDaysOff);
  };

  const handleCalendarAuth = async () => {
    const { data } = await supabase.rpc('verify_admin_login', { p_username: 'admin', p_password: calendarAdminPassword });
    if (data?.success) {
      setCalendarEditMode(true);
      setCalendarAuthError('');
    } else {
      setCalendarAuthError(t('admin.dash.wrongPassword'));
    }
  };

  const getAdminUsername = (): string | null => {
    if (adminUsernameRef.current) return adminUsernameRef.current;
    const session = localStorage.getItem('_ust_sh_') || sessionStorage.getItem('_ust_sh_');
    if (!session) return null;
    try {
      const decoded = atob(session);
      const parts = decoded.split('_');
      return parts[2] || null;
    } catch { return null; }
  };

  const isSuperAdmin = ['andreas', 'andreas@unrealstudiobali.com'].includes((getAdminUsername() || '').toLowerCase());

  // --- DATA LOADING ---
  const loadData = useCallback(async () => {
      // Cargar TODO en PARALELO (antes era secuencial → 5 viajes encadenados =
      // panel "ultra lento" en conexiones lentas). Cada bloque es independiente.
      const userId = getAdminUserId();
      const [projectsRes, blogsRes, usersRes, clientsRes, configRes] = await Promise.all([
          supabase.from('projects').select('*').order('sort_order', { ascending: true }),
          supabase.from('blogs').select('*').order('published_date', { ascending: false }),
          userId ? supabase.rpc('admin_list_users', { p_user_id: userId }) : Promise.resolve({ data: null, error: null }),
          userId ? supabase.rpc('admin_list_clients', { p_user_id: userId }) : Promise.resolve({ data: null, error: null }),
          supabase.from('app_config').select('*'),
      ]);

      if (projectsRes.data) {
          setProjects(projectsRes.data.map((p: any) => ({
                ...p,
                gallery: parseJsonField(p.gallery, []),
                investor_tiers: parseJsonField(p.investor_tiers, []),
          })) as unknown as Project[]);
      } else if (projectsRes.error) { console.error('Error loading projects:', projectsRes.error); }

      if (blogsRes.data) setBlogs(blogsRes.data as unknown as BlogPost[]);
      else if (blogsRes.error) console.error('Error loading blogs:', blogsRes.error);

      if ((usersRes.data as any)?.success) setUsers((usersRes.data as any).users || []);
      if ((clientsRes.data as any)?.success) setClients((clientsRes.data as any).clients || []);

      if (configRes.data && configRes.data.length > 0) {
          const configObj: Record<string, any> = {};
          configRes.data.forEach((row: any) => { configObj[row.key] = row.value; });
          setConfig({ ...DEFAULT_CONFIG, ...configObj } as AppConfig);
      } else if (configRes.error) { console.error('Error loading config:', configRes.error); }
  }, []);

  useEffect(() => {
    let cancelled = false;
    const guard = async () => {
      // Acceso válido por DOS vías: token legacy (_ust_sh_) O sesión Supabase Auth
      // (nuevo login unificado). El login nuevo NO setea _ust_sh_, así que comprobar
      // solo el token legacy rebotaba a /admin/login y dejaba el panel en blanco.
      const legacy = localStorage.getItem('_ust_sh_') || sessionStorage.getItem('_ust_sh_');
      if (!legacy) {
        const { data } = await supabase.auth.getSession();
        if (!data.session) { if (!cancelled) navigate('/admin/login'); return; }
        // El login nuevo (Supabase Auth) NO setea _ust_sh_. Resolvemos el id de
        // admin (sistema admin_users) desde la sesión vía admin_self(), si no las
        // RPC admin_* reciben id null y todo sale vacío.
        try {
          const { data: self } = await supabase.rpc('admin_self');
          if (!cancelled && self?.success) {
            adminIdRef.current = self.user_id;
            adminUsernameRef.current = self.username;
          }
        } catch { /* ignore */ }
      }
      if (cancelled) return;
      // Carga datos, pero NO bloquees el panel indefinidamente si la red va lenta:
      // a los 12s mostramos la UI igualmente (con lo que haya cargado).
      await Promise.race([loadData(), new Promise((r) => setTimeout(r, 12000))]);
      if (!cancelled) setBooted(true);
      loadDaysOff();
      void loadMySignature();
    };
    void guard();
    return () => { cancelled = true; };
  }, [navigate, loadData]);

  useEffect(() => {
    const session = localStorage.getItem('_ust_sh_') || sessionStorage.getItem('_ust_sh_');
    if (session && users.length > 0) {
        try {
            const decoded = atob(session);
            const userId = decoded.split('_')[1];
            const found = users.find((u: any) => String(u.id) === String(userId));
            if (found) setCurrentUserData(found);
        } catch(e) {}
    }
  }, [users]);

  // --- GUÍA / WALKTHROUGH ---
  const finishWalkthrough = () => {
    localStorage.setItem('unreal_walkthrough_seen', 'true');
    setWalkthroughStep(null);
  };

  const nextStep = () => {
    if (walkthroughStep !== null && walkthroughStep < GUIDE_STEPS.length - 1) {
      setWalkthroughStep(walkthroughStep + 1);
    } else {
      finishWalkthrough();
    }
  };

  const prevStep = () => {
    if (walkthroughStep !== null && walkthroughStep > 0) {
      setWalkthroughStep(walkthroughStep - 1);
    }
  };

  const handleLogout = async () => {
    // Limpiar token legacy + cerrar sesión de Supabase Auth (el admin entra por
    // Supabase Auth, no por el token legacy → sin signOut la sesión persistía y
    // "cerrar sesión" no hacía nada). Redirect DURO para garantizar estado limpio.
    localStorage.removeItem('_ust_sh_');
    sessionStorage.removeItem('_ust_sh_');
    try { await supabase.auth.signOut(); } catch { /* ignore */ }
    window.location.href = '/admin/login';
  };

  const filteredAdminBlogs = useMemo(() => {
    let result = [...blogs];
    if (blogTagFilter !== 'Todos') {
      result = result.filter(b => b.tag === blogTagFilter);
    }
    if (blogSearch.trim()) {
      const q = blogSearch.toLowerCase();
      result = result.filter(b => b.title.toLowerCase().includes(q) || b.tag?.toLowerCase().includes(q));
    }
    result.sort((a, b) => {
      const dateA = new Date(a.published_date).getTime();
      const dateB = new Date(b.published_date).getTime();
      return blogSortOrder === 'newest' ? dateB - dateA : dateA - dateB;
    });
    return result;
  }, [blogs, blogTagFilter, blogSearch, blogSortOrder]);

  const adminBlogTags = useMemo(() => {
    const tags = blogs.map(b => b.tag).filter(Boolean);
    return ['Todos', ...Array.from(new Set(tags))];
  }, [blogs]);

  // --- IMAGE UPLOAD LOGIC ---
  // Sube un brochure para un IDIOMA concreto → currentProject.brochures[lang].
  const handleBrochureLangUpload = async (e: React.ChangeEvent<HTMLInputElement>, lang: string) => {
    const file = e.target.files?.[0]; if (!file) return;
    setUploading(true);
    try {
      const path = await uploadImage(file, 'projects');
      if (!path) throw new Error('Upload failed');
      setCurrentProject(prev => ({ ...prev, brochures: { ...(((prev as any).brochures) || {}), [lang]: getImageUrl(path) } } as any));
    } catch { alert(t('admin.dash.saveClientError')); } finally { setUploading(false); }
  };

  // Plano por URL (además de subir PDF): pegar un enlace de Drive/PDF. Convierte
  // los enlaces de Google Drive a /preview para que se abran/incrusten bien.
  const [floorPlanUrl, setFloorPlanUrl] = useState('');
  const driveToPreview = (u: string): string => {
    const m = u.match(/\/file\/d\/([^/?]+)/) || u.match(/[?&]id=([^&]+)/);
    return m ? `https://drive.google.com/file/d/${m[1]}/preview` : u.trim();
  };
  const addFloorPlanUrl = () => {
    const u = floorPlanUrl.trim();
    if (!u) return;
    const norm = u.includes('drive.google.com') ? driveToPreview(u) : u;
    setCurrentProject((prev) => ({ ...prev, floor_plans: [...(prev.floor_plans || []), norm] }));
    setFloorPlanUrl('');
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, type: 'project_main' | 'project_gallery' | 'blog_main' | 'project_brochure' | 'project_construction_update' | 'project_construction_gallery' | 'project_floor_plans') => {
      const file = e.target.files?.[0];
      if (!file) return;

      setUploading(true);
      let folder = 'misc';
      if (type.startsWith('project')) folder = 'projects';
      if (type.startsWith('blog')) folder = 'blogs';

      try {
          const path = await uploadImage(file, folder);
          if (!path) throw new Error('Upload failed');

          if (type === 'project_main') {
              setCurrentProject(prev => ({ ...prev, image: path }));
          } else if (type === 'project_gallery') {
              const currentGallery = currentProject.gallery || [];
              setCurrentProject(prev => ({ ...prev, gallery: [...currentGallery, path] }));
          } else if (type === 'project_construction_gallery') {
              const currentGallery = currentProject.construction_gallery || [];
              setCurrentProject(prev => ({ ...prev, construction_gallery: [...currentGallery, path] }));
          } else if (type === 'project_floor_plans') {
              const currentPlans = currentProject.floor_plans || [];
              setCurrentProject(prev => ({ ...prev, floor_plans: [...currentPlans, path] }));
          } else if (type === 'blog_main') {
              setCurrentBlog(prev => ({ ...prev, image: path }));
          } else if (type === 'project_brochure') {
              const oldUrl = currentProject.brochure_url;
              if (oldUrl && oldUrl.includes('/storage/v1/object/public/')) {
                  try {
                      const oldPath = oldUrl.split('/storage/v1/object/public/')[1];
                      if (oldPath) {
                          const bucketAndPath = oldPath.split('/');
                          const bucket = bucketAndPath[0];
                          const filePath = bucketAndPath.slice(1).join('/');
                          await supabase.storage.from(bucket).remove([filePath]);
                      }
                  } catch (err) { console.warn('No se pudo borrar archivo anterior:', err); }
              }
              setCurrentProject(prev => ({ ...prev, brochure_url: getImageUrl(path) }));
          } else if (type === 'project_construction_update') {
              const oldUrl = currentProject.construction_update_url;
              if (oldUrl && oldUrl.includes('/storage/v1/object/public/')) {
                  try {
                      const oldPath = oldUrl.split('/storage/v1/object/public/')[1];
                      if (oldPath) {
                          const bucketAndPath = oldPath.split('/');
                          const bucket = bucketAndPath[0];
                          const filePath = bucketAndPath.slice(1).join('/');
                          await supabase.storage.from(bucket).remove([filePath]);
                      }
                  } catch (err) { console.warn('No se pudo borrar archivo anterior:', err); }
              }
              setCurrentProject(prev => ({ ...prev, construction_update_url: getImageUrl(path) }));
          }
      } catch (error) {
          console.error(error);
          alert(t('admin.dash.uploadError'));
      } finally {
          setUploading(false);
          // Reset input value to allow uploading same file again if needed
          e.target.value = '';
      }
  };

  const removePhoto = (photo: string, type: 'main' | 'gallery' | 'construction_gallery' | 'floor_plans') => {
    if (type === 'main') {
        setCurrentProject(prev => ({ ...prev, image: '' }));
    } else if (type === 'gallery') {
        setCurrentProject(prev => ({ 
            ...prev, 
            gallery: (prev.gallery || []).filter(img => img !== photo) 
        }));
    } else if (type === 'construction_gallery') {
        setCurrentProject(prev => ({ 
            ...prev, 
            construction_gallery: (prev.construction_gallery || []).filter(img => img !== photo) 
        }));
    } else if (type === 'floor_plans') {
        setCurrentProject(prev => ({ 
            ...prev, 
            floor_plans: (prev.floor_plans || []).filter(img => img !== photo) 
        }));
    }
  };

  const moveGalleryImage = (index: number, direction: number) => {
    const newGallery = [...(currentProject.gallery || [])];
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= newGallery.length) return;
    
    // Swap elements
    const temp = newGallery[index];
    newGallery[index] = newGallery[targetIndex];
    newGallery[targetIndex] = temp;
    
    setCurrentProject(prev => ({ ...prev, gallery: newGallery }));
  };

  // --- LOGICA DE PROYECTOS ---
  const openEditProject = (proj?: Project) => {
    setGalleryInput(''); 
    
    // Fix: Handle both string (new format) and array (legacy format) for loading tiers into textarea
    const tiers = parseJsonField(proj?.investor_tiers, []);
    setTiersInput(Array.isArray(tiers) ? tiers.join('\n') : (typeof proj?.investor_tiers === 'string' ? proj.investor_tiers : ''));
    
    const defaultProject: Partial<Project> = {
      id: `proj-${Date.now()}`,
      name: '', location: config.customZones[0] || '', description: '',
      investor_price: 0, market_price: 0, price_currency: 'EUR', status: config.customStatuses[0] || '',
      image: '', property_type: config.customTypes[0] || '', distance_beach: '',
      available_units: '', completion_percent: 0, years_contract: 25, years_extension: 10,
      brochure_link: '', roi: '', roi_type: 'Bruto/año', investor_tiers: [], gallery: [], is_featured: false,
      bedrooms: 0, bathrooms: 0, area_m2: 0, has_pool: false, amenities: [], furnishing: '',
      annual_rental_projection: 0, completion_date: '', brochure_url: '',
      construction_update_url: '', construction_update_date: '', google_maps_url: '',
      land_ratio: 30, floor_plans: [], construction_gallery: [], furnishing_items: [], is_hidden: false
    };

    setCurrentProject(proj ? { ...defaultProject, ...proj } : defaultProject);
    setIsEditing(true);
  };

  const handleSaveProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (uploading) return;
    setUploading(true);

    let newGalleryImages: string[] = [];
    if (galleryInput.trim()) {
        newGalleryImages = galleryInput.split(';').map(url => url.trim()).filter(url => url.length > 0);
    }
    
    // Fix: Save tiers as a simple string, not an array
    const processedTiers = tiersInput.trim();

    const projectToSave = {
        ...currentProject,
        gallery: [...(currentProject.gallery || []), ...newGalleryImages],
        investor_tiers: processedTiers || null
    } as Project;

    const isNew = projectToSave.id.toString().startsWith('proj-');
    let savedId = projectToSave.id;

    try {
        const userId = getAdminUserId();
        if (!userId) { alert(t('admin.dash.sessionExpired')); navigate('/admin/login'); return; }

        const projectData = isNew ? { ...projectToSave, id: undefined } : projectToSave;
        const { data, error } = await supabase.rpc('admin_save_project', {
          p_user_id: userId,
          p_project: projectData
        });
        if (error) throw error;
        if (data && !data.success) throw new Error(data.error);
        if (data && data.id) savedId = data.id;

        // Campos extra (agencia / legal / drive / vídeo) que admin_save_project no
        // cubre, vía RPC additiva. (Se quita el viejo raw update de is_hidden: la RLS
        // lo denegaba y admin_save_project ya persiste is_hidden.)
        await supabase.rpc('admin_save_project_extra', { p_user_id: userId, p_project: { ...projectData, id: savedId } });
        // Traducciones EN/ID de los campos de ficha (para packs de agencia multilingües).
        await supabase.rpc('admin_save_project_i18n', { p_user_id: userId, p_project: { ...projectData, id: savedId } });
        // Hitos/timeline del proyecto (gestión interna, oculto en web).
        if (savedId) {
          const tl = (projectData as any).timeline;
          await supabase.from('projects').update({ timeline: Array.isArray(tl) && tl.length ? tl : null }).eq('id', savedId);
        }
        // Auto-traducción del contenido (es→en/ro/id) SIEMPRE, sin trabajo manual.
        // Fire-and-forget: no bloquea el guardado; la edge fn traduce en segundo plano.
        if (savedId) void supabase.functions.invoke('translate-project', { body: { project_id: savedId } }).catch(() => {});

        await loadData();
        setIsEditing(false);
    } catch (error) {
        console.error('Error saving project:', error);
        alert(t('admin.dash.saveProjectError'));
    } finally {
        setUploading(false);
    }
  };

  const handleDeleteProject = async (id: string) => {
    if (window.confirm(t('admin.dash.confirmDeleteProject'))) {
      const userId = getAdminUserId();
      if (!userId) { alert(t('admin.dash.sessionExpired')); navigate('/admin/login'); return; }
      const { data, error } = await supabase.rpc('admin_delete_project', {
        p_user_id: userId,
        p_project_id: id
      });
      if (error || (data && !data.success)) {
          console.error('Error deleting project:', error || data?.error);
          alert(t('admin.dash.deleteProjectError'));
          return;
      }
      await loadData();
    }
  };

  // --- LOGICA DE BLOGS ---
  const openEditBlog = (post?: BlogPost) => {
    setCurrentBlog(post ? { ...post } : {
      id: `blog-${Date.now()}`,
      title: '', tag: 'MERCADO', description: '', content: '', image: '',
      published_date: new Date().toISOString().split('T')[0]
    });
    setIsEditingBlog(true);
  };

  const wrapSelection = (tag: string) => {
    if (!blogContentRef.current) return;
    const textarea = blogContentRef.current;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = textarea.value;
    const selection = text.substring(start, end);
    const before = text.substring(0, start);
    const after = text.substring(end, text.length);

    let newContent = '';
    if (tag === 'b') newContent = `${before}<strong>${selection}</strong>${after}`;
    else if (tag === 'p') newContent = `${before}<p>${selection}</p>${after}`;
    else newContent = `${before}<${tag}>${selection}</${tag}>${after}`;

    setCurrentBlog({ ...currentBlog, content: newContent });
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + tag.length + 2, start + tag.length + 2 + selection.length);
    }, 0);
  };

  const handleSaveBlog = async (e: React.FormEvent) => {
    e.preventDefault();
    if (uploading) return;
    setUploading(true);

    const blogToSave = currentBlog as BlogPost;
    const isNew = blogToSave.id.toString().startsWith('blog-');

    try {
        const userId = getAdminUserId();
        if (!userId) { alert(t('admin.dash.sessionExpired')); navigate('/admin/login'); return; }

        const blogData = isNew ? { ...blogToSave, id: undefined } : blogToSave;
        const { data, error } = await supabase.rpc('admin_save_blog', {
          p_user_id: userId,
          p_blog: blogData
        });
        if (error) throw error;
        if (data && !data.success) throw new Error(data.error);
        await loadData();
        setIsEditingBlog(false);
    } catch (error) {
        console.error('Error saving blog:', error);
        alert(t('admin.dash.saveBlogError'));
    } finally {
        setUploading(false);
    }
  };

  const handleDeleteBlog = async (id: string) => {
    if (window.confirm(t('admin.dash.confirmDeleteBlog'))) {
      const userId = getAdminUserId();
      if (!userId) { alert(t('admin.dash.sessionExpired')); navigate('/admin/login'); return; }
      const { data, error } = await supabase.rpc('admin_delete_blog', {
        p_user_id: userId,
        p_blog_id: id
      });
      if (error || (data && !data.success)) {
          console.error('Error deleting blog:', error || data?.error);
          alert(t('admin.dash.deleteBlogError'));
          return;
      }
      await loadData();
    }
  };

  // --- LOGICA DE USUARIOS ---
  const openEditUser = (user?: User) => {
    setCurrentUser(user ? { ...user } : { id: `user-${Date.now()}`, name: '', username: '', password_hash: '' });
    setIsEditingUser(true);
  };

  const handleSaveUser = async (e: React.FormEvent) => {
    e.preventDefault();
    const userToSave = currentUser as User;
    
    // El try/catch completo ha sido reemplazado según instrucciones
    try {
        const userId = getAdminUserId();
        if (!userId) { alert(t('admin.dash.sessionExpired')); navigate('/admin/login'); return; }
        
        const { data, error } = await supabase.rpc('admin_save_user', {
            p_user_id: userId,
            p_target_user: currentUser
        });
        if (error) throw error;
        if (data && !data.success) throw new Error(data.error);
        
        await loadData();
        void loadMySignature();
        setIsEditingUser(false);
    } catch (error) {
        console.error('Error saving user:', error);
        alert(t('admin.dash.saveUserError'));
    }
  };

  const handleDeleteUser = async (id: string) => {
    if (!window.confirm(t('admin.dash.confirmDeleteUser'))) return;
    try {
      const userId = getAdminUserId();
      if (!userId) { alert(t('admin.dash.sessionExpired')); navigate('/admin/login'); return; }
      const { data, error } = await supabase.rpc('admin_delete_user', {
        p_user_id: userId,
        p_target_user_id: id
      });
      if (error || (data && !data.success)) throw new Error(data?.error || 'Error');
      await loadData();
    } catch (error) {
      alert(t('admin.dash.deleteUserError'));
    }
  };

// --- LOGICA DE CLIENTES ---
// Para ordenar por "más caro" sumando proyectos en distintas divisas, normalizamos
// a EUR con tasas aproximadas (solo para ordenar; los importes se MUESTRAN sin convertir).
const EUR_RATE: Record<string, number> = { EUR: 1, USD: 1.08, GBP: 0.83, AUD: 1.65, IDR: 17200 };
const toEur = (amount: number, currency?: string) => (Number(amount) || 0) / (EUR_RATE[currency || 'EUR'] || 1);
const clientTotalEur = (c: any) => (c.projects || []).reduce((s: number, cp: any) => s + toEur(cp.investment_amount, cp.currency), 0);

// Opciones para los desplegables (proyectos y divisas presentes en los contratos).
const clientProjectOptions = Array.from(new Set(clients.flatMap((c: any) => (c.projects || []).map((cp: any) => cp.project_name || cp.project_id)).filter(Boolean))).sort();
const clientCurrencyOptions = Array.from(new Set(clients.flatMap((c: any) => (c.projects || []).map((cp: any) => cp.currency).filter(Boolean)))).sort();

const filteredClients = clients
  .filter((c: any) => {
    if (clientSearch.trim()) {
      const q = clientSearch.toLowerCase();
      if (!(c.name.toLowerCase().includes(q) || c.email.toLowerCase().includes(q) || c.phone?.toLowerCase().includes(q))) return false;
    }
    if (clientFilterProjects.length && !(c.projects || []).some((cp: any) => clientFilterProjects.includes(cp.project_name || cp.project_id))) return false;
    if (clientFilterCurrency && !(c.projects || []).some((cp: any) => cp.currency === clientFilterCurrency)) return false;
    const st = c.status || (c.is_active ? 'active' : 'inactive');
    if (clientFilterStatus && st !== clientFilterStatus) return false;
    if (clientFilterPerms.length) {
      const gf = ((config as any).brand?.client_features) || {};
      const ov = c.feature_overrides || {};
      if (!clientFilterPerms.every((k: string) => (gf[k] !== false) && (ov[k] !== false))) return false;
    }
    return true;
  })
  .sort((a: any, b: any) => {
    if (clientSort === 'name') return a.name.localeCompare(b.name);
    if (clientSort === 'amount_desc') return clientTotalEur(b) - clientTotalEur(a);
    if (clientSort === 'amount_asc') return clientTotalEur(a) - clientTotalEur(b);
    if (clientSort === 'recent') {
      const la = (a.projects || []).map((cp: any) => cp.purchase_date).sort().pop() || '';
      const lb = (b.projects || []).map((cp: any) => cp.purchase_date).sort().pop() || '';
      return lb.localeCompare(la);
    }
    return 0;
  });

const toggleClientSel = (id: string) => setSelectedClientIds((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
const allFilteredSelected = filteredClients.length > 0 && filteredClients.every((c: any) => selectedClientIds.has(c.id));
const toggleSelectAll = () => setSelectedClientIds((prev) => allFilteredSelected ? new Set() : new Set(filteredClients.map((c: any) => c.id)));
const bulkClients = async (action: 'delete' | 'status', status?: string) => {
  if (!selectedClientIds.size) return;
  const userId = getAdminUserId();
  if (!userId) { alert(t('admin.dash.sessionExpired')); return; }
  if (action === 'delete' && !window.confirm(t('admin.dash.bulkDeleteConfirm', { n: selectedClientIds.size, defaultValue: `¿Borrar ${selectedClientIds.size} cliente(s)? No se puede deshacer.` }))) return;
  setBulkBusy(true);
  try {
    const { data, error } = await supabase.rpc('admin_bulk_clients', { p_user_id: userId, p_ids: Array.from(selectedClientIds), p_action: action, p_status: status || null });
    if (error || !data?.success) { alert(t('admin.dash.bulkError', { defaultValue: 'Error en la acción en bloque' })); return; }
    setSelectedClientIds(new Set());
    await loadData();
  } finally { setBulkBusy(false); }
};

const openEditClient = (client?: Client) => {
  setCurrentClient(client ? { ...client } : {
    id: `client-${Date.now()}`,
    name: '', email: '', phone: '', notes: '', tags: [], is_active: true
  });
  setIsEditingClient(true);
};

const handleSaveClient = async (e: React.FormEvent) => {
  e.preventDefault();
  try {
    setUploading(true);
    const userId = getAdminUserId();
    if (!userId) { alert(t('admin.dash.sessionExpired')); navigate('/admin/login'); return; }
    const isNewClient = !currentClient.id || currentClient.id.startsWith('client-');
    const clientData = currentClient.id?.startsWith('client-') ? { ...currentClient, id: undefined } : currentClient;
    // Emails NUEVOS añadidos (principal o cualquier co-titular) → se les manda la
    // bienvenida. Comparamos el conjunto de correos ANTES vs DESPUÉS, para no
    // reenviar a los que ya estaban y para cubrir también a los co-titulares.
    const prevClient = clients.find((c) => c.id === currentClient.id);
    const prevSet = new Set(emailsOf(prevClient || {}).map((x) => x.toLowerCase()));
    const newEmail = (currentClient.email || '').trim();
    const allNewEmails = emailsOf({ email: newEmail, extra_emails: (currentClient as any).extra_emails, holders: (currentClient as any).holders });
    // Placeholder @pendiente.* nunca recibe correo.
    const addedEmails = allNewEmails.filter((e) => !prevSet.has(e.toLowerCase()) && !/@pendiente\./i.test(e));
    const { data, error } = await supabase.rpc('admin_save_client', {
      p_user_id: userId,
      p_client: clientData
    });
    if (error) throw error;
    if (data && !data.success) throw new Error(data.error);
    await loadData();
    setIsEditingClient(false);
    // El aviso de "cliente creado + contraseña temporal" SOLO al crear, no al editar.
    if (isNewClient && data && data.temp_password) {
      alert(t('admin.dash.clientCreatedTempPw', { pw: data.temp_password }));
    }
    // Auto-bienvenida a los correos nuevos (cada uno con su nombre e idioma).
    if (addedEmails.length) {
      const lang = ((currentClient as any).preferred_language || 'es') as 'es' | 'en' | 'ro' | 'id';
      const _holders = (currentClient as any).holders;
      const r = await sendWelcomeCore({ name: dedupeAmpNames(currentClient.name), email: addedEmails[0], emails: addedEmails, holders: _holders, lang, tempPassword: data?.temp_password || (currentClient as any).temp_password });
      alert(r.ok ? t('admin.dash.welcomeSent', { email: addedEmails.join(', ') }) : t('admin.dash.welcomeError', { error: r.error }));
    }
    // Al AÑADIR un cotitular a una ficha que YA tiene propiedades asignadas, ofrecer
    // repartir a partes iguales el % de participación en TODAS ellas. Cancelar = el
    // admin lo ajusta a mano por propiedad (deja la casilla en blanco).
    try {
      const finalHolders = (((currentClient as any).holders) || []).filter((h: any) => (h?.email || '').trim());
      const assignments = (((prevClient as any)?.projects) || []).filter((cp: any) => cp?.id);
      if (!isNewClient && addedEmails.length && finalHolders.length >= 2 && assignments.length) {
        const n = finalHolders.length;
        const pct = Math.round(100 / n);
        if (window.confirm(t('admin.dash.applyParticipantsAll', { defaultValue: '¿Repartir la participación a partes iguales ({{p}}% cada uno, {{n}} titulares) en las {{c}} propiedades asignadas? Aceptar = aplicar en todas; Cancelar = lo pones tú a mano por propiedad.', p: pct, n, c: assignments.length }))) {
          const participants = finalHolders.map((h: any) => ({ email: (h.email || '').trim(), pct }));
          const { data: pd, error: pe } = await supabase.rpc('admin_set_client_participants', { p_user_id: userId, p_client_id: currentClient.id, p_participants: participants });
          if (pe || (pd && !pd.success)) { alert(t('admin.dash.applyParticipantsErr', { defaultValue: 'No se pudieron aplicar los participantes a todas las propiedades.' })); }
          else { await loadData(); alert(t('admin.dash.applyParticipantsOk', { defaultValue: 'Participación aplicada en {{c}} propiedades.', c: (pd as any)?.updated ?? assignments.length })); }
        }
      }
    } catch (err) { console.error('apply participants all', err); }
  } catch (error) {
    console.error('Error saving client:', error);
    alert(t('admin.dash.saveClientError'));
  } finally {
    setUploading(false);
  }
};

// ── Correos al cliente (idioma del cliente). Cada plantilla puede enviarse a
// mano desde el "centro de correo" de la ficha, y la bienvenida además se manda
// sola al cambiar el email (ver handleSaveClient). ─────────────────────────────
const clientLangOf = (client: Client) => ((client as any).preferred_language || 'es') as 'es' | 'en' | 'ro' | 'id';
const clientPortalUrl = (lang: 'es' | 'en' | 'ro' | 'id') => `https://unrealstudiobali.com${portalPath('cliente', lang)}`;
// Todos los emails de una ficha (titular + co-titulares). Los envíos van a TODOS.
const emailsOf = (c: any): string[] => {
  const hs = Array.isArray(c?.holders) ? c.holders.map((h: any) => h?.email) : [];
  const all = [c?.email, ...((c?.extra_emails) || []), ...hs].map((e: string) => (e || '').trim()).filter(Boolean);
  const seen = new Set<string>(); const out: string[] = [];
  for (const e of all) { const k = e.toLowerCase(); if (!seen.has(k)) { seen.add(k); out.push(e); } }
  return out;
};
// Destinatarios para una PROPIEDAD concreta: si tiene participantes definidos
// (holder_participants no vacío), solo esos titulares; si no, todos (emailsOf).
const recipientsForCp = (client: any, cp: any): string[] => {
  const hp = cp?.holder_participants;
  if (Array.isArray(hp) && hp.length) {
    const seen = new Set<string>(); const out: string[] = [];
    for (const x of hp) { const e = (x?.email || '').trim(); if (!e) continue; const k = e.toLowerCase(); if (!seen.has(k)) { seen.add(k); out.push(e); } }
    return out;
  }
  return emailsOf(client);
};

// Núcleo de la bienvenida: construye y envía. Sin alerts (lo usa el botón y el auto-envío).
const sendWelcomeCore = async (args: { name: string; email: string; emails?: string[]; holders?: any[]; lang: 'es' | 'en' | 'ro' | 'id'; tempPassword?: string | null }): Promise<{ ok: boolean; error?: string }> => {
  const userId = getAdminUserId();
  if (!userId) return { ok: false, error: 'session' };
  // Un correo por titular, cada uno con SU email de acceso, SU nombre y SU IDIOMA
  // (independencia total entre titulares).
  const clientLike = { holders: args.holders, name: args.name, preferred_language: args.lang };
  const targets = (args.emails && args.emails.length ? args.emails : [args.email]).map((e) => (e || '').trim()).filter(Boolean);
  for (const to of targets) {
    const lang = holderLangByEmail(clientLike, to);
    const et = i18n.getFixedT(lang);
    const html = welcomeEmailHtml({
      firstName: holderNameByEmail(clientLike, to),
      portalUrl: clientPortalUrl(lang),
      email: to,
      tempPassword: args.tempPassword || null,
      lang,
    });
    const { data: sent, error: sErr } = await invokeSendEmail({ adminUserId: userId, to, lang, subject: et('emails.welcome.subject'), html });
    if (sErr || !sent?.success) return { ok: false, error: sent?.error || sErr?.message || 'error' };
  }
  return { ok: true };
};

const sendWelcome = async (client: Client) => {
  const email = (client.email || '').trim();
  if (!email) { alert(t('admin.dash.welcomeNoEmail')); return; }
  const userId = getAdminUserId();
  if (!userId) { alert(t('admin.dash.sessionExpired')); navigate('/admin/login'); return; }
  const lang = clientLangOf(client);
  const et = i18n.getFixedT(lang);
  // Bienvenida MANUAL → preview con personalización por titular: cada uno ve SU
  // propio email de acceso (no el del titular principal).
  const tempPw = (client as any).password_plain || client.temp_password || null;
  const buildHtml = (em: string) => { const lg = holderLangByEmail(client, em || email); return welcomeEmailHtml({ firstName: holderNameByEmail(client, em || email), portalUrl: clientPortalUrl(lg), email: em || email, tempPassword: tempPw, lang: lg }); };
  openEmailPreview({ to: emailsOf(client), subject: et('emails.welcome.subject'), html: buildHtml(emailsOf(client)[0] || email), sentMsg: (ems) => t('admin.dash.welcomeSent', { email: ems.join(', ') }), userId, lang, buildHtml, buildSubject: (em) => i18n.getFixedT(holderLangByEmail(client, em))('emails.welcome.subject') });
};

// Recuperación de contraseña manual (te llaman "perdí la clave" → se la mandas tú).
const sendResetEmail = async (client: Client) => {
  const email = (client.email || '').trim();
  if (!email) { alert(t('admin.dash.welcomeNoEmail')); return; }
  if (!window.confirm(t('admin.dash.resetConfirm', { email }))) return;
  const { data: sent, error: sErr } = await supabase.functions.invoke('send-password-reset', {
    body: { email, lang: clientLangOf(client), portal: 'cliente' },
  });
  if (sErr || !sent?.success) { alert(t('admin.dash.resetError', { error: sent?.error || sErr?.message || 'error' })); return; }
  alert(t('admin.dash.resetSent', { email }));
};

// Recordatorio de pago manual: coge el pago pendiente más relevante del cliente
// (próximo a vencer o, si hay vencidos, el más antiguo) y manda el aviso con los
// días que faltan / vencidos a día de hoy (zona horaria de Bali).
// Preview de email: en vez de enviar directo, abrimos un pop-up con la vista
// previa; el envío real ocurre al pulsar "Enviar" en sendPreviewedEmail.
// buildHtml: si se pasa, el correo se PERSONALIZA por destinatario (cada titular ve
// SU propio email de acceso). Si no, se envía el mismo html a todos los seleccionados.
const openEmailPreview = (args: { to: string | string[]; subject: string; html: string; sentMsg: (emails: string[]) => string; userId: string; lang: string; buildHtml?: (email: string) => string; buildSubject?: (email: string) => string }) => {
  const recipients = (Array.isArray(args.to) ? args.to : [args.to]).map((e) => (e || '').trim()).filter(Boolean);
  const first = recipients[0] || '';
  const html0 = args.buildHtml ? args.buildHtml(first) : args.html;
  setEmailPreview({ recipients, selected: [...recipients], previewEmail: first, subject: args.subject, html: html0, sentMsg: args.sentMsg, userId: args.userId, lang: args.lang, sending: false, buildHtml: args.buildHtml, buildSubject: args.buildSubject });
};
const sendPreviewedEmail = async () => {
  if (!emailPreview || emailPreview.selected.length === 0) return;
  const ep = emailPreview;
  setEmailPreview((p) => p ? { ...p, sending: true } : p);
  try {
    if (ep.buildHtml) {
      // Un correo PERSONALIZADO por cada destinatario (su propio email de acceso).
      for (const to of ep.selected) {
        const subj = ep.buildSubject ? ep.buildSubject(to) : ep.subject; // asunto en el idioma de CADA titular
        const { data: sent, error } = await invokeSendEmail({ adminUserId: ep.userId, to, lang: ep.lang, subject: subj, html: ep.buildHtml(to) });
        if (error || !sent?.success) { alert(t('admin.dash.reportError', { error: sent?.error || error?.message || 'error' })); setEmailPreview((p) => p ? { ...p, sending: false } : p); return; }
      }
    } else {
      const { data: sent, error } = await invokeSendEmail({ adminUserId: ep.userId, to: ep.selected, lang: ep.lang, subject: ep.subject, html: ep.html });
      if (error || !sent?.success) { alert(t('admin.dash.reportError', { error: sent?.error || error?.message || 'error' })); setEmailPreview((p) => p ? { ...p, sending: false } : p); return; }
    }
    alert(ep.sentMsg(ep.selected));
    setEmailPreview(null);
  } catch (e) {
    alert(t('admin.dash.reportError', { error: String(e) })); setEmailPreview((p) => p ? { ...p, sending: false } : p);
  }
};

const sendReminderEmail = async (client: Client) => {
  const email = (client.email || '').trim();
  if (!email) { alert(t('admin.dash.welcomeNoEmail')); return; }
  const userId = getAdminUserId();
  if (!userId) { alert(t('admin.dash.sessionExpired')); navigate('/admin/login'); return; }
  const { data } = await supabase.rpc('admin_list_client_payments', { p_user_id: userId, p_client_id: client.id });
  const units: any[] = data?.success ? (data.units || []) : [];
  const pend = units.flatMap((u) => (u.payments || []).filter((p: any) => !p.received && p.due_date).map((p: any) => ({ ...p, project_name: u.project_name })));
  if (!pend.length) { alert(t('admin.dash.reminderNoPayments')); return; }
  const today = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Makassar' }));
  today.setHours(0, 0, 0, 0);
  const daysUntil = (due: string) => Math.round((new Date(due + 'T00:00:00').getTime() - today.getTime()) / 86400000);
  // Orden: vencidos primero (más antiguo), luego próximos (el más cercano).
  pend.sort((a, b) => daysUntil(a.due_date) - daysUntil(b.due_date));
  const overdue = pend.filter((p) => daysUntil(p.due_date) < 0);
  const target = overdue.length ? overdue[0] : pend[pend.length === overdue.length ? 0 : overdue.length];
  const d = daysUntil(target.due_date);
  const lang = clientLangOf(client);
  const et = i18n.getFixedT(lang);
  const stage = d > 1 ? 'b7' : d === 0 ? 'due' : d < 0 ? (d <= -7 ? 'aN' : 'a3') : 'b7';
  const n = Math.abs(d);
  const subject = et(`emails.reminder.${stage}_subject`, { n });
  const lead = et(`emails.reminder.${stage}_lead`, { n });
  const daysLine = d > 0 ? et('emails.reminder.daysLeft', { n }) : d === 0 ? et('emails.reminder.dueToday') : et('emails.reminder.daysOverdue', { n });
  const dueStr = new Date(target.due_date + 'T00:00:00').toLocaleDateString(lang, { day: '2-digit', month: 'long', year: 'numeric' });
  const BROWN = '#3F2305';
  const buildHtml = (em: string) => {
    const lg = holderLangByEmail(client, em); const e2 = i18n.getFixedT(lg);
    const subj = e2(`emails.reminder.${stage}_subject`, { n });
    const lead2 = e2(`emails.reminder.${stage}_lead`, { n });
    const daysLine2 = d > 0 ? e2('emails.reminder.daysLeft', { n }) : d === 0 ? e2('emails.reminder.dueToday') : e2('emails.reminder.daysOverdue', { n });
    const dueStr2 = new Date(target.due_date + 'T00:00:00').toLocaleDateString(lg, { day: '2-digit', month: 'long', year: 'numeric' });
    return `
    <h1 style="font-family:'DM Serif Display',Georgia,serif;font-size:22px;margin:0 0 14px;color:${BROWN}">${subj}</h1>
    <p style="font-size:15px;line-height:1.6;margin:0 0 12px;color:${BROWN}">${e2('emails.reminder.hi', { name: holderNameByEmail(client, em) })}</p>
    <p style="font-size:15px;line-height:1.6;margin:0 0 12px;color:${BROWN}">${lead2}</p>
    <p style="font-size:14px;line-height:1.6;margin:0 0 6px;color:${BROWN}">${e2('emails.reminder.paymentFor', { project: target.project_name, label: target.label || '' })}</p>
    <p style="font-size:14px;line-height:1.6;margin:0 0 4px;color:rgba(63,35,5,.7)">${e2('emails.reminder.deadlineLabel')} <b>${dueStr2}</b></p>
    <p style="font-size:15px;font-weight:700;line-height:1.6;margin:0 0 14px;color:${BROWN}">${daysLine2}</p>
    <p style="font-size:13px;line-height:1.6;margin:0 0 16px;color:rgba(63,35,5,.7)">${e2('emails.reminder.recommendation')}</p>
    <p style="text-align:center;margin:0 0 4px"><a href="${clientPortalUrl(lg)}" style="background:${BROWN};color:#fff;text-decoration:none;font-weight:700;padding:12px 28px;border-radius:10px;display:inline-block;font-family:Manrope,Arial,sans-serif;font-size:13px">${e2('emails.reminder.cta')}</a></p>`;
  };
  openEmailPreview({ to: emailsOf(client), subject, html: buildHtml(emailsOf(client)[0] || email), sentMsg: (ems) => t('admin.dash.reminderSent', { email: ems.join(', ') }), userId, lang, buildHtml, buildSubject: (em) => i18n.getFixedT(holderLangByEmail(client, em))(`emails.reminder.${stage}_subject`, { n }) });
};

// Aviso MANUAL de reporte de obra disponible (uno por propiedad asignada), en el
// idioma del cliente. El aviso AUTOMÁTICO al subir un reporte lo manda la edge fn
// notify-report; este botón es el envío manual equivalente desde la ficha.
// HTML del aviso de reporte para UNA propiedad, en el idioma del cliente.
// Personalizado por destinatario (saludo con su nombre).
const buildReportHtmlFor = (client: Client, cp: any) => (em: string) => {
  const BROWN = '#3F2305';
  const lg = holderLangByEmail(client, em); const et = i18n.getFixedT(lg);
  return [
    `<h1 style="font-family:'DM Serif Display',Georgia,serif;font-size:22px;font-weight:700;margin:0 0 14px;color:${BROWN}">${et('emails.report.subject', { project: cp.project_name })}</h1>`,
    `<p style="font-size:15px;line-height:1.6;margin:0 0 12px;color:${BROWN}">${et('emails.report.hi', { name: holderNameByEmail(client, em) })}</p>`,
    `<p style="font-size:15px;line-height:1.6;margin:0 0 12px;color:${BROWN}">${et('emails.report.body', { project: cp.project_name })}</p>`,
    cp.unit_number ? `<p style="font-size:13px;line-height:1.6;margin:0 0 16px;color:rgba(63,35,5,.7)">${et('emails.report.unit', { unit: cp.unit_number })}</p>` : '',
    `<p style="text-align:center;margin:8px 0 4px"><a href="${clientPortalUrl(lg)}" style="background:${BROWN};color:#fff;text-decoration:none;font-weight:700;padding:14px 30px;border-radius:12px;display:inline-block;font-family:Manrope,Arial,sans-serif;font-size:14px">${et('emails.report.cta')}</a></p>`,
  ].join('');
};

// Aviso de obra: UN correo SEPARADO por propiedad (y por titular), en el idioma
// del cliente. 1 propiedad → preview; varias → se envían directas (un mail por
// propiedad × titular) tras confirmar, porque cada propiedad es un correo distinto.
const sendReportForProjects = async (client: Client, cps: any[], allowed?: string[]) => {
  const list = (cps || []).filter(Boolean);
  if (!list.length) return;
  // Si se pasa `allowed`, solo se envía a esos destinatarios (intersección con los
  // participantes de cada propiedad). Si no, a todos los participantes de cada una.
  const allowSet = (allowed && allowed.length) ? new Set(allowed.map((e) => e.toLowerCase())) : null;
  const recForCp = (cp: any) => recipientsForCp(client, cp).filter((e) => !allowSet || allowSet.has(e.toLowerCase()));
  const email = (client.email || '').trim();
  const userId = getAdminUserId();
  if (!userId) { alert(t('admin.dash.sessionExpired')); navigate('/admin/login'); return; }
  const lang = clientLangOf(client);
  const et = i18n.getFixedT(lang);

  if (list.length === 1) {
    const cp = list[0];
    const recipients = recForCp(cp);
    if (!recipients.length) { alert(t('admin.dash.reportNoRecipients', { defaultValue: 'No hay destinatarios seleccionados.' })); return; }
    const buildHtml = buildReportHtmlFor(client, cp);
    openEmailPreview({ to: recipients, subject: et('emails.report.subject', { project: cp.project_name }), html: buildHtml(recipients[0] || email), sentMsg: (ems) => t('admin.dash.reportSent', { email: ems.join(', '), n: 1 }), userId, lang, buildHtml, buildSubject: (em) => i18n.getFixedT(holderLangByEmail(client, em))('emails.report.subject', { project: cp.project_name }) });
    return;
  }

  // Varias propiedades → un correo separado por propiedad y por titular PARTICIPANTE.
  const totalR = new Set(list.flatMap((cp) => recForCp(cp).map((e) => e.toLowerCase()))).size;
  if (!totalR) { alert(t('admin.dash.reportNoRecipients', { defaultValue: 'No hay destinatarios seleccionados.' })); return; }
  if (!window.confirm(t('admin.dash.reportSendMultiConfirm', { defaultValue: 'Se enviará un correo separado por cada propiedad ({{p}}) a cada titular ({{r}}). ¿Enviar?', p: list.length, r: totalR }))) return;
  let sent = 0; let failed = 0;
  for (const cp of list) {
    const buildHtml = buildReportHtmlFor(client, cp);
    for (const to of recForCp(cp)) {
      const lg = holderLangByEmail(client, to);
      const subject = i18n.getFixedT(lg)('emails.report.subject', { project: cp.project_name });
      try {
        const { data, error } = await invokeSendEmail({ adminUserId: userId, to, lang: lg, subject, html: buildHtml(to) });
        if (error || !data?.success) failed++; else sent++;
      } catch { failed++; }
    }
  }
  alert(t('admin.dash.reportSentMulti', { defaultValue: 'Avisos enviados: {{n}}{{f}}', n: sent, f: failed ? ` · fallidos: ${failed}` : '' }));
};

const sendReportEmail = async (client: Client) => {
  const email = (client.email || '').trim();
  if (!email) { alert(t('admin.dash.welcomeNoEmail')); return; }
  const projs = ((client as any).projects || []).filter((cp: any) => cp.project_name);
  if (!projs.length) { alert(t('admin.dash.reportNoProjects')); return; }
  // El admin elige PARA CUÁLES propiedades y A QUIÉN va el aviso, si hay más de una
  // opción (varias propiedades o varios destinatarios participantes).
  const unionR = new Set(projs.flatMap((cp: any) => recipientsForCp(client, cp).map((e: string) => e.toLowerCase())));
  if (projs.length > 1 || unionR.size > 1) { setReportPicker({ client, projs, selected: projs.map((p: any) => p.id), excluded: [] }); return; }
  sendReportForProjects(client, projs);
};

// Envía al cliente un email con su CALENDARIO DE PAGOS completo (tabla por unidad:
// concepto, fecha límite, importe, recibido, balance + totales), en su idioma.
const sendCalendarEmail = async (client: Client) => {
  const email = (client.email || '').trim();
  if (!email) { alert(t('admin.dash.welcomeNoEmail')); return; }
  const userId = getAdminUserId();
  if (!userId) { alert(t('admin.dash.sessionExpired')); navigate('/admin/login'); return; }
  const { data } = await supabase.rpc('admin_list_client_payments', { p_user_id: userId, p_client_id: client.id });
  const units: any[] = data?.success ? (data.units || []) : [];
  if (!units.length) { alert(t('admin.dash.reportNoProjects')); return; }
  const lang = clientLangOf(client);
  const et = i18n.getFixedT(lang);
  const BROWN = '#3F2305';
  const money = (n: number, c: string) => { try { return new Intl.NumberFormat('es-ES', { style: 'currency', currency: c || 'EUR', maximumFractionDigits: 0, useGrouping: 'always' } as any).format(n); } catch { return `${c} ${Math.round(n)}`; } };
  const fmtd = (s: string | null) => s ? new Date(s + 'T00:00:00').toLocaleDateString(lang, { day: '2-digit', month: '2-digit', year: '2-digit' }) : '—';
  const recv = (p: any) => p.received_amount != null ? p.received_amount : (p.received ? p.amount : 0);
  const th = `style="text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:.3px;color:rgba(63,35,5,.5);padding:4px 8px;border-bottom:1px solid rgba(63,35,5,.15);white-space:nowrap"`;
  const td = `style="font-size:12px;color:${BROWN};padding:4px 8px;border-bottom:1px solid rgba(63,35,5,.08);white-space:nowrap"`;
  const h1 = `<h1 style="font-family:'DM Serif Display',Georgia,serif;font-size:22px;font-weight:700;margin:0 0 12px;color:${BROWN}">${et('emails.calendar.subject')}</h1>`;
  const intro = `<p style="font-size:14px;line-height:1.6;margin:0 0 14px;color:rgba(63,35,5,.8)">${et('emails.calendar.intro')}</p>`;
  // ¿Participa el email `em` en la unidad `u`? Sin participantes definidos → sí (todos).
  const unitHasEm = (u: any, em: string) => {
    const hp = u?.holder_participants;
    if (!Array.isArray(hp) || !hp.length) return true;
    const t = (em || '').trim().toLowerCase();
    return hp.some((x: any) => (x?.email || '').trim().toLowerCase() === t);
  };
  // Tabla(s) SOLO de las unidades en las que participa el destinatario.
  const tablesFor = (em: string, tt: typeof et = et) => {
    let tables = '';
    for (const u of units) {
      if (!unitHasEm(u, em)) continue;
      let tA = 0, tR = 0;
      tables += `<h2 style="font-size:15px;font-weight:700;margin:18px 0 6px;color:${BROWN}">${u.project_name || ''}${u.unit_number ? ' · ' + u.unit_number : ''}</h2>`;
      const fmtPaid = (s: string | null) => s ? new Date(s).toLocaleDateString(lang, { day: '2-digit', month: '2-digit', year: '2-digit' }) : '—';
      tables += `<div style="width:100%;overflow-x:auto"><table style="width:100%;border-collapse:collapse;margin-bottom:6px"><tr><th ${th}>${tt('emails.calendar.colConcept')}</th><th ${th}>${tt('emails.calendar.colDue')}</th><th ${th}>${tt('emails.calendar.colAmount')}</th><th ${th}>${tt('emails.calendar.colReceived')}</th><th ${th}>${tt('emails.calendar.colReceivedDate', { defaultValue: 'Recibido el' })}</th><th ${th}>${tt('emails.calendar.colBalance')}</th></tr>`;
      for (const p of (u.payments || [])) { const r = recv(p); tA += p.amount; tR += r; const bal = p.amount - r;
        const balCol = bal > 0 ? '#c0392b' : '#15803d';
        tables += `<tr><td ${td}>${p.label || ''}</td><td ${td}>${fmtd(p.due_date)}</td><td ${td}>${money(p.amount, u.currency)}</td><td ${td}>${money(r, u.currency)}</td><td ${td}>${p.received ? fmtPaid(p.paid_at) : '—'}</td><td style="font-size:12px;padding:4px 8px;border-bottom:1px solid rgba(63,35,5,.08);white-space:nowrap;font-weight:700;color:${balCol}">${money(bal, u.currency)}</td></tr>`; }
      const tBalCol = (tA - tR) > 0 ? '#c0392b' : '#15803d';
      tables += `<tr><td ${td}><b>${tt('emails.calendar.total')}</b></td><td ${td}></td><td ${td}><b>${money(tA, u.currency)}</b></td><td ${td}><b>${money(tR, u.currency)}</b></td><td ${td}></td><td style="font-size:12px;padding:4px 8px;border-bottom:1px solid rgba(63,35,5,.08);white-space:nowrap;font-weight:800;color:${tBalCol}"><b>${money(tA - tR, u.currency)}</b></td></tr></table></div>`;
    }
    return tables;
  };
  // Cabecera/saludo/intro/cta en el idioma de CADA titular (la tabla de cifras es
  // numérica; sus cabeceras quedan en el idioma de la ficha).
  const buildHtml = (em: string) => {
    const lg = holderLangByEmail(client, em); const e2 = i18n.getFixedT(lg);
    const h1b = `<h1 style="font-family:'DM Serif Display',Georgia,serif;font-size:22px;font-weight:700;margin:0 0 12px;color:${BROWN}">${e2('emails.calendar.subject')}</h1>`;
    const introb = `<p style="font-size:14px;line-height:1.6;margin:0 0 14px;color:rgba(63,35,5,.8)">${e2('emails.calendar.intro')}</p>`;
    const ctab = `<p style="text-align:center;margin:20px 0 4px"><a href="${clientPortalUrl(lg)}" style="background:${BROWN};color:#fff;text-decoration:none;font-weight:700;padding:13px 28px;border-radius:10px;display:inline-block;font-family:Manrope,Arial,sans-serif;font-size:13px">${e2('emails.calendar.cta')}</a></p>`;
    return h1b + `<p style="font-size:15px;line-height:1.6;margin:0 0 6px;color:${BROWN}">${e2('emails.calendar.hi', { name: holderNameByEmail(client, em) })}</p>` + introb + tablesFor(em, e2) + ctab;
  };
  // Destinatarios = unión de participantes de todas las unidades (cada uno recibe
  // SOLO sus unidades). Un titular que no participa en ninguna no recibe nada.
  const calRecipients = (() => {
    const seen = new Set<string>(); const out: string[] = [];
    for (const u of units) for (const e of recipientsForCp(client, { holder_participants: u.holder_participants })) { const k = e.toLowerCase(); if (!seen.has(k)) { seen.add(k); out.push(e); } }
    return out;
  })();
  // Preview antes de enviar (el envío real es el botón "Enviar" del pop-up). Cada
  // titular recibe un correo SEPARADO con su nombre.
  openEmailPreview({ to: calRecipients, subject: et('emails.calendar.subject'), html: buildHtml(calRecipients[0] || email), sentMsg: (ems) => t('admin.dash.calendarSent', { email: ems.join(', ') }), userId, lang, buildHtml, buildSubject: (em) => i18n.getFixedT(holderLangByEmail(client, em))('emails.calendar.subject') });
};

const handleDeleteClient = async (id: string) => {
  if (!window.confirm(t('admin.dash.confirmDeleteClient'))) return;
  try {
    const userId = getAdminUserId();
    if (!userId) { alert(t('admin.dash.sessionExpired')); navigate('/admin/login'); return; }
    const { data, error } = await supabase.rpc('admin_delete_client', {
      p_user_id: userId,
      p_client_id: id
    });
    if (error || (data && !data.success)) throw new Error('Error');
    await loadData();
  } catch (error) {
    alert(t('admin.dash.deleteClientError'));
  }
};

const handleAssignProject = async (e: React.FormEvent) => {
  e.preventDefault();
  if (!assigningProject) return;
  try {
    setUploading(true);
    const userId = getAdminUserId();
    if (!userId) { alert(t('admin.dash.sessionExpired')); navigate('/admin/login'); return; }
    const { data, error } = await supabase.rpc('admin_assign_project', {
      p_user_id: userId,
      p_client_id: assigningProject.clientId,
      p_project_id: assignForm.project_id,
      p_unit: assignForm.unit_number,
      p_amount: assignForm.investment_amount,
      p_currency: assignForm.currency,
      p_date: assignForm.purchase_date || null,
      p_status: assignForm.status,
      p_investment_type: (assignForm as any).investment_type || 'compra',
      p_pool_total: (assignForm as any).pool_total || null,
      p_participants: ((assignForm as any).participants && (assignForm as any).participants.length) ? (assignForm as any).participants : null,
    });
    if (error) throw error;
    if (data && !data.success) throw new Error(data.error);
    await loadData();
    setAssigningProject(null);
    setAssignForm({ project_id: '', unit_number: '', investment_amount: 0, currency: 'EUR', purchase_date: '', status: 'Reserva', investment_type: 'compra', pool_total: 0, participants: [] });
  } catch (error) {
    console.error('Error assigning project:', error);
    alert(t('admin.dash.assignProjectError'));
  } finally {
    setUploading(false);
  }
};

const handleUnassignProject = async (clientId: string, assignmentId: string) => {
  if (!window.confirm(t('admin.dash.confirmUnassign'))) return;
  try {
    const userId = getAdminUserId();
    if (!userId) return;
    const { data, error } = await supabase.rpc('admin_unassign_project', {
      p_user_id: userId,
      p_client_id: clientId,
      p_assignment_id: assignmentId
    });
    if (error) throw error;
    await loadData();
  } catch (error) {
    alert(t('admin.dash.unassignProjectError'));
  }
};

const handleEditAssignment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingAssignment) return;
    try {
        setUploading(true);
        const userId = getAdminUserId();
        if (!userId) { alert(t('admin.dash.sessionExpired')); navigate('/admin/login'); return; }
        const { data, error } = await supabase.rpc('admin_update_assignment', {
            p_user_id: userId,
            p_assignment_id: editingAssignment.assignment.id,
            p_unit: editingAssignment.assignment.unit_number || '',
            p_amount: editingAssignment.assignment.investment_amount || 0,
            p_currency: editingAssignment.assignment.currency,
            p_date: editingAssignment.assignment.purchase_date || null,
            p_status: editingAssignment.assignment.status || 'Reserva',
            p_delivery: (editingAssignment.assignment as any).delivery_date || '',
            p_drive: (editingAssignment.assignment as any).drive_folder_url ?? '',
            p_investment_type: (editingAssignment.assignment as any).investment_type ?? '',
            p_pool_total: (editingAssignment.assignment as any).pool_total_amount ?? null,
            p_participants: (editingAssignment.assignment as any).holder_participants ?? null
        });
        if (error) throw error;
        if (data && !data.success) throw new Error(data.error);
        await loadData();
        setEditingAssignment(null);
    } catch (error) {
        console.error('Error updating assignment:', error);
        alert(t('admin.dash.updateAssignmentError'));
    } finally {
        setUploading(false);
    }
};

const WHATSAPP_TEMPLATES = [
  { nameKey: 'admin.dash.waTplWelcome', template: (c: Client) => `¡Hola ${c.name}!\n\nBienvenido/a a Unreal Studio. Tu portal de inversor está listo:\n\nLink: https://unrealstudiobali.com/cliente\nEmail o Teléfono: ${c.email || c.phone}\nPass: ${c.temp_password || '(contraseña enviada previamente)'}\n\nCambia tu contraseña en el primer acceso.\n\n¿Alguna duda? Estamos aquí para ayudarte.` },
  { nameKey: 'admin.dash.waTplWeekly', template: (c: Client) => `¡Hola ${c.name}!\n\nTe compartimos la actualización semanal de tu inversión. Entra a tu portal para ver los últimos avances:\n\nLink: https://unrealstudiobali.com/cliente\n\n¿Preguntas? Escríbenos.` },
  { nameKey: 'admin.dash.waTplNewReport', template: (c: Client) => `¡Hola ${c.name}!\n\n[Doc] Hay un nuevo informe de obra disponible en tu portal de inversor.\n\nLink: https://unrealstudiobali.com/cliente\n\nRevísalo y cuéntanos si tienes dudas.` },
  { nameKey: 'admin.dash.waTplMilestone', template: (c: Client) => `¡Hola ${c.name}!\n\n¡Gran noticia! Tu proyecto ha alcanzado un nuevo hito de construcción.\n\nEntra al portal para ver los detalles y fotos actualizadas:\nLink: https://unrealstudiobali.com/cliente` },
  { nameKey: 'admin.dash.waTplCompletion', template: (c: Client) => `¡Hola ${c.name}!\n\n¡Enhorabuena! Tu proyecto se ha completado. Es momento de coordinar la entrega.\n\nContáctanos para agendar los próximos pasos.` },
  { nameKey: 'admin.dash.waTplAnniversary', template: (c: Client) => `¡Hola ${c.name}!\n\n¡Feliz aniversario de inversión! Gracias por confiar en Unreal Studio.\n\nSi te interesa explorar nuevas oportunidades, estamos a tu disposición.` },
  { nameKey: 'admin.dash.waTplNewProject', template: (c: Client) => `¡Hola ${c.name}!\n\nComo inversor de Unreal Studio, tienes acceso prioritario a nuestro nuevo proyecto.\n\n¿Te gustaría recibir información exclusiva antes del lanzamiento público?\n\nEscríbenos para reservar tu plaza.` }
];

const openWhatsAppTemplate = (client: Client, message: string) => {
  const phone = client.phone?.replace(/[^0-9]/g, '') || '34625710770';
  window.open(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`, '_blank');
};

  // --- OPCIONES DE CONFIGURACION ---
  
  // Sube una imagen de marca (logo/sello) y guarda su URL pública en config.brand.
  const handleBrandUpload = async (fieldKey: string, file: File) => {
    const path = await uploadImage(file, 'brand');
    if (!path) { alert(t('admin.dash.imageUploadError')); return; }
    const url = getImageUrl(path);
    setConfig({ ...config, brand: { ...((config as any).brand || {}), [fieldKey]: url } } as any);
  };

  // Atajo para fijar una clave dentro de config.brand.
  const setBrandKey = (key: string, value: any) =>
    setConfig({ ...config, brand: { ...((config as any).brand || {}), [key]: value } } as any);

  // Carga / guarda la firma PERSONAL del admin actual (admin_users.signature_url).
  const loadMySignature = useCallback(async () => {
    const userId = getAdminUserId();
    if (!userId) return;
    const { data } = await supabase.rpc('admin_my_signature', { p_user_id: userId });
    if (data?.success) setMySignature(data.signature_url || '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sube la firma de un admin (en su perfil de Administradores) → currentUser.signature_url.
  const handleUserSignatureUpload = async (file: File) => {
    const path = await uploadImage(file, 'signatures');
    if (!path) { alert(t('admin.dash.signatureUploadError')); return; }
    setCurrentUser({ ...currentUser, signature_url: getImageUrl(path) } as any);
  };

  const handleMySignatureUpload = async (file: File) => {
    const userId = getAdminUserId();
    if (!userId) { alert(t('admin.dash.sessionExpired')); return; }
    const path = await uploadImage(file, 'signatures');
    if (!path) { alert(t('admin.dash.signatureUploadError')); return; }
    const url = getImageUrl(path);
    const { data } = await supabase.rpc('admin_set_my_signature', { p_user_id: userId, p_url: url });
    if (data?.success) { setMySignature(url); } else { alert(t('admin.dash.signatureSaveError')); }
  };

  const saveConfigToDb = async (newConfig: AppConfig) => {
      try {
        const userId = getAdminUserId();
        if (!userId) { alert(t('admin.dash.sessionExpired')); navigate('/admin/login'); return; }

        const configEntries = [
          { key: 'labels', value: newConfig.labels },
          { key: 'customTypes', value: newConfig.customTypes },
          { key: 'customZones', value: newConfig.customZones },
          { key: 'customStatuses', value: newConfig.customStatuses },
          { key: 'exchangeRates', value: newConfig.exchangeRates },
          { key: 'brand', value: (newConfig as any).brand || {} },
        ];
        for (const entry of configEntries) {
          const { error } = await supabase.rpc('admin_save_config', {
            p_user_id: userId,
            p_key: entry.key,
            p_value: entry.value
          });
          if (error) throw error;
        }
        setConfig(newConfig);
        alert(t('admin.dash.configSaved'));
        await loadData();
      } catch (error) {
          console.error('Config save error:', error);
          alert(t('admin.dash.configSaveError'));
      }
  };

  const handleAddOption = () => {
    if (!newOptionValue.trim() || !optionManager) return;
    const field = optionManager.field as 'customTypes' | 'customZones' | 'customStatuses';
    const updatedConfig = { ...config, [field]: [...config[field], newOptionValue.trim()] };
    saveConfigToDb(updatedConfig);
    setNewOptionValue('');
  };

  const handleDeleteOption = (index: number) => {
    if (!optionManager) return;
    const field = optionManager.field as 'customTypes' | 'customZones' | 'customStatuses';
    const updatedConfig = { ...config, [field]: config[field].filter((_, i) => i !== index) };
    saveConfigToDb(updatedConfig);
  };
  
  const handleSaveLabels = () => {
      saveConfigToDb(config);
  };

  if (!booted) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-almond gap-4">
        <div className="w-12 h-12 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
        <p className="text-primary/50 text-xs font-bold uppercase tracking-widest animate-pulse">{t('admin.dash.loadingPanel', { defaultValue: 'Cargando panel…' })}</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex font-sans text-left relative">
      <AdminSidebar />
      <div className="flex-1 flex flex-col min-w-0 overflow-x-hidden">

      {/* 5-STEP CENTERED GUIDE OVERLAY */}
      {walkthroughStep !== null && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm transition-opacity duration-300">
          <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-md w-full relative animate-in zoom-in-95 duration-300 mx-4 border border-gray-100">
            
            {/* Close Button */}
            <button 
              onClick={() => setWalkthroughStep(null)}
              className="absolute top-4 right-4 text-gray-400 hover:text-primary transition"
              title={t('admin.dash.closeGuide')}
            >
              <span className="material-symbols-outlined">close</span>
            </button>

            <div className="mb-6">
              <span className="text-[10px] font-black uppercase text-primary/40 tracking-widest block mb-2">
                {t('admin.dash.stepOf', { current: walkthroughStep + 1, total: GUIDE_STEPS.length })}
              </span>
              <h2 className="text-2xl font-serif text-primary mb-4 leading-tight">
                {t(GUIDE_STEPS[walkthroughStep].titleKey)}
              </h2>
              <p className="text-primary/70 text-sm font-medium leading-relaxed">
                {t(GUIDE_STEPS[walkthroughStep].textKey)}
              </p>
            </div>

            <div className="flex justify-between items-center pt-4 border-t border-gray-100">
              {/* Progress Dots */}
              <div className="flex gap-2">
                {GUIDE_STEPS.map((_, i) => (
                  <div 
                    key={i}
                    className={`w-2 h-2 rounded-full transition-colors duration-300 ${
                      i === walkthroughStep ? 'bg-primary' : 'bg-gray-200'
                    }`}
                  />
                ))}
              </div>

              {/* Navigation Buttons */}
              <div className="flex gap-3">
                {walkthroughStep > 0 && (
                  <button 
                    onClick={prevStep}
                    className="text-primary font-bold text-xs uppercase tracking-widest hover:text-primary/70 px-2"
                  >
                    {t('admin.dash.prev')}
                  </button>
                )}
                
                <button 
                  onClick={nextStep}
                  className="bg-primary text-white px-5 py-2.5 rounded-xl font-bold text-xs uppercase tracking-widest shadow-lg hover:bg-black transition-all"
                >
                  {walkthroughStep < GUIDE_STEPS.length - 1 ? t('admin.dash.next') : t('admin.dash.finish')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <header className="bg-white border-b border-gray-200 px-3 md:px-6 py-3 md:py-4 sticky top-0 z-30 shadow-sm flex justify-between items-center gap-2">
        <div className="flex items-center flex-shrink-0">
          <Link to="/"><BrandLogo imgClassName="h-8 md:h-10 w-auto object-contain" textClassName="font-serif text-primary text-lg md:text-2xl tracking-tight" /></Link>
        </div>
        <div className="flex items-center gap-2 md:gap-3 flex-wrap justify-end">
          <select value={currency} onChange={(e) => setCurrency(e.target.value as any)} className="hidden md:block bg-white/50 border border-primary/10 rounded-full px-3 py-1.5 text-[10px] font-bold text-primary focus:ring-0 cursor-pointer hover:bg-white transition">
            {CURRENCIES.map(c => (<option key={c.code} value={c.code}>{c.code} ({c.symbol})</option>))}
          </select>
          <div className="hidden md:block"><LanguageSwitcher /></div>
          <button onClick={() => setWalkthroughStep(0)} className="hidden md:flex text-[10px] font-black uppercase tracking-widest text-primary/40 hover:text-primary transition items-center gap-1">
             <span className="material-symbols-outlined text-xs">help</span> {t('admin.common.viewGuide')}
          </button>
          <button onClick={handleLogout} className="hidden md:block bg-red-50 text-red-600 px-3 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest hover:bg-red-600 hover:text-white transition">{t('admin.common.logout')}</button>
          {/* Bocadillo (tres rayitas) en móvil: todos los menús + idioma/divisa/guía/salir */}
          <button onClick={() => setAdminMenuOpen((o) => !o)} aria-label={t('fix.adm.menuAria')} className="md:hidden w-10 h-10 rounded-full bg-gray-100 text-primary flex items-center justify-center active:scale-95 transition">
            <span className="material-symbols-outlined text-[22px]">{adminMenuOpen ? 'close' : 'menu'}</span>
          </button>
        </div>
      </header>

      {adminMenuOpen && (
        <div className="md:hidden fixed inset-0 z-40" onClick={() => setAdminMenuOpen(false)}>
          <div className="absolute right-3 top-16 bg-white rounded-2xl shadow-xl border border-gray-100 p-3 w-[230px] max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex flex-col gap-1 mb-2">
              {ADMIN_MOBILE_NAV.map((it) => (
                <button key={it.key} onClick={() => { if (it.to) navigate(it.to); else setActiveView(it.view as any); setAdminMenuOpen(false); }}
                  className={`text-left px-3 py-2 rounded-xl text-sm font-bold capitalize transition ${!it.to && activeView === it.view ? 'bg-primary text-white' : 'text-primary/70 hover:bg-gray-100'}`}>
                  {t(`admin.nav.${it.key}`)}
                </button>
              ))}
            </div>
            <div className="border-t border-gray-100 pt-2 flex flex-col gap-2">
              <div className="flex flex-col gap-2 px-1">
                <select value={currency} onChange={(e) => setCurrency(e.target.value as any)} className="w-full bg-gray-50 border border-gray-200 rounded-lg pl-3 pr-9 py-1.5 text-xs font-bold text-primary">
                  {CURRENCIES.map(c => (<option key={c.code} value={c.code}>{c.code} ({c.symbol})</option>))}
                </select>
                <LanguageSwitcher />
              </div>
              <button onClick={() => { setWalkthroughStep(0); setAdminMenuOpen(false); }} className="text-left px-3 py-2 rounded-xl text-xs font-bold text-primary/60 hover:bg-gray-100 inline-flex items-center gap-1">
                <span className="material-symbols-outlined text-sm">help</span> {t('admin.common.viewGuide')}
              </button>
              <button onClick={handleLogout} className="text-left px-3 py-2 rounded-xl text-xs font-black uppercase tracking-widest bg-red-50 text-red-600 hover:bg-red-600 hover:text-white transition">{t('admin.common.logout')}</button>
            </div>
          </div>
        </div>
      )}

      <main className="p-4 md:p-8 max-w-7xl mx-auto w-full flex-grow">
        {activeView === 'dashboard' && <DashboardOverview />}

        {activeView === 'notifications' && <NotificationsPanel />}
        {activeView === 'cobros' && (
          <CobrosPanel
            adminUserId={getAdminUserId()}
            displayCurrency={currency}
            rates={(config as any).exchangeRates}
            onOpenPayments={(r) => { setPaymentsFilter({ name: r.project_name || '', unit: r.unit_number ?? null }); setPaymentsClient({ id: r.client_id, name: r.client_name, email: r.client_email } as any); }}
          />
        )}

        {activeView === 'faqs' && (
          <div className="animate-in fade-in duration-500">
            <h2 className="text-2xl font-serif text-primary mb-6">FAQs</h2>
            <FaqsTab data={faqsData} onChange={loadFaqs} />
          </div>
        )}

        {activeView === 'agencias' && <AgencyApplications />}

        {activeView === 'projects' && (
          <div className="animate-in fade-in duration-500">
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-end mb-8 gap-3">
              <h1 className="text-2xl font-black uppercase tracking-widest text-primary/20">{t('admin.props.mgmtTitle')}</h1>
              <button onClick={() => openEditProject()} className="bg-primary text-white px-6 py-3 rounded-xl font-black text-xs uppercase tracking-widest shadow-lg flex items-center gap-2 hover:bg-black transition">
                <span className="material-symbols-outlined text-base">add</span> {t('admin.props.newBtn')}
              </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {projects.map(proj => (
                <div key={proj.id} className="bg-white rounded-3xl overflow-hidden shadow-sm border border-gray-100 flex flex-col group">
                  <div className="h-48 relative overflow-hidden bg-gray-100">
                    {proj.image ? <img src={getImageUrl(proj.image)} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-gray-300"><span className="material-symbols-outlined text-4xl">image</span></div>}
                    <div className="absolute top-4 left-4 flex gap-2">
                      <div className="bg-primary text-white text-[8px] font-black px-3 py-1.5 uppercase rounded-lg shadow-lg">{translateStatus(proj.status, t)}</div>
                      {proj.is_hidden && <div className="bg-red-500 text-white text-[8px] font-black px-3 py-1.5 uppercase rounded-lg shadow-lg">{t('admin.props.hidden')}</div>}
                    </div>
                  </div>
                  <div className="p-6 flex-grow flex flex-col">
                    <h3 className="text-xl font-bold text-primary mb-1">{proj.name}</h3>
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-4">{proj.location}</p>
                    <div className="mt-auto pt-4 border-t border-gray-50 flex justify-between items-center">
                      <p className="font-bold text-primary">{formatPrice(proj.investor_price, proj.price_currency)}</p>
                      <div className="flex gap-2">
                        <button onClick={() => openEditProject(proj)} className="p-2 text-primary bg-almond rounded-xl hover:brightness-95"><span className="material-symbols-outlined text-sm">edit</span></button>
                        <button onClick={() => handleDeleteProject(proj.id)} className="p-2 text-red-600 bg-red-50 rounded-xl hover:bg-red-600 hover:text-white"><span className="material-symbols-outlined text-sm">delete</span></button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ... (Other views logic remains same) ... */}
        
        {/* Only updating the Project Modal section */}
        {activeView === 'blogs' && (
          <div className="animate-in fade-in duration-500">
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-end mb-8 gap-3">
              <h1 className="text-2xl font-black uppercase tracking-widest text-primary/20">{t('admin.blogTab.title')}</h1>
              <button onClick={() => openEditBlog()} className="bg-primary text-white px-6 py-3 rounded-xl font-black text-xs uppercase tracking-widest shadow-lg flex items-center gap-2 hover:bg-black transition">
                <span className="material-symbols-outlined text-base">post_add</span> {t('admin.blogTab.newBtn')}
              </button>
            </div>

            <div className="flex flex-col md:flex-row gap-3 mb-6">
              <div className="flex items-center gap-2 bg-white rounded-xl px-4 py-2 flex-1 border border-gray-100">
                <span className="material-symbols-outlined text-gray-400 text-sm">search</span>
                <input type="text" placeholder={t('admin.blogTab.search')} value={blogSearch} onChange={(e) => setBlogSearch(e.target.value)} className="bg-transparent border-none outline-none text-sm w-full font-bold text-primary" />
              </div>
              <select value={blogTagFilter} onChange={(e) => setBlogTagFilter(e.target.value)} className="bg-white rounded-xl px-4 py-2 text-sm border border-gray-100 outline-none font-bold text-primary cursor-pointer">
                {adminBlogTags.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
              <select value={blogSortOrder} onChange={(e) => setBlogSortOrder(e.target.value as 'newest' | 'oldest')} className="bg-white rounded-xl px-4 py-2 text-sm border border-gray-100 outline-none font-bold text-primary cursor-pointer">
                <option value="newest">{t('admin.blogTab.sortNewest')}</option>
                <option value="oldest">{t('admin.blogTab.sortOldest')}</option>
              </select>
            </div>

            <div className="space-y-4">
              {filteredAdminBlogs.map(post => (
                <div key={post.id} className="bg-white rounded-2xl p-4 flex gap-4 border border-gray-100 hover:shadow-md transition">
                  <div className="w-24 h-24 rounded-xl overflow-hidden bg-gray-100 shrink-0">
                    {post.image && <img src={getImageUrl(post.image)} className="w-full h-full object-cover" />}
                  </div>
                  <div className="flex-grow flex flex-col justify-center">
                    <div className="flex justify-between items-start">
                      <div>
                        <span className="text-[10px] font-black uppercase bg-gray-100 px-2 py-1 rounded text-primary/60">{post.tag}</span>
                        <h3 className="text-lg font-bold text-primary mt-1">{post.title}</h3>
                        <p className="text-[10px] text-gray-400 font-bold mt-1">{formatDate(post.published_date)}</p>
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => openEditBlog(post)} className="p-2 text-primary bg-almond rounded-xl"><span className="material-symbols-outlined text-sm">edit</span></button>
                        <button onClick={() => handleDeleteBlog(post.id)} className="p-2 text-red-600 bg-red-50 rounded-xl"><span className="material-symbols-outlined text-sm">delete</span></button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

{activeView === 'clients' && (
  <div className="animate-in fade-in duration-500">
    <div className="flex flex-col sm:flex-row sm:justify-between sm:items-end mb-8 gap-3">
      <h1 className="text-lg sm:text-2xl font-black uppercase tracking-wide sm:tracking-widest text-primary/20 break-words">{t('admin.clientsTab.title')}</h1>
      <button onClick={() => openEditClient()} className="w-full sm:w-auto justify-center bg-primary text-white px-6 py-3 rounded-xl font-black text-xs uppercase tracking-widest shadow-lg flex items-center gap-2 hover:bg-black transition shrink-0">
        <span className="material-symbols-outlined text-base">person_add</span> {t('admin.clientsTab.newClient')}
      </button>
    </div>

    <div className="flex flex-wrap items-center gap-2 mb-6">
      <div className="flex items-center gap-2 bg-white rounded-xl px-4 py-2 border border-gray-100 flex-grow min-w-[220px] max-w-md">
        <span className="material-symbols-outlined text-gray-400 text-sm">search</span>
        <input type="text" placeholder={t('admin.adminDash.searchClients')} value={clientSearch} onChange={(e) => setClientSearch(e.target.value)} className="bg-transparent border-none outline-none text-sm w-full font-bold text-primary" />
      </div>
      {/* Filtro por proyecto: multi-selección con checkboxes */}
      <div className="relative">
        <button type="button" onClick={() => setProjectFilterOpen(o => !o)} className="bg-white border border-gray-100 rounded-xl pl-3 pr-8 py-2 text-xs font-bold text-primary flex items-center gap-2 relative">
          {clientFilterProjects.length ? `${clientFilterProjects.length} ${t('admin.nav.projects')}` : t('admin.clientsTab.allProjects')}
          <span className="material-symbols-outlined text-sm absolute right-2 top-1/2 -translate-y-1/2 text-primary/40">{projectFilterOpen ? 'expand_less' : 'expand_more'}</span>
        </button>
        {projectFilterOpen && (
          <>
          <div className="fixed inset-0 z-20" onClick={() => setProjectFilterOpen(false)} />
          <div className="absolute z-30 mt-1 w-64 max-h-64 overflow-auto bg-white border border-gray-100 rounded-xl shadow-xl p-2">
            {clientProjectOptions.length === 0 && <p className="text-[11px] text-gray-400 px-2 py-1">{t('admin.clientsTab.noProjects')}</p>}
            {clientProjectOptions.map((p) => {
              const val = p as string;
              const checked = clientFilterProjects.includes(val);
              return (
                <label key={val} className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-gray-50 cursor-pointer text-xs font-bold text-primary">
                  <input type="checkbox" checked={checked} onChange={() => setClientFilterProjects(prev => checked ? prev.filter(x => x !== val) : [...prev, val])} className="accent-primary" />
                  <span className="truncate">{val}</span>
                </label>
              );
            })}
          </div>
          </>
        )}
      </div>
      <select value={clientFilterCurrency} onChange={(e) => setClientFilterCurrency(e.target.value)} className="bg-white border border-gray-100 rounded-xl pl-3 pr-8 py-2 text-xs font-bold text-primary">
        <option value="">{t('admin.clientsTab.allCurrencies')}</option>
        {clientCurrencyOptions.map((c) => <option key={c as string} value={c as string}>{c as string}</option>)}
      </select>
      <select value={clientFilterStatus} onChange={(e) => setClientFilterStatus(e.target.value)} className="bg-white border border-gray-100 rounded-xl pl-3 pr-8 py-2 text-xs font-bold text-primary">
        <option value="">{t('admin.clientsTab.allStatuses', { defaultValue: 'Todos los estados' })}</option>
        <option value="active">{t('admin.clientsTab.active')}</option>
        <option value="inactive">{t('admin.clientsTab.inactive')}</option>
        <option value="draft">{t('admin.clientsTab.draft', { defaultValue: 'Draft' })}</option>
      </select>
      <div className="flex items-center gap-1 flex-wrap">
        <span className="text-[10px] font-black uppercase tracking-widest text-gray-300">{t('admin.clientsTab.permsFilter', { defaultValue: 'Permisos' })}:</span>
        {([['drive', t('fix.adm.featDrive')], ['brochure', t('fix.adm.featBrochure')], ['construction', t('fix.adm.featConstruction')], ['constructionProgress', t('fix.adm.featConstructionProgress', { defaultValue: 'Progreso de obra' })], ['viewProject', t('fix.adm.featViewProject')], ['calculator', t('fix.adm.featCalculator')]] as [string, string][]).map(([k, label]) => (
          <button key={k} type="button" onClick={() => setClientFilterPerms((p) => p.includes(k) ? p.filter((x) => x !== k) : [...p, k])} className={`text-[10px] font-bold px-2 py-1 rounded-full border transition ${clientFilterPerms.includes(k) ? 'bg-primary text-white border-primary' : 'bg-white text-gray-400 border-gray-200 hover:border-primary/30'}`}>{label}</button>
        ))}
      </div>
      <select value={clientSort} onChange={(e) => setClientSort(e.target.value as any)} className="bg-white border border-gray-100 rounded-xl pl-3 pr-8 py-2 text-xs font-bold text-primary">
        <option value="name">{t('admin.clientsTab.sortName')}</option>
        <option value="amount_desc">{t('admin.clientsTab.sortAmountDesc')}</option>
        <option value="amount_asc">{t('admin.clientsTab.sortAmountAsc')}</option>
        <option value="recent">{t('admin.clientsTab.sortRecent')}</option>
      </select>
      {!!(clientFilterProjects.length || clientFilterCurrency || clientSearch || clientFilterStatus || clientFilterPerms.length) && (
        <button onClick={() => { setClientFilterProjects([]); setClientFilterCurrency(''); setClientSearch(''); setClientFilterStatus(''); setClientFilterPerms([]); }} className="text-[10px] font-black uppercase tracking-widest text-primary/40 hover:text-primary px-2">{t('admin.clientsTab.clear')}</button>
      )}
      <span className="text-[10px] font-black uppercase tracking-widest text-primary/30 ml-auto">{t('admin.clientsTab.clientCount', { n: filteredClients.length })}</span>
    </div>

    {/* Barra de acciones en bloque (selección múltiple) */}
    {filteredClients.length > 0 && (
      <div className="flex items-center gap-3 mb-3 flex-wrap">
        <label className="flex items-center gap-2 text-xs font-bold text-primary/60 cursor-pointer"><input type="checkbox" checked={allFilteredSelected} onChange={toggleSelectAll} className="rounded border-gray-300" /> {t('admin.clientsTab.selectAll', { defaultValue: 'Seleccionar todos' })}</label>
        {selectedClientIds.size > 0 && (
          <div className="flex items-center gap-2 flex-wrap bg-primary/5 rounded-xl px-3 py-2">
            <span className="text-xs font-black text-primary">{t('admin.clientsTab.nSelected', { n: selectedClientIds.size, defaultValue: `${selectedClientIds.size} sel.` })}</span>
            <span className="text-[10px] text-gray-400">{t('admin.clientsTab.setStatusTo', { defaultValue: 'Estado →' })}</span>
            <AsyncButton disabled={bulkBusy} onClick={() => bulkClients('status', 'active')} className="text-[10px] font-black uppercase px-2 py-1 rounded bg-green-600 text-white disabled:opacity-50">{t('admin.clientsTab.active')}</AsyncButton>
            <AsyncButton disabled={bulkBusy} onClick={() => bulkClients('status', 'inactive')} className="text-[10px] font-black uppercase px-2 py-1 rounded bg-gray-400 text-white disabled:opacity-50">{t('admin.clientsTab.inactive')}</AsyncButton>
            <AsyncButton disabled={bulkBusy} onClick={() => bulkClients('status', 'draft')} className="text-[10px] font-black uppercase px-2 py-1 rounded bg-amber-500 text-white disabled:opacity-50">{t('admin.clientsTab.draft', { defaultValue: 'Draft' })}</AsyncButton>
            <AsyncButton disabled={bulkBusy} onClick={() => bulkClients('delete')} className="text-[10px] font-black uppercase px-2 py-1 rounded bg-red-600 text-white disabled:opacity-50 inline-flex items-center gap-1"><span className="material-symbols-outlined text-xs">delete</span>{t('admin.clientsTab.deleteSel', { defaultValue: 'Borrar' })}</AsyncButton>
          </div>
        )}
      </div>
    )}

    <div className="space-y-4">
      {filteredClients.map(client => (
        <div key={client.id} className="bg-[#f7f1ea] rounded-2xl border border-[#e4d8c9] shadow-sm overflow-hidden">
          {/* Header con datos del cliente — layout consistente: casilla + info (izq) + acciones (der/abajo) */}
          <div className="p-5 sm:p-6 flex flex-col sm:flex-row sm:items-start gap-3">
            <div className="flex items-start gap-3 flex-1 min-w-0">
              <input type="checkbox" checked={selectedClientIds.has(client.id)} onChange={() => toggleClientSel(client.id)} className="mt-1.5 rounded border-gray-300 shrink-0" title={t('admin.dash.selectClient', { defaultValue: 'Seleccionar' })} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <h3 className="text-base sm:text-lg font-bold text-primary break-words">{client.name}</h3>
                  {(() => { const st = (client as any).status || (client.is_active ? 'active' : 'inactive'); return (
                    <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-full ${st === 'draft' ? 'bg-amber-50 text-amber-600' : st === 'active' ? 'bg-green-50 text-green-600' : 'bg-gray-100 text-gray-400'}`}>{st === 'draft' ? t('admin.clientsTab.draft', { defaultValue: 'Draft' }) : st === 'active' ? t('admin.clientsTab.active') : t('admin.clientsTab.inactive')}</span>
                  ); })()}
                </div>
                <p className="text-sm text-gray-500 break-words">{(client.holders && client.holders.length ? client.holders.map((h: any) => h.email).filter(Boolean).join(', ') : client.email)}{client.phone && ` · ${client.phone}`}</p>
                {(client as any).last_login && (
                  <p className="text-[11px] text-green-700 font-medium mt-0.5"><span className="material-symbols-outlined text-xs align-middle">login</span> {t('admin.clientsTab.lastLogin', { defaultValue: 'Último acceso' })}: {new Date((client as any).last_login).toLocaleString('es-ES', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</p>
                )}
                <div className="mt-1 space-y-0.5">
                  {(() => {
                    // Contraseña POR titular: cada email tiene la suya (independiente).
                    const hs = Array.isArray((client as any).holders) ? (client as any).holders.filter((h: any) => (h?.email || '').trim()) : [];
                    const perHolder = hs.filter((h: any) => h?.password_plain || h?.temp_password);
                    if (perHolder.length > 1) {
                      return perHolder.map((h: any, i: number) => {
                        const pw = h.password_plain || h.temp_password;
                        return (
                          <p key={i} className="text-[10px] text-orange-500 font-mono cursor-pointer hover:bg-orange-50 rounded px-1 inline-block break-all" onClick={() => { navigator.clipboard.writeText(pw); alert(t('admin.dash.passwordCopied')); }} title={t('admin.dash.clickToCopy')}>
                            <span className="material-symbols-outlined text-xs align-middle">key</span> <span className="text-gray-400">{h.email}:</span> {pw}
                            {h.must_change_password && <span className="text-red-400 ml-2">{t('admin.dash.temporary')}</span>}
                          </p>
                        );
                      });
                    }
                    const pw = (client as any).password_plain || client.temp_password;
                    return pw ? (
                      <p className="text-[10px] text-orange-500 font-mono cursor-pointer hover:bg-orange-50 rounded px-1 inline-block break-all" onClick={() => { navigator.clipboard.writeText(pw); alert(t('admin.dash.passwordCopied')); }} title={t('admin.dash.clickToCopy')}>
                        <span className="material-symbols-outlined text-xs align-middle">key</span> {pw}
                        {client.must_change_password && <span className="text-red-400 ml-2">{t('admin.dash.temporary')}</span>}
                      </p>
                    ) : null;
                  })()}
                  {isSuperAdmin && (client as any).password_hash && (
                    <p className="text-[9px] text-gray-300 font-mono truncate max-w-[200px] cursor-pointer hover:bg-gray-50 rounded px-1 inline-block" onClick={() => {navigator.clipboard.writeText((client as any).password_hash); alert(t('admin.dash.hashCopied'));}} title={t('admin.dash.clickToCopyHash')}>
                      🔒 {(client as any).password_hash.substring(0, 20)}...
                    </p>
                  )}
                </div>
                {client.notes && <p className="text-xs text-primary/40 mt-2 italic break-words">{client.notes}</p>}
              </div>
            </div>
            <div className="flex gap-1.5 shrink-0 flex-wrap justify-end">
              <button onClick={() => openEditClient(client)} className="p-2.5 text-primary bg-almond rounded-xl hover:brightness-95 transition" title={t('admin.dash.editData')}><span className="material-symbols-outlined text-sm">edit</span></button>
              <button onClick={() => setMailClient(client)} className="p-2.5 bg-blue-50 text-blue-600 rounded-xl hover:bg-blue-100 transition" title={t('admin.dash.mailCenter')}><span className="material-symbols-outlined text-sm">mail</span></button>
              <button onClick={() => setWhatsappClient(client)} className="p-2.5 bg-green-50 text-green-600 rounded-xl hover:bg-green-100 transition" title={t('admin.dash.sendWhatsapp')}><span className="material-symbols-outlined text-sm">chat</span></button>
              <button onClick={() => handleDeleteClient(client.id)} className="p-2.5 text-red-500 bg-red-50 rounded-xl hover:bg-red-100 transition" title={t('admin.dash.deleteClientTitle')}><span className="material-symbols-outlined text-sm">delete</span></button>
            </div>
          </div>

          {/* Proyectos asignados */}
          <div className="border-t border-gray-50 bg-gray-50/50 px-6 py-4">
            <div className="flex justify-between items-center mb-3">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-[10px] font-black uppercase text-gray-400 tracking-widest">{t('admin.clientsTab.assignedProjects')} ({(client.projects || []).length})</p>
                {(() => {
                  const byCur: Record<string, number> = {};
                  (client.projects || []).forEach((cp: any) => { const cur = cp.currency || 'EUR'; byCur[cur] = (byCur[cur] || 0) + (Number(cp.investment_amount) || 0); });
                  const parts = Object.entries(byCur).filter(([, v]) => v > 0);
                  return parts.length ? (
                    <span className="text-[10px] font-black text-primary bg-primary/5 px-2 py-0.5 rounded">
                      {t('admin.clientsTab.total')}: {parts.map(([cur, v]) => formatMoney(v, cur)).join(' + ')}
                    </span>
                  ) : null;
                })()}
              </div>
              <button onClick={() => { setAssigningProject({ clientId: client.id, clientName: client.name }); setAssignForm({ project_id: projects[0]?.id || '', unit_number: '', investment_amount: 0, currency: 'EUR', purchase_date: '', status: 'Reserva', investment_type: 'compra', pool_total: 0, participants: [] }); }} className="bg-primary text-white text-[10px] font-black uppercase tracking-widest px-4 py-2 rounded-lg flex items-center gap-1 hover:bg-black transition">
                <span className="material-symbols-outlined text-xs">add</span> {t('admin.clientsTab.assign')}
              </button>
            </div>
            {client.projects && client.projects.length > 0 ? (
              <div className="space-y-2">
                {client.projects.map((cp: any, cpIdx: number) => (
                  <div key={cp.id || cpIdx} className="flex justify-between items-center bg-white rounded-xl px-4 py-3 border border-gray-100">
                    <div className="flex items-center gap-4 flex-wrap">
                      <span className="font-bold text-primary text-sm">{cp.project_name || cp.project_id}</span>
                      {cp.unit_number && <span className="text-[10px] bg-gray-100 text-gray-500 px-2 py-0.5 rounded font-bold">{t('admin.clientsTab.unit')}: {cp.unit_number}</span>}
                      {cp.investment_amount > 0 && <span className="text-[10px] bg-primary/5 text-primary px-2 py-0.5 rounded font-bold">{formatMoney(Number(cp.investment_amount), cp.currency || 'EUR')}</span>}
                      {cp.purchase_date && <span className="text-[10px] text-gray-400 font-bold">{formatDate(cp.purchase_date)}</span>}
                      <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-full ${cp.status === 'Completado' ? 'bg-green-50 text-green-600' : cp.status === 'Pagado' ? 'bg-blue-50 text-blue-600' : 'bg-yellow-50 text-yellow-600'}`}>{translateStatus(cp.status, t)}</span>
                    </div>
                    <div className="flex gap-1.5 shrink-0 items-center">
                        {cp.drive_folder_url && <a href={cp.drive_folder_url} target="_blank" rel="noopener noreferrer" className="text-amber-700 bg-amber-50 hover:bg-amber-100 transition p-2 rounded-lg" title={t('admin.dash.driveFolder', { defaultValue: 'Carpeta de documentación (Drive)' })}><span className="material-symbols-outlined text-xl leading-none">folder</span></a>}
                        <button onClick={() => { setPaymentsFilter({ name: cp.project_name, unit: cp.unit_number ?? null }); setPaymentsClient(client); }} className="text-primary bg-primary/5 hover:bg-primary/15 transition p-2 rounded-lg" title={t('fix.adm.paymentsCalendar')}><span className="material-symbols-outlined text-xl leading-none">event</span></button>
                        <button onClick={() => setEditingAssignment({ clientId: client.id, clientName: client.name, assignment: { ...cp } })} className="text-primary bg-primary/5 hover:bg-primary/15 transition p-2 rounded-lg" title={t('admin.dash.editAssignmentTitle')}><span className="material-symbols-outlined text-xl leading-none">edit</span></button>
                        <AsyncButton onClick={() => handleUnassignProject(client.id, cp.id)} className="text-red-500 bg-red-50 hover:bg-red-100 transition p-2 rounded-lg" title={t('admin.dash.unassignTitle')}><span className="material-symbols-outlined text-xl leading-none">close</span></AsyncButton>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-gray-300 italic">{t('admin.clientsTab.noProjects')}</p>
            )}
          </div>
        </div>
      ))}
    </div>
  </div>
)}

        {/* === Arquitectura: hub de proyectos de arquitectura (documentación Drive + planes de pago) === */}
        {activeView === 'arquitectura' && (() => {
          const archItems = (clients || []).flatMap((c: any) => (c.projects || [])
            .filter((cp: any) => cp.investment_type === 'arquitectura')
            .map((cp: any) => ({ client: c, cp })));
          const groups: Record<string, { client: any; cp: any }[]> = {};
          archItems.forEach((it: any) => { const k = it.cp.project_name || it.cp.project_id || '—'; (groups[k] = groups[k] || []).push(it); });
          const groupKeys = Object.keys(groups).sort();
          return (
            <div className="animate-in fade-in duration-500">
              <div className="flex flex-col sm:flex-row sm:justify-between sm:items-end mb-8 gap-3">
                <div>
                  <h1 className="text-2xl font-black uppercase tracking-widest text-primary/20">{t('admin.nav.arquitectura', 'Arquitectura')}</h1>
                  <p className="text-xs text-gray-400 mt-1">{t('admin.arch.subtitle', { defaultValue: 'Proyectos de arquitectura: documentación (Drive) y plan de pagos por cliente.' })}</p>
                </div>
                <button onClick={() => navigate('/admin?view=clients')} className="bg-primary text-white px-5 py-3 rounded-xl font-black text-[10px] uppercase tracking-widest shadow-lg flex items-center gap-2 hover:bg-black transition">
                  <span className="material-symbols-outlined text-base">person_add</span> {t('admin.arch.associate', { defaultValue: 'Asociar cliente' })}
                </button>
              </div>
              {archItems.length === 0 ? (
                <div className="bg-[#f7f1ea] border border-[#e4d8c9] rounded-2xl p-8 text-center">
                  <span className="material-symbols-outlined text-4xl text-amber-700/40">architecture</span>
                  <p className="text-sm font-bold text-primary mt-2">{t('admin.arch.emptyTitle', { defaultValue: 'Aún no hay clientes de arquitectura' })}</p>
                  <p className="text-xs text-gray-400 mt-1 max-w-md mx-auto">{t('admin.arch.emptyHint', { defaultValue: 'Para asociar un cliente: Clientes → su ficha → en la propiedad asignada, cambia el tipo de inversión a "Arquitectura". Aparecerá aquí para gestionar su carpeta de Drive y su plan de pagos.' })}</p>
                </div>
              ) : (
                <div className="space-y-8">
                  {groupKeys.map((gk) => (
                    <div key={gk}>
                      <div className="flex items-center gap-2 mb-3">
                        <span className="material-symbols-outlined text-amber-700">architecture</span>
                        <h2 className="text-lg font-bold text-primary break-words">{gk}</h2>
                        <span className="text-[10px] font-black uppercase text-primary/30">{groups[gk].length}</span>
                      </div>
                      <div className="space-y-3">
                        {groups[gk].map(({ client, cp }, idx) => (
                          <div key={cp.id || idx} className="bg-[#f7f1ea] border border-[#e4d8c9] rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center gap-3">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-bold text-primary break-words">{client.name}</span>
                                {cp.unit_number && <span className="text-[10px] bg-white text-gray-500 px-2 py-0.5 rounded font-bold">{t('admin.clientsTab.unit')}: {cp.unit_number}</span>}
                                {cp.investment_amount > 0 && <span className="text-[10px] bg-primary/5 text-primary px-2 py-0.5 rounded font-bold">{formatMoney(Number(cp.investment_amount), cp.currency || 'EUR')}</span>}
                              </div>
                              <p className="text-xs text-gray-400 mt-0.5 break-words">{(client.holders && client.holders.length ? client.holders.map((h: any) => h.email).filter(Boolean).join(', ') : client.email)}</p>
                            </div>
                            <div className="flex gap-1.5 shrink-0 flex-wrap items-center justify-end">
                              {cp.drive_folder_url
                                ? <a href={cp.drive_folder_url} target="_blank" rel="noopener noreferrer" className="text-amber-700 bg-amber-50 hover:bg-amber-100 transition px-3 py-2 rounded-lg text-xs font-bold flex items-center gap-1"><span className="material-symbols-outlined text-base leading-none">folder</span>{t('admin.arch.driveOpen', { defaultValue: 'Drive' })}</a>
                                : <span className="text-[10px] text-gray-400 italic px-2">{t('admin.arch.noDrive', { defaultValue: 'Sin carpeta Drive' })}</span>}
                              <button onClick={() => { setPaymentsFilter({ name: cp.project_name, unit: cp.unit_number ?? null }); setPaymentsClient(client); }} className="text-primary bg-white hover:bg-primary/10 transition px-3 py-2 rounded-lg text-xs font-bold flex items-center gap-1"><span className="material-symbols-outlined text-base leading-none">payments</span>{t('admin.arch.payments', { defaultValue: 'Pagos' })}</button>
                              <button onClick={() => setEditingAssignment({ clientId: client.id, clientName: client.name, assignment: { ...cp } })} className="text-primary bg-white hover:bg-primary/10 transition px-3 py-2 rounded-lg text-xs font-bold flex items-center gap-1"><span className="material-symbols-outlined text-base leading-none">edit</span>{t('admin.arch.editFolder', { defaultValue: 'Drive / Editar' })}</button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })()}

        {/* ... (Users and Config views remain unchanged) ... */}

        {activeView === 'users' && (
          <div className="animate-in fade-in duration-500">
             <div className="flex flex-col sm:flex-row sm:justify-between sm:items-end mb-8 gap-3">
              <h1 className="text-2xl font-black uppercase tracking-widest text-primary/20">{t('admin.usersTab.title')}</h1>
              <button onClick={() => openEditUser()} className="bg-primary text-white px-6 py-3 rounded-xl font-black text-xs uppercase tracking-widest shadow-lg flex items-center gap-2 hover:bg-black transition">
                <span className="material-symbols-outlined text-base">person_add</span> {t('admin.dash.new')}
              </button>
            </div>
             <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left min-w-[600px]">
                    <thead className="bg-gray-50 border-b border-gray-100 text-[10px] font-black uppercase text-gray-400 tracking-widest">
                      <tr><th className="px-6 py-4">{t('admin.usersTab.thName')}</th><th className="px-6 py-4">{t('admin.usersTab.thUsername')}</th>{isSuperAdmin && <th className="px-6 py-4">{t('admin.usersTab.thPassword')}</th>}<th className="px-6 py-4 text-right">{t('admin.usersTab.thActions')}</th></tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {users.map(u => (
                        <tr key={u.id} className="hover:bg-gray-50 transition">
                          <td className="px-6 py-4 font-bold text-primary">{u.name}</td>
                          <td className="px-6 py-4 text-sm text-gray-500">{u.username}</td>
                          {isSuperAdmin && (
                            <td className="px-6 py-4">
                              {(() => {
                                // Mostrar la contraseña SOLO si tenemos el texto plano real.
                                // Si lo guardado es un hash bcrypt ($2a$…), NO es la contraseña
                                // → mostrar puntos (Andreas: "esa no es mi contraseña").
                                const pw = (u as any).password_plain as string | undefined;
                                const isHash = !!pw && /^\$2[aby]?\$/.test(pw);
                                if (pw && !isHash) {
                                  return <p className="text-[10px] text-orange-500 font-mono cursor-pointer hover:bg-orange-50 rounded px-1 inline-block" onClick={() => {navigator.clipboard.writeText(pw); alert(t('admin.dash.passwordCopied'));}} title={t('admin.dash.clickToCopy')}>🔑 {pw}</p>;
                                }
                                return <p className="text-[10px] text-gray-400 font-mono inline-block px-1" title={t('admin.dash.pwEncryptedHint', { defaultValue: 'Cifrada — no visible. Usa Editar para fijar una nueva.' })}>•••••••• <span className="text-[9px]">({t('admin.dash.pwEncrypted', { defaultValue: 'cifrada' })})</span></p>;
                              })()}
                            </td>
                          )}
                          <td className="px-6 py-4 text-right flex justify-end gap-2">
                            <button onClick={() => openEditUser(u)} className="p-2 text-primary bg-almond rounded-lg"><span className="material-symbols-outlined text-sm">edit</span></button>
                            <button onClick={() => handleDeleteUser(u.id)} className="p-2 text-red-600 bg-red-50 rounded-lg hover:bg-red-600 hover:text-white"><span className="material-symbols-outlined text-sm">delete</span></button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
          </div>
        )}

        {activeView === 'config' && (
           <div className="animate-in fade-in duration-500 flex flex-col md:flex-row gap-6">
             {/* Submenú lateral ordenado */}
             <nav className="md:w-48 shrink-0 flex md:flex-col gap-1.5 overflow-x-auto md:overflow-visible">
               {([['etiquetas',t('fix.adm.cfgTabLabels'),'sell'],['permisos',t('fix.adm.cfgTabPermissions'),'tune'],['marca',t('fix.adm.cfgTabBrand'),'storefront']] as [typeof configTab,string,string][]).map(([k,label,icon]) => (
                 <button key={k} onClick={() => setConfigTab(k)}
                   className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold whitespace-nowrap transition ${configTab === k ? 'bg-primary text-white shadow-sm' : 'text-primary/60 hover:bg-gray-100'}`}>
                   <span className="material-symbols-outlined text-[18px]">{icon}</span>{label}
                 </button>
               ))}
             </nav>

             <div className="flex-1 min-w-0">
             {configTab === 'etiquetas' && (
             <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
               <div className="bg-white rounded-3xl p-8 border border-gray-100 shadow-sm">
                 <h3 className="text-xl font-serif text-primary mb-6">{t('admin.configTab.labels')}</h3>
                 <div className="space-y-4">
                   {Object.keys(config.labels).map((key) => (
                     <div key={key}>
                       <label className="block text-[10px] font-black uppercase text-gray-400 mb-2">{key}</label>
                       <input
                         value={(config.labels as any)[key]}
                         onChange={(e) => setConfig({ ...config, labels: { ...config.labels, [key]: e.target.value } })}
                         className="w-full px-4 py-3 bg-gray-50 border rounded-xl font-bold text-primary text-sm"
                       />
                     </div>
                   ))}
                 </div>
                 <button onClick={handleSaveLabels} className="mt-8 w-full bg-primary text-white py-4 rounded-xl font-black uppercase text-[10px] tracking-widest shadow-md">{t('admin.configTab.saveLabels')}</button>
               </div>
               <div className="space-y-6">
                 {['customZones', 'customTypes', 'customStatuses'].map(field => (
                   <div key={field} className="bg-white rounded-2xl p-6 border border-gray-100 flex items-center justify-between shadow-sm">
                     <div>
                       <h3 className="text-lg font-serif text-primary capitalize">{field.replace('custom', '')}</h3>
                       <p className="text-[10px] text-gray-400 font-bold uppercase">{t('admin.dash.optionsAvailable', { n: (config as any)[field].length })}</p>
                     </div>
                     <button onClick={() => setOptionManager({ field: field as any, title: t('admin.dash.editField', { field: field.replace('custom', '') }) })} className="p-3 bg-primary text-white rounded-xl"><span className="material-symbols-outlined">edit</span></button>
                   </div>
                 ))}
               </div>
             </div>
             )}

             {configTab === 'permisos' && (
             <div className="bg-white rounded-3xl p-8 border border-gray-100 shadow-sm">
               <h3 className="text-xl font-serif text-primary mb-2">{t('fix.adm.clientFeaturesTitle')}</h3>
               <p className="text-xs text-gray-400 mb-6">{t('fix.adm.clientFeaturesHint')}</p>
               <div className="grid sm:grid-cols-2 gap-2">
                 {([['calculator',t('fix.adm.featCalculator')],['construction',t('fix.adm.featConstruction')],['constructionProgress',t('fix.adm.featConstructionProgress',{defaultValue:'Progreso de obra'})],['brochure',t('fix.adm.featBrochure')],['viewProject',t('fix.adm.featViewProject')],['drive',t('fix.adm.featDrive')]] as [string,string][]).map(([k,label]) => {
                   const feats = ((config as any).brand?.client_features) || {};
                   const on = feats[k] !== false;
                   return (
                     <button key={k} type="button" onClick={() => setBrandKey('client_features', { ...feats, [k]: !on })}
                       className={`flex items-center justify-between px-4 py-3 rounded-xl border text-sm font-bold transition ${on ? 'bg-green-50 border-green-200 text-green-700' : 'bg-gray-50 border-gray-200 text-gray-400'}`}>
                       {label}
                       <span className={`w-9 h-5 rounded-full flex items-center px-0.5 transition ${on ? 'bg-green-500 justify-end' : 'bg-gray-300 justify-start'}`}><span className="w-4 h-4 bg-white rounded-full" /></span>
                     </button>
                   );
                 })}
               </div>
               <AsyncButton onClick={() => saveConfigToDb(config)} className="mt-6 w-full bg-primary text-white py-4 rounded-xl font-black uppercase text-[10px] tracking-widest shadow-md">{t('fix.adm.savePermissions')}</AsyncButton>
             </div>
             )}

             {configTab === 'marca' && (
             <>
             {/* Marca y empresa — fuente única para web, emails y kwitansi */}
             <div className="bg-white rounded-3xl p-8 border border-gray-100 shadow-sm">
               <h3 className="text-xl font-serif text-primary mb-2">{t('admin.dash.brandCompany')}</h3>
               <p className="text-xs text-gray-400 mb-6">{t('admin.dash.brandCompanyHint')}</p>
               <div className="grid sm:grid-cols-2 gap-5 mb-6">
                 {[{ k: 'logo', label: t('admin.dash.logoLabel') }, { k: 'stamp', label: t('admin.dash.stampLabel') }].map(({ k, label }) => (
                   <div key={k}>
                     <label className="block text-[10px] font-black uppercase text-gray-400 mb-2">{label}</label>
                     <div className="relative border-2 border-dashed border-gray-200 rounded-2xl p-4 text-center">
                       {(config as any).brand?.[k] && (
                         <button type="button" title={t('admin.dash.deletePhoto')}
                           onClick={() => { const b = { ...((config as any).brand || {}), [k]: '' }; const nc = { ...config, brand: b } as any; setConfig(nc); void saveConfigToDb(nc); }}
                           className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center text-base leading-none shadow hover:bg-red-600 transition">×</button>
                       )}
                       {(config as any).brand?.[k]
                         ? <img src={(config as any).brand[k]} alt={label} className="h-16 mx-auto object-contain mb-1" />
                         : <span className="material-symbols-outlined text-gray-300 text-3xl">image</span>}
                       <label className="block mt-2 cursor-pointer text-[10px] font-black uppercase text-primary tracking-widest">
                         {(config as any).brand?.[k] ? t('admin.dash.change') : t('admin.dash.uploadPng')}
                         <input type="file" accept="image/png,image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleBrandUpload(k, f); }} />
                       </label>
                     </div>
                   </div>
                 ))}
               </div>
               <div className="grid sm:grid-cols-2 gap-5">
                 <div>
                   <label className="block text-[10px] font-black uppercase text-gray-400 mb-2">{t('admin.dash.commercialEmail')}</label>
                   <input className="w-full px-4 py-3 bg-gray-50 border rounded-xl font-bold text-primary text-sm" placeholder="hello@unrealstudiobali.com"
                     value={(config as any).brand?.commercial_email || ''} onChange={(e) => setConfig({ ...config, brand: { ...((config as any).brand || {}), commercial_email: e.target.value } } as any)} />
                 </div>
                 <div>
                   <label className="block text-[10px] font-black uppercase text-gray-400 mb-2">{t('admin.dash.contactPhone')}</label>
                   <input className="w-full px-4 py-3 bg-gray-50 border rounded-xl font-bold text-primary text-sm" placeholder="+62 ..."
                     value={(config as any).brand?.phone || ''} onChange={(e) => setConfig({ ...config, brand: { ...((config as any).brand || {}), phone: e.target.value } } as any)} />
                 </div>
               </div>
               <AsyncButton onClick={() => saveConfigToDb(config)} className="mt-6 w-full bg-primary text-white py-4 rounded-xl font-black uppercase text-[10px] tracking-widest shadow-md">{t('admin.dash.saveBrandCompany')}</AsyncButton>
               <p className="mt-3 text-[11px] text-gray-400">{t('admin.dash.signatureHint')}</p>
             </div>

             {/* Datos de empresa — una columna, módulos dinámicos */}
             <div className="mt-8 bg-white rounded-3xl p-8 border border-gray-100 shadow-sm">
               <h3 className="text-xl font-serif text-primary mb-2">{t('admin.dash.companyData')}</h3>
               <p className="text-xs text-gray-400 mb-6">{t('admin.dash.companyDataHint')}</p>
               <div className="space-y-7 max-w-xl">

                 <div>
                   <label className="block text-[10px] font-black uppercase text-gray-400 mb-2">{t('admin.dash.addresses')}</label>
                   <p className="text-[10px] text-gray-400 mb-2">{t('admin.dash.addressesHint')}</p>
                   {(((config as any).brand?.addresses) || []).map((addr: any, i: number) => {
                     const text = typeof addr === 'string' ? addr : (addr?.text || '');
                     const maps = typeof addr === 'string' ? '' : (addr?.maps || '');
                     const writeAddr = (patch: any) => { const arr = [...(((config as any).brand?.addresses) || [])]; arr[i] = { text, maps, ...patch }; setBrandKey('addresses', arr); };
                     return (
                       <div key={i} className="flex flex-col sm:flex-row gap-2 mb-3 bg-gray-50/60 p-2 rounded-xl">
                         <div className="flex-1 flex flex-col gap-2">
                           <input className="px-4 py-3 bg-white border rounded-xl text-sm text-primary" value={text} placeholder={t('admin.dash.officeAddressPh')}
                             onChange={(e) => writeAddr({ text: e.target.value })} />
                           <input className="px-4 py-2 bg-white border rounded-xl text-xs text-primary/70" value={maps} placeholder={t('admin.dash.mapsLinkPh')}
                             onChange={(e) => writeAddr({ maps: e.target.value })} />
                         </div>
                         <button type="button" onClick={() => setBrandKey('addresses', (((config as any).brand?.addresses) || []).filter((_: any, j: number) => j !== i))} className="w-10 shrink-0 bg-red-50 text-red-500 rounded-xl hover:bg-red-100 text-lg">×</button>
                       </div>
                     );
                   })}
                   <button type="button" onClick={() => setBrandKey('addresses', [...(((config as any).brand?.addresses) || []), { text: '', maps: '' }])} className="text-[10px] font-black uppercase tracking-widest text-primary">{t('admin.dash.addAddress')}</button>
                 </div>

                 <div>
                   <label className="block text-[10px] font-black uppercase text-gray-400 mb-2">{t('admin.dash.socials')}</label>
                   <p className="text-[10px] text-gray-400 mb-2">{t('admin.dash.socialsHint')}</p>
                   {(((config as any).brand?.socials) || []).map((s: any, i: number) => (
                     <div key={i} className="flex gap-2 mb-2">
                       <select className="w-40 px-3 py-3 bg-gray-50 border rounded-xl text-sm text-primary" value={s?.network || s?.label || 'instagram'}
                         onChange={(e) => { const arr = [...(((config as any).brand?.socials) || [])]; arr[i] = { ...arr[i], network: e.target.value, label: undefined }; setBrandKey('socials', arr); }}>
                         {SOCIAL_NETWORKS.map((n) => <option key={n.key} value={n.key}>{n.label}</option>)}
                       </select>
                       <input className="flex-1 px-3 py-3 bg-gray-50 border rounded-xl text-sm text-primary" value={s?.url || ''} placeholder="https://..."
                         onChange={(e) => { const arr = [...(((config as any).brand?.socials) || [])]; arr[i] = { ...arr[i], url: e.target.value }; setBrandKey('socials', arr); }} />
                       <button type="button" onClick={() => setBrandKey('socials', (((config as any).brand?.socials) || []).filter((_: any, j: number) => j !== i))} className="w-10 shrink-0 bg-red-50 text-red-500 rounded-xl hover:bg-red-100 text-lg">×</button>
                     </div>
                   ))}
                   <button type="button" onClick={() => setBrandKey('socials', [...(((config as any).brand?.socials) || []), { network: 'instagram', url: '' }])} className="text-[10px] font-black uppercase tracking-widest text-primary">{t('admin.dash.addSocial')}</button>
                 </div>

                 <div>
                   <label className="block text-[10px] font-black uppercase text-gray-400 mb-2">{t('admin.dash.openingHours')}</label>
                   {[['mon', t('admin.dash.dayMon')], ['tue', t('admin.dash.dayTue')], ['wed', t('admin.dash.dayWed')], ['thu', t('admin.dash.dayThu')], ['fri', t('admin.dash.dayFri')], ['sat', t('admin.dash.daySat')], ['sun', t('admin.dash.daySun')]].map(([dk, dl]) => (
                     <div key={dk} className="flex items-center gap-3 mb-2">
                       <span className="w-24 text-xs font-bold text-primary/70">{dl}</span>
                       <input className="flex-1 px-3 py-2.5 bg-gray-50 border rounded-xl text-sm text-primary" placeholder="9:00–18:00"
                         value={(((config as any).brand?.hours) || {})[dk] || ''} onChange={(e) => setBrandKey('hours', { ...(((config as any).brand?.hours) || {}), [dk]: e.target.value })} />
                     </div>
                   ))}
                 </div>

                 <div>
                   <label className="block text-[10px] font-black uppercase text-gray-400 mb-2">{t('admin.dash.bookingLink')}</label>
                   <input className="w-full px-4 py-3 bg-gray-50 border rounded-xl text-sm text-primary" placeholder="https://calendly.com/..."
                     value={(config as any).brand?.booking_url || ''} onChange={(e) => setBrandKey('booking_url', e.target.value)} />
                 </div>

                 <div>
                   <label className="block text-[10px] font-black uppercase text-gray-400 mb-2">{t('admin.dash.defaultCurrencyClients')}</label>
                   <select className="w-full px-4 py-3 bg-gray-50 border rounded-xl font-bold text-sm text-primary"
                     value={(config as any).brand?.default_currency_clients || 'EUR'} onChange={(e) => setBrandKey('default_currency_clients', e.target.value)}>
                     <option value="EUR">EUR</option><option value="USD">USD</option><option value="IDR">IDR</option>
                   </select>
                   <p className="text-[10px] text-gray-400 mt-1">{t('admin.dash.defaultCurrencyHint')}</p>
                 </div>
               </div>
               <AsyncButton onClick={() => saveConfigToDb(config)} className="mt-7 w-full bg-primary text-white py-4 rounded-xl font-black uppercase text-[10px] tracking-widest shadow-md">{t('admin.dash.saveCompanyData')}</AsyncButton>
             </div>
             </>
             )}
             </div>
           </div>
        )}

        {activeView === 'employees' && (
          <div className="animate-in fade-in duration-500">
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-4">
              <div className="min-w-0">
                <h2 className="text-2xl font-serif text-primary mb-1">{t('admin.dash.employeeProfiles')}</h2>
                <p className="text-sm text-gray-400">{t('admin.dash.employeeProfilesHint')}</p>
                <p className="text-xs text-primary/50 mt-1">{t('admin.dash.vacationsManagedHint')}</p>
              </div>
              <div className="flex items-stretch gap-2 flex-wrap w-full sm:w-auto shrink-0">
                <button onClick={() => setEmpModal({ emp: null })} className="flex-1 sm:flex-none justify-center bg-primary text-white text-[10px] font-black uppercase tracking-widest px-4 py-2.5 rounded-xl inline-flex items-center gap-1 hover:bg-black transition">
                  <span className="material-symbols-outlined text-sm">person_add</span> {t('fix.adm.createEmployee')}
                </button>
              </div>
            </div>
            {/* Tarjetas de empleados — mismo formato que la vista de clientes (legible en móvil) */}
            <div className="space-y-3">
              {employees.map((e) => {
                const nPerms = EMPLOYEE_PERMISSIONS.filter((p) => hasPermission(e, p.key)).length;
                const sched = (e.work_start_time && e.work_end_time) ? `${e.work_start_time.slice(0,5)}–${e.work_end_time.slice(0,5)}` : '—';
                return (
                  <div key={e.id} className="bg-[#f7f1ea] rounded-2xl border border-[#e4d8c9] shadow-sm p-5 sm:p-6 flex flex-col sm:flex-row sm:items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <h3 className="text-base sm:text-lg font-bold text-primary break-words">{e.full_name || e.email}</h3>
                        <button onClick={() => toggleEmployeeActive(e.id, !e.active)}
                          className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-full transition ${e.active ? 'bg-green-50 text-green-600 hover:bg-green-100' : 'bg-gray-100 text-gray-400 hover:bg-gray-200'}`}>
                          {e.active ? t('admin.dash.activeStatus') : t('admin.dash.inactiveStatus')}
                        </button>
                      </div>
                      <p className="text-sm text-gray-500 break-words">{e.email}</p>
                      <div className="flex items-center gap-2 mt-2 flex-wrap">
                        <span className="text-[10px] font-black uppercase tracking-widest text-primary/50 bg-primary/5 px-2 py-0.5 rounded">{t('fix.adm.thPermissions')}: {nPerms}/{EMPLOYEE_PERMISSIONS.length}</span>
                        <span className="text-[10px] font-black uppercase tracking-widest text-primary/50 bg-primary/5 px-2 py-0.5 rounded inline-flex items-center gap-1"><span className="material-symbols-outlined text-xs align-middle">schedule</span>{sched}</span>
                      </div>
                    </div>
                    <div className="flex gap-1.5 shrink-0 flex-wrap justify-end">
                      <button onClick={() => setEmpModal({ emp: e as EmployeeRow })} className="p-2.5 text-primary bg-almond rounded-xl hover:brightness-95 transition" title={t('admin.dash.editData', { defaultValue: 'Editar' })}><span className="material-symbols-outlined text-sm">edit</span></button>
                      {(e.email || '').includes('@') && (
                        <button onClick={() => setMailEmployee(e)} className="p-2.5 bg-blue-50 text-blue-600 rounded-xl hover:bg-blue-100 transition" title={t('admin.dash.mailCenter')}><span className="material-symbols-outlined text-sm">mail</span></button>
                      )}
                      <button onClick={() => { const ph = ((e as any).phone || '').replace(/[^0-9]/g, ''); if (ph) window.open('https://wa.me/' + ph, '_blank'); else setEmpModal({ emp: e as EmployeeRow }); }} className="p-2.5 bg-green-50 text-green-600 rounded-xl hover:bg-green-100 transition" title={t('admin.dash.sendWhatsapp', { defaultValue: 'WhatsApp' })}><span className="material-symbols-outlined text-sm">chat</span></button>
                      <button onClick={() => deleteEmployee(e)} className="p-2.5 text-red-500 bg-red-50 rounded-xl hover:bg-red-100 transition" title={t('fix.emp.delete', { defaultValue: 'Borrar' })}><span className="material-symbols-outlined text-sm">delete</span></button>
                    </div>
                  </div>
                );
              })}
              {employees.length === 0 && (
                <div className="px-4 py-8 text-center text-gray-400 bg-white rounded-2xl border border-gray-100">{t('admin.dash.noEmployees')}</div>
              )}
            </div>
            {empModal && (
              <EmployeeEditModal emp={empModal.emp} onClose={() => setEmpModal(null)} onSaved={async (info) => { await loadEmployees(); if (info?.active && info.email) { const { data: emp } = await supabase.from('employees').select('id, email, full_name, password, active, preferred_language, welcomed_at').ilike('email', info.email).maybeSingle(); await maybeSendEmployeeWelcome(emp as any); } }} />
            )}
            {/* Mail center de empleado — MISMO componente/flujo que clientes (lista de plantillas → previsualización con marca) */}
            {mailEmployee && (
              <div className="fixed inset-0 z-[160] flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm p-0 sm:p-4" onClick={(e) => { if (e.target === e.currentTarget) setMailEmployee(null); }}>
                <div className="relative bg-white w-full sm:max-w-2xl rounded-t-3xl sm:rounded-3xl p-5 sm:p-10 shadow-2xl max-h-[88vh] overflow-y-auto">
                  {mailBusy && (
                    <div className="absolute inset-0 z-10 bg-white/80 backdrop-blur-sm rounded-t-3xl sm:rounded-3xl flex flex-col items-center justify-center gap-3">
                      <span className="w-10 h-10 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
                      <span className="text-sm font-bold text-primary">{t('admin.dash.sendingMail')}</span>
                    </div>
                  )}
                  <div className="flex justify-between items-start gap-3 mb-6">
                    <div className="min-w-0">
                      <h2 className="text-xl sm:text-2xl font-serif text-primary">{t('admin.dash.mailCenter')}</h2>
                      <p className="text-sm text-gray-400 mt-1 truncate">{t('admin.dash.sendTo')} <strong className="text-primary">{mailEmployee.full_name || mailEmployee.email}</strong> <span className="text-gray-300">· {mailEmployee.email || '—'}</span></p>
                    </div>
                    <button onClick={() => setMailEmployee(null)} className="p-2 text-red-500 bg-red-50 rounded-xl hover:bg-red-100 transition shrink-0"><span className="material-symbols-outlined">close</span></button>
                  </div>
                  <div className="space-y-3">
                    {[
                      { icon: 'waving_hand', title: t('admin.dash.mailWelcome', { defaultValue: 'Bienvenida' }), desc: t('admin.dash.mailWelcomeDesc', { defaultValue: 'Acceso al portal + contraseña temporal' }), run: () => sendEmployeeWelcome(mailEmployee) },
                      { icon: 'schedule', title: t('admin.dash.mailCheckin', { defaultValue: 'Recordatorio de fichaje' }), desc: t('admin.dash.mailCheckinDesc', { defaultValue: 'Recuérdale fichar entrada, pausas y salida' }), run: () => sendEmployeeCheckin(mailEmployee) },
                      { icon: 'lock_reset', title: t('admin.dash.mailReset', { defaultValue: 'Recuperar contraseña' }), desc: t('admin.dash.mailResetEmp', { defaultValue: 'Enlace para crear una nueva contraseña' }), run: () => sendEmployeeReset(mailEmployee) },
                    ].map((m, idx) => (
                      <button key={idx} disabled={mailBusy} onClick={() => { void (async () => { setMailBusy(true); try { await m.run(); } finally { setMailBusy(false); } })(); }} className="w-full text-left bg-gray-50 hover:bg-blue-50 rounded-xl px-4 sm:px-6 py-4 sm:py-5 transition border border-gray-100 hover:border-blue-200 flex items-center gap-3 sm:gap-4 disabled:opacity-60">
                        <span className="material-symbols-outlined text-blue-600 shrink-0">{m.icon}</span>
                        <span className="min-w-0">
                          <span className="block font-bold text-primary text-sm mb-0.5">{m.title}</span>
                          <span className="block text-xs text-gray-400">{m.desc}</span>
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
            <AttendancePanel />
          </div>
        )}

        {activeView === 'agenda' && (
          <EventsCalendar
            adminUserId={getAdminUserId()}
            onOpenPayments={(r) => { setPaymentsFilter({ name: r.project_name || '', unit: r.unit_number ?? null }); setPaymentsClient({ id: r.client_id, name: r.client_name, email: r.client_email } as any); }}
            onOpenClient={(name) => setSearchParams({ view: 'clients', q: name })}
            onOpenVacations={() => setSearchParams({ view: 'calendar' })}
          />
        )}
        {activeView === 'calendar' && <VacationManager />}
      </main>

      {/* MODALS */}
      {/* ... Project Edit Modal ... */}
      {isEditing && (
        <div className="fixed inset-0 z-[150] flex items-center justify-end bg-black/60 backdrop-blur-sm p-4" onClick={(e) => { if (e.target === e.currentTarget) setIsEditing(false); }}>
          <div className="bg-white w-full max-w-[90vw] h-full shadow-2xl p-6 md:p-12 overflow-y-auto rounded-2xl md:rounded-l-[3rem]">
            <div className="flex justify-between items-center mb-8 pb-4 border-b">
              <h2 className="text-2xl font-serif text-primary">{t('admin.props.editorTitle')}</h2>
              <button onClick={() => setIsEditing(false)} className="p-2 text-gray-400 hover:text-primary"><span className="material-symbols-outlined">close</span></button>
            </div>
            <form onSubmit={handleSaveProject} className="space-y-8 pb-10">
               {/* ... form content ... */}
               <div className="bg-gray-50 p-6 rounded-3xl border border-gray-100 flex justify-between items-center">
                <span className="text-[10px] font-black uppercase text-primary/60">{t('admin.props.highlightHome')}</span>
                <button type="button" onClick={() => setCurrentProject({...currentProject, is_featured: !currentProject.is_featured})} className={`w-12 h-6 rounded-full transition-all flex items-center px-1 ${currentProject.is_featured ? 'bg-primary justify-end' : 'bg-gray-300 justify-start'}`}><div className="w-4 h-4 bg-white rounded-full shadow-md" /></button>
              </div>
              <div className="bg-gray-50 p-6 rounded-3xl border border-gray-100 flex justify-between items-center">
                <div>
                  <span className="text-[10px] font-black uppercase text-primary/60 block mb-1">{t('admin.props.hideFromPublic')}</span>
                  <span className="text-[9px] text-gray-400">{t('admin.props.hideFromPublicHint')}</span>
                </div>
                <button type="button" onClick={() => setCurrentProject({...currentProject, is_hidden: !currentProject.is_hidden})} className={`w-12 h-6 rounded-full transition-all flex items-center px-1 ${currentProject.is_hidden ? 'bg-primary justify-end' : 'bg-gray-300 justify-start'}`}><div className="w-4 h-4 bg-white rounded-full shadow-md" /></button>
              </div>
              
              <div className="space-y-6">
                {/* ... Image Uploads ... */}
                <div>
                   <label className="block text-[10px] font-black uppercase text-gray-400 mb-2">{t('admin.props.mainImage')}</label>
                   <div className="flex gap-2">
                       <input type="text" value={currentProject.image || ''} onChange={(e) => setCurrentProject({...currentProject, image: e.target.value})} placeholder={t('admin.props.mainImagePlaceholder')} className="flex-grow px-5 py-4 bg-gray-50 rounded-2xl font-medium border border-transparent focus:border-primary/20" />
                       <label className={`cursor-pointer bg-primary text-white px-5 py-4 rounded-2xl hover:bg-black transition flex items-center justify-center ${uploading ? 'opacity-50 pointer-events-none' : ''}`}>
                           {uploading ? <span className="material-symbols-outlined animate-spin">refresh</span> : <span className="material-symbols-outlined">upload_file</span>}
                           <input type="file" className="hidden" accept="image/*,.heic" onChange={(e) => handleFileUpload(e, 'project_main')} disabled={uploading} />
                       </label>
                   </div>
                   {currentProject.image && <div className="mt-4 h-40 rounded-2xl overflow-hidden border border-gray-200"><img src={getImageUrl(currentProject.image)} className="w-full h-full object-cover" /></div>}
                </div>

                <div>
                   <label className="block text-[10px] font-black uppercase text-gray-400 mb-2">{t('admin.props.gallery')}</label>
                   <div className="flex gap-2 mb-4">
                       <input type="text" value={galleryInput} onChange={(e) => setGalleryInput(e.target.value)} placeholder={t('admin.props.extraUrl')} className="flex-grow px-5 py-4 bg-gray-50 rounded-2xl font-medium border border-transparent focus:border-primary/20" />
                       <label className={`cursor-pointer bg-primary text-white px-5 py-4 rounded-2xl hover:bg-black transition flex items-center justify-center ${uploading ? 'opacity-50 pointer-events-none' : ''}`}>
                           {uploading ? <span className="material-symbols-outlined animate-spin">refresh</span> : <span className="material-symbols-outlined">add_photo_alternate</span>}
                           <input type="file" className="hidden" accept="image/*,.heic" onChange={(e) => handleFileUpload(e, 'project_gallery')} disabled={uploading} />
                       </label>
                   </div>
                   <div className="grid grid-cols-4 md:grid-cols-6 gap-3">
                       {(currentProject.gallery || []).map((img, idx) => (
                           <div key={idx} className="relative aspect-square rounded-xl overflow-hidden group border border-gray-200">
                               <img src={getImageUrl(img)} className="w-full h-full object-cover" />
                               <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition flex flex-col items-center justify-center gap-2 text-white">
                                   <div className="flex gap-2">
                                     <button type="button" onClick={() => moveGalleryImage(idx, -1)} disabled={idx === 0} className="p-1 hover:bg-white/20 rounded disabled:opacity-30"><span className="material-symbols-outlined text-sm">arrow_back</span></button>
                                     <button type="button" onClick={() => moveGalleryImage(idx, 1)} disabled={idx === (currentProject.gallery?.length || 0) - 1} className="p-1 hover:bg-white/20 rounded disabled:opacity-30"><span className="material-symbols-outlined text-sm">arrow_forward</span></button>
                                   </div>
                                   <button type="button" onClick={() => removePhoto(img, 'gallery')} className="p-1 hover:bg-red-500 rounded"><span className="material-symbols-outlined">delete</span></button>
                               </div>
                           </div>
                       ))}
                   </div>
                </div>

                <div>
                   <label className="block text-[10px] font-black uppercase text-gray-400 mb-2">{t('admin.props.constructionPhotos')}</label>
                   <div className="flex gap-2 mb-4">
                       <label className={`cursor-pointer bg-primary text-white px-5 py-4 rounded-2xl hover:bg-black transition flex items-center justify-center ${uploading ? 'opacity-50 pointer-events-none' : ''}`}>
                           {uploading ? <span className="material-symbols-outlined animate-spin">refresh</span> : <span className="material-symbols-outlined">add_photo_alternate</span>}
                           <input type="file" className="hidden" accept="image/*,.heic" onChange={(e) => handleFileUpload(e, 'project_construction_gallery')} disabled={uploading} />
                       </label>
                   </div>
                   <div className="grid grid-cols-4 md:grid-cols-6 gap-3">
                       {(currentProject.construction_gallery || []).map((img, idx) => (
                           <div key={idx} className="relative aspect-square rounded-xl overflow-hidden group border border-gray-200">
                               <img src={getImageUrl(img)} className="w-full h-full object-cover" />
                               <button type="button" onClick={() => removePhoto(img, 'construction_gallery')} className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition flex items-center justify-center text-white">
                                   <span className="material-symbols-outlined">delete</span>
                               </button>
                           </div>
                       ))}
                   </div>
                </div>

                <div>
                   <label className="block text-[10px] font-black uppercase text-gray-400 mb-2">{t('admin.props.projectPlans')}</label>
                   <div className="flex gap-2 mb-2">
                       <label className={`cursor-pointer bg-primary text-white px-5 py-4 rounded-2xl hover:bg-black transition flex items-center justify-center ${uploading ? 'opacity-50 pointer-events-none' : ''}`} title={t('admin.props.uploadPdf', { defaultValue: 'Subir PDF' })}>
                           {uploading ? <span className="material-symbols-outlined animate-spin">refresh</span> : <span className="material-symbols-outlined">upload_file</span>}
                           <input type="file" className="hidden" accept=".pdf" onChange={(e) => handleFileUpload(e, 'project_floor_plans')} disabled={uploading} />
                       </label>
                   </div>
                   {/* …o pegar un enlace (Google Drive / PDF) */}
                   <div className="flex gap-2 mb-4">
                       <input type="url" value={floorPlanUrl} onChange={(e) => setFloorPlanUrl(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addFloorPlanUrl(); } }} placeholder={t('admin.props.planUrlPlaceholder', { defaultValue: 'o pega un enlace (Drive / PDF)…' })} className="flex-1 px-4 py-3 bg-gray-50 border border-gray-200 rounded-2xl text-sm focus:border-primary/30 focus:outline-none" />
                       <button type="button" onClick={addFloorPlanUrl} className="bg-primary/10 text-primary px-4 rounded-2xl text-sm font-bold hover:bg-primary/20 transition">{t('admin.props.addPlan', { defaultValue: 'Añadir' })}</button>
                   </div>
                   <div className="flex flex-col gap-2">
                       {(currentProject.floor_plans || []).map((pdf, idx) => (
                           <div key={idx} className="flex items-center justify-between bg-gray-50 p-4 rounded-2xl border border-gray-100">
                               <div className="flex items-center gap-3 overflow-hidden">
                                   <span className="material-symbols-outlined text-gray-400">picture_as_pdf</span>
                                   <span className="text-sm font-medium truncate">{pdf.includes('drive.google.com') ? t('admin.props.planDrive', { defaultValue: 'Plano (Google Drive)' }) : (pdf.split('/').pop() || 'Plano')}</span>
                               </div>
                               <button type="button" onClick={() => removePhoto(pdf, 'floor_plans')} className="p-2 hover:bg-red-50 text-red-500 rounded-xl transition"><span className="material-symbols-outlined">delete</span></button>
                           </div>
                       ))}
                   </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                  <div><label className="block text-[10px] font-black uppercase text-gray-400 mb-2">{t('admin.props.name')}</label><input required value={currentProject.name || ''} onChange={(e) => setCurrentProject({...currentProject, name: e.target.value})} className="w-full px-5 py-4 bg-gray-50 rounded-2xl font-bold" /></div>
                  <div><label className="block text-[10px] font-black uppercase text-gray-400 mb-2">{t('admin.props.location')}</label><select value={currentProject.location || ''} onChange={(e) => setCurrentProject({...currentProject, location: e.target.value})} className="w-full px-5 py-4 bg-gray-50 rounded-2xl font-bold">{config.customZones.map(z => <option key={z} value={z}>{z}</option>)}</select></div>
                  <div><label className="block text-[10px] font-black uppercase text-gray-400 mb-2">{t('admin.props.type', 'Tipo')}</label><select value={currentProject.property_type || ''} onChange={(e) => setCurrentProject({...currentProject, property_type: e.target.value})} className="w-full px-5 py-4 bg-gray-50 rounded-2xl font-bold">{config.customTypes.map(ty => <option key={ty} value={ty}>{ty}</option>)}</select></div>
                  <div>
                    <label className="block text-[10px] font-black uppercase text-gray-400 mb-2">{t('admin.props.status')}</label>
                    <select value={currentProject.status || config.customStatuses[0] || ''} onChange={(e) => setCurrentProject({...currentProject, status: e.target.value})} className="w-full px-5 py-4 bg-gray-50 rounded-2xl font-bold">
                        {/* Incluye el estado actual del proyecto aunque no esté en la lista de
                            estados configurados, para no mostrar uno equivocado ni sobreescribirlo. */}
                        {(currentProject.status && !config.customStatuses.includes(currentProject.status)
                          ? [currentProject.status, ...config.customStatuses]
                          : config.customStatuses
                        ).map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                </div>
                <div><label className="block text-[10px] font-black uppercase text-gray-400 mb-2">{t('admin.props.description')}</label><textarea rows={4} value={currentProject.description || ''} onChange={(e) => setCurrentProject({...currentProject, description: e.target.value})} className="w-full px-5 py-4 bg-gray-50 rounded-2xl font-medium" /></div>
                
                 <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                    <div><label className="block text-[10px] font-black uppercase text-gray-400 mb-2">{t('admin.props.investorPrice')}</label><input type="number" value={currentProject.investor_price || 0} onChange={(e) => setCurrentProject({...currentProject, investor_price: parseFloat(e.target.value) || 0})} className="w-full px-5 py-4 bg-gray-50 rounded-2xl font-bold" /></div>
                    <div><label className="block text-[10px] font-black uppercase text-gray-400 mb-2">{t('admin.props.marketPrice')}</label><input type="number" value={currentProject.market_price || 0} onChange={(e) => setCurrentProject({...currentProject, market_price: parseFloat(e.target.value) || 0})} className="w-full px-5 py-4 bg-gray-50 rounded-2xl font-bold" /></div>
                    <div><label className="block text-[10px] font-black uppercase text-gray-400 mb-2">{t('admin.props.currency')}</label><select value={currentProject.price_currency || 'EUR'} onChange={(e) => setCurrentProject({...currentProject, price_currency: e.target.value as any})} className="w-full px-5 py-4 bg-primary text-white rounded-2xl font-bold h-[58px]">{CURRENCIES.map(c => <option key={c.code} value={c.code}>{c.code}</option>)}</select></div>
                </div>
                
                 <div>
                    <label className="block text-[10px] font-black uppercase text-gray-400 mb-2">{t('admin.props.investmentTiers')}</label>
                    <textarea rows={4} value={tiersInput} onChange={(e) => setTiersInput(e.target.value)} className="w-full px-5 py-4 bg-gray-50 rounded-2xl font-medium" />
                 </div>

<div className="border-t border-gray-100 pt-8 mt-8">
  <h3 className="text-lg font-serif text-primary mb-6">{t('admin.props.propertyDetails')}</h3>
  <div className="grid grid-cols-3 gap-6 mb-6">
    <div><label className="block text-[10px] font-black uppercase text-gray-400 mb-2">{t('admin.props.bedrooms')}</label><input type="number" value={currentProject.bedrooms || 0} onChange={(e) => setCurrentProject({...currentProject, bedrooms: parseInt(e.target.value) || 0})} className="w-full px-5 py-4 bg-gray-50 rounded-2xl font-bold" /></div>
    <div><label className="block text-[10px] font-black uppercase text-gray-400 mb-2">{t('admin.props.bathrooms')}</label><input type="number" value={currentProject.bathrooms || 0} onChange={(e) => setCurrentProject({...currentProject, bathrooms: parseInt(e.target.value) || 0})} className="w-full px-5 py-4 bg-gray-50 rounded-2xl font-bold" /></div>
    <div><label className="block text-[10px] font-black uppercase text-gray-400 mb-2">{t('admin.props.areaM2')}</label><input type="number" value={currentProject.area_m2 || 0} onChange={(e) => setCurrentProject({...currentProject, area_m2: parseInt(e.target.value) || 0})} className="w-full px-5 py-4 bg-gray-50 rounded-2xl font-bold" /></div>
  </div>

  <div className="grid grid-cols-2 gap-6 mb-6">
    <div><label className="block text-[10px] font-black uppercase text-gray-400 mb-2">{t('admin.props.furnishing')}</label>
      <select value={currentProject.furnishing || ''} onChange={(e) => setCurrentProject({...currentProject, furnishing: e.target.value})} className="w-full px-5 py-4 bg-gray-50 rounded-2xl font-bold">
        <option value="">{t('admin.props.furnishNone')}</option>
        <option value="Sin amueblar">{t('admin.props.furnishUnfurnished')}</option>
        <option value="Semi-amueblado">{t('admin.props.furnishSemi')}</option>
        <option value="Totalmente amueblado">{t('admin.props.furnishFull')}</option>
      </select>
    </div>
    <div className="flex items-center gap-4 pt-6">
      <span className="text-[10px] font-black uppercase text-gray-400">{t('admin.dash.hasPool')}</span>
      <button type="button" onClick={() => setCurrentProject({...currentProject, has_pool: !currentProject.has_pool})} className={`w-12 h-6 rounded-full transition-all flex items-center px-1 ${currentProject.has_pool ? 'bg-primary justify-end' : 'bg-gray-300 justify-start'}`}><div className="w-4 h-4 bg-white rounded-full shadow-md" /></button>
    </div>
  </div>

  <div className="mb-6">
    <label className="block text-[10px] font-black uppercase text-gray-400 mb-3">{t('admin.props.equipment')}</label>
    {[
      { category: 'Baño', items: ['Ducha', 'Grifería', 'Lavabo', 'Espejo de baño', 'Toallero', 'Mampara'] },
      { category: 'Instalaciones', items: ['Iluminación', 'Enchufes', 'Interruptores', 'Aire acondicionado', 'Ventilador de techo', 'Puertas', 'Topes de puerta'] },
      { category: 'Dormitorio', items: ['Estructura de cama', 'Colchón', 'Mesilla de noche', 'Armario', 'Ropa de cama', 'Almohadas', 'Cortinas'] },
      { category: 'Salón', items: ['Sofá', 'Mesa de centro', 'Sillas', 'Estanterías', 'Alfombra', 'Cojines decorativos', 'Lámpara de pie'] },
      { category: 'Exterior', items: ['Tumbonas de piscina', 'Mesa exterior', 'Sillas exterior', 'Sombrilla', 'Macetas'] },
      { category: 'Cocina', items: ['Nevera', 'Microondas', 'Horno', 'Placa de cocción', 'Campana extractora', 'Fregadero', 'Cafetera', 'Tostadora', 'Hervidor', 'Batidora', 'Utensilios de cocina', 'Cubertería', 'Vajilla', 'Cristalería', 'Sartenes y ollas'] },
      { category: 'Decoración', items: ['Cuadros', 'Jarrones', 'Plantas artificiales', 'Espejos decorativos'] }
    ].map(group => (
      <div key={group.category} className="mb-4">
        <p className="text-[9px] font-black uppercase text-primary/30 tracking-widest mb-2">{group.category}</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {group.items.map(item => (
            <label key={item} className="flex items-center gap-2 p-3 bg-gray-50 rounded-xl border border-gray-100 cursor-pointer hover:bg-gray-100 transition text-xs">
              <input 
                type="checkbox" 
                checked={(currentProject.furnishing_items || []).includes(item)}
                onChange={(e) => {
                  const newItems = e.target.checked 
                    ? [...(currentProject.furnishing_items || []), item]
                    : (currentProject.furnishing_items || []).filter(i => i !== item);
                  setCurrentProject({...currentProject, furnishing_items: newItems});
                }}
                className="w-4 h-4 rounded border-gray-300 text-primary focus:ring-primary"
              />
              <span className="font-medium">{item}</span>
            </label>
          ))}
        </div>
      </div>
    ))}
  </div>

  <div className="mb-6">
    <label className="block text-[10px] font-black uppercase text-gray-400 mb-3">{t('admin.props.amenities')}</label>
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
      {AMENITIES_LIST.map(a => (
        <label key={a} className="flex items-center gap-2 p-2 rounded-xl hover:bg-gray-50 cursor-pointer">
          <input type="checkbox" checked={(currentProject.amenities || []).includes(a)} onChange={(e) => {
            const current = currentProject.amenities || [];
            setCurrentProject({...currentProject, amenities: e.target.checked ? [...current, a] : current.filter(x => x !== a)});
          }} className="rounded border-gray-300 text-primary focus:ring-primary" />
          <span className="text-sm font-medium text-primary">{a}</span>
        </label>
      ))}
    </div>
  </div>
</div>

<div className="border-t border-gray-100 pt-8 mt-8">
  <h3 className="text-lg font-serif text-primary mb-6">{t('admin.props.profitTitle')}</h3>
  <div className="grid grid-cols-2 gap-6 mb-6">
    <div><label className="block text-[10px] font-black uppercase text-gray-400 mb-2">{t('admin.dash.annualRentalProjection', { cur: currentProject.price_currency || 'EUR' })}</label><input type="number" value={currentProject.annual_rental_projection || 0} onChange={(e) => setCurrentProject({...currentProject, annual_rental_projection: parseFloat(e.target.value) || 0})} className="w-full px-5 py-4 bg-gray-50 rounded-2xl font-bold" /></div>
    
    <div>
      <label className="block text-[10px] font-black uppercase text-gray-400 mb-2">{t('admin.dash.landRatio')}</label>
      <div className="flex items-center gap-3">
        <input type="range" min={0} max={100} value={currentProject.land_ratio || 30} onChange={(e) => setCurrentProject({...currentProject, land_ratio: parseInt(e.target.value)})} className="flex-1" />
        <span className="text-lg font-bold text-primary w-16 text-right">{currentProject.land_ratio || 30}%</span>
      </div>
      <div className="flex justify-between text-[9px] text-primary/40 mt-1">
        <span>{t('admin.dash.landLabel')}: {formatPrice((currentProject.market_price || 0) * ((currentProject.land_ratio || 30) / 100), currentProject.price_currency || 'EUR')}</span>
        <span>{t('admin.dash.buildingLabel')}: {formatPrice((currentProject.market_price || 0) * (1 - (currentProject.land_ratio || 30) / 100), currentProject.price_currency || 'EUR')}</span>
      </div>
    </div>

    <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
      <div><label className="block text-[10px] font-black uppercase text-gray-400 mb-2">{t('admin.props.beachDistance')}</label><input type="text" value={currentProject.distance_beach || ''} onChange={(e) => setCurrentProject({...currentProject, distance_beach: e.target.value})} placeholder={t('admin.dash.beachDistancePh')} className="w-full px-5 py-4 bg-gray-50 rounded-2xl font-medium" /></div>
      <div><label className="block text-[10px] font-black uppercase text-gray-400 mb-2">{t('admin.props.availableUnits')}</label><input type="text" value={currentProject.available_units || ''} onChange={(e) => setCurrentProject({...currentProject, available_units: e.target.value})} placeholder="3" className="w-full px-5 py-4 bg-gray-50 rounded-2xl font-medium" /></div>
    </div>
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
      <div><label className="block text-[10px] font-black uppercase text-gray-400 mb-2">{t('admin.props.contractYears')}</label><input type="number" value={currentProject.years_contract || 25} onChange={(e) => setCurrentProject({...currentProject, years_contract: parseInt(e.target.value) || 25})} className="w-full px-5 py-4 bg-gray-50 rounded-2xl font-bold" /></div>
      <div><label className="block text-[10px] font-black uppercase text-gray-400 mb-2">{t('admin.props.extensionYears')}</label><input type="number" value={currentProject.years_extension || 0} onChange={(e) => setCurrentProject({...currentProject, years_extension: parseInt(e.target.value) || 0})} className="w-full px-5 py-4 bg-gray-50 rounded-2xl font-bold" /></div>
    </div>
    <div><label className="block text-[10px] font-black uppercase text-gray-400 mb-2">{t('admin.props.progressPct')}</label><div className="flex items-center gap-3"><input type="range" min={0} max={100} value={currentProject.completion_percent || 0} onChange={(e) => setCurrentProject({...currentProject, completion_percent: parseInt(e.target.value)})} className="flex-1" /><span className="text-lg font-bold text-primary w-16 text-right">{currentProject.completion_percent || 0}%</span></div></div>

    <div><label className="block text-[10px] font-black uppercase text-gray-400 mb-2">{t('admin.adminDash.completionDateLabel')}</label><input type="text" placeholder="30/06/2026" value={currentProject.completion_date || ''} onChange={(e) => setCurrentProject({...currentProject, completion_date: e.target.value})} className="w-full px-5 py-4 bg-gray-50 rounded-2xl font-bold" /></div>
  </div>

  <div className="bg-gray-50 p-6 rounded-2xl mb-6">
    <p className="text-[10px] font-black uppercase text-gray-400 mb-3">{t('admin.dash.roiCalculated')}</p>
    <div className="grid grid-cols-2 gap-4">
      <div className="bg-white p-4 rounded-xl">
        <p className="text-[10px] font-black uppercase text-gray-400">{t('admin.dash.roiRental')}</p>
        <p className="text-2xl font-serif text-primary">{currentProject.investor_price && currentProject.annual_rental_projection ? ((currentProject.annual_rental_projection / currentProject.investor_price) * 100).toFixed(1) + '%' : '—'}</p>
      </div>
      <div className="bg-white p-4 rounded-xl">
        <p className="text-[10px] font-black uppercase text-gray-400">{t('admin.dash.roiResale')}</p>
        <p className="text-2xl font-serif text-primary">{currentProject.investor_price && currentProject.market_price && currentProject.market_price > currentProject.investor_price ? (((currentProject.market_price - currentProject.investor_price) / currentProject.investor_price) * 100).toFixed(1) + '%' : '—'}</p>
      </div>
    </div>
  </div>
</div>

<div className="border-t border-gray-100 pt-8 mt-8">
  <h3 className="text-lg font-serif text-primary mb-6">{t('admin.dash.linksDocs')}</h3>
  <div className="space-y-4">
    <div>
        <label className="block text-[10px] font-black uppercase text-gray-400 mb-1">{t('admin.dash.brochureByLang')}</label>
        <p className="text-[10px] text-gray-400 mb-3">{t('admin.dash.brochureByLangHint')}</p>
        <div className="space-y-2">
          {([['en','English (ENG) · por defecto'],['es','Español'],['ro','Română'],['id','Indonesia']] as [string,string][]).map(([lng,label]) => {
            const val = ((currentProject as any).brochures?.[lng]) || (lng === 'en' ? (currentProject.brochure_url || '') : '');
            return (
              <div key={lng} className="flex gap-2 items-center">
                <span className="w-10 text-[10px] font-black uppercase text-primary/50 shrink-0">{lng}</span>
                <input type="text" value={val} onChange={(e) => setCurrentProject({...currentProject, brochures: {...(((currentProject as any).brochures) || {}), [lng]: e.target.value}} as any)} placeholder={label} className="flex-grow px-4 py-3 bg-gray-50 rounded-xl font-medium text-sm" />
                <label className={`cursor-pointer bg-primary text-white px-4 py-3 rounded-xl hover:bg-black transition flex items-center justify-center ${uploading ? 'opacity-50 pointer-events-none' : ''}`}>
                  <span className="material-symbols-outlined text-base">{uploading ? 'refresh' : 'upload_file'}</span>
                  <input type="file" className="hidden" accept=".pdf,.doc,.docx,.xls,.xlsx,image/*" onChange={(e) => handleBrochureLangUpload(e, lng)} disabled={uploading} />
                </label>
              </div>
            );
          })}
        </div>
    </div>
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
      <div>
         <label className="block text-[10px] font-black uppercase text-gray-400 mb-2">{t('admin.dash.constructionReportUrl')}</label>
         <div className="flex gap-2">
             <input type="text" value={currentProject.construction_update_url || ''} onChange={(e) => setCurrentProject({...currentProject, construction_update_url: e.target.value})} placeholder="https://..." className="flex-grow px-5 py-4 bg-gray-50 rounded-2xl font-medium" />
             <label className={`cursor-pointer bg-primary text-white px-5 py-4 rounded-2xl hover:bg-black transition flex items-center justify-center ${uploading ? 'opacity-50 pointer-events-none' : ''}`}>
                 {uploading ? <span className="material-symbols-outlined animate-spin">refresh</span> : <span className="material-symbols-outlined">upload_file</span>}
                 <input type="file" className="hidden" accept=".pdf,.doc,.docx,.xls,.xlsx,image/*" onChange={(e) => handleFileUpload(e, 'project_construction_update')} disabled={uploading} />
             </label>
         </div>
      </div>
      <div><label className="block text-[10px] font-black uppercase text-gray-400 mb-2">{t('admin.dash.reportDate')}</label><input type="date" value={currentProject.construction_update_date || ''} onChange={(e) => setCurrentProject({...currentProject, construction_update_date: e.target.value})} className="w-full px-5 py-4 bg-gray-50 rounded-2xl font-bold" /></div>
    </div>
    <div>
      <label className="block text-[10px] font-black uppercase text-gray-400 mb-2">{t('admin.dash.googleMapsUrl')}</label>
      <input type="text" value={currentProject.google_maps_url || ''} onChange={(e) => setCurrentProject({...currentProject, google_maps_url: e.target.value})} placeholder={t('admin.dash.googleMapsPh')} className="w-full px-5 py-4 bg-gray-50 rounded-2xl font-medium" />
      <p className="text-[8px] text-primary/30 mt-1">{t('admin.dash.googleMapsHint')}</p>
    </div>
  </div>
</div>

              </div>
              {/* Ficha extendida: datos de agencia / legal / drive / vídeo (los usan los packs de agencia). */}
              <details className="border-t border-gray-100 pt-6">
                <summary className="cursor-pointer select-none mb-4"><span className="text-lg font-serif text-primary">{t('admin.dash.agencyLegalExtra')}</span><span className="block text-xs text-gray-400">{t('admin.dash.agencyLegalHint')}</span></summary>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                  {([
                    ['zone',t('admin.dash.fldZone'),'text'],['owner_name',t('admin.dash.fldOwner'),'text'],['lease_end_date',t('admin.dash.fldLeaseEnd'),'text'],
                    ['lease_years_paid',t('admin.dash.fldYearsPaid'),'number'],['extension_cost_usd',t('admin.dash.fldExtensionCost'),'number'],
                    ['payment_plan_off_plan',t('admin.dash.fldPaymentPlan'),'text'],['zoning_type',t('admin.dash.fldZoning'),'text'],
                    ['building_permit_status',t('admin.dash.fldBuildingPermit'),'text'],['structural_warranty',t('admin.dash.fldStructuralWarranty'),'text'],
                    ['water_supply',t('admin.dash.fldWaterSupply'),'text'],['land_size_m2',t('admin.dash.fldLandSize'),'number'],
                    ['pool_size_m2',t('admin.dash.fldPoolSize'),'number'],['parking',t('admin.dash.fldParking'),'text'],['view',t('admin.dash.fldView'),'text'],
                    ['living_room_style',t('admin.dash.fldLivingStyle'),'text'],['furnishing_pack_cost_usd',t('admin.dash.fldFurnishPack'),'number'],
                    ['timeline',t('admin.dash.fldTimeline'),'text'],['booking_widget_url',t('admin.dash.fldBookingWidget'),'text'],
                    ['video_url',t('admin.dash.fldVideoUrl'),'text'],['drive_renders_url',t('admin.dash.fldDriveRenders'),'text'],
                    ['drive_2d_plans_url',t('admin.dash.fldDrive2dPlans'),'text'],['drive_permits_url',t('admin.dash.fldDrivePermits'),'text'],
                    ['drive_legal_url',t('admin.dash.fldDriveLegal'),'text'],['drive_brochure_folder_url',t('admin.dash.fldDriveBrochure'),'text'],
                  ] as [string,string,string][]).map(([k,label,type]) => (
                    <div key={k}>
                      <label className="block text-[10px] font-black uppercase text-gray-400 mb-1.5">{label}</label>
                      <input type={type==='number'?'number':'text'} value={(currentProject as any)[k] ?? ''}
                        onChange={(e) => setCurrentProject({ ...currentProject, [k]: type==='number' ? (parseFloat(e.target.value) || 0) : e.target.value } as any)}
                        className="w-full px-3 py-2.5 bg-gray-50 rounded-xl text-sm font-medium" />
                    </div>
                  ))}
                </div>
                <div className="flex gap-6 mt-4">
                  {([['has_powder_room',t('admin.dash.fldPowderRoom')],['has_rooftop',t('admin.dash.fldRooftop')]] as [string,string][]).map(([k,label]) => (
                    <label key={k} className="flex items-center gap-2 text-xs font-bold text-primary/70 cursor-pointer">
                      <input type="checkbox" checked={!!(currentProject as any)[k]} onChange={(e) => setCurrentProject({ ...currentProject, [k]: e.target.checked } as any)} /> {label}
                    </label>
                  ))}
                </div>
              </details>
              {/* Traducciones (EN/ID) de los campos que aparecen en los packs de agencia. */}
              <details className="border-t border-gray-100 pt-6">
                <summary className="cursor-pointer select-none mb-4"><span className="text-lg font-serif text-primary">{t('admin.dash.packTranslations')}</span><span className="block text-xs text-gray-400">{t('admin.dash.packTranslationsHint')}</span></summary>
                <div className="space-y-3">
                  {([
                    ['description',t('admin.dash.trDescription')],['status',t('admin.dash.trStatus')],['completion_date',t('admin.dash.trCompletionDate')],
                    ['distance_beach',t('admin.dash.trDistanceBeach')],['view',t('admin.dash.trView')],['parking',t('admin.dash.trParking')],
                    ['living_room_style',t('admin.dash.trLivingStyle')],['furnishing',t('admin.dash.trFurnishing')],['water_supply',t('admin.dash.trWater')],
                    ['structural_warranty',t('admin.dash.trStructuralWarranty')],['zoning_type',t('admin.dash.trZoning')],
                    ['building_permit_status',t('admin.dash.trBuildingPermit')],['payment_plan_off_plan',t('admin.dash.trPaymentPlan')],
                    ['lease_end_date',t('admin.dash.trLeaseEnd')],
                  ] as [string,string][]).map(([k,label]) => (
                    <div key={k} className="grid grid-cols-1 md:grid-cols-[140px_1fr_1fr] gap-2 items-center">
                      <span className="text-[10px] font-black uppercase text-gray-400">{label}</span>
                      <input placeholder="EN" value={(currentProject as any)[`${k}_en`] ?? ''} onChange={(e) => setCurrentProject({ ...currentProject, [`${k}_en`]: e.target.value } as any)} className="w-full px-3 py-2 bg-gray-50 rounded-xl text-sm" />
                      <input placeholder="ID" value={(currentProject as any)[`${k}_id`] ?? ''} onChange={(e) => setCurrentProject({ ...currentProject, [`${k}_id`]: e.target.value } as any)} className="w-full px-3 py-2 bg-gray-50 rounded-xl text-sm" />
                    </div>
                  ))}
                </div>
              </details>

              <div className="flex gap-3 pt-4 sticky bottom-0 bg-white/95 backdrop-blur -mx-1 px-1">
                <button type="submit" disabled={uploading} className="flex-1 bg-primary text-white py-3 rounded-xl font-black uppercase tracking-widest text-xs shadow-lg hover:bg-black disabled:opacity-60 inline-flex items-center justify-center gap-2">
                  {uploading && <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />}
                  {uploading ? t('admin.common.saving') : t('admin.adminDash.saveProperty')}
                </button>
                <button type="button" onClick={() => setIsEditing(false)} className="px-6 bg-gray-100 text-gray-500 py-3 rounded-xl font-black uppercase tracking-widest text-xs hover:bg-gray-200">{t('admin.common.cancel')}</button>
              </div>
            </form>
          </div>
        </div>
      )}
      
{/* Modal Editar/Crear Artículo de Blog */}
{isEditingBlog && (
  <div className="fixed inset-0 z-[150] flex items-start justify-center bg-black/50 backdrop-blur-sm p-4 overflow-y-auto" onClick={(e) => { if (e.target === e.currentTarget) setIsEditingBlog(false); }}>
    <div className="bg-white w-full max-w-3xl rounded-3xl p-6 md:p-10 shadow-2xl my-8">
      <h2 className="text-2xl font-serif text-primary mb-6">{currentBlog.id && !String(currentBlog.id).startsWith('blog-') ? t('admin.dash.editArticle') : t('admin.dash.newArticle')}</h2>
      <form onSubmit={handleSaveBlog} className="space-y-5">
        <div className="grid grid-cols-2 gap-5">
          <div><label className="block text-[10px] font-black uppercase text-gray-400 mb-2">{t('admin.dash.titleLabel')}</label><input required value={currentBlog.title || ''} onChange={(e) => setCurrentBlog({...currentBlog, title: e.target.value})} className="w-full px-5 py-4 bg-gray-50 rounded-2xl font-bold" /></div>
          <div><label className="block text-[10px] font-black uppercase text-gray-400 mb-2">{t('admin.dash.tagLabel')}</label><input value={currentBlog.tag || ''} onChange={(e) => setCurrentBlog({...currentBlog, tag: e.target.value})} placeholder="MERCADO" className="w-full px-5 py-4 bg-gray-50 rounded-2xl font-bold" /></div>
        </div>
        <div className="grid grid-cols-2 gap-5">
          <div><label className="block text-[10px] font-black uppercase text-gray-400 mb-2">{t('admin.dash.publishDate')}</label><input type="date" value={currentBlog.published_date || ''} onChange={(e) => setCurrentBlog({...currentBlog, published_date: e.target.value})} className="w-full px-5 py-4 bg-gray-50 rounded-2xl font-bold" /></div>
          <div><label className="block text-[10px] font-black uppercase text-gray-400 mb-2">{t('admin.dash.imageUrlPath')}</label><input value={currentBlog.image || ''} onChange={(e) => setCurrentBlog({...currentBlog, image: e.target.value})} className="w-full px-5 py-4 bg-gray-50 rounded-2xl font-bold" /></div>
        </div>
        <div><label className="block text-[10px] font-black uppercase text-gray-400 mb-2">{t('admin.dash.descExcerpt')}</label><textarea value={currentBlog.description || ''} onChange={(e) => setCurrentBlog({...currentBlog, description: e.target.value})} className="w-full px-5 py-4 bg-gray-50 rounded-2xl font-medium resize-none h-20" /></div>
        <div>
          <label className="block text-[10px] font-black uppercase text-gray-400 mb-2">{t('admin.dash.contentHtml')}</label>
          <div className="flex gap-2 mb-2">
            <button type="button" onClick={() => wrapSelection('b')} className="px-3 py-1.5 bg-gray-100 rounded-lg text-xs font-black hover:bg-gray-200">B</button>
            <button type="button" onClick={() => wrapSelection('p')} className="px-3 py-1.5 bg-gray-100 rounded-lg text-xs font-bold hover:bg-gray-200">P</button>
            <button type="button" onClick={() => wrapSelection('h2')} className="px-3 py-1.5 bg-gray-100 rounded-lg text-xs font-bold hover:bg-gray-200">H2</button>
          </div>
          <textarea ref={blogContentRef} value={currentBlog.content || ''} onChange={(e) => setCurrentBlog({...currentBlog, content: e.target.value})} className="w-full px-5 py-4 bg-gray-50 rounded-2xl font-mono text-sm resize-none h-48" />
        </div>
        <div className="flex gap-4 pt-2">
          <button type="button" onClick={() => setIsEditingBlog(false)} className="flex-1 py-4 rounded-2xl font-black text-xs uppercase tracking-widest border border-gray-200 text-gray-400 hover:bg-gray-50 transition">{t('admin.common.cancel')}</button>
          <button type="submit" disabled={uploading} className="flex-1 py-4 rounded-2xl font-black text-xs uppercase tracking-widest bg-primary text-white shadow-lg hover:bg-black transition disabled:opacity-50">{uploading ? t('admin.dash.savingEllipsis') : t('admin.common.save')}</button>
        </div>
      </form>
    </div>
  </div>
)}

{/* Modal Editar/Crear Administrador */}
{isEditingUser && (
  <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={(e) => { if (e.target === e.currentTarget) setIsEditingUser(false); }}>
    <div className="bg-white w-full max-w-md rounded-3xl p-8 shadow-2xl">
      <h2 className="text-2xl font-serif text-primary mb-6">{currentUser.id && !String(currentUser.id).startsWith('user-') ? t('admin.dash.editAdmin') : t('admin.dash.newAdmin')}</h2>
      <form onSubmit={handleSaveUser} className="space-y-5">
        <div><label className="block text-[10px] font-black uppercase text-gray-400 mb-2">{t('admin.dash.nameLabel')}</label><input required value={currentUser.name || ''} onChange={(e) => setCurrentUser({...currentUser, name: e.target.value})} className="w-full px-5 py-4 bg-gray-50 rounded-2xl font-bold" /></div>
        <div><label className="block text-[10px] font-black uppercase text-gray-400 mb-2">{t('admin.dash.usernameEmail')}</label><input required type="email" value={currentUser.username || ''} onChange={(e) => setCurrentUser({...currentUser, username: e.target.value})} className="w-full px-5 py-4 bg-gray-50 rounded-2xl font-bold" /></div>
        <div><label className="block text-[10px] font-black uppercase text-gray-400 mb-2">{t('admin.dash.passwordLabel')} {currentUser.id && !String(currentUser.id).startsWith('user-') ? t('admin.dash.emptyNoChange') : ''}</label><input type="text" required={!(currentUser.id && !String(currentUser.id).startsWith('user-'))} value={currentUser.password_hash || ''} onChange={(e) => setCurrentUser({...currentUser, password_hash: e.target.value})} className="w-full px-5 py-4 bg-gray-50 rounded-2xl font-bold" /></div>
        <div><label className="block text-[10px] font-black uppercase text-gray-400 mb-2">{t('admin.dash.roleLabel')}</label><select value={(currentUser as any).role || 'admin'} onChange={(e) => setCurrentUser({...currentUser, role: e.target.value} as any)} className="w-full px-5 py-4 bg-gray-50 rounded-2xl font-bold"><option value="admin">admin</option><option value="superadmin">superadmin</option><option value="team">team</option></select></div>
        <div>
          <label className="block text-[10px] font-black uppercase text-gray-400 mb-2">{t('admin.dash.signatureLabel')}</label>
          <div className="relative inline-block border-2 border-dashed border-gray-200 rounded-2xl p-3 w-52 text-center">
            {(currentUser as any).signature_url && <button type="button" title={t('admin.dash.deleteSignature')} onClick={() => setCurrentUser({ ...currentUser, signature_url: '' } as any)} className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center text-base leading-none shadow hover:bg-red-600">×</button>}
            {(currentUser as any).signature_url ? <img src={(currentUser as any).signature_url} alt={t('admin.dash.signatureLabel')} className="h-12 mx-auto object-contain" /> : <span className="material-symbols-outlined text-gray-300 text-2xl">edit</span>}
            <label className="block mt-1 cursor-pointer text-[10px] font-black uppercase text-primary tracking-widest">{(currentUser as any).signature_url ? t('admin.dash.change') : t('admin.dash.uploadPng')}<input type="file" accept="image/png,image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleUserSignatureUpload(f); }} /></label>
          </div>
        </div>
        <div className="flex gap-4 pt-2">
          <button type="button" onClick={() => setIsEditingUser(false)} className="flex-1 py-4 rounded-2xl font-black text-xs uppercase tracking-widest border border-gray-200 text-gray-400 hover:bg-gray-50 transition">{t('admin.common.cancel')}</button>
          <button type="submit" className="flex-1 py-4 rounded-2xl font-black text-xs uppercase tracking-widest bg-primary text-white shadow-lg hover:bg-black transition">{t('admin.common.save')}</button>
        </div>
      </form>
    </div>
  </div>
)}

{/* Pop-up de PREVIEW del email antes de enviar (calendario, recordatorio, etc.) */}
{reportPicker && (
  <div className="fixed inset-0 z-[165] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) setReportPicker(null); }}>
    <div className="bg-white rounded-3xl w-full max-w-md shadow-2xl overflow-hidden">
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
        <div>
          <h3 className="font-black text-primary text-sm uppercase tracking-widest">{t('admin.dash.reportPickTitle', { defaultValue: 'Aviso de obra — proyectos y destinatarios' })}</h3>
          <p className="text-xs text-gray-400 mt-0.5 truncate">{reportPicker.client.name}</p>
        </div>
        <button onClick={() => setReportPicker(null)} className="p-2 text-gray-400 hover:text-primary shrink-0"><span className="material-symbols-outlined">close</span></button>
      </div>
      <div className="p-4 space-y-2">
        <label className="flex items-center gap-2 px-2 pb-1 cursor-pointer select-none">
          <input type="checkbox" className="rounded" checked={reportPicker.selected.length === reportPicker.projs.length} onChange={(e) => setReportPicker((p) => p ? { ...p, selected: e.target.checked ? p.projs.map((x: any) => x.id) : [] } : p)} />
          <span className="text-[10px] font-black uppercase tracking-widest text-primary/50">{t('admin.dash.selectAll', { defaultValue: 'Seleccionar todos' })}</span>
        </label>
        {reportPicker.projs.map((cp: any, i: number) => {
          const on = reportPicker.selected.includes(cp.id);
          return (
            <label key={cp.id || i} className={`w-full text-left px-4 py-3 rounded-xl border transition flex items-center gap-2 cursor-pointer ${on ? 'border-primary bg-primary/5' : 'border-gray-200 hover:border-primary/40'}`}>
              <input type="checkbox" className="rounded" checked={on} onChange={() => setReportPicker((p) => p ? { ...p, selected: p.selected.includes(cp.id) ? p.selected.filter((x) => x !== cp.id) : [...p.selected, cp.id] } : p)} />
              <span className="material-symbols-outlined text-primary/60 text-base">apartment</span>
              <span className="font-bold text-primary text-sm break-words">{cp.project_name}{cp.unit_number ? <span className="text-gray-400 font-normal"> · {cp.unit_number}</span> : null}</span>
            </label>
          );
        })}
        {(() => {
          const selCps = reportPicker.projs.filter((x: any) => reportPicker.selected.includes(x.id));
          const excl = new Set(reportPicker.excluded.map((e) => e.toLowerCase()));
          const avail: string[] = []; const seen = new Set<string>();
          for (const cp of selCps) for (const e of recipientsForCp(reportPicker.client, cp)) { const k = e.toLowerCase(); if (!seen.has(k)) { seen.add(k); avail.push(e); } }
          const checked = avail.filter((e) => !excl.has(e.toLowerCase()));
          return (
            <>
              <div className="pt-2 mt-1 border-t border-gray-100">
                <p className="text-[10px] font-black uppercase tracking-widest text-primary/50 px-2 mb-1">{t('admin.dash.reportPickRecipients', { defaultValue: 'Destinatarios' })}</p>
                {avail.length === 0 ? (
                  <p className="text-xs text-gray-400 px-2 py-1">{t('admin.dash.reportPickPickProject', { defaultValue: 'Selecciona alguna propiedad para ver sus destinatarios.' })}</p>
                ) : avail.map((em) => {
                  const on = !excl.has(em.toLowerCase());
                  return (
                    <label key={em} className="flex items-center gap-2 px-2 py-1.5 cursor-pointer select-none">
                      <input type="checkbox" className="rounded" checked={on} onChange={() => setReportPicker((p) => p ? { ...p, excluded: on ? [...p.excluded, em] : p.excluded.filter((x) => x.toLowerCase() !== em.toLowerCase()) } : p)} />
                      <span className="text-sm text-primary font-medium break-all">{holderNameByEmail(reportPicker.client, em)} <span className="text-gray-400 font-normal">· {em}</span></span>
                    </label>
                  );
                })}
              </div>
              <button type="button" disabled={reportPicker.selected.length === 0 || checked.length === 0} onClick={() => { const c = reportPicker.client; setReportPicker(null); void sendReportForProjects(c, selCps, checked); }} className="w-full mt-2 bg-primary text-white py-3 rounded-xl font-black uppercase text-[10px] tracking-widest disabled:opacity-50 flex items-center justify-center gap-2"><span className="material-symbols-outlined text-sm">arrow_forward</span> {t('admin.dash.reportPickContinue', { defaultValue: 'Continuar' })} ({reportPicker.selected.length})</button>
            </>
          );
        })()}
      </div>
    </div>
  </div>
)}

{emailPreview && (
  <div className="fixed inset-0 z-[160] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onMouseDown={(e) => { if (e.target === e.currentTarget && !emailPreview.sending) setEmailPreview(null); }}>
    <div className="bg-white rounded-3xl w-full max-w-2xl max-h-[92vh] flex flex-col overflow-hidden shadow-2xl">
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
        <div className="min-w-0">
          <h3 className="font-black text-primary text-sm uppercase tracking-widest">{t('admin.dash.emailPreviewTitle', { defaultValue: 'Previsualización del email' })}</h3>
          <p className="text-xs text-gray-400 mt-0.5 truncate">{emailPreview.subject}</p>
          <div className="flex flex-wrap items-center gap-2 mt-1">
            <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">{t('admin.dash.emailPreviewTo', { defaultValue: 'Para' })}:</span>
            {emailPreview.recipients.map((em) => (
              <label key={em} className={`flex items-center gap-1 text-xs px-2 py-1 rounded-lg border cursor-pointer ${emailPreview.selected.includes(em) ? 'bg-primary/10 border-primary/30 text-primary' : 'bg-gray-50 border-gray-200 text-gray-400'}`}>
                <input type="checkbox" checked={emailPreview.selected.includes(em)} onChange={() => setEmailPreview((p) => { if (!p) return p; const selected = p.selected.includes(em) ? p.selected.filter((x) => x !== em) : [...p.selected, em]; return { ...p, selected }; })} className="rounded" />
                {em}
              </label>
            ))}
          </div>
          {emailPreview.buildHtml && emailPreview.recipients.length > 1 && (
            <div className="flex flex-wrap items-center gap-2 mt-2">
              <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">{t('admin.dash.emailPreviewViewAs', { defaultValue: 'Ver como' })}:</span>
              {emailPreview.recipients.map((em) => (
                <button key={em} type="button" onClick={() => setEmailPreview((p) => p && p.buildHtml ? { ...p, previewEmail: em, html: p.buildHtml(em) } : p)} className={`text-xs px-2 py-1 rounded-lg border transition ${emailPreview.previewEmail === em ? 'bg-primary text-white border-primary' : 'bg-gray-50 border-gray-200 text-gray-500 hover:border-primary/40'}`}>
                  {em}
                </button>
              ))}
            </div>
          )}
        </div>
        <button onClick={() => setEmailPreview(null)} disabled={emailPreview.sending} className="p-2 text-gray-400 hover:text-primary disabled:opacity-50 shrink-0"><span className="material-symbols-outlined">close</span></button>
      </div>
      <div className="overflow-y-auto p-5 bg-[#F3E5D8]">
        <div className="max-w-xl mx-auto">
          <div className="text-center mb-4"><span style={{ fontFamily: "'DM Serif Display',Georgia,serif" }} className="text-2xl font-bold text-primary">Unreal Studio Bali</span></div>
          <div className="bg-white rounded-2xl p-6 shadow-sm" dangerouslySetInnerHTML={{ __html: emailPreview.html }} />
        </div>
      </div>
      <div className="px-6 py-4 border-t border-gray-100 flex gap-3 shrink-0">
        <button onClick={() => setEmailPreview(null)} disabled={emailPreview.sending} className="flex-1 py-3 rounded-xl border border-gray-200 text-gray-500 font-bold text-xs uppercase tracking-widest disabled:opacity-50">{t('admin.common.cancel')}</button>
        <button onClick={() => void sendPreviewedEmail()} disabled={emailPreview.sending || emailPreview.selected.length === 0} className="flex-1 py-3 rounded-xl bg-primary text-white font-bold text-xs uppercase tracking-widest hover:bg-black transition disabled:opacity-50 flex items-center justify-center gap-2">{emailPreview.sending ? <><span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> {t('admin.adminDash.savingEllipsis')}</> : <><span className="material-symbols-outlined text-sm">send</span> {t('admin.dash.sendEmailBtn', { defaultValue: 'Enviar' })} ({emailPreview.selected.length})</>}</button>
      </div>
    </div>
  </div>
)}

{/* Modal Editar/Crear Cliente */}
{isEditingClient && (
  <div className="fixed inset-0 z-[150] flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm p-0 sm:p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) setIsEditingClient(false); }}>
    <div className="relative bg-white w-full sm:max-w-2xl rounded-t-3xl sm:rounded-3xl p-5 sm:p-10 shadow-2xl max-h-[92vh] overflow-y-auto overscroll-contain">
      <button type="button" onClick={() => setIsEditingClient(false)} className="absolute top-4 right-4 z-10 p-2 rounded-full bg-gray-100 text-gray-500 hover:bg-gray-200 hover:text-primary transition"><span className="material-symbols-outlined">close</span></button>
      <h2 className="text-2xl font-serif text-primary mb-2 pr-10">{currentClient.id?.startsWith('client-') ? t('admin.adminDash.newClient') : t('admin.adminDash.editClient')}</h2>
      <p className="text-sm text-gray-400 mb-8">{t('admin.dash.fillClientData')}</p>
      <form onSubmit={handleSaveClient} onKeyDown={(e) => { if (e.key === 'Enter' && (e.target as HTMLElement).tagName !== 'TEXTAREA') e.preventDefault(); }} className="space-y-5">
        {/* TITULARES: cada titular con su NOMBRE y su EMAIL. El título de la ficha
            junta los nombres con " & " y los correos van a todos. */}
        {(() => {
          const cc: any = currentClient;
          const hs: any[] = (cc.holders && cc.holders.length)
            ? cc.holders
            : [{ name: cc.name || '', email: cc.email || '', phone: cc.phone || '', lang: cc.preferred_language || 'es' }, ...((cc.extra_emails) || []).map((e: string) => ({ name: '', email: e, phone: '', lang: cc.preferred_language || 'es' }))];
          const setH = (next: any[]) => setCurrentClient((prev: any) => ({
            ...prev, holders: next,
            name: (next.map((h) => (h.name || '').trim()).filter(Boolean).join(' & ')) || prev.name,
            email: (next.find((h) => (h.email || '').trim())?.email || prev.email),
            // El teléfono/idioma del cliente = los del 1er titular (default para la ficha y el portal).
            phone: (next.find((h) => (h.phone || '').trim())?.phone ?? prev.phone),
            preferred_language: (next.find((h) => (h.lang || '').trim())?.lang || prev.preferred_language),
          }));
          return (
            <div>
              <label className="block text-[10px] font-black uppercase text-gray-400 mb-2">{t('admin.dash.holders', { defaultValue: 'Titular(es) — nombre, email, teléfono e idioma' })}</label>
              <div className="space-y-3">
                {hs.map((h, i) => (
                  <div key={i} className="bg-gray-50/60 rounded-2xl p-2 border border-gray-100">
                    <div className="flex gap-2 items-start">
                      <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <input type="text" value={h.name || ''} onChange={(e) => { const n = hs.map((x, j) => j === i ? { ...x, name: e.target.value } : x); setH(n); }} className="px-4 py-3 bg-white rounded-xl font-medium border border-gray-100 focus:border-primary/20 focus:outline-none text-sm" placeholder={t('admin.dash.holderNamePh', { defaultValue: 'Nombre' })} />
                        <input type="email" value={h.email || ''} onChange={(e) => { const n = hs.map((x, j) => j === i ? { ...x, email: e.target.value } : x); setH(n); }} className="px-4 py-3 bg-white rounded-xl font-medium border border-gray-100 focus:border-primary/20 focus:outline-none text-sm" placeholder={t('admin.dash.holderEmailPh', { defaultValue: 'Email' })} />
                        <input type="text" value={h.phone || ''} onChange={(e) => { const n = hs.map((x, j) => j === i ? { ...x, phone: e.target.value } : x); setH(n); }} className="px-4 py-3 bg-white rounded-xl font-medium border border-gray-100 focus:border-primary/20 focus:outline-none text-sm" placeholder={t('admin.dash.holderPhonePh', { defaultValue: 'Teléfono' })} />
                        <select value={h.lang || 'es'} onChange={(e) => { const n = hs.map((x, j) => j === i ? { ...x, lang: e.target.value } : x); setH(n); }} className="px-4 py-3 bg-white rounded-xl font-bold border border-gray-100 focus:border-primary/20 focus:outline-none text-sm">
                          <option value="es">Español</option><option value="en">English</option><option value="ro">Română</option><option value="id">Indonesia</option>
                        </select>
                      </div>
                      {hs.length > 1 && <button type="button" onClick={() => setH(hs.filter((_, j) => j !== i))} className="px-2 py-3 text-red-400 hover:text-red-600"><span className="material-symbols-outlined">close</span></button>}
                    </div>
                  </div>
                ))}
              </div>
              <button type="button" onClick={() => setH([...hs, { name: '', email: '', phone: '', lang: (currentClient as any).preferred_language || 'es' }])} className="mt-2 text-xs font-bold text-primary hover:text-black inline-flex items-center gap-1"><span className="material-symbols-outlined text-sm">add</span> {t('admin.dash.addHolder', { defaultValue: 'Añadir titular' })}</button>
              {hs.filter((h) => (h.name || '').trim()).length > 1 && <p className="text-xs text-primary/50 mt-1">{t('admin.dash.titlePreview', { defaultValue: 'Título' })}: <b>{hs.map((h) => (h.name || '').trim()).filter(Boolean).join(' & ')}</b></p>}
            </div>
          );
        })()}
        {/* El teléfono se captura POR TITULAR (cada bloque tiene el suyo). El del
            cliente se sincroniza desde el 1er titular como fallback, así que aquí
            NO repetimos un campo global de teléfono. */}
        <div>
          <label className="block text-[10px] font-black uppercase text-gray-400 mb-2">{t('admin.dash.notesLabel')}</label>
          <textarea value={currentClient.notes || ''} onChange={(e) => setCurrentClient({...currentClient, notes: e.target.value})} className="w-full px-5 py-4 bg-gray-50 rounded-2xl font-medium border border-transparent focus:border-primary/20 focus:outline-none resize-none h-24" placeholder={t('admin.dash.notesPh')} />
        </div>
        <div>
          <label className="block text-[10px] font-black uppercase text-gray-400 mb-2">{t('admin.dash.clientDriveFolder')}</label>
          <input type="url" value={(currentClient as any).drive_folder_url || ''} onChange={(e) => setCurrentClient({...currentClient, drive_folder_url: e.target.value} as any)} className="w-full px-5 py-4 bg-gray-50 rounded-2xl font-medium border border-transparent focus:border-primary/20 focus:outline-none" placeholder="https://drive.google.com/drive/folders/..." />
        </div>
        {/* El idioma se elige POR TITULAR (cada bloque de titular tiene su selector).
            preferred_language del cliente se sincroniza desde el primer titular como
            fallback, así que aquí NO repetimos un selector global de idioma.
            La divisa tampoco se elige por cliente: el cliente ve únicamente las
            divisas que fija el admin en cada compra/calendario (sin selector). */}
        <div className="bg-gray-50 p-4 rounded-2xl border border-gray-100">
          <label className="text-[10px] font-black uppercase text-primary/60 block mb-2">{t('admin.dash.clientStatus', { defaultValue: 'Estado del cliente' })}</label>
          <select value={(currentClient as any).status || (currentClient.is_active === false ? 'inactive' : 'active')} onChange={(e) => setCurrentClient((prev: any) => ({ ...prev, status: e.target.value, is_active: e.target.value === 'active' }))} className="w-full px-5 py-3 bg-white border border-gray-200 rounded-2xl font-bold">
            <option value="active">{t('admin.clientsTab.active')}</option>
            <option value="inactive">{t('admin.clientsTab.inactive')}</option>
            <option value="draft">{t('admin.clientsTab.draft', { defaultValue: 'Draft' })}</option>
          </select>
          <p className="text-[10px] text-gray-400 mt-2">{t('admin.dash.draftHint', { defaultValue: 'Activo = puede entrar y cuenta en Finanzas. Inactivo = no entra, sí cuenta. Draft = perfil de prueba, no entra ni cuenta.' })}</p>
        </div>
        {/* Permisos POR CLIENTE: heredan Configuración; lo global-OFF queda bloqueado
            (solo se activa en Configuración); lo global-ON se puede desactivar aquí. */}
        <div className="bg-gray-50 p-4 rounded-2xl border border-gray-100">
          <p className="text-[10px] font-black uppercase text-primary/60 mb-1">{t('admin.dash.clientPermsTitle')}</p>
          <p className="text-[10px] text-gray-400 mb-3">{t('admin.dash.clientPermsHint')}</p>
          <div className="grid grid-cols-1 gap-2">
            {([['calculator', t('fix.adm.featCalculator')], ['construction', t('fix.adm.featConstruction')], ['constructionProgress', t('fix.adm.featConstructionProgress', { defaultValue: 'Progreso de obra' })], ['brochure', t('fix.adm.featBrochure')], ['viewProject', t('fix.adm.featViewProject')], ['drive', t('fix.adm.featDrive')]] as [string, string][]).map(([k, label]) => {
              const globalOn = ((((config as any).brand?.client_features) || {})[k]) !== false;
              const ov = ((currentClient as any).feature_overrides) || {};
              const clientOn = ov[k] !== false;
              const on = globalOn && clientOn;
              return (
                <button key={k} type="button" disabled={!globalOn}
                  onClick={() => setCurrentClient({ ...currentClient, feature_overrides: { ...ov, [k]: !clientOn } } as any)}
                  className={`flex items-center justify-between px-3 py-2.5 rounded-xl border text-xs font-bold transition ${!globalOn ? 'bg-gray-100 border-gray-200 text-gray-300 cursor-not-allowed' : on ? 'bg-green-50 border-green-200 text-green-700' : 'bg-gray-50 border-gray-200 text-gray-400'}`}>
                  <span className="text-left">{label}{!globalOn && <span className="block text-[9px] font-normal text-gray-400 normal-case">{t('admin.dash.clientPermsLocked')}</span>}</span>
                  <span className={`w-9 h-5 rounded-full flex items-center px-0.5 transition shrink-0 ${on ? 'bg-green-500 justify-end' : 'bg-gray-300 justify-start'}`}><span className="w-4 h-4 bg-white rounded-full" /></span>
                </button>
              );
            })}
          </div>
        </div>
        <div className="flex gap-4 pt-4">
          <button type="button" onClick={() => setIsEditingClient(false)} className="flex-1 py-4 rounded-2xl font-black text-xs uppercase tracking-widest border border-gray-200 text-gray-400 hover:bg-gray-50 transition">{t('admin.common.cancel')}</button>
          <button type="submit" disabled={uploading} className="flex-1 py-4 rounded-2xl font-black text-xs uppercase tracking-widest bg-primary text-white shadow-lg hover:bg-black transition disabled:opacity-50">{uploading ? t('admin.adminDash.savingEllipsis') : t('admin.adminDash.save')}</button>
        </div>
      </form>
    </div>
  </div>
)}

{editingAssignment && (
    <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={(e) => { if (e.target === e.currentTarget) setEditingAssignment(null); }}>
        <div className="bg-white w-full max-w-2xl rounded-3xl p-6 md:p-10 shadow-2xl max-h-[92vh] overflow-y-auto">
            <h2 className="text-2xl font-serif text-primary mb-2">{t('admin.adminDash.editAssignment')}</h2>
            <p className="text-sm text-gray-400 mb-2">{t('admin.dash.clientLabel')}: <strong className="text-primary">{editingAssignment.clientName}</strong></p>
            <p className="text-sm text-gray-400 mb-8">{t('admin.dash.projectLabel')}: <strong className="text-primary">{editingAssignment.assignment.project_name}</strong></p>
            <form onSubmit={handleEditAssignment} className="space-y-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                    <div><label className="block text-[10px] font-black uppercase text-gray-400 mb-2">{t('admin.dash.unitReference')}</label><input value={editingAssignment.assignment.unit_number || ''} onChange={(e) => setEditingAssignment({...editingAssignment, assignment: {...editingAssignment.assignment, unit_number: e.target.value}})} placeholder={t('admin.dash.unitReferencePh')} className="w-full px-5 py-4 bg-gray-50 border border-gray-200 rounded-2xl font-bold" /></div>
                    <div>
                        <label className="block text-[10px] font-black uppercase text-gray-400 mb-2">{t('admin.dash.investedAmount')}</label>
                        <div className="flex gap-2">
                            <input type="number" value={editingAssignment.assignment.investment_amount || ''} onChange={(e) => setEditingAssignment({...editingAssignment, assignment: {...editingAssignment.assignment, investment_amount: parseFloat(e.target.value) || 0}})} className="w-full px-5 py-4 bg-gray-50 border border-gray-200 rounded-2xl font-bold flex-grow" />
                            <select value={editingAssignment.assignment.currency || 'EUR'} onChange={(e) => setEditingAssignment({...editingAssignment, assignment: {...editingAssignment.assignment, currency: e.target.value}})} className="px-3 py-4 bg-gray-100 border border-gray-200 rounded-2xl font-bold w-24">
                                {CURRENCIES.map(c => <option key={c.code} value={c.code}>{c.code}</option>)}
                            </select>
                        </div>
                    </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                    <div><label className="block text-[10px] font-black uppercase text-gray-400 mb-2">{t('admin.dash.purchaseDate')}</label><input type="date" value={editingAssignment.assignment.purchase_date || ''} onChange={(e) => setEditingAssignment({...editingAssignment, assignment: {...editingAssignment.assignment, purchase_date: e.target.value}})} className="w-full px-5 py-4 bg-gray-50 border border-gray-200 rounded-2xl font-bold" /></div>
                    <div><label className="block text-[10px] font-black uppercase text-gray-400 mb-2">{t('admin.dash.investmentStatus')}</label>
                        <select value={editingAssignment.assignment.status || 'Reserva'} onChange={(e) => setEditingAssignment({...editingAssignment, assignment: {...editingAssignment.assignment, status: e.target.value}})} className="w-full px-5 py-4 bg-gray-50 border border-gray-200 rounded-2xl font-bold">
                            <option value="Reserva">{translateStatus('Reserva', t)}</option>
                            <option value="Pagado">{translateStatus('Pagado', t)}</option>
                            <option value="En proceso">{translateStatus('En proceso', t)}</option>
                            <option value="Completado">{translateStatus('Completado', t)}</option>
                        </select>
                    </div>
                </div>
                <div>
                    <label className="block text-[10px] font-black uppercase text-gray-400 mb-2">{t('admin.dash.deliveryDate')}</label>
                    <input type="date" value={((editingAssignment.assignment as any).delivery_date || '').slice(0, 10)} onChange={(e) => setEditingAssignment({...editingAssignment, assignment: {...editingAssignment.assignment, delivery_date: e.target.value} as any})} className="w-full px-5 py-4 bg-gray-50 border border-gray-200 rounded-2xl font-bold" />
                    <p className="text-[10px] text-gray-400 mt-1">{t('admin.dash.deliveryDateHint')}</p>
                </div>
                <div>
                    <label className="block text-[10px] font-black uppercase text-gray-400 mb-2">{t('admin.dash.driveFolderLabel', { defaultValue: 'Carpeta de documentación (Drive) de este proyecto' })}</label>
                    <input type="url" value={(editingAssignment.assignment as any).drive_folder_url || ''} onChange={(e) => setEditingAssignment({...editingAssignment, assignment: {...editingAssignment.assignment, drive_folder_url: e.target.value} as any})} placeholder="https://drive.google.com/drive/folders/..." className="w-full px-5 py-4 bg-gray-50 border border-gray-200 rounded-2xl font-medium" />
                </div>
                <div>
                    <label className="block text-[10px] font-black uppercase text-gray-400 mb-2">{t('admin.dash.investmentType', { defaultValue: 'Tipo de inversión' })}</label>
                    <select value={(editingAssignment.assignment as any).investment_type || 'compra'} onChange={(e) => setEditingAssignment({...editingAssignment, assignment: {...editingAssignment.assignment, investment_type: e.target.value} as any})} className="w-full px-5 py-4 bg-gray-50 border border-gray-200 rounded-2xl font-bold">
                      <option value="compra">{t('admin.dash.invCompra', { defaultValue: 'Compra (revender/alquilar)' })}</option>
                      <option value="pool">{t('admin.dash.invPool', { defaultValue: 'Pool de inversión' })}</option>
                      <option value="desarrollo">{t('admin.dash.invDesarrollo', { defaultValue: 'Desarrollo a medida' })}</option>
                      <option value="arquitectura">{t('admin.dash.invArquitectura', { defaultValue: 'Arquitectura' })}</option>
                    </select>
                </div>
                {(editingAssignment.assignment as any).investment_type === 'pool' && (
                  <div>
                    <label className="block text-[10px] font-black uppercase text-gray-400 mb-2">{t('admin.dash.poolTotal', { defaultValue: 'Total del complejo (para el %)' })}</label>
                    <input type="number" value={(editingAssignment.assignment as any).pool_total_amount || ''} onChange={(e) => setEditingAssignment({...editingAssignment, assignment: {...editingAssignment.assignment, pool_total_amount: parseFloat(e.target.value) || 0} as any})} className="w-full px-5 py-4 bg-gray-50 border border-gray-200 rounded-2xl font-bold" />
                    {Number((editingAssignment.assignment as any).pool_total_amount) > 0 && (
                      <p className="text-xs font-bold text-primary/70 mt-1">{t('admin.dash.poolShare', { defaultValue: 'Participación' })}: {((Number(editingAssignment.assignment.investment_amount || 0) / Number((editingAssignment.assignment as any).pool_total_amount)) * 100).toFixed(4)}%</p>
                    )}
                  </div>
                )}
                <ParticipantsPicker holders={(clients.find((c) => c.id === editingAssignment.clientId)?.holders) || []} value={(editingAssignment.assignment as any).holder_participants} onChange={(v) => setEditingAssignment({...editingAssignment, assignment: {...editingAssignment.assignment, holder_participants: v} as any})} t={t} />
                <div className="flex gap-4 pt-4">
                    <button type="submit" disabled={uploading} className="flex-1 bg-primary text-white py-4 rounded-xl font-bold uppercase tracking-widest text-xs disabled:opacity-50 flex items-center justify-center gap-2">{uploading ? <><span className="material-symbols-outlined animate-spin text-sm">refresh</span> {t('admin.adminDash.savingEllipsis')}</> : t('admin.adminDash.saveChanges')}</button>
                    <button type="button" onClick={() => setEditingAssignment(null)} className="flex-1 bg-red-50 text-red-600 py-4 rounded-xl font-bold uppercase tracking-widest text-xs hover:bg-red-100 transition">{t('admin.dash.close')}</button>
                </div>
            </form>
        </div>
    </div>
)}

{/* Modal Asignar Proyecto a un cliente */}
{assigningProject && (
    <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={(e) => { if (e.target === e.currentTarget) setAssigningProject(null); }}>
        <div className="bg-white w-full max-w-2xl rounded-3xl p-6 md:p-10 shadow-2xl max-h-[92vh] overflow-y-auto">
            <h2 className="text-2xl font-serif text-primary mb-2">{t('admin.dash.assignProjectTitle')}</h2>
            <p className="text-sm text-gray-400 mb-8">{t('admin.dash.clientLabel')}: <strong className="text-primary">{assigningProject.clientName}</strong></p>
            <form onSubmit={handleAssignProject} className="space-y-6">
                <div>
                    <label className="block text-[10px] font-black uppercase text-gray-400 mb-2">{t('admin.dash.projectLabel')}</label>
                    <select value={assignForm.project_id} onChange={(e) => setAssignForm({...assignForm, project_id: e.target.value})} className="w-full px-5 py-4 bg-gray-50 border border-gray-200 rounded-2xl font-bold">
                        {projects.length === 0 && <option value="">{t('admin.dash.noProjectsOption')}</option>}
                        {projects.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                    <div><label className="block text-[10px] font-black uppercase text-gray-400 mb-2">{t('admin.dash.unitReference')}</label><input value={assignForm.unit_number} onChange={(e) => setAssignForm({...assignForm, unit_number: e.target.value})} placeholder={t('admin.dash.unitReferencePh')} className="w-full px-5 py-4 bg-gray-50 border border-gray-200 rounded-2xl font-bold" /></div>
                    <div>
                        <label className="block text-[10px] font-black uppercase text-gray-400 mb-2">{t('admin.dash.investedAmount')}</label>
                        <div className="flex gap-2">
                            <input type="number" value={assignForm.investment_amount || ''} onChange={(e) => setAssignForm({...assignForm, investment_amount: parseFloat(e.target.value) || 0})} className="w-full px-5 py-4 bg-gray-50 border border-gray-200 rounded-2xl font-bold flex-grow" />
                            <select value={assignForm.currency} onChange={(e) => setAssignForm({...assignForm, currency: e.target.value})} className="px-3 py-4 bg-gray-100 border border-gray-200 rounded-2xl font-bold w-24">
                                {CURRENCIES.map(c => <option key={c.code} value={c.code}>{c.code}</option>)}
                            </select>
                        </div>
                    </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                    <div><label className="block text-[10px] font-black uppercase text-gray-400 mb-2">{t('admin.dash.purchaseDate')}</label><input type="date" value={assignForm.purchase_date} onChange={(e) => setAssignForm({...assignForm, purchase_date: e.target.value})} className="w-full px-5 py-4 bg-gray-50 border border-gray-200 rounded-2xl font-bold" /></div>
                    <div><label className="block text-[10px] font-black uppercase text-gray-400 mb-2">{t('admin.dash.investmentStatus')}</label>
                        <select value={assignForm.status} onChange={(e) => setAssignForm({...assignForm, status: e.target.value})} className="w-full px-5 py-4 bg-gray-50 border border-gray-200 rounded-2xl font-bold">
                            <option value="Reserva">{translateStatus('Reserva', t)}</option>
                            <option value="Pagado">{translateStatus('Pagado', t)}</option>
                            <option value="En proceso">{translateStatus('En proceso', t)}</option>
                            <option value="Completado">{translateStatus('Completado', t)}</option>
                        </select>
                    </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                    <div>
                        <label className="block text-[10px] font-black uppercase text-gray-400 mb-2">{t('admin.dash.investmentType', { defaultValue: 'Tipo de inversión' })}</label>
                        <select value={(assignForm as any).investment_type || 'compra'} onChange={(e) => setAssignForm({...assignForm, investment_type: e.target.value} as any)} className="w-full px-5 py-4 bg-gray-50 border border-gray-200 rounded-2xl font-bold">
                            <option value="compra">{t('admin.dash.invCompra', { defaultValue: 'Compra (revender/alquilar)' })}</option>
                            <option value="pool">{t('admin.dash.invPool', { defaultValue: 'Pool de inversión' })}</option>
                            <option value="desarrollo">{t('admin.dash.invDesarrollo', { defaultValue: 'Desarrollo a medida' })}</option>
                            <option value="arquitectura">{t('admin.dash.invArquitectura', { defaultValue: 'Arquitectura' })}</option>
                        </select>
                    </div>
                    {(assignForm as any).investment_type === 'pool' && (
                      <div>
                        <label className="block text-[10px] font-black uppercase text-gray-400 mb-2">{t('admin.dash.poolTotal', { defaultValue: 'Total del complejo (para el %)' })}</label>
                        <input type="number" value={(assignForm as any).pool_total || ''} onChange={(e) => setAssignForm({...assignForm, pool_total: parseFloat(e.target.value) || 0} as any)} className="w-full px-5 py-4 bg-gray-50 border border-gray-200 rounded-2xl font-bold" />
                        {Number((assignForm as any).pool_total) > 0 && Number(assignForm.investment_amount) > 0 && (
                          <p className="text-xs font-bold text-primary/70 mt-1">{t('admin.dash.poolShare', { defaultValue: 'Participación' })}: {((Number(assignForm.investment_amount) / Number((assignForm as any).pool_total)) * 100).toFixed(4)}%</p>
                        )}
                      </div>
                    )}
                </div>
                <ParticipantsPicker holders={(clients.find((c) => c.id === assigningProject.clientId)?.holders) || []} value={(assignForm as any).participants} onChange={(v) => setAssignForm({...assignForm, participants: v} as any)} t={t} />
                <div className="flex gap-4 pt-4">
                    <button type="submit" disabled={uploading || !assignForm.project_id} className="flex-1 bg-primary text-white py-4 rounded-xl font-bold uppercase tracking-widest text-xs disabled:opacity-50 flex items-center justify-center gap-2">{uploading ? <><span className="material-symbols-outlined animate-spin text-sm">refresh</span> {t('admin.adminDash.savingEllipsis')}</> : t('admin.dash.assignBtn')}</button>
                    <button type="button" onClick={() => setAssigningProject(null)} className="flex-1 bg-red-50 text-red-600 py-4 rounded-xl font-bold uppercase tracking-widest text-xs hover:bg-red-100 transition">{t('admin.common.cancel')}</button>
                </div>
            </form>
        </div>
    </div>
)}

{/* Modal Option Manager */}
{optionManager && optionManager.field && (
  <div className="fixed inset-0 z-[160] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={(e) => { if (e.target === e.currentTarget) setOptionManager(null); }}>
    <div className="bg-white w-full max-w-md rounded-3xl p-8 shadow-2xl">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-xl font-serif text-primary">{optionManager.title}</h2>
        <button onClick={() => setOptionManager(null)} className="text-gray-400 hover:text-primary"><span className="material-symbols-outlined">close</span></button>
      </div>
      <div className="space-y-2 mb-6 max-h-60 overflow-y-auto">
        {((config as any)[optionManager.field] || []).map((item: string, idx: number) => (
          <div key={idx} className="flex items-center justify-between bg-gray-50 rounded-xl px-4 py-3">
            <span className="text-sm font-medium text-primary">{item}</span>
            <button onClick={() => handleDeleteOption(idx)} className="text-red-400 hover:text-red-600 transition"><span className="material-symbols-outlined text-sm">delete</span></button>
          </div>
        ))}
      </div>
      <div className="flex gap-2">
        <input type="text" value={newOptionValue} onChange={(e) => setNewOptionValue(e.target.value)} placeholder={t('admin.adminDash.newOptionPlaceholder')} className="flex-1 px-4 py-3 bg-gray-50 rounded-xl font-medium border border-gray-200 focus:border-primary focus:outline-none" onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddOption(); } }} />
        <button onClick={handleAddOption} className="bg-primary text-white px-5 py-3 rounded-xl font-bold text-xs uppercase hover:bg-black transition">{t('admin.dash.add')}</button>
      </div>
    </div>
  </div>
)}

{/* Modal Plantillas WhatsApp */}
{paymentsClient && getAdminUserId() && (
  <ClientPaymentsPanel
    clientId={paymentsClient.id}
    clientName={paymentsClient.name}
    clientEmail={paymentsClient.email || null}
    clientExtraEmails={(paymentsClient as any).extra_emails || []}
    clientHolders={(paymentsClient as any).holders || []}
    adminUserId={getAdminUserId() as string}
    brand={(config as any).brand || {}}
    adminSignature={mySignature}
    clientLang={(paymentsClient as any).preferred_language || 'es'}
    filterName={paymentsFilter?.name}
    filterUnit={paymentsFilter?.unit ?? undefined}
    onClose={() => { setPaymentsClient(null); setPaymentsFilter(null); }}
  />
)}

{whatsappClient && (
  <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={(e) => { if (e.target === e.currentTarget) setWhatsappClient(null); }}>
    <div className="bg-white w-full max-w-2xl rounded-3xl p-6 md:p-10 shadow-2xl max-h-[85vh] overflow-y-auto">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h2 className="text-2xl font-serif text-primary">{t('admin.dash.whatsappTemplates')}</h2>
          <p className="text-sm text-gray-400 mt-1">{t('admin.dash.sendTo')} <strong className="text-primary">{whatsappClient.name}</strong></p>
        </div>
        <button onClick={() => setWhatsappClient(null)} className="p-2 text-red-500 bg-red-50 rounded-xl hover:bg-red-100 transition"><span className="material-symbols-outlined">close</span></button>
      </div>
      <div className="space-y-3">
        {WHATSAPP_TEMPLATES.map((tpl, idx) => (
          <button key={idx} onClick={() => openWhatsAppTemplate(whatsappClient, tpl.template(whatsappClient))} className="w-full text-left bg-gray-50 hover:bg-green-50 rounded-xl px-6 py-5 transition border border-gray-100 hover:border-green-200">
            <p className="font-bold text-primary text-sm mb-1">{t(tpl.nameKey)}</p>
            <p className="text-xs text-gray-400 line-clamp-2">{tpl.template(whatsappClient).substring(0, 100)}...</p>
          </button>
        ))}
      </div>
    </div>
  </div>
)}

{mailClient && (
  <div className="fixed inset-0 z-[150] flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm p-0 sm:p-4" onClick={(e) => { if (e.target === e.currentTarget) setMailClient(null); }}>
    <div className="relative bg-white w-full sm:max-w-2xl rounded-t-3xl sm:rounded-3xl p-5 sm:p-10 shadow-2xl max-h-[88vh] overflow-y-auto">
      {mailBusy && (
        <div className="absolute inset-0 z-10 bg-white/80 backdrop-blur-sm rounded-t-3xl sm:rounded-3xl flex flex-col items-center justify-center gap-3">
          <span className="w-10 h-10 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
          <span className="text-sm font-bold text-primary">{t('admin.dash.sendingMail')}</span>
        </div>
      )}
      <div className="flex justify-between items-start gap-3 mb-6">
        <div className="min-w-0">
          <h2 className="text-xl sm:text-2xl font-serif text-primary">{t('admin.dash.mailCenter')}</h2>
          <p className="text-sm text-gray-400 mt-1 truncate">{t('admin.dash.sendTo')} <strong className="text-primary">{mailClient.name}</strong> <span className="text-gray-300">· {mailClient.email || '—'}</span></p>
        </div>
        <button onClick={() => setMailClient(null)} className="p-2 text-red-500 bg-red-50 rounded-xl hover:bg-red-100 transition shrink-0"><span className="material-symbols-outlined">close</span></button>
      </div>
      <div className="space-y-3">
        {[
          { icon: 'waving_hand', titleKey: 'admin.dash.mailWelcome', descKey: 'admin.dash.mailWelcomeDesc', run: () => sendWelcome(mailClient) },
          { icon: 'lock_reset', titleKey: 'admin.dash.mailReset', descKey: 'admin.dash.mailResetDesc', run: () => sendResetEmail(mailClient) },
          { icon: 'event', titleKey: 'admin.dash.mailReminder', descKey: 'admin.dash.mailReminderDesc', run: () => sendReminderEmail(mailClient) },
          { icon: 'description', titleKey: 'admin.dash.mailReport', descKey: 'admin.dash.mailReportDesc', run: () => sendReportEmail(mailClient) },
          { icon: 'event_note', titleKey: 'admin.dash.mailCalendar', descKey: 'admin.dash.mailCalendarDesc', run: () => sendCalendarEmail(mailClient) },
        ].map((m, idx) => (
          <button key={idx} disabled={mailBusy} onClick={() => { void (async () => { setMailBusy(true); try { await m.run(); } finally { setMailBusy(false); } })(); }} className="w-full text-left bg-gray-50 hover:bg-blue-50 rounded-xl px-4 sm:px-6 py-4 sm:py-5 transition border border-gray-100 hover:border-blue-200 flex items-center gap-3 sm:gap-4 disabled:opacity-60">
            <span className="material-symbols-outlined text-blue-600 shrink-0">{m.icon}</span>
            <span className="min-w-0">
              <span className="block font-bold text-primary text-sm mb-0.5">{t(m.titleKey)}</span>
              <span className="block text-xs text-gray-400">{t(m.descKey)}</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  </div>
)}

    <Footer />
      </div>
    </div>
  );
};

export default AdminDashboard;