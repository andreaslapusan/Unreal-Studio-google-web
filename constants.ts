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