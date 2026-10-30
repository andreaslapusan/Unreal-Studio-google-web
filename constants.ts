import { AppConfig } from './types';

// Número de WhatsApp del asesor (Globalitae, 2026-10-13). Todos los CTAs de la web
// apuntan aquí. Formato internacional sin + ni espacios para wa.me.
export const WHATSAPP_NUMBER = "34684733361";

// Copy de bienvenida genérico para todos los CTAs que NO son de un proyecto concreto.
export const WHATSAPP_WELCOME_TEXT =
  "Hola, estoy buscando opciones de inversión en Bali y me interesa conocer más sobre las oportunidades que tenéis disponibles ahora en Unreal Studio";

// Construye un enlace de WhatsApp con texto pre-rellenado.
export const whatsappUrl = (text: string = WHATSAPP_WELCOME_TEXT): string =>
  `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(text)}`;

// Enlace de WhatsApp con copy específico de un proyecto.
export const whatsappProjectUrl = (projectName: string): string =>
  whatsappUrl(`Hola, me interesa saber más sobre el proyecto de ${projectName} que tenéis en vuestra web`);

// CTA genérico (bienvenida). Se mantiene el nombre WHATSAPP_URL por compatibilidad.
export const WHATSAPP_URL = whatsappUrl();

export const DEFAULT_CONFIG: AppConfig = {
  labels: {
    distance_beach: 'Distancia Playa',
    available_units: 'Unidades Disponibles',
    completion_percent: 'Progreso de Obra',
    years_contract: 'Contrato Leasehold',
    roi: 'ROI Proyectado',
    price: 'Precio Inversor',
    market_price: 'Precio Mercado'
  },
  customTypes: ['Villa', 'Loft', 'Apartamento', 'Terreno'],
  customZones: ['Uluwatu', 'Canggu', 'Tabanan', 'Pererenan', 'Seminyak'],
  customStatuses: ['En Construcción', 'Pre-Venta', 'Entregado', 'Últimas Unidades', 'Oportunidad de Co-inversión', 'Listo para Entrar'],
  exchangeRates: {
    EUR: 1,
    USD: 1.08,
    IDR: 17200,
    GBP: 0.83,
    AUD: 1.65
  }
};

export const CURRENCIES: { code: any, symbol: string }[] = [
  { code: 'EUR', symbol: '€' },
  { code: 'USD', symbol: '$' },
  { code: 'IDR', symbol: 'Rp' },
  { code: 'GBP', symbol: '£' },
  { code: 'AUD', symbol: 'A$' }
];
// Columnas de `projects` legibles por visitantes anónimos (la BD niega a anon owner_name,
// enlaces Drive internos, pack de agencias y costes). Usar en vez de select('*') en páginas públicas.
export const PUBLIC_PROJECT_COLS = 'id,name,slug,location,zone,property_type,description,distance_beach,available_units,total_units,completion_percent,years_contract,years_extension,market_price,investor_price,price_currency,roi,roi_type,investor_tiers,brochure_link,image,gallery,is_featured,status,sort_order,created_at,updated_at,bedrooms,bathrooms,area_m2,has_pool,amenities,furnishing,annual_rental_projection,completion_date,brochure_url,google_maps_url,land_ratio,floor_plans,construction_gallery,furnishing_items,is_hidden,visibility_status,timeline,booking_widget_url,lease_end_date,payment_plan_off_plan,zoning_type,building_permit_status,lease_years_paid,structural_warranty,water_supply,land_size_m2,pool_size_m2,parking,view,living_room_style,has_powder_room,has_rooftop,video_url,description_en,description_id,payment_plan_off_plan_en,payment_plan_off_plan_id,view_en,view_id,living_room_style_en,living_room_style_id,parking_en,parking_id,water_supply_en,water_supply_id,structural_warranty_en,structural_warranty_id,zoning_type_en,zoning_type_id,building_permit_status_en,building_permit_status_id,distance_beach_en,distance_beach_id,status_en,status_id,furnishing_en,furnishing_id,completion_date_en,completion_date_id,lease_end_date_en,lease_end_date_id,description_ro,building_permit_status_ro,distance_beach_ro,furnishing_ro,living_room_style_ro,parking_ro,payment_plan_off_plan_ro,structural_warranty_ro,view_ro,water_supply_ro,zoning_type_ro,brochures,tenure,has_real_photos,is_listed,ref_code,land_area_m2,area_m2_label,land_m2_label,view_type,walkthrough_url,already_rented,extensions,rent_currency';
