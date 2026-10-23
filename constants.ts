import { AppConfig } from './types';

export const WHATSAPP_URL = "https://wa.me/34625710770?text=¡Hola!%20Me%20gustaría%20agendar%20una%20llamada%20con%20el%20equipo%20de%20Unreal%20Studio%20para%20recibir%20m%C3%A1s%20informaci%C3%B3n%20sobre%20vuestros%20proyectos%20de%20inversi%C3%B3n.";

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
export const PUBLIC_PROJECT_COLS = 'id,name,slug,location,zone,property_type,description,distance_beach,available_units,completion_percent,years_contract,years_extension,market_price,investor_price,price_currency,roi,roi_type,investor_tiers,brochure_link,image,gallery,is_featured,status,sort_order,created_at,updated_at,bedrooms,bathrooms,area_m2,has_pool,amenities,furnishing,annual_rental_projection,completion_date,brochure_url,construction_update_url,construction_update_date,google_maps_url,land_ratio,floor_plans,construction_gallery,furnishing_items,is_hidden,timeline,booking_widget_url,lease_end_date,payment_plan_off_plan,zoning_type,building_permit_status,lease_years_paid,structural_warranty,water_supply,land_size_m2,pool_size_m2,parking,view,living_room_style,has_powder_room,has_rooftop,video_url,description_en,description_id,payment_plan_off_plan_en,payment_plan_off_plan_id,view_en,view_id,living_room_style_en,living_room_style_id,parking_en,parking_id,water_supply_en,water_supply_id,structural_warranty_en,structural_warranty_id,zoning_type_en,zoning_type_id,building_permit_status_en,building_permit_status_id,distance_beach_en,distance_beach_id,status_en,status_id,furnishing_en,furnishing_id,completion_date_en,completion_date_id,lease_end_date_en,lease_end_date_id,description_ro,building_permit_status_ro,distance_beach_ro,furnishing_ro,living_room_style_ro,parking_ro,payment_plan_off_plan_ro,structural_warranty_ro,view_ro,water_supply_ro,zoning_type_ro,brochures,tenure,has_real_photos,is_listed,ref_code,land_area_m2,view_type,walkthrough_url,already_rented,extensions,rent_currency';
