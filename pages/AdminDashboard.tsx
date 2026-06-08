import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
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
import ClientPaymentsPanel from '../components/admin/ClientPaymentsPanel';

type AdminView = 'projects' | 'blogs' | 'config' | 'users' | 'clients' | 'calendar' | 'employees';
const ADMIN_VIEWS: AdminView[] = ['projects', 'blogs', 'config', 'users', 'clients', 'calendar', 'employees'];

const GUIDE_STEPS = [
  { 
    title: "Navegación principal", 
    text: "Desde aquí accedes a las 4 secciones del panel: gestión de propiedades, artículos del blog, usuarios administradores y configuración general." 
  },
  { 
    title: "Crear contenido", 
    text: "Usa este botón para añadir nuevos proyectos o artículos. Rellena los campos y pulsa Guardar. Las imágenes se suben directamente a la nube." 
  },
  { 
    title: "Editar y eliminar", 
    text: "Cada elemento tiene botones para editarlo o eliminarlo. Al eliminar, se pedirá confirmación. Los cambios se aplican inmediatamente en la web pública." 
  },
  { 
    title: "Configuración", 
    text: "Aquí puedes personalizar las etiquetas, tipos de propiedad, zonas, estados y tasas de cambio que se usan en toda la plataforma." 
  },
  { 
    title: "¡Listo!", 
    text: "Ya conoces lo básico. Todos los cambios que hagas se reflejan en unrealstudio.es en tiempo real. Si necesitas ayuda, contacta con el equipo técnico." 
  }
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
  const [assigningProject, setAssigningProject] = useState<{ clientId: string, clientName: string } | null>(null);
  const [editingAssignment, setEditingAssignment] = useState<{ clientId: string, clientName: string, assignment: any } | null>(null);
  const [assignForm, setAssignForm] = useState({ project_id: '', unit_number: '', investment_amount: 0, currency: 'EUR', purchase_date: '', status: 'Reserva' });
  const [whatsappClient, setWhatsappClient] = useState<Client | null>(null);
  const [paymentsClient, setPaymentsClient] = useState<Client | null>(null);

  const [currentUserData, setCurrentUserData] = useState<User | null>(null);
  
  const { currency, setCurrency, formatPrice } = useCurrency();
  // La vista activa vive en la URL (?view=) para que el menú lateral (presente
  // en todas las páginas admin) navegue entre secciones de forma consistente.
  const [searchParams, setSearchParams] = useSearchParams();
  const viewParam = searchParams.get('view') as AdminView | null;
  const activeView: AdminView = viewParam && ADMIN_VIEWS.includes(viewParam) ? viewParam : 'projects';
  const setActiveView = (v: AdminView) => setSearchParams({ view: v });
  const [employees, setEmployees] = useState<Array<{ id: string; email: string; full_name: string | null; password: string | null; active: boolean; can_upload_reports: boolean; permissions: Record<string, boolean> | null }>>([]);
  const loadEmployees = useCallback(async () => {
    const { data } = await supabase
      .from('employees')
      .select('id, email, full_name, password, active, can_upload_reports, permissions')
      .order('full_name');
    setEmployees((data as typeof employees) ?? []);
  }, []);
  useEffect(() => {
    if (activeView !== 'employees') return;
    void loadEmployees();
  }, [activeView, loadEmployees]);
  // Toggle del estado activo/inactivo del empleado.
  const toggleEmployeeActive = async (id: string, value: boolean) => {
    await supabase.from('employees').update({ active: value }).eq('id', id);
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
        return new Date(dateString).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
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
      setCalendarAuthError('Contraseña incorrecta');
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
      // Proyectos
      const { data: projectsData, error: projectsError } = await supabase
          .from('projects')
          .select('*')
          .order('sort_order', { ascending: true });
      
      if (projectsData) {
          const safeProjects = projectsData.map((p: any) => ({
                ...p,
                gallery: parseJsonField(p.gallery, []),
                investor_tiers: parseJsonField(p.investor_tiers, [])
          }));
          setProjects(safeProjects as unknown as Project[]);
      } else if (projectsError) {
          console.error('Error loading projects:', projectsError);
      }

      // Blogs
      const { data: blogsData, error: blogsError } = await supabase
          .from('blogs')
          .select('*')
          .order('published_date', { ascending: false });

      if (blogsData) {
          setBlogs(blogsData as unknown as BlogPost[]);
      } else if (blogsError) {
          console.error('Error loading blogs:', blogsError);
      }

      // Usuarios
      const userId = getAdminUserId();
      if (userId) {
          const { data: usersResult, error: usersError } = await supabase.rpc('admin_list_users', { p_user_id: userId });
          if (usersResult && usersResult.success) {
              setUsers(usersResult.users || []);
          } else if (usersError) {
              console.error('Error loading users:', usersError);
          }
      }

      // Clientes
      if (userId) {
        const { data: clientsResult, error: clientsError } = await supabase.rpc('admin_list_clients', { p_user_id: userId });
        if (clientsResult && clientsResult.success) {
          setClients(clientsResult.clients || []);
        } else if (clientsError) {
          console.error('Error loading clients:', clientsError);
        }
      }

      // Configuración
      const { data: configRows, error: configError } = await supabase
          .from('app_config')
          .select('*');

      if (configRows && configRows.length > 0) {
          const configObj: Record<string, any> = {};
          configRows.forEach((row: any) => {
              configObj[row.key] = row.value;
          });
          setConfig({ ...DEFAULT_CONFIG, ...configObj } as AppConfig);
      } else if (configError) {
          console.error('Error loading config:', configError);
      }
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
      loadData();
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
          alert('Error subiendo archivo');
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
        if (!userId) { alert('Sesión expirada'); navigate('/admin/login'); return; }

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

        await loadData();
        setIsEditing(false);
    } catch (error) {
        console.error('Error saving project:', error);
        alert('Error al guardar el proyecto.');
    } finally {
        setUploading(false);
    }
  };

  const handleDeleteProject = async (id: string) => {
    if (window.confirm('¿Eliminar esta propiedad definitivamente?')) {
      const userId = getAdminUserId();
      if (!userId) { alert('Sesión expirada'); navigate('/admin/login'); return; }
      const { data, error } = await supabase.rpc('admin_delete_project', {
        p_user_id: userId,
        p_project_id: id
      });
      if (error || (data && !data.success)) {
          console.error('Error deleting project:', error || data?.error);
          alert('No se pudo eliminar el proyecto.');
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
        if (!userId) { alert('Sesión expirada'); navigate('/admin/login'); return; }

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
        alert('Error al guardar el artículo.');
    } finally {
        setUploading(false);
    }
  };

  const handleDeleteBlog = async (id: string) => {
    if (window.confirm('¿Eliminar este artículo definitivamente?')) {
      const userId = getAdminUserId();
      if (!userId) { alert('Sesión expirada'); navigate('/admin/login'); return; }
      const { data, error } = await supabase.rpc('admin_delete_blog', {
        p_user_id: userId,
        p_blog_id: id
      });
      if (error || (data && !data.success)) {
          console.error('Error deleting blog:', error || data?.error);
          alert('No se pudo eliminar el blog.');
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
        if (!userId) { alert('Sesión expirada'); navigate('/admin/login'); return; }
        
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
        alert('Error al guardar usuario.');
    }
  };

  const handleDeleteUser = async (id: string) => {
    if (!window.confirm('¿Eliminar este administrador definitivamente?')) return;
    try {
      const userId = getAdminUserId();
      if (!userId) { alert('Sesión expirada'); navigate('/admin/login'); return; }
      const { data, error } = await supabase.rpc('admin_delete_user', {
        p_user_id: userId,
        p_target_user_id: id
      });
      if (error || (data && !data.success)) throw new Error(data?.error || 'Error');
      await loadData();
    } catch (error) {
      alert('No se pudo eliminar el administrador.');
    }
  };

// --- LOGICA DE CLIENTES ---
const filteredClients = clients.filter(c => {
  if (!clientSearch.trim()) return true;
  const q = clientSearch.toLowerCase();
  return c.name.toLowerCase().includes(q) || c.email.toLowerCase().includes(q) || c.phone?.toLowerCase().includes(q);
});

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
    if (!userId) { alert('Sesión expirada'); navigate('/admin/login'); return; }
    const clientData = currentClient.id?.startsWith('client-') ? { ...currentClient, id: undefined } : currentClient;
    const { data, error } = await supabase.rpc('admin_save_client', {
      p_user_id: userId,
      p_client: clientData
    });
    if (error) throw error;
    if (data && !data.success) throw new Error(data.error);
    await loadData();
    setIsEditingClient(false);
    if (data && data.temp_password) {
      alert(`Cliente creado. Contraseña temporal: ${data.temp_password}`);
    }
  } catch (error) {
    console.error('Error saving client:', error);
    alert('Error al guardar cliente.');
  } finally {
    setUploading(false);
  }
};

const handleDeleteClient = async (id: string) => {
  if (!window.confirm('¿Eliminar este cliente definitivamente?')) return;
  try {
    const userId = getAdminUserId();
    if (!userId) { alert('Sesión expirada'); navigate('/admin/login'); return; }
    const { data, error } = await supabase.rpc('admin_delete_client', {
      p_user_id: userId,
      p_client_id: id
    });
    if (error || (data && !data.success)) throw new Error('Error');
    await loadData();
  } catch (error) {
    alert('No se pudo eliminar el cliente.');
  }
};

const handleAssignProject = async (e: React.FormEvent) => {
  e.preventDefault();
  if (!assigningProject) return;
  try {
    setUploading(true);
    const userId = getAdminUserId();
    if (!userId) { alert('Sesión expirada'); navigate('/admin/login'); return; }
    const { data, error } = await supabase.rpc('admin_assign_project', {
      p_user_id: userId,
      p_client_id: assigningProject.clientId,
      p_project_id: assignForm.project_id,
      p_unit: assignForm.unit_number,
      p_amount: assignForm.investment_amount,
      p_currency: assignForm.currency,
      p_date: assignForm.purchase_date || null,
      p_status: assignForm.status
    });
    if (error) throw error;
    if (data && !data.success) throw new Error(data.error);
    await loadData();
    setAssigningProject(null);
    setAssignForm({ project_id: '', unit_number: '', investment_amount: 0, currency: 'EUR', purchase_date: '', status: 'Reserva' });
  } catch (error) {
    console.error('Error assigning project:', error);
    alert('Error al asignar proyecto.');
  } finally {
    setUploading(false);
  }
};

