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