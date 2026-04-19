
export type CurrencyCode = 'EUR' | 'USD' | 'IDR' | 'GBP' | 'AUD';

export interface Currency {
  code: CurrencyCode;
  symbol: string;
  rate: number; 
}

export interface User {
  id: string;
  name: string;
  username: string;
  password_hash: string; 
  is_active?: boolean;
  created_at?: string;
  last_login?: string;
}

export interface Project {
  id: string;
  slug: string;
  name: string;
  location: string;
  description: string;
  investor_price: number;
  market_price: number;
  price_currency: CurrencyCode;
  status: string;
  image: string;
  gallery: string[];
  drive_folder_link?: string;
  roi: string;
  roi_type: string;
  is_featured?: boolean;
  property_type: string;
  distance_beach: string;
  available_units: string;
  completion_percent: number;
  years_contract: number;
  years_extension: number;
  brochure_link: string;
  investor_tiers?: string | string[];
  sort_order?: number;
  bedrooms: number;
  bathrooms: number;
  area_m2: number;
  has_pool: boolean;
  amenities: string[];
  furnishing: string;
  annual_rental_projection: number;
  completion_date: string;
  brochure_url: string;
  construction_update_url: string;
  construction_update_date: string;
  google_maps_url: string;
  land_ratio?: number;
  floor_plans?: string[];
  construction_gallery?: string[];
  furnishing_items?: string[];
  is_hidden?: boolean;
}

export interface BlogPost {
  id: string;
  slug: string;
  title: string;
  tag: string;
  description: string;
  content: string; 
  image: string;
  published_date: string;
  is_published?: boolean;
}

export interface Client {
  id: string;
  name: string;
  email: string;
  phone: string;
  password_hash?: string;
  temp_password?: string;
  must_change_password?: boolean;
  notes: string;
  tags: string[];
  is_active: boolean;
  created_at?: string;
  last_login?: string;
  projects?: ClientProject[];
}

export interface ClientProject {
  id: string;
  client_id: string;
  project_id: string;
  project_name?: string;
  unit_number: string;
  investment_amount: number;
  currency?: CurrencyCode; // Added currency field
  purchase_date: string;
  status: string;
}

export interface AppConfig {
  labels: {
    distance_beach: string;
    available_units: string;
    completion_percent: string;
    years_contract: string;
    roi: string;
    price: string;
    market_price: string;
  };
  customTypes: string[];
  customZones: string[];
  customStatuses: string[];
  exchangeRates: Record<CurrencyCode, number>;
}