const handleUnassignProject = async (clientId: string, assignmentId: string) => {
  if (!window.confirm('¿Desasignar este proyecto del cliente?')) return;
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
    alert('Error al desasignar proyecto.');
  }
};

const handleEditAssignment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingAssignment) return;
    try {
        setUploading(true);
        const userId = getAdminUserId();
        if (!userId) { alert('Sesión expirada'); navigate('/admin/login'); return; }
        const { data, error } = await supabase.rpc('admin_update_assignment', {
            p_user_id: userId,
            p_assignment_id: editingAssignment.assignment.id,
            p_unit: editingAssignment.assignment.unit_number || '',
            p_amount: editingAssignment.assignment.investment_amount || 0,
            p_currency: editingAssignment.assignment.currency,
            p_date: editingAssignment.assignment.purchase_date || null,
            p_status: editingAssignment.assignment.status || 'Reserva'
        });
        if (error) throw error;
        if (data && !data.success) throw new Error(data.error);
        await loadData();
        setEditingAssignment(null);
    } catch (error) {
        console.error('Error updating assignment:', error);
        alert('Error al actualizar la asignación.');
    } finally {
        setUploading(false);
    }
};

const WHATSAPP_TEMPLATES = [
  { name: 'Bienvenida + credenciales', template: (c: Client) => `¡Hola ${c.name}!\n\nBienvenido/a a Unreal Studio. Tu portal de inversor está listo:\n\nLink: https://unrealstudiobali.com/cliente\nEmail o Teléfono: ${c.email || c.phone}\nPass: ${c.temp_password || '(contraseña enviada previamente)'}\n\nCambia tu contraseña en el primer acceso.\n\n¿Alguna duda? Estamos aquí para ayudarte.` },
  { name: 'Update semanal', template: (c: Client) => `¡Hola ${c.name}!\n\nTe compartimos la actualización semanal de tu inversión. Entra a tu portal para ver los últimos avances:\n\nLink: https://unrealstudiobali.com/cliente\n\n¿Preguntas? Escríbenos.` },
  { name: 'Nuevo informe disponible', template: (c: Client) => `¡Hola ${c.name}!\n\n[Doc] Hay un nuevo informe de obra disponible en tu portal de inversor.\n\nLink: https://unrealstudiobali.com/cliente\n\nRevísalo y cuéntanos si tienes dudas.` },
  { name: 'Hito de obra', template: (c: Client) => `¡Hola ${c.name}!\n\n¡Gran noticia! Tu proyecto ha alcanzado un nuevo hito de construcción.\n\nEntra al portal para ver los detalles y fotos actualizadas:\nLink: https://unrealstudiobali.com/cliente` },
  { name: 'Finalización', template: (c: Client) => `¡Hola ${c.name}!\n\n¡Enhorabuena! Tu proyecto se ha completado. Es momento de coordinar la entrega.\n\nContáctanos para agendar los próximos pasos.` },
  { name: 'Aniversario inversión', template: (c: Client) => `¡Hola ${c.name}!\n\n¡Feliz aniversario de inversión! Gracias por confiar en Unreal Studio.\n\nSi te interesa explorar nuevas oportunidades, estamos a tu disposición.` },
  { name: 'Invitación nuevo proyecto', template: (c: Client) => `¡Hola ${c.name}!\n\nComo inversor de Unreal Studio, tienes acceso prioritario a nuestro nuevo proyecto.\n\n¿Te gustaría recibir información exclusiva antes del lanzamiento público?\n\nEscríbenos para reservar tu plaza.` }
];

