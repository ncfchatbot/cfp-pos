
export type Language = 'th' | 'lo' | 'en';

export enum Role {
  USER = 'user',
  MODEL = 'model',
  SYSTEM = 'system'
}

export interface Message {
  id: string;
  role: Role;
  text: string;
  timestamp: number;
  isError?: boolean;
}

export enum AppMode {
  DASHBOARD = 'dashboard',
  ORDERS = 'orders',
  STOCK = 'stock',
  REPORTS = 'reports',
  PROMOTIONS = 'promotions',
  AI = 'ai',
  SETTINGS = 'settings'
}

export interface Product {
  id: string;
  code: string;
  name: string;
  price: number;
  cost: number;
  category: string;
  stock: number;
  color: string;
  imageUrl?: string;
}

export interface CartItem extends Product {
  quantity: number;
}

export type LogisticsProvider = 'Anuchit' | 'Meexai' | 'Rungarun' | 'Other' | 'None';

export type OrderStatus = 'Pending' | 'Paid' | 'Shipped' | 'Cancelled' | 'Completed';

export type PaymentMethod = 'Transfer' | 'COD';

export interface SaleRecord {
  id: string;
  items: CartItem[];
  subtotal: number;
  discount: number;
  total: number;
  date: string;
  timestamp: number;
  status: OrderStatus;
  paymentMethod: PaymentMethod;
  customerName?: string;
  customerPhone?: string;
  customerAddress?: string;
  shippingCarrier?: LogisticsProvider;
  shippingBranch?: string;
}

export interface StoreProfile {
  name: string;
  address: string;
  phone: string;
  logoUrl: string | null;
}

export interface PromoTier {
  minQty: number;
  unitPrice: number;
}

export interface Promotion {
  id: string;
  name: string;
  targetProductIds: string[];
  isActive: boolean;
  tiers: PromoTier[];
}
