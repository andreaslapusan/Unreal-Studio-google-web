// Traducción de términos de datos (amenities / equipamiento) que llegan de la BD
// en español. El vocabulario es un conjunto FIJO y conocido, definido en
// ProjectDetail.tsx (iconos de amenities + categorías de furnishing). Aquí lo
// traducimos a en/ro/id para que los visitantes no vean español.
//
// Regla de oro: si un término no está en el mapa, se devuelve tal cual (español).
// Así, añadir un amenity nuevo en la BD nunca rompe nada — solo saldría sin
// traducir hasta que se añada aquí. Mismo comportamiento que antes para lo no mapeado.

import i18n from "./i18n";
import { uiLocale } from "./dateLocale";

type Tr = { en: string; ro: string; id: string };

const TERMS: Record<string, Tr> = {
  // === Amenities / Servicios ===
  'Piscina privada': { en: 'Private pool', ro: 'Piscină privată', id: 'Kolam renang pribadi' },
  'Piscina compartida': { en: 'Shared pool', ro: 'Piscină comună', id: 'Kolam renang bersama' },
  'Gimnasio': { en: 'Gym', ro: 'Sală de fitness', id: 'Pusat kebugaran' },
  'Coworking': { en: 'Coworking', ro: 'Spațiu coworking', id: 'Ruang kerja bersama' },
  'Jardín tropical': { en: 'Tropical garden', ro: 'Grădină tropicală', id: 'Taman tropis' },
  'Terraza': { en: 'Terrace', ro: 'Terasă', id: 'Teras' },
  'Parking': { en: 'Parking', ro: 'Parcare', id: 'Parkir' },
  'Seguridad 24h': { en: '24h security', ro: 'Securitate 24h', id: 'Keamanan 24 jam' },
  'Cámaras de seguridad': { en: 'Security cameras', ro: 'Camere de securitate', id: 'Kamera keamanan' },
  'WiFi': { en: 'WiFi', ro: 'WiFi', id: 'WiFi' },
  'Aire acondicionado': { en: 'Air conditioning', ro: 'Aer condiționat', id: 'AC' },
  'Ventilador': { en: 'Fan', ro: 'Ventilator', id: 'Kipas angin' },
  'Cocina equipada': { en: 'Equipped kitchen', ro: 'Bucătărie utilată', id: 'Dapur lengkap' },
  'Lavandería': { en: 'Laundry', ro: 'Spălătorie', id: 'Ruang cuci' },
  'Zona barbacoa': { en: 'BBQ area', ro: 'Zonă barbecue', id: 'Area barbeku' },
  'Vistas al mar': { en: 'Sea views', ro: 'Vedere la mare', id: 'Pemandangan laut' },
  'Cercano a la playa': { en: 'Close to the beach', ro: 'Aproape de plajă', id: 'Dekat pantai' },
  'Recepción': { en: 'Reception', ro: 'Recepție', id: 'Resepsionis' },
  'Bar': { en: 'Bar', ro: 'Bar', id: 'Bar' },
  'Almacén': { en: 'Storage', ro: 'Depozit', id: 'Gudang' },
  'Spa': { en: 'Spa', ro: 'Spa', id: 'Spa' },
  'Sala de juegos': { en: 'Games room', ro: 'Sală de jocuri', id: 'Ruang permainan' },
  'Servicio de limpieza': { en: 'Cleaning service', ro: 'Serviciu de curățenie', id: 'Layanan kebersihan' },
  'Alquiler de motos': { en: 'Motorbike rental', ro: 'Închiriere scutere', id: 'Sewa motor' },

  // === Vista (projects.view_type, texto libre sin columnas traducidas) ===
  'Vistas al océano': { en: 'Ocean views', ro: 'Vedere la ocean', id: 'Pemandangan laut' },
  'Vistas al mar y arrozales': { en: 'Sea and rice field views', ro: 'Vedere la mare și orezării', id: 'Pemandangan laut dan sawah' },
  'Vistas a los arrozales': { en: 'Rice field views', ro: 'Vedere la orezării', id: 'Pemandangan sawah' },
  'Vistas al jardín': { en: 'Garden views', ro: 'Vedere la grădină', id: 'Pemandangan taman' },
  'Vistas a la piscina': { en: 'Pool views', ro: 'Vedere la piscină', id: 'Pemandangan kolam' },
  'Complejo': { en: 'Complex', ro: 'Complex', id: 'Kompleks' },
  'Jardín': { en: 'Garden', ro: 'Grădină', id: 'Taman' },

  // === Categorías de equipamiento ===
  'Baño': { en: 'Bathroom', ro: 'Baie', id: 'Kamar mandi' },
  'Instalaciones': { en: 'Installations', ro: 'Instalații', id: 'Instalasi' },
  'Dormitorio': { en: 'Bedroom', ro: 'Dormitor', id: 'Kamar tidur' },
  'Salón': { en: 'Living room', ro: 'Living', id: 'Ruang tamu' },
  'Exterior': { en: 'Outdoor', ro: 'Exterior', id: 'Luar ruangan' },
  'Cocina': { en: 'Kitchen', ro: 'Bucătărie', id: 'Dapur' },
  'Decoración': { en: 'Decoration', ro: 'Decorațiuni', id: 'Dekorasi' },

  // === Equipamiento — Baño ===
  'Ducha': { en: 'Shower', ro: 'Duș', id: 'Pancuran' },
  'Grifería': { en: 'Taps', ro: 'Baterii', id: 'Keran' },
  'Lavabo': { en: 'Washbasin', ro: 'Chiuvetă', id: 'Wastafel' },
  'Espejo de baño': { en: 'Bathroom mirror', ro: 'Oglindă de baie', id: 'Cermin kamar mandi' },
  'Toallero': { en: 'Towel rail', ro: 'Suport prosoape', id: 'Gantungan handuk' },
  'Mampara': { en: 'Shower screen', ro: 'Cabină de duș', id: 'Sekat kamar mandi' },

  // === Equipamiento — Instalaciones ===
  'Iluminación': { en: 'Lighting', ro: 'Iluminat', id: 'Pencahayaan' },
  'Enchufes': { en: 'Power sockets', ro: 'Prize', id: 'Stopkontak' },
  'Interruptores': { en: 'Switches', ro: 'Întrerupătoare', id: 'Sakelar' },
  'Ventilador de techo': { en: 'Ceiling fan', ro: 'Ventilator de tavan', id: 'Kipas langit-langit' },
  'Puertas': { en: 'Doors', ro: 'Uși', id: 'Pintu' },
  'Topes de puerta': { en: 'Door stops', ro: 'Opritoare de ușă', id: 'Penahan pintu' },

  // === Equipamiento — Dormitorio ===
  'Estructura de cama': { en: 'Bed frame', ro: 'Cadru de pat', id: 'Rangka tempat tidur' },
  'Colchón': { en: 'Mattress', ro: 'Saltea', id: 'Kasur' },
  'Mesilla de noche': { en: 'Nightstand', ro: 'Noptieră', id: 'Meja samping tempat tidur' },
  'Armario': { en: 'Wardrobe', ro: 'Dulap', id: 'Lemari' },
  'Ropa de cama': { en: 'Bed linen', ro: 'Lenjerie de pat', id: 'Seprai' },
  'Almohadas': { en: 'Pillows', ro: 'Perne', id: 'Bantal' },
  'Cortinas': { en: 'Curtains', ro: 'Perdele', id: 'Tirai' },

  // === Equipamiento — Salón ===
  'Sofá': { en: 'Sofa', ro: 'Canapea', id: 'Sofa' },
  'Mesa de centro': { en: 'Coffee table', ro: 'Măsuță de cafea', id: 'Meja tengah' },
  'Sillas': { en: 'Chairs', ro: 'Scaune', id: 'Kursi' },
  'Estanterías': { en: 'Shelves', ro: 'Rafturi', id: 'Rak' },
  'Alfombra': { en: 'Rug', ro: 'Covor', id: 'Karpet' },
  'Cojines decorativos': { en: 'Decorative cushions', ro: 'Perne decorative', id: 'Bantal dekoratif' },
  'Lámpara de pie': { en: 'Floor lamp', ro: 'Lampadar', id: 'Lampu lantai' },

  // === Equipamiento — Exterior ===
  'Tumbonas de piscina': { en: 'Pool loungers', ro: 'Șezlonguri de piscină', id: 'Kursi santai kolam' },
  'Mesa exterior': { en: 'Outdoor table', ro: 'Masă de exterior', id: 'Meja luar ruangan' },
  'Sillas exterior': { en: 'Outdoor chairs', ro: 'Scaune de exterior', id: 'Kursi luar ruangan' },
  'Sombrilla': { en: 'Parasol', ro: 'Umbrelă de soare', id: 'Payung' },
  'Macetas': { en: 'Plant pots', ro: 'Ghivece', id: 'Pot tanaman' },

  // === Equipamiento — Cocina ===
  'Nevera': { en: 'Fridge', ro: 'Frigider', id: 'Kulkas' },
  'Microondas': { en: 'Microwave', ro: 'Cuptor cu microunde', id: 'Microwave' },
  'Horno': { en: 'Oven', ro: 'Cuptor', id: 'Oven' },
  'Placa de cocción': { en: 'Cooktop', ro: 'Plită', id: 'Kompor' },
  'Campana extractora': { en: 'Extractor hood', ro: 'Hotă', id: 'Penghisap asap' },
  'Fregadero': { en: 'Kitchen sink', ro: 'Chiuvetă', id: 'Bak cuci piring' },
  'Cafetera': { en: 'Coffee maker', ro: 'Cafetieră', id: 'Pembuat kopi' },
  'Tostadora': { en: 'Toaster', ro: 'Prăjitor de pâine', id: 'Pemanggang roti' },
  'Hervidor': { en: 'Kettle', ro: 'Fierbător', id: 'Ketel' },
  'Batidora': { en: 'Blender', ro: 'Blender', id: 'Blender' },
  'Utensilios de cocina': { en: 'Kitchen utensils', ro: 'Ustensile de bucătărie', id: 'Peralatan dapur' },
  'Cubertería': { en: 'Cutlery', ro: 'Tacâmuri', id: 'Peralatan makan' },
  'Vajilla': { en: 'Dishware', ro: 'Veselă', id: 'Piring' },
  'Cristalería': { en: 'Glassware', ro: 'Pahare', id: 'Gelas' },
  'Sartenes y ollas': { en: 'Pans and pots', ro: 'Tigăi și oale', id: 'Wajan dan panci' },

  // === Equipamiento — Decoración ===
  'Cuadros': { en: 'Wall art', ro: 'Tablouri', id: 'Lukisan' },
  'Jarrones': { en: 'Vases', ro: 'Vaze', id: 'Vas' },
  'Plantas artificiales': { en: 'Artificial plants', ro: 'Plante artificiale', id: 'Tanaman artifisial' },
  'Espejos decorativos': { en: 'Decorative mirrors', ro: 'Oglinzi decorative', id: 'Cermin dekoratif' },
};

/**
 * Traduce un término de datos (amenity, categoría o ítem de equipamiento) al
 * idioma dado. Devuelve el término original (español) si el idioma es 'es' o si
 * el término no está mapeado — nunca rompe, solo mejora.
 */
export function translateProjectTerm(term: string, lang: string | undefined): string {
  const l = (lang || 'es').slice(0, 2).toLowerCase();
  if (l === 'es') return term;
  const tr = TERMS[term];
  if (!tr) return term;
  return (tr as Record<string, string>)[l] || term;
}

// Amenities llegan de la BD en dos formatos: etiqueta española (admin) o clave
// camelCase (auto-alta /listing: "sharedPool", "ac"…). Las claves se traducen con
// las MISMAS cadenas de locales que usa ListingIntake (listingIntake.amenity.*).
// Strings españoles (admin) que equivalen a una clave canónica → se muestran con
// la traducción de la clave y se deduplican si vienen ambos.
const ES_TO_KEY: Record<string, string> = {
  'Piscina privada': 'privatePool', 'Piscina compartida': 'sharedPool', 'Jardín tropical': 'garden',
  'Jardín': 'garden', 'Parking': 'parking', 'Seguridad 24h': 'security', 'Gimnasio': 'gym',
  'Cocina equipada': 'kitchen', 'Aire acondicionado': 'ac', 'WiFi': 'wifi', 'Vistas al mar': 'oceanView',
  'Cercano a la playa': 'nearBeach', 'Cerca de la playa': 'nearBeach', 'Coworking': 'coworking',
  'Servicio de limpieza': 'cleaning', 'Terraza': 'terrace', 'Spa': 'spa', 'Almacén': 'storage',
  'Recepción': 'reception', 'Bar': 'bar', 'Cámaras de seguridad': 'cctv', 'Lavandería': 'laundry',
  'Jacuzzi': 'jacuzzi',
};

/** Lista de amenities a claves canónicas (cuando existen), sin duplicados, orden original. */
export function normalizeAmenities(list: string[] | null | undefined): string[] {
  return [...new Set((list || []).map((a) => ES_TO_KEY[a.trim()] || a.trim()).filter(Boolean))];
}

const AMENITY_ICONS: Record<string, string> = {
  privatePool: 'pool', sharedPool: 'pool', garden: 'park', parking: 'local_parking', security: 'shield',
  gym: 'fitness_center', kitchen: 'kitchen', ac: 'ac_unit', wifi: 'wifi', rooftop: 'deck',
  oceanView: 'water', nearBeach: 'beach_access', coworking: 'desktop_windows', cleaning: 'cleaning_services',
  terrace: 'deck', spa: 'spa', storage: 'warehouse', reception: 'concierge', bar: 'local_bar',
  cctv: 'videocam', laundry: 'local_laundry_service', jacuzzi: 'hot_tub',
  'Ventilador': 'mode_fan_off', 'Zona barbacoa': 'outdoor_grill', 'Sala de juegos': 'sports_esports',
  'Alquiler de motos': 'two_wheeler',
};

export function amenityIcon(term: string): string {
  return AMENITY_ICONS[term] || 'check_circle';
}

const capitalize = (s: string) => s.charAt(0).toLocaleUpperCase() + s.slice(1);