const openWhatsAppTemplate = (client: Client, message: string) => {
  const phone = client.phone?.replace(/[^0-9]/g, '') || '34625710770';
  window.open(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`, '_blank');
};

  // --- OPCIONES DE CONFIGURACION ---
  
  // Sube una imagen de marca (logo/sello) y guarda su URL pública en config.brand.
  const handleBrandUpload = async (fieldKey: string, file: File) => {
    const path = await uploadImage(file, 'brand');
    if (!path) { alert('Error subiendo la imagen'); return; }
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
    if (!path) { alert('Error subiendo la firma'); return; }
    setCurrentUser({ ...currentUser, signature_url: getImageUrl(path) } as any);
  };

  const handleMySignatureUpload = async (file: File) => {
    const userId = getAdminUserId();
    if (!userId) { alert('Sesión expirada'); return; }
    const path = await uploadImage(file, 'signatures');
    if (!path) { alert('Error subiendo la firma'); return; }
    const url = getImageUrl(path);
    const { data } = await supabase.rpc('admin_set_my_signature', { p_user_id: userId, p_url: url });
    if (data?.success) { setMySignature(url); } else { alert('No se pudo guardar la firma'); }
  };

  const saveConfigToDb = async (newConfig: AppConfig) => {
      try {
        const userId = getAdminUserId();
        if (!userId) { alert('Sesión expirada'); navigate('/admin/login'); return; }

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
        alert('Configuración guardada');
        await loadData();
      } catch (error) {
          console.error('Config save error:', error);
          alert('Error al guardar configuración.');
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
              title="Cerrar guía"
            >
              <span className="material-symbols-outlined">close</span>
            </button>

            <div className="mb-6">
              <span className="text-[10px] font-black uppercase text-primary/40 tracking-widest block mb-2">
                Paso {walkthroughStep + 1} de {GUIDE_STEPS.length}
              </span>
              <h2 className="text-2xl font-serif text-primary mb-4 leading-tight">
                {GUIDE_STEPS[walkthroughStep].title}
              </h2>
              <p className="text-primary/70 text-sm font-medium leading-relaxed">
                {GUIDE_STEPS[walkthroughStep].text}
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
                    Anterior
                  </button>
                )}
                
                <button 
                  onClick={nextStep}
                  className="bg-primary text-white px-5 py-2.5 rounded-xl font-bold text-xs uppercase tracking-widest shadow-lg hover:bg-black transition-all"
                >
                  {walkthroughStep < GUIDE_STEPS.length - 1 ? 'Siguiente' : 'Finalizar'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <header className="bg-white border-b border-gray-200 px-3 md:px-6 py-3 md:py-4 sticky top-0 z-30 shadow-sm flex justify-between items-center gap-2">
        <div className="flex items-center flex-shrink-0">
          <Link to="/">
            <img src={LOGO_URL} alt="Unreal Studio" className="h-8 md:h-10 w-auto object-contain" />
          </Link>
        </div>
        <div className="flex items-center gap-2 md:gap-3 flex-wrap justify-end">
          <select value={currency} onChange={(e) => setCurrency(e.target.value as any)} className="hidden md:block bg-white/50 border border-primary/10 rounded-full px-3 py-1.5 text-[10px] font-bold text-primary focus:ring-0 cursor-pointer hover:bg-white transition">
            {CURRENCIES.map(c => (<option key={c.code} value={c.code}>{c.code} ({c.symbol})</option>))}
          </select>
          <div className="hidden md:block"><LanguageSwitcher /></div>
          <Link to="/admin/portal" className="bg-primary text-white px-3 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest hover:brightness-110 transition flex items-center gap-1" title={t('admin.nav.portalManager')}>
             <span className="material-symbols-outlined text-sm">dashboard</span>
             <span className="hidden sm:inline">{t('admin.nav.portalManager')}</span>
          </Link>
          <Link to="/admin/marketing" className="bg-emerald-600 text-white px-3 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest hover:brightness-110 transition flex items-center gap-1" title="Marketing · GHL Embudo y Leads">
             <span className="material-symbols-outlined text-sm">campaign</span>
             <span className="hidden sm:inline">{t('admin.nav.marketing')}</span>
          </Link>
          <button onClick={() => setWalkthroughStep(0)} className="hidden md:flex text-[10px] font-black uppercase tracking-widest text-primary/40 hover:text-primary transition items-center gap-1">
             <span className="material-symbols-outlined text-xs">help</span> {t('admin.common.viewGuide')}
          </button>
          <button onClick={handleLogout} className="bg-red-50 text-red-600 px-3 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest hover:bg-red-600 hover:text-white transition">{t('admin.common.logout')}</button>
        </div>
      </header>

      <main className="p-4 md:p-8 max-w-7xl mx-auto w-full flex-grow">
        <div className="md:hidden flex space-x-6 mb-12 border-b border-gray-200 pb-2 overflow-x-auto scrollbar-hide">
          {['projects', 'blogs', 'clients', 'users', 'employees', 'config', 'calendar'].map((v) => (
            <button 
              key={v}
              onClick={() => setActiveView(v as any)}
              className={`text-lg font-serif pb-2 transition-all whitespace-nowrap capitalize ${activeView === v ? 'text-primary border-b-2 border-primary' : 'text-gray-400 hover:text-primary'}`}
            >
              {t(`admin.nav.${v === 'config' ? 'config' : v}`)}
            </button>
          ))}
        </div>

        {activeView === 'projects' && (
          <div className="animate-in fade-in duration-500">
            <div className="flex justify-between items-end mb-8 gap-4">
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
            <div className="flex justify-between items-end mb-8 gap-4">
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
    <div className="flex justify-between items-end mb-8 gap-4">
      <h1 className="text-2xl font-black uppercase tracking-widest text-primary/20">{t('admin.clientsTab.title')}</h1>
      <button onClick={() => openEditClient()} className="bg-primary text-white px-6 py-3 rounded-xl font-black text-xs uppercase tracking-widest shadow-lg flex items-center gap-2 hover:bg-black transition">
        <span className="material-symbols-outlined text-base">person_add</span> Nuevo Cliente
      </button>
    </div>

    <div className="flex items-center gap-2 bg-white rounded-xl px-4 py-2 mb-6 border border-gray-100 max-w-md">
      <span className="material-symbols-outlined text-gray-400 text-sm">search</span>
      <input type="text" placeholder={t('admin.adminDash.searchClients')} value={clientSearch} onChange={(e) => setClientSearch(e.target.value)} className="bg-transparent border-none outline-none text-sm w-full font-bold text-primary" />
    </div>

    <div className="space-y-4">
      {filteredClients.map(client => (
        <div key={client.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          {/* Header con datos del cliente */}
          <div className="p-6 flex justify-between items-start">
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-1">
                <h3 className="text-lg font-bold text-primary">{client.name}</h3>
                <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-full ${client.is_active ? 'bg-green-50 text-green-600' : 'bg-gray-100 text-gray-400'}`}>{client.is_active ? 'Activo' : 'Inactivo'}</span>
              </div>
              <p className="text-sm text-gray-500">{client.email} {client.phone && `· ${client.phone}`}</p>
              <div className="mt-1 space-y-0.5">
                {((client as any).password_plain || client.temp_password) && (
                  <p className="text-[10px] text-orange-500 font-mono cursor-pointer hover:bg-orange-50 rounded px-1 inline-block" onClick={() => {navigator.clipboard.writeText((client as any).password_plain || client.temp_password); alert('Contraseña copiada');}} title="Click para copiar">
                    🔑 {(client as any).password_plain || client.temp_password}
                    {client.must_change_password && <span className="text-red-400 ml-2">(temporal)</span>}
                  </p>
                )}
                {isSuperAdmin && (client as any).password_hash && (
                  <p className="text-[9px] text-gray-300 font-mono truncate max-w-[200px] cursor-pointer hover:bg-gray-50 rounded px-1 inline-block" onClick={() => {navigator.clipboard.writeText((client as any).password_hash); alert('Hash copiado');}} title="Click para copiar hash">
                    🔒 {(client as any).password_hash.substring(0, 20)}...
                  </p>
                )}
              </div>
              {client.notes && <p className="text-xs text-primary/40 mt-2 italic">{client.notes}</p>}
            </div>
            <div className="flex gap-2 shrink-0 ml-4">
              <button onClick={() => openEditClient(client)} className="p-2.5 text-primary bg-almond rounded-xl hover:brightness-95 transition" title="Editar datos"><span className="material-symbols-outlined text-sm">edit</span></button>
              <button onClick={() => setPaymentsClient(client)} className="p-2.5 bg-almond text-primary rounded-xl hover:brightness-95 transition" title="Pagos y kwitansi"><span className="material-symbols-outlined text-sm">payments</span></button>
              <button onClick={() => setWhatsappClient(client)} className="p-2.5 bg-green-50 text-green-600 rounded-xl hover:bg-green-100 transition" title="Enviar WhatsApp"><span className="material-symbols-outlined text-sm">chat</span></button>
              <button onClick={() => handleDeleteClient(client.id)} className="p-2.5 text-red-500 bg-red-50 rounded-xl hover:bg-red-100 transition" title="Eliminar cliente"><span className="material-symbols-outlined text-sm">delete</span></button>
            </div>
          </div>

          {/* Proyectos asignados */}
          <div className="border-t border-gray-50 bg-gray-50/50 px-6 py-4">
            <div className="flex justify-between items-center mb-3">
              <p className="text-[10px] font-black uppercase text-gray-400 tracking-widest">Proyectos asignados ({(client.projects || []).length})</p>
              <button onClick={() => { setAssigningProject({ clientId: client.id, clientName: client.name }); setAssignForm({ project_id: projects[0]?.id || '', unit_number: '', investment_amount: 0, currency: 'EUR', purchase_date: '', status: 'Reserva' }); }} className="bg-primary text-white text-[10px] font-black uppercase tracking-widest px-4 py-2 rounded-lg flex items-center gap-1 hover:bg-black transition">
                <span className="material-symbols-outlined text-xs">add</span> Asignar
              </button>
            </div>
            {client.projects && client.projects.length > 0 ? (
              <div className="space-y-2">
                {client.projects.map((cp: any, cpIdx: number) => (
                  <div key={cp.id || cpIdx} className="flex justify-between items-center bg-white rounded-xl px-4 py-3 border border-gray-100">
                    <div className="flex items-center gap-4 flex-wrap">
                      <span className="font-bold text-primary text-sm">{cp.project_name || cp.project_id}</span>
                      {cp.unit_number && <span className="text-[10px] bg-gray-100 text-gray-500 px-2 py-0.5 rounded font-bold">Unidad: {cp.unit_number}</span>}
                      {cp.investment_amount > 0 && <span className="text-[10px] bg-primary/5 text-primary px-2 py-0.5 rounded font-bold">{formatPrice(Number(cp.investment_amount), cp.currency || 'EUR')}</span>}
                      {cp.purchase_date && <span className="text-[10px] text-gray-400 font-bold">{formatDate(cp.purchase_date)}</span>}
                      <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-full ${cp.status === 'Completado' ? 'bg-green-50 text-green-600' : cp.status === 'Pagado' ? 'bg-blue-50 text-blue-600' : 'bg-yellow-50 text-yellow-600'}`}>{cp.status}</span>
                    </div>
                    <div className="flex gap-1 shrink-0">
                        <button onClick={() => setEditingAssignment({ clientId: client.id, clientName: client.name, assignment: { ...cp } })} className="text-primary hover:text-primary/70 transition p-1" title="Editar asignación"><span className="material-symbols-outlined text-sm">edit</span></button>
                        <button onClick={() => handleUnassignProject(client.id, cp.id)} className="text-red-400 hover:text-red-600 transition p-1" title="Desasignar"><span className="material-symbols-outlined text-sm">close</span></button>
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

        {/* ... (Users and Config views remain unchanged) ... */}
        
        {activeView === 'users' && (
          <div className="animate-in fade-in duration-500">
             <div className="flex justify-between items-end mb-8 gap-4">
              <h1 className="text-2xl font-black uppercase tracking-widest text-primary/20">{t('admin.usersTab.title')}</h1>
              <button onClick={() => openEditUser()} className="bg-primary text-white px-6 py-3 rounded-xl font-black text-xs uppercase tracking-widest shadow-lg flex items-center gap-2 hover:bg-black transition">
                <span className="material-symbols-outlined text-base">person_add</span> Nuevo
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
                              {(u as any).password_plain && (
                                <p className="text-[10px] text-orange-500 font-mono cursor-pointer hover:bg-orange-50 rounded px-1 inline-block" onClick={() => {navigator.clipboard.writeText((u as any).password_plain); alert('Contraseña copiada');}} title="Click para copiar">🔑 {(u as any).password_plain}</p>
                              )}
                              <p className="text-[9px] text-gray-300 font-mono truncate max-w-[200px] cursor-pointer hover:bg-gray-50 rounded px-1 inline-block mt-0.5" onClick={() => {navigator.clipboard.writeText(u.password_hash); alert('Hash copiado');}} title="Click para copiar hash">🔒 {u.password_hash.substring(0, 25)}...</p>
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
           <div className="animate-in fade-in duration-500">
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
                       <p className="text-[10px] text-gray-400 font-bold uppercase">{(config as any)[field].length} opciones disponibles</p>
                     </div>
                     <button onClick={() => setOptionManager({ field: field as any, title: `Editar ${field.replace('custom', '')}` })} className="p-3 bg-primary text-white rounded-xl"><span className="material-symbols-outlined">edit</span></button>
                   </div>
                 ))}
               </div>
             </div>

             {/* Marca y empresa — fuente única para web, emails y kwitansi */}
             <div className="mt-8 bg-white rounded-3xl p-8 border border-gray-100 shadow-sm">
               <h3 className="text-xl font-serif text-primary mb-2">Marca y empresa</h3>
               <p className="text-xs text-gray-400 mb-6">Logo, sello, firma y datos de contacto. Se usan en la WEB, en los EMAILS y en los recibos (kwitansi). Si cambias el logo aquí, cambia en todos.</p>
               <div className="grid sm:grid-cols-2 gap-5 mb-6">
                 {[{ k: 'logo', label: 'Logo' }, { k: 'stamp', label: 'Sello de la empresa' }].map(({ k, label }) => (
                   <div key={k}>
                     <label className="block text-[10px] font-black uppercase text-gray-400 mb-2">{label}</label>
                     <div className="relative border-2 border-dashed border-gray-200 rounded-2xl p-4 text-center">
                       {(config as any).brand?.[k] && (
                         <button type="button" title="Borrar esta foto"
                           onClick={() => { const b = { ...((config as any).brand || {}), [k]: '' }; const nc = { ...config, brand: b } as any; setConfig(nc); void saveConfigToDb(nc); }}
                           className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center text-base leading-none shadow hover:bg-red-600 transition">×</button>
                       )}
                       {(config as any).brand?.[k]
                         ? <img src={(config as any).brand[k]} alt={label} className="h-16 mx-auto object-contain mb-1" />
                         : <span className="material-symbols-outlined text-gray-300 text-3xl">image</span>}
                       <label className="block mt-2 cursor-pointer text-[10px] font-black uppercase text-primary tracking-widest">
                         {(config as any).brand?.[k] ? 'Cambiar' : 'Subir PNG'}
                         <input type="file" accept="image/png,image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleBrandUpload(k, f); }} />
                       </label>
                     </div>
                   </div>
                 ))}
               </div>
               <div className="grid sm:grid-cols-2 gap-5">
                 <div>
                   <label className="block text-[10px] font-black uppercase text-gray-400 mb-2">Email comercial (al que responden los clientes)</label>
                   <input className="w-full px-4 py-3 bg-gray-50 border rounded-xl font-bold text-primary text-sm" placeholder="hello@unrealstudiobali.com"
                     value={(config as any).brand?.commercial_email || ''} onChange={(e) => setConfig({ ...config, brand: { ...((config as any).brand || {}), commercial_email: e.target.value } } as any)} />
                 </div>
                 <div>
                   <label className="block text-[10px] font-black uppercase text-gray-400 mb-2">Teléfono de contacto</label>
                   <input className="w-full px-4 py-3 bg-gray-50 border rounded-xl font-bold text-primary text-sm" placeholder="+62 ..."
                     value={(config as any).brand?.phone || ''} onChange={(e) => setConfig({ ...config, brand: { ...((config as any).brand || {}), phone: e.target.value } } as any)} />
                 </div>
               </div>
               <button onClick={() => saveConfigToDb(config)} className="mt-6 w-full bg-primary text-white py-4 rounded-xl font-black uppercase text-[10px] tracking-widest shadow-md">Guardar marca y empresa</button>
               <p className="mt-3 text-[11px] text-gray-400">La firma se configura en cada administrador (Administradores → editar).</p>
             </div>

             {/* Datos de empresa — una columna, módulos dinámicos */}
             <div className="mt-8 bg-white rounded-3xl p-8 border border-gray-100 shadow-sm">
               <h3 className="text-xl font-serif text-primary mb-2">Datos de empresa</h3>
               <p className="text-xs text-gray-400 mb-6">Para la web, el footer y las comunicaciones. Fuente única.</p>
               <div className="space-y-7 max-w-xl">

                 <div>
                   <label className="block text-[10px] font-black uppercase text-gray-400 mb-2">Direcciones / oficinas</label>
                   {(((config as any).brand?.addresses) || []).map((addr: string, i: number) => (
                     <div key={i} className="flex gap-2 mb-2">
                       <input className="flex-1 px-4 py-3 bg-gray-50 border rounded-xl text-sm text-primary" value={addr} placeholder="Dirección de la oficina"
                         onChange={(e) => { const arr = [...(((config as any).brand?.addresses) || [])]; arr[i] = e.target.value; setBrandKey('addresses', arr); }} />
                       <button type="button" onClick={() => setBrandKey('addresses', (((config as any).brand?.addresses) || []).filter((_: any, j: number) => j !== i))} className="w-10 shrink-0 bg-red-50 text-red-500 rounded-xl hover:bg-red-100 text-lg">×</button>
                     </div>
                   ))}
                   <button type="button" onClick={() => setBrandKey('addresses', [...(((config as any).brand?.addresses) || []), ''])} className="text-[10px] font-black uppercase tracking-widest text-primary">+ Añadir dirección</button>
                 </div>

                 <div>
                   <label className="block text-[10px] font-black uppercase text-gray-400 mb-2">Redes sociales</label>
                   {(((config as any).brand?.socials) || []).map((s: any, i: number) => (
                     <div key={i} className="flex gap-2 mb-2">
                       <input className="w-36 px-3 py-3 bg-gray-50 border rounded-xl text-sm text-primary" value={s?.label || ''} placeholder="Instagram"
                         onChange={(e) => { const arr = [...(((config as any).brand?.socials) || [])]; arr[i] = { ...arr[i], label: e.target.value }; setBrandKey('socials', arr); }} />
                       <input className="flex-1 px-3 py-3 bg-gray-50 border rounded-xl text-sm text-primary" value={s?.url || ''} placeholder="https://..."
                         onChange={(e) => { const arr = [...(((config as any).brand?.socials) || [])]; arr[i] = { ...arr[i], url: e.target.value }; setBrandKey('socials', arr); }} />
                       <button type="button" onClick={() => setBrandKey('socials', (((config as any).brand?.socials) || []).filter((_: any, j: number) => j !== i))} className="w-10 shrink-0 bg-red-50 text-red-500 rounded-xl hover:bg-red-100 text-lg">×</button>
                     </div>
                   ))}
                   <button type="button" onClick={() => setBrandKey('socials', [...(((config as any).brand?.socials) || []), { label: '', url: '' }])} className="text-[10px] font-black uppercase tracking-widest text-primary">+ Añadir red social</button>
                 </div>

                 <div>
                   <label className="block text-[10px] font-black uppercase text-gray-400 mb-2">Horario de atención (vacío = cerrado)</label>
                   {[['mon', 'Lunes'], ['tue', 'Martes'], ['wed', 'Miércoles'], ['thu', 'Jueves'], ['fri', 'Viernes'], ['sat', 'Sábado'], ['sun', 'Domingo']].map(([dk, dl]) => (
                     <div key={dk} className="flex items-center gap-3 mb-2">
                       <span className="w-24 text-xs font-bold text-primary/70">{dl}</span>
                       <input className="flex-1 px-3 py-2.5 bg-gray-50 border rounded-xl text-sm text-primary" placeholder="9:00–18:00"
                         value={(((config as any).brand?.hours) || {})[dk] || ''} onChange={(e) => setBrandKey('hours', { ...(((config as any).brand?.hours) || {}), [dk]: e.target.value })} />
                     </div>
                   ))}
                 </div>

                 <div>
                   <label className="block text-[10px] font-black uppercase text-gray-400 mb-2">Enlace de reservas (Calendly)</label>
                   <input className="w-full px-4 py-3 bg-gray-50 border rounded-xl text-sm text-primary" placeholder="https://calendly.com/..."
                     value={(config as any).brand?.booking_url || ''} onChange={(e) => setBrandKey('booking_url', e.target.value)} />
                 </div>

                 <div>
                   <label className="block text-[10px] font-black uppercase text-gray-400 mb-2">Moneda por defecto para clientes</label>
                   <select className="w-full px-4 py-3 bg-gray-50 border rounded-xl font-bold text-sm text-primary"
                     value={(config as any).brand?.default_currency_clients || 'EUR'} onChange={(e) => setBrandKey('default_currency_clients', e.target.value)}>
                     <option value="EUR">EUR</option><option value="USD">USD</option><option value="IDR">IDR</option>
                   </select>
                   <p className="text-[10px] text-gray-400 mt-1">Se aplica salvo que el cliente tenga otra en su perfil.</p>
                 </div>
               </div>
               <button onClick={() => saveConfigToDb(config)} className="mt-7 w-full bg-primary text-white py-4 rounded-xl font-black uppercase text-[10px] tracking-widest shadow-md">Guardar datos de empresa</button>
             </div>
           </div>
        )}

        {activeView === 'employees' && (
          <div className="animate-in fade-in duration-500">
            <h2 className="text-2xl font-serif text-primary mb-2">Perfiles de Empleados</h2>
            <p className="text-sm text-gray-400 mb-6">Cuentas del portal Team (acceso con email + contraseña).</p>
            <div className="overflow-x-auto bg-white rounded-2xl border border-gray-100 shadow-sm">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-gray-400 text-[10px] uppercase tracking-widest">
                  <tr>
                    <th className="text-left px-4 py-3">Nombre</th>
                    <th className="text-left px-4 py-3">Email</th>
                    <th className="text-left px-4 py-3">Contraseña</th>
                    <th className="text-left px-4 py-3">Permisos</th>
                    <th className="text-left px-4 py-3">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {employees.map((e) => (
                    <tr key={e.id} className="border-t border-gray-50">
                      <td className="px-4 py-3 font-bold text-primary align-top">{e.full_name || '—'}</td>
                      <td className="px-4 py-3 text-gray-600 align-top">{e.email}</td>
                      <td className="px-4 py-3 font-mono text-gray-600 align-top">{e.password || '—'}</td>
                      <td className="px-4 py-3 align-top">
                        <div className="flex flex-wrap gap-2 max-w-md">
                          {EMPLOYEE_PERMISSIONS.map((perm) => {
                            const on = hasPermission(e, perm.key);
                            return (
                              <button
                                key={perm.key}
                                onClick={() => toggleEmployeePermission(e, perm.key, !on)}
                                title={perm.description || perm.label}
                                className={`px-2.5 py-1 rounded-full text-[11px] font-bold transition ${on ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-400 hover:bg-gray-200'}`}
                              >
                                {on ? '✅' : '○'} {perm.label}
                              </button>
                            );
                          })}
                        </div>
                      </td>
                      <td className="px-4 py-3 align-top">
                        <button
                          onClick={() => toggleEmployeeActive(e.id, !e.active)}
                          className={`px-3 py-1 rounded-full text-xs font-bold transition ${e.active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}`}
                        >
                          {e.active ? 'Activo' : 'Inactivo'}
                        </button>
                      </td>
                    </tr>
                  ))}
                  {employees.length === 0 && (
                    <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-400">Sin empleados todavía.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeView === 'calendar' && (
          <div>
            <div className="flex justify-between items-center mb-8">
              <h2 className="text-3xl font-serif text-primary">{t('admin.adminDash.calendarTitle')}</h2>
              <div className="flex items-center gap-3">
                <button onClick={() => setCalendarYear(y => y - 1)} className="p-2 bg-gray-100 rounded-xl hover:bg-gray-200 transition"><span className="material-symbols-outlined">chevron_left</span></button>
                <span className="text-xl font-bold text-primary">{calendarYear}</span>
                <button onClick={() => setCalendarYear(y => y + 1)} className="p-2 bg-gray-100 rounded-xl hover:bg-gray-200 transition"><span className="material-symbols-outlined">chevron_right</span></button>
              </div>
            </div>

            {!calendarEditMode && (
              <div className="bg-white p-6 rounded-2xl shadow-sm border border-primary/5 mb-8 max-w-md">
                <p className="text-sm text-primary/60 mb-3">{t('admin.calendarTab.passwordPrompt')}</p>
                <div className="flex gap-2">
                  <input type="password" value={calendarAdminPassword} onChange={(e) => setCalendarAdminPassword(e.target.value)} placeholder={t('admin.adminDash.adminPassword')} className="flex-1 px-4 py-3 bg-gray-50 rounded-xl border border-gray-200 font-medium" onKeyDown={(e) => e.key === 'Enter' && handleCalendarAuth()} />
                  <button onClick={handleCalendarAuth} className="bg-primary text-white px-5 py-3 rounded-xl font-bold text-xs uppercase hover:bg-black transition">{t('admin.calendarTab.unlock')}</button>
                </div>
                {calendarAuthError && <p className="text-red-500 text-xs mt-2">{calendarAuthError}</p>}
              </div>
            )}

            {calendarEditMode && (
              <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-2 mb-6 flex items-center gap-2">
                <span className="material-symbols-outlined text-green-600 text-sm">lock_open</span>
                <span className="text-xs font-bold text-green-700">{t('admin.calendarTab.editActive')}</span>
                <button onClick={() => setCalendarEditMode(false)} className="ml-auto text-xs text-green-600 hover:text-green-800 font-bold">{t('admin.calendarTab.lock')}</button>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {Array.from({ length: 12 }, (_, monthIdx) => {
                const monthDate = new Date(calendarYear, monthIdx, 1);
                const monthName = monthDate.toLocaleDateString('es-ES', { month: 'long' });
                const daysInMonth = new Date(calendarYear, monthIdx + 1, 0).getDate();
                const firstDayOfWeek = (monthDate.getDay() + 6) % 7;
                
                return (
                  <div key={monthIdx} className="bg-white rounded-2xl p-4 shadow-sm border border-primary/5">
                    <h3 className="text-sm font-bold text-primary uppercase tracking-widest mb-3 text-center capitalize">{monthName}</h3>
                    <div className="grid grid-cols-7 gap-1 text-center">
                      {['L','M','X','J','V','S','D'].map(d => (
                        <span key={d} className="text-[8px] font-bold text-primary/30">{d}</span>
                      ))}
                      {Array.from({ length: firstDayOfWeek }, (_, i) => (
                        <span key={`empty-${i}`} />
                      ))}
                      {Array.from({ length: daysInMonth }, (_, dayIdx) => {
                        const day = dayIdx + 1;
                        const dateStr = `${calendarYear}-${String(monthIdx + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                        const usersOff = users.filter(u => (daysOff[u.id] || []).includes(dateStr));
                        const isWeekend = new Date(calendarYear, monthIdx, day).getDay() === 0 || new Date(calendarYear, monthIdx, day).getDay() === 6;
                        const isToday = dateStr === new Date().toISOString().split('T')[0];
                        
                        return (
                          <div 
                            key={day}
                            className={`relative text-[10px] rounded-lg p-1 min-h-[28px] flex flex-col items-center justify-center cursor-pointer transition
                              ${isToday ? 'ring-2 ring-primary' : ''}
                              ${isWeekend ? 'bg-gray-50 text-gray-300' : 'hover:bg-primary/5'}
                              ${usersOff.length > 0 ? 'bg-red-50' : ''}
                            `}
                            onClick={() => {
                              if (!calendarEditMode) return;
                              const userId = getAdminUserId();
                              if (userId) toggleDayOff(userId, dateStr);
                            }}
                            title={usersOff.length > 0 ? usersOff.map(u => u.username).join(', ') : ''}
                          >
                            <span className={`font-bold ${usersOff.length > 0 ? 'text-red-600' : ''}`}>{day}</span>
                            {usersOff.length > 0 && (
                              <div className="flex gap-0.5 mt-0.5">
                                {usersOff.slice(0, 3).map((u, i) => (
                                  <div key={i} className="w-1.5 h-1.5 rounded-full bg-red-400" title={u.username} />
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>

            {users.length > 0 && (
              <div className="mt-8 bg-white rounded-2xl p-6 shadow-sm border border-primary/5">
                <h3 className="text-lg font-serif text-primary mb-4">{t('admin.calendarTab.summaryByEmployee')}</h3>
                <div className="space-y-3">
                  {users.map(u => {
                    const userDays = (daysOff[u.id] || []).filter(d => d.startsWith(String(calendarYear)));
                    return (
                      <div key={u.id} className="flex justify-between items-center py-2 border-b border-gray-50">
                        <span className="font-medium text-primary">{u.username}</span>
                        <span className="text-sm text-primary/50">{userDays.length} días libres en {calendarYear}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
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
                   <div className="flex gap-2 mb-4">
                       <label className={`cursor-pointer bg-primary text-white px-5 py-4 rounded-2xl hover:bg-black transition flex items-center justify-center ${uploading ? 'opacity-50 pointer-events-none' : ''}`}>
                           {uploading ? <span className="material-symbols-outlined animate-spin">refresh</span> : <span className="material-symbols-outlined">upload_file</span>}
                           <input type="file" className="hidden" accept=".pdf" onChange={(e) => handleFileUpload(e, 'project_floor_plans')} disabled={uploading} />
                       </label>
                   </div>
                   <div className="flex flex-col gap-2">
                       {(currentProject.floor_plans || []).map((pdf, idx) => (
                           <div key={idx} className="flex items-center justify-between bg-gray-50 p-4 rounded-2xl border border-gray-100">
                               <div className="flex items-center gap-3 overflow-hidden">
                                   <span className="material-symbols-outlined text-gray-400">picture_as_pdf</span>
                                   <span className="text-sm font-medium truncate">{pdf.split('/').pop()}</span>
                               </div>
                               <button type="button" onClick={() => removePhoto(pdf, 'floor_plans')} className="p-2 hover:bg-red-50 text-red-500 rounded-xl transition"><span className="material-symbols-outlined">delete</span></button>
                           </div>
                       ))}
                   </div>
                </div>

                <div className="grid grid-cols-3 gap-6">
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
                
                 <div className="grid grid-cols-3 gap-6">
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
      <span className="text-[10px] font-black uppercase text-gray-400">¿Tiene piscina?</span>
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
    <div><label className="block text-[10px] font-black uppercase text-gray-400 mb-2">Proyección alquiler anual ({currentProject.price_currency || 'EUR'})</label><input type="number" value={currentProject.annual_rental_projection || 0} onChange={(e) => setCurrentProject({...currentProject, annual_rental_projection: parseFloat(e.target.value) || 0})} className="w-full px-5 py-4 bg-gray-50 rounded-2xl font-bold" /></div>
    
    <div>
      <label className="block text-[10px] font-black uppercase text-gray-400 mb-2">% Terreno (land ratio)</label>
      <div className="flex items-center gap-3">
        <input type="range" min={0} max={100} value={currentProject.land_ratio || 30} onChange={(e) => setCurrentProject({...currentProject, land_ratio: parseInt(e.target.value)})} className="flex-1" />
        <span className="text-lg font-bold text-primary w-16 text-right">{currentProject.land_ratio || 30}%</span>
      </div>
      <div className="flex justify-between text-[9px] text-primary/40 mt-1">
        <span>Terreno: {formatPrice((currentProject.market_price || 0) * ((currentProject.land_ratio || 30) / 100), currentProject.price_currency || 'EUR')}</span>
        <span>Edificio: {formatPrice((currentProject.market_price || 0) * (1 - (currentProject.land_ratio || 30) / 100), currentProject.price_currency || 'EUR')}</span>
      </div>
    </div>

    <div className="grid grid-cols-2 gap-6">
      <div><label className="block text-[10px] font-black uppercase text-gray-400 mb-2">{t('admin.props.beachDistance')}</label><input type="text" value={currentProject.distance_beach || ''} onChange={(e) => setCurrentProject({...currentProject, distance_beach: e.target.value})} placeholder="3 minutos a Playa Balangan" className="w-full px-5 py-4 bg-gray-50 rounded-2xl font-medium" /></div>
      <div><label className="block text-[10px] font-black uppercase text-gray-400 mb-2">{t('admin.props.availableUnits')}</label><input type="text" value={currentProject.available_units || ''} onChange={(e) => setCurrentProject({...currentProject, available_units: e.target.value})} placeholder="3" className="w-full px-5 py-4 bg-gray-50 rounded-2xl font-medium" /></div>
    </div>
    <div className="grid grid-cols-2 gap-6">
      <div><label className="block text-[10px] font-black uppercase text-gray-400 mb-2">{t('admin.props.contractYears')}</label><input type="number" value={currentProject.years_contract || 25} onChange={(e) => setCurrentProject({...currentProject, years_contract: parseInt(e.target.value) || 25})} className="w-full px-5 py-4 bg-gray-50 rounded-2xl font-bold" /></div>
      <div><label className="block text-[10px] font-black uppercase text-gray-400 mb-2">{t('admin.props.extensionYears')}</label><input type="number" value={currentProject.years_extension || 0} onChange={(e) => setCurrentProject({...currentProject, years_extension: parseInt(e.target.value) || 0})} className="w-full px-5 py-4 bg-gray-50 rounded-2xl font-bold" /></div>
    </div>
    <div><label className="block text-[10px] font-black uppercase text-gray-400 mb-2">{t('admin.props.progressPct')}</label><div className="flex items-center gap-3"><input type="range" min={0} max={100} value={currentProject.completion_percent || 0} onChange={(e) => setCurrentProject({...currentProject, completion_percent: parseInt(e.target.value)})} className="flex-1" /><span className="text-lg font-bold text-primary w-16 text-right">{currentProject.completion_percent || 0}%</span></div></div>

    <div><label className="block text-[10px] font-black uppercase text-gray-400 mb-2">{t('admin.adminDash.completionDateLabel')}</label><input type="text" placeholder="30/06/2026" value={currentProject.completion_date || ''} onChange={(e) => setCurrentProject({...currentProject, completion_date: e.target.value})} className="w-full px-5 py-4 bg-gray-50 rounded-2xl font-bold" /></div>
  </div>

  <div className="bg-gray-50 p-6 rounded-2xl mb-6">
    <p className="text-[10px] font-black uppercase text-gray-400 mb-3">ROI Calculado (solo lectura)</p>
    <div className="grid grid-cols-2 gap-4">
      <div className="bg-white p-4 rounded-xl">
        <p className="text-[10px] font-black uppercase text-gray-400">ROI Alquiler</p>
        <p className="text-2xl font-serif text-primary">{currentProject.investor_price && currentProject.annual_rental_projection ? ((currentProject.annual_rental_projection / currentProject.investor_price) * 100).toFixed(1) + '%' : '—'}</p>
      </div>
      <div className="bg-white p-4 rounded-xl">
        <p className="text-[10px] font-black uppercase text-gray-400">ROI Reventa</p>
        <p className="text-2xl font-serif text-primary">{currentProject.investor_price && currentProject.market_price && currentProject.market_price > currentProject.investor_price ? (((currentProject.market_price - currentProject.investor_price) / currentProject.investor_price) * 100).toFixed(1) + '%' : '—'}</p>
      </div>
    </div>
  </div>
</div>

<div className="border-t border-gray-100 pt-8 mt-8">
  <h3 className="text-lg font-serif text-primary mb-6">Enlaces y documentos</h3>
  <div className="space-y-4">
    <div>
        <label className="block text-[10px] font-black uppercase text-gray-400 mb-2">URL Brochure</label>
        <div className="flex gap-2">
            <input type="text" value={currentProject.brochure_url || ''} onChange={(e) => setCurrentProject({...currentProject, brochure_url: e.target.value})} placeholder="https://..." className="flex-grow px-5 py-4 bg-gray-50 rounded-2xl font-medium" />
            <label className={`cursor-pointer bg-primary text-white px-5 py-4 rounded-2xl hover:bg-black transition flex items-center justify-center ${uploading ? 'opacity-50 pointer-events-none' : ''}`}>
                {uploading ? <span className="material-symbols-outlined animate-spin">refresh</span> : <span className="material-symbols-outlined">upload_file</span>}
                <input type="file" className="hidden" accept=".pdf,.doc,.docx,.xls,.xlsx,image/*" onChange={(e) => handleFileUpload(e, 'project_brochure')} disabled={uploading} />
            </label>
        </div>
    </div>
    <div className="grid grid-cols-2 gap-6">
      <div>
         <label className="block text-[10px] font-black uppercase text-gray-400 mb-2">URL Informe de obra</label>
         <div className="flex gap-2">
             <input type="text" value={currentProject.construction_update_url || ''} onChange={(e) => setCurrentProject({...currentProject, construction_update_url: e.target.value})} placeholder="https://..." className="flex-grow px-5 py-4 bg-gray-50 rounded-2xl font-medium" />
             <label className={`cursor-pointer bg-primary text-white px-5 py-4 rounded-2xl hover:bg-black transition flex items-center justify-center ${uploading ? 'opacity-50 pointer-events-none' : ''}`}>
                 {uploading ? <span className="material-symbols-outlined animate-spin">refresh</span> : <span className="material-symbols-outlined">upload_file</span>}
                 <input type="file" className="hidden" accept=".pdf,.doc,.docx,.xls,.xlsx,image/*" onChange={(e) => handleFileUpload(e, 'project_construction_update')} disabled={uploading} />
             </label>
         </div>
      </div>
      <div><label className="block text-[10px] font-black uppercase text-gray-400 mb-2">Fecha informe</label><input type="date" value={currentProject.construction_update_date || ''} onChange={(e) => setCurrentProject({...currentProject, construction_update_date: e.target.value})} className="w-full px-5 py-4 bg-gray-50 rounded-2xl font-bold" /></div>
    </div>
    <div>
      <label className="block text-[10px] font-black uppercase text-gray-400 mb-2">URL Google Maps</label>
      <input type="text" value={currentProject.google_maps_url || ''} onChange={(e) => setCurrentProject({...currentProject, google_maps_url: e.target.value})} placeholder="https://www.google.com/maps/embed?pb=... o enlace de Google Maps" className="w-full px-5 py-4 bg-gray-50 rounded-2xl font-medium" />
      <p className="text-[8px] text-primary/30 mt-1">Pega la URL de Google Maps (cualquier formato) o la URL de "Insertar mapa" (embed). Se convertirá automáticamente.</p>
    </div>
  </div>
</div>

              </div>
              {/* Ficha extendida: datos de agencia / legal / drive / vídeo (los usan los packs de agencia). */}
              <div className="border-t border-gray-100 pt-6">
                <h3 className="text-lg font-serif text-primary mb-1">Ficha de agencia / legal / extra</h3>
                <p className="text-xs text-gray-400 mb-4">Datos que usan los packs de agencia y la ficha completa.</p>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  {([
                    ['zone','Zona','text'],['owner_name','Propietario','text'],['lease_end_date','Fin leasehold','text'],
                    ['lease_years_paid','Años pagados','number'],['extension_cost_usd','Coste extensión (USD)','number'],
                    ['payment_plan_off_plan','Plan de pago','text'],['zoning_type','Zonificación','text'],
                    ['building_permit_status','Permiso de obra','text'],['structural_warranty','Garantía estructural','text'],
                    ['water_supply','Suministro de agua','text'],['land_size_m2','Terreno (m2)','number'],
                    ['pool_size_m2','Piscina (m2)','number'],['parking','Parking','text'],['view','Vistas','text'],
                    ['living_room_style','Estilo salon','text'],['furnishing_pack_cost_usd','Pack mobiliario (USD)','number'],
                    ['timeline','Timeline','text'],['booking_widget_url','Widget reservas (URL)','text'],
                    ['video_url','Video (URL)','text'],['drive_renders_url','Drive renders','text'],
                    ['drive_2d_plans_url','Drive planos 2D','text'],['drive_permits_url','Drive permisos','text'],
                    ['drive_legal_url','Drive legal','text'],['drive_brochure_folder_url','Drive brochure','text'],
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
                  {([['has_powder_room','Aseo de cortesia'],['has_rooftop','Azotea']] as [string,string][]).map(([k,label]) => (
                    <label key={k} className="flex items-center gap-2 text-xs font-bold text-primary/70 cursor-pointer">
                      <input type="checkbox" checked={!!(currentProject as any)[k]} onChange={(e) => setCurrentProject({ ...currentProject, [k]: e.target.checked } as any)} /> {label}
                    </label>
                  ))}
                </div>
              </div>
              {/* Traducciones (EN/ID) de los campos que aparecen en los packs de agencia. */}
              <div className="border-t border-gray-100 pt-6">
                <h3 className="text-lg font-serif text-primary mb-1">Traducciones para packs (inglés / indonesio)</h3>
                <p className="text-xs text-gray-400 mb-4">Opcional. Si están vacías, el pack usa el texto en español.</p>
                <div className="space-y-3">
                  {([
                    ['description','Descripción'],['status','Estado'],['completion_date','Fecha de entrega'],
                    ['distance_beach','Distancia playa'],['view','Vistas'],['parking','Parking'],
                    ['living_room_style','Estilo salón'],['furnishing','Mobiliario'],['water_supply','Agua'],
                    ['structural_warranty','Garantía estructural'],['zoning_type','Zonificación'],
                    ['building_permit_status','Permiso de obra'],['payment_plan_off_plan','Plan de pago'],
                    ['lease_end_date','Fin leasehold'],
                  ] as [string,string][]).map(([k,label]) => (
                    <div key={k} className="grid grid-cols-1 md:grid-cols-[140px_1fr_1fr] gap-2 items-center">
                      <span className="text-[10px] font-black uppercase text-gray-400">{label}</span>
                      <input placeholder="EN" value={(currentProject as any)[`${k}_en`] ?? ''} onChange={(e) => setCurrentProject({ ...currentProject, [`${k}_en`]: e.target.value } as any)} className="w-full px-3 py-2 bg-gray-50 rounded-xl text-sm" />
                      <input placeholder="ID" value={(currentProject as any)[`${k}_id`] ?? ''} onChange={(e) => setCurrentProject({ ...currentProject, [`${k}_id`]: e.target.value } as any)} className="w-full px-3 py-2 bg-gray-50 rounded-xl text-sm" />
                    </div>
                  ))}
                </div>
              </div>
              <div className="flex gap-4 pt-6"><button type="submit" className="flex-1 bg-primary text-white py-5 rounded-2xl font-black uppercase tracking-widest shadow-xl hover:bg-black">{t('admin.adminDash.saveProperty')}</button><button type="button" onClick={() => setIsEditing(false)} className="flex-1 bg-gray-100 text-gray-400 py-5 rounded-2xl font-black uppercase tracking-widest hover:bg-gray-200">{t('admin.common.cancel')}</button></div>
            </form>
          </div>
        </div>
      )}
      
{/* Modal Editar/Crear Artículo de Blog */}
{isEditingBlog && (
  <div className="fixed inset-0 z-[150] flex items-start justify-center bg-black/50 backdrop-blur-sm p-4 overflow-y-auto" onClick={(e) => { if (e.target === e.currentTarget) setIsEditingBlog(false); }}>
    <div className="bg-white w-full max-w-3xl rounded-3xl p-6 md:p-10 shadow-2xl my-8">
      <h2 className="text-2xl font-serif text-primary mb-6">{currentBlog.id && !String(currentBlog.id).startsWith('blog-') ? 'Editar artículo' : 'Nuevo artículo'}</h2>
      <form onSubmit={handleSaveBlog} className="space-y-5">
        <div className="grid grid-cols-2 gap-5">
          <div><label className="block text-[10px] font-black uppercase text-gray-400 mb-2">Título</label><input required value={currentBlog.title || ''} onChange={(e) => setCurrentBlog({...currentBlog, title: e.target.value})} className="w-full px-5 py-4 bg-gray-50 rounded-2xl font-bold" /></div>
          <div><label className="block text-[10px] font-black uppercase text-gray-400 mb-2">Etiqueta</label><input value={currentBlog.tag || ''} onChange={(e) => setCurrentBlog({...currentBlog, tag: e.target.value})} placeholder="MERCADO" className="w-full px-5 py-4 bg-gray-50 rounded-2xl font-bold" /></div>
        </div>
        <div className="grid grid-cols-2 gap-5">
          <div><label className="block text-[10px] font-black uppercase text-gray-400 mb-2">Fecha de publicación</label><input type="date" value={currentBlog.published_date || ''} onChange={(e) => setCurrentBlog({...currentBlog, published_date: e.target.value})} className="w-full px-5 py-4 bg-gray-50 rounded-2xl font-bold" /></div>
          <div><label className="block text-[10px] font-black uppercase text-gray-400 mb-2">Imagen (URL o ruta)</label><input value={currentBlog.image || ''} onChange={(e) => setCurrentBlog({...currentBlog, image: e.target.value})} className="w-full px-5 py-4 bg-gray-50 rounded-2xl font-bold" /></div>
        </div>
        <div><label className="block text-[10px] font-black uppercase text-gray-400 mb-2">Descripción / extracto</label><textarea value={currentBlog.description || ''} onChange={(e) => setCurrentBlog({...currentBlog, description: e.target.value})} className="w-full px-5 py-4 bg-gray-50 rounded-2xl font-medium resize-none h-20" /></div>
        <div>
          <label className="block text-[10px] font-black uppercase text-gray-400 mb-2">Contenido (HTML)</label>
          <div className="flex gap-2 mb-2">
            <button type="button" onClick={() => wrapSelection('b')} className="px-3 py-1.5 bg-gray-100 rounded-lg text-xs font-black hover:bg-gray-200">B</button>
            <button type="button" onClick={() => wrapSelection('p')} className="px-3 py-1.5 bg-gray-100 rounded-lg text-xs font-bold hover:bg-gray-200">P</button>
            <button type="button" onClick={() => wrapSelection('h2')} className="px-3 py-1.5 bg-gray-100 rounded-lg text-xs font-bold hover:bg-gray-200">H2</button>
          </div>
          <textarea ref={blogContentRef} value={currentBlog.content || ''} onChange={(e) => setCurrentBlog({...currentBlog, content: e.target.value})} className="w-full px-5 py-4 bg-gray-50 rounded-2xl font-mono text-sm resize-none h-48" />
        </div>
        <div className="flex gap-4 pt-2">
          <button type="button" onClick={() => setIsEditingBlog(false)} className="flex-1 py-4 rounded-2xl font-black text-xs uppercase tracking-widest border border-gray-200 text-gray-400 hover:bg-gray-50 transition">Cancelar</button>
          <button type="submit" disabled={uploading} className="flex-1 py-4 rounded-2xl font-black text-xs uppercase tracking-widest bg-primary text-white shadow-lg hover:bg-black transition disabled:opacity-50">{uploading ? 'Guardando…' : 'Guardar'}</button>
        </div>
      </form>
    </div>
  </div>
)}

{/* Modal Editar/Crear Administrador */}
{isEditingUser && (
  <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={(e) => { if (e.target === e.currentTarget) setIsEditingUser(false); }}>
    <div className="bg-white w-full max-w-md rounded-3xl p-8 shadow-2xl">
      <h2 className="text-2xl font-serif text-primary mb-6">{currentUser.id && !String(currentUser.id).startsWith('user-') ? 'Editar administrador' : 'Nuevo administrador'}</h2>
      <form onSubmit={handleSaveUser} className="space-y-5">
        <div><label className="block text-[10px] font-black uppercase text-gray-400 mb-2">Nombre</label><input required value={currentUser.name || ''} onChange={(e) => setCurrentUser({...currentUser, name: e.target.value})} className="w-full px-5 py-4 bg-gray-50 rounded-2xl font-bold" /></div>
        <div><label className="block text-[10px] font-black uppercase text-gray-400 mb-2">Usuario (email)</label><input required type="email" value={currentUser.username || ''} onChange={(e) => setCurrentUser({...currentUser, username: e.target.value})} className="w-full px-5 py-4 bg-gray-50 rounded-2xl font-bold" /></div>
        <div><label className="block text-[10px] font-black uppercase text-gray-400 mb-2">Contraseña {currentUser.id && !String(currentUser.id).startsWith('user-') ? '(vacío = no cambiar)' : ''}</label><input type="text" required={!(currentUser.id && !String(currentUser.id).startsWith('user-'))} value={currentUser.password_hash || ''} onChange={(e) => setCurrentUser({...currentUser, password_hash: e.target.value})} className="w-full px-5 py-4 bg-gray-50 rounded-2xl font-bold" /></div>
        <div><label className="block text-[10px] font-black uppercase text-gray-400 mb-2">Rol</label><select value={(currentUser as any).role || 'admin'} onChange={(e) => setCurrentUser({...currentUser, role: e.target.value} as any)} className="w-full px-5 py-4 bg-gray-50 rounded-2xl font-bold"><option value="admin">admin</option><option value="superadmin">superadmin</option><option value="team">team</option></select></div>
        <div>
          <label className="block text-[10px] font-black uppercase text-gray-400 mb-2">Firma (para firmar kwitansis)</label>
          <div className="relative inline-block border-2 border-dashed border-gray-200 rounded-2xl p-3 w-52 text-center">
            {(currentUser as any).signature_url && <button type="button" title="Borrar firma" onClick={() => setCurrentUser({ ...currentUser, signature_url: '' } as any)} className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center text-base leading-none shadow hover:bg-red-600">×</button>}
            {(currentUser as any).signature_url ? <img src={(currentUser as any).signature_url} alt="Firma" className="h-12 mx-auto object-contain" /> : <span className="material-symbols-outlined text-gray-300 text-2xl">edit</span>}
            <label className="block mt-1 cursor-pointer text-[10px] font-black uppercase text-primary tracking-widest">{(currentUser as any).signature_url ? 'Cambiar' : 'Subir PNG'}<input type="file" accept="image/png,image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleUserSignatureUpload(f); }} /></label>
          </div>
        </div>
        <div className="flex gap-4 pt-2">
          <button type="button" onClick={() => setIsEditingUser(false)} className="flex-1 py-4 rounded-2xl font-black text-xs uppercase tracking-widest border border-gray-200 text-gray-400 hover:bg-gray-50 transition">Cancelar</button>
          <button type="submit" className="flex-1 py-4 rounded-2xl font-black text-xs uppercase tracking-widest bg-primary text-white shadow-lg hover:bg-black transition">Guardar</button>
        </div>
      </form>
    </div>
  </div>
)}

{/* Modal Editar/Crear Cliente */}
{isEditingClient && (
  <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={(e) => { if (e.target === e.currentTarget) setIsEditingClient(false); }}>
    <div className="bg-white w-full max-w-2xl rounded-3xl p-6 md:p-10 shadow-2xl">
      <h2 className="text-2xl font-serif text-primary mb-2">{currentClient.id?.startsWith('client-') ? t('admin.adminDash.newClient') : t('admin.adminDash.editClient')}</h2>
      <p className="text-sm text-gray-400 mb-8">Completa los datos del cliente</p>
      <form onSubmit={handleSaveClient} className="space-y-5">
        <div>
          <label className="block text-[10px] font-black uppercase text-gray-400 mb-2">Nombre completo *</label>
          <input type="text" required value={currentClient.name || ''} onChange={(e) => setCurrentClient({...currentClient, name: e.target.value})} className="w-full px-5 py-4 bg-gray-50 rounded-2xl font-medium border border-transparent focus:border-primary/20 focus:outline-none" placeholder="Nombre del cliente" />
        </div>
        <div>
          <label className="block text-[10px] font-black uppercase text-gray-400 mb-2">Email *</label>
          <input type="email" required value={currentClient.email || ''} onChange={(e) => setCurrentClient({...currentClient, email: e.target.value})} className="w-full px-5 py-4 bg-gray-50 rounded-2xl font-medium border border-transparent focus:border-primary/20 focus:outline-none" placeholder="email@ejemplo.com" />
        </div>
        <div>
          <label className="block text-[10px] font-black uppercase text-gray-400 mb-2">Telefono</label>
          <input type="text" value={currentClient.phone || ''} onChange={(e) => setCurrentClient({...currentClient, phone: e.target.value})} className="w-full px-5 py-4 bg-gray-50 rounded-2xl font-medium border border-transparent focus:border-primary/20 focus:outline-none" placeholder="+34 625 710 770" />
        </div>
        <div>
          <label className="block text-[10px] font-black uppercase text-gray-400 mb-2">Notas</label>
          <textarea value={currentClient.notes || ''} onChange={(e) => setCurrentClient({...currentClient, notes: e.target.value})} className="w-full px-5 py-4 bg-gray-50 rounded-2xl font-medium border border-transparent focus:border-primary/20 focus:outline-none resize-none h-24" placeholder="Notas internas sobre el cliente..." />
        </div>
        <div>
          <label className="block text-[10px] font-black uppercase text-gray-400 mb-2">Carpeta Drive del cliente (contratos, docs)</label>
          <input type="url" value={(currentClient as any).drive_folder_url || ''} onChange={(e) => setCurrentClient({...currentClient, drive_folder_url: e.target.value} as any)} className="w-full px-5 py-4 bg-gray-50 rounded-2xl font-medium border border-transparent focus:border-primary/20 focus:outline-none" placeholder="https://drive.google.com/drive/folders/..." />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-[10px] font-black uppercase text-gray-400 mb-2">Idioma preferido</label>
            <select value={(currentClient as any).preferred_language || 'es'} onChange={(e) => setCurrentClient({...currentClient, preferred_language: e.target.value} as any)} className="w-full px-5 py-4 bg-gray-50 rounded-2xl font-bold border border-transparent focus:border-primary/20 focus:outline-none">
              <option value="es">Español</option><option value="en">English</option><option value="ro">Română</option><option value="id">Indonesia</option>
            </select>
          </div>
          <div>
            <label className="block text-[10px] font-black uppercase text-gray-400 mb-2">Divisa preferida</label>
            <select value={(currentClient as any).preferred_currency || (((config as any).brand?.default_currency_clients) || 'EUR')} onChange={(e) => setCurrentClient({...currentClient, preferred_currency: e.target.value} as any)} className="w-full px-5 py-4 bg-gray-50 rounded-2xl font-bold border border-transparent focus:border-primary/20 focus:outline-none">
              <option value="EUR">EUR</option><option value="USD">USD</option><option value="IDR">IDR</option>
            </select>
          </div>
        </div>
        <div className="bg-gray-50 p-4 rounded-2xl border border-gray-100 flex justify-between items-center">
          <span className="text-[10px] font-black uppercase text-primary/60">Cliente activo</span>
          <button type="button" onClick={() => setCurrentClient({...currentClient, is_active: !currentClient.is_active})} className={`w-12 h-6 rounded-full transition-all flex items-center px-1 ${currentClient.is_active ? 'bg-primary justify-end' : 'bg-gray-300 justify-start'}`}><div className="w-4 h-4 bg-white rounded-full shadow-md" /></button>
        </div>
        <div className="flex gap-4 pt-4">
          <button type="button" onClick={() => setIsEditingClient(false)} className="flex-1 py-4 rounded-2xl font-black text-xs uppercase tracking-widest border border-gray-200 text-gray-400 hover:bg-gray-50 transition">Cancelar</button>
          <button type="submit" disabled={uploading} className="flex-1 py-4 rounded-2xl font-black text-xs uppercase tracking-widest bg-primary text-white shadow-lg hover:bg-black transition disabled:opacity-50">{uploading ? t('admin.adminDash.savingEllipsis') : t('admin.adminDash.save')}</button>
        </div>
      </form>
    </div>
  </div>
)}

{editingAssignment && (
    <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={(e) => { if (e.target === e.currentTarget) setEditingAssignment(null); }}>
        <div className="bg-white w-full max-w-2xl rounded-3xl p-6 md:p-10 shadow-2xl">
            <h2 className="text-2xl font-serif text-primary mb-2">{t('admin.adminDash.editAssignment')}</h2>
            <p className="text-sm text-gray-400 mb-2">Cliente: <strong className="text-primary">{editingAssignment.clientName}</strong></p>
            <p className="text-sm text-gray-400 mb-8">Proyecto: <strong className="text-primary">{editingAssignment.assignment.project_name}</strong></p>
            <form onSubmit={handleEditAssignment} className="space-y-6">
                <div className="grid grid-cols-2 gap-6">
                    <div><label className="block text-[10px] font-black uppercase text-gray-400 mb-2">Unidad / Referencia</label><input value={editingAssignment.assignment.unit_number || ''} onChange={(e) => setEditingAssignment({...editingAssignment, assignment: {...editingAssignment.assignment, unit_number: e.target.value}})} placeholder="Ej: A-101, Villa 3" className="w-full px-5 py-4 bg-gray-50 border border-gray-200 rounded-2xl font-bold" /></div>
                    <div>
                        <label className="block text-[10px] font-black uppercase text-gray-400 mb-2">Importe invertido</label>
                        <div className="flex gap-2">
                            <input type="number" value={editingAssignment.assignment.investment_amount || ''} onChange={(e) => setEditingAssignment({...editingAssignment, assignment: {...editingAssignment.assignment, investment_amount: parseFloat(e.target.value) || 0}})} className="w-full px-5 py-4 bg-gray-50 border border-gray-200 rounded-2xl font-bold flex-grow" />
                            <select value={editingAssignment.assignment.currency || 'EUR'} onChange={(e) => setEditingAssignment({...editingAssignment, assignment: {...editingAssignment.assignment, currency: e.target.value}})} className="px-3 py-4 bg-gray-100 border border-gray-200 rounded-2xl font-bold w-24">
                                {CURRENCIES.map(c => <option key={c.code} value={c.code}>{c.code}</option>)}
                            </select>
                        </div>
                    </div>
                </div>
                <div className="grid grid-cols-2 gap-6">
                    <div><label className="block text-[10px] font-black uppercase text-gray-400 mb-2">Fecha de compra</label><input type="date" value={editingAssignment.assignment.purchase_date || ''} onChange={(e) => setEditingAssignment({...editingAssignment, assignment: {...editingAssignment.assignment, purchase_date: e.target.value}})} className="w-full px-5 py-4 bg-gray-50 border border-gray-200 rounded-2xl font-bold" /></div>
                    <div><label className="block text-[10px] font-black uppercase text-gray-400 mb-2">Estado de la inversión</label>
                        <select value={editingAssignment.assignment.status || 'Reserva'} onChange={(e) => setEditingAssignment({...editingAssignment, assignment: {...editingAssignment.assignment, status: e.target.value}})} className="w-full px-5 py-4 bg-gray-50 border border-gray-200 rounded-2xl font-bold">
                            <option value="Reserva">Reserva</option>
                            <option value="Pagado">Pagado</option>
                            <option value="En proceso">En proceso</option>
                            <option value="Completado">Completado</option>
                        </select>
                    </div>
                </div>
                <div className="flex gap-4 pt-4">
                    <button type="submit" disabled={uploading} className="flex-1 bg-primary text-white py-4 rounded-xl font-bold uppercase tracking-widest text-xs disabled:opacity-50 flex items-center justify-center gap-2">{uploading ? <><span className="material-symbols-outlined animate-spin text-sm">refresh</span> {t('admin.adminDash.savingEllipsis')}</> : t('admin.adminDash.saveChanges')}</button>
                    <button type="button" onClick={() => setEditingAssignment(null)} className="flex-1 bg-red-50 text-red-600 py-4 rounded-xl font-bold uppercase tracking-widest text-xs hover:bg-red-100 transition">Cerrar</button>
                </div>
            </form>
        </div>
    </div>
)}

{/* Modal Asignar Proyecto a un cliente */}
{assigningProject && (
    <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={(e) => { if (e.target === e.currentTarget) setAssigningProject(null); }}>
        <div className="bg-white w-full max-w-2xl rounded-3xl p-6 md:p-10 shadow-2xl">
            <h2 className="text-2xl font-serif text-primary mb-2">Asignar proyecto</h2>
            <p className="text-sm text-gray-400 mb-8">Cliente: <strong className="text-primary">{assigningProject.clientName}</strong></p>
            <form onSubmit={handleAssignProject} className="space-y-6">
                <div>
                    <label className="block text-[10px] font-black uppercase text-gray-400 mb-2">Proyecto</label>
                    <select value={assignForm.project_id} onChange={(e) => setAssignForm({...assignForm, project_id: e.target.value})} className="w-full px-5 py-4 bg-gray-50 border border-gray-200 rounded-2xl font-bold">
                        {projects.length === 0 && <option value="">No hay proyectos</option>}
                        {projects.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                </div>
                <div className="grid grid-cols-2 gap-6">
                    <div><label className="block text-[10px] font-black uppercase text-gray-400 mb-2">Unidad / Referencia</label><input value={assignForm.unit_number} onChange={(e) => setAssignForm({...assignForm, unit_number: e.target.value})} placeholder="Ej: A-101, Villa 3" className="w-full px-5 py-4 bg-gray-50 border border-gray-200 rounded-2xl font-bold" /></div>
                    <div>
                        <label className="block text-[10px] font-black uppercase text-gray-400 mb-2">Importe invertido</label>
                        <div className="flex gap-2">
                            <input type="number" value={assignForm.investment_amount || ''} onChange={(e) => setAssignForm({...assignForm, investment_amount: parseFloat(e.target.value) || 0})} className="w-full px-5 py-4 bg-gray-50 border border-gray-200 rounded-2xl font-bold flex-grow" />
                            <select value={assignForm.currency} onChange={(e) => setAssignForm({...assignForm, currency: e.target.value})} className="px-3 py-4 bg-gray-100 border border-gray-200 rounded-2xl font-bold w-24">
                                {CURRENCIES.map(c => <option key={c.code} value={c.code}>{c.code}</option>)}
                            </select>
                        </div>
                    </div>
                </div>
                <div className="grid grid-cols-2 gap-6">
                    <div><label className="block text-[10px] font-black uppercase text-gray-400 mb-2">Fecha de compra</label><input type="date" value={assignForm.purchase_date} onChange={(e) => setAssignForm({...assignForm, purchase_date: e.target.value})} className="w-full px-5 py-4 bg-gray-50 border border-gray-200 rounded-2xl font-bold" /></div>
                    <div><label className="block text-[10px] font-black uppercase text-gray-400 mb-2">Estado de la inversión</label>
                        <select value={assignForm.status} onChange={(e) => setAssignForm({...assignForm, status: e.target.value})} className="w-full px-5 py-4 bg-gray-50 border border-gray-200 rounded-2xl font-bold">
                            <option value="Reserva">Reserva</option>
                            <option value="Pagado">Pagado</option>
                            <option value="En proceso">En proceso</option>
                            <option value="Completado">Completado</option>
                        </select>
                    </div>
                </div>
                <div className="flex gap-4 pt-4">
                    <button type="submit" disabled={uploading || !assignForm.project_id} className="flex-1 bg-primary text-white py-4 rounded-xl font-bold uppercase tracking-widest text-xs disabled:opacity-50 flex items-center justify-center gap-2">{uploading ? <><span className="material-symbols-outlined animate-spin text-sm">refresh</span> {t('admin.adminDash.savingEllipsis')}</> : 'Asignar'}</button>
                    <button type="button" onClick={() => setAssigningProject(null)} className="flex-1 bg-red-50 text-red-600 py-4 rounded-xl font-bold uppercase tracking-widest text-xs hover:bg-red-100 transition">Cancelar</button>
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
        <button onClick={handleAddOption} className="bg-primary text-white px-5 py-3 rounded-xl font-bold text-xs uppercase hover:bg-black transition">Añadir</button>
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
    adminUserId={getAdminUserId() as string}
    brand={(config as any).brand || {}}
    adminSignature={mySignature}
    clientLang={(paymentsClient as any).preferred_language || 'es'}
    onClose={() => setPaymentsClient(null)}
  />
)}

{whatsappClient && (
  <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={(e) => { if (e.target === e.currentTarget) setWhatsappClient(null); }}>
    <div className="bg-white w-full max-w-2xl rounded-3xl p-6 md:p-10 shadow-2xl max-h-[85vh] overflow-y-auto">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h2 className="text-2xl font-serif text-primary">Plantillas WhatsApp</h2>
          <p className="text-sm text-gray-400 mt-1">Enviar a <strong className="text-primary">{whatsappClient.name}</strong></p>
        </div>
        <button onClick={() => setWhatsappClient(null)} className="p-2 text-red-500 bg-red-50 rounded-xl hover:bg-red-100 transition"><span className="material-symbols-outlined">close</span></button>
      </div>
      <div className="space-y-3">
        {WHATSAPP_TEMPLATES.map((t, idx) => (
          <button key={idx} onClick={() => openWhatsAppTemplate(whatsappClient, t.template(whatsappClient))} className="w-full text-left bg-gray-50 hover:bg-green-50 rounded-xl px-6 py-5 transition border border-gray-100 hover:border-green-200">
            <p className="font-bold text-primary text-sm mb-1">{t.name}</p>
            <p className="text-xs text-gray-400 line-clamp-2">{t.template(whatsappClient).substring(0, 100)}...</p>
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