/** Etiqueta visible de un amenity en el idioma dado, siempre con mayúscula inicial. */
export function amenityLabel(term: string, lang: string | undefined): string {
  const key = `listingIntake.amenity.${term}`;
  if (i18n.exists(key)) return capitalize(i18n.t(key, { lng: (lang || 'es').slice(0, 2) }));
  // Clave desconocida tipo "seaView"/"sea_view" → "Sea view".
  if (/^[a-z][a-zA-Z0-9_]*$/.test(term)) {
    return capitalize(term.replace(/_/g, ' ').replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase());
  }
  return capitalize(translateProjectTerm(term, lang));
}

/** Campo de proyecto en el idioma dado: `<campo>_<lang>` (auto-traducido por translate-project) o el original. */
export function localizedField(p: any, base: string, lang: string | undefined): string {
  const l = (lang || 'es').slice(0, 2).toLowerCase();
  return (l !== 'es' && p?.[`${base}_${l}`]) || p?.[base] || '';
}

const ES_MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

/** "Diciembre 2027" (texto libre en español) → "December 2027" / "Decembrie 2027"…; otros formatos, tal cual. */
export function localizeMonthYear(s: string, lang: string | undefined): string {
  const m = /^([a-záéíóú]+)\s+(?:de\s+)?(\d{4})$/i.exec((s || '').trim());
  const i = m ? ES_MONTHS.indexOf(m[1].toLowerCase().replace('setiembre', 'septiembre')) : -1;
  if (!m || i < 0 || (lang || 'es').startsWith('es')) return s;
  return capitalize(new Date(Date.UTC(+m[2], i, 15)).toLocaleDateString(uiLocale(), { month: 'long', year: 'numeric', timeZone: 'UTC' }));
}

/** Fecha de entrega en el idioma dado (columna traducida si existe; si no, traduce "Mes AAAA"). */
export function localizedCompletion(p: any, lang: string | undefined): string {
  return localizeMonthYear(localizedField(p, 'completion_date', lang), lang);
}

// projects.property_type se guarda en inglés (Villa/Loft/Apartment…).
const PROPERTY_TYPES: Record<string, Record<string, string>> = {
  Apartment: { es: 'Apartamento', en: 'Apartment', ro: 'Apartament', id: 'Apartemen' },
  Villa: { es: 'Villa', en: 'Villa', ro: 'Vilă', id: 'Vila' },
  Loft: { es: 'Loft', en: 'Loft', ro: 'Loft', id: 'Loft' },
  Studio: { es: 'Estudio', en: 'Studio', ro: 'Garsonieră', id: 'Studio' },
  Townhouse: { es: 'Adosado', en: 'Townhouse', ro: 'Casă înșiruită', id: 'Rumah deret' },
  Land: { es: 'Terreno', en: 'Land', ro: 'Teren', id: 'Tanah' },
};
export function propertyTypeLabel(v: string, lang: string | undefined): string {
  return PROPERTY_TYPES[v]?.[(lang || 'es').slice(0, 2)] || v;
}

/** Copia del registro con `fields` en el idioma dado (columnas <campo>_<lang>; blogs, proyectos…). */
export function localizeFields<T extends Record<string, any>>(row: T, fields: string[], lang: string | undefined): T {
  return { ...row, ...Object.fromEntries(fields.map((f) => [f, localizedField(row, f, lang)])) };
}

/** Etiqueta de categoría del blog (blogs.tag se guarda en español en mayúsculas). */
export function blogTagLabel(tag: string | undefined, t: (k: string, o?: any) => string): string {
  const k = ({ MERCADO: 'market', 'INVERSIÓN': 'investment', LEGAL: 'legal' } as Record<string, string>)[(tag || '').toUpperCase()];
  return k ? t('blog.cat.' + k, { defaultValue: tag }) : tag || '';
}
