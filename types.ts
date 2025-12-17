
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
  POS = 'pos',
  ORDERS = 'orders',
  STOCK = 'stock',
  AI = 'ai',
  SETTINGS = 'settings',
  REPORTS = 'reports',
  PROMOTIONS = 'promotions'
}

export interface Product {
  id: string;
  code: string; // รหัสสินค้า SKU
  name: string;
  price: number;
  cost: number; // ต้นทุน
  category: string;
  stock: number;
  color: string;
  imageUrl?: string; // URL รูปภาพสินค้า
}

export interface CartItem extends Product {
  quantity: number;
  isFree?: boolean; // สินค้าแถม
  originalPrice?: number; // ราคาเดิมก่อนลด
  promotionApplied?: string; // ชื่อโปรโมชั่นที่ใช้
}

export type LogisticsProvider = 'Anuchit' | 'Meexai' | 'Rungarun' | 'Other' | 'None';
export type OrderStatus = 'Pending' | 'Paid' | 'Shipped' | 'Cancelled';

export interface SaleRecord {
  id: string;
  items: CartItem[];
  total: number;
  date: string;
  timestamp?: number; // For easier date filtering
  paymentMethod: 'cash' | 'qr' | 'transfer';
  status: OrderStatus;
  
  // Customer & Shipping Info
  customerName?: string;
  customerPhone?: string;
  customerAddress?: string; // ที่อยู่
  shippingCarrier?: LogisticsProvider;
  shippingBranch?: string;
  trackingNumber?: string;
}

export interface StoreProfile {
  name: string;
  address: string;
  phone: string;
  logoUrl: string | null;
  promptPayId?: string;
}

export type PromotionType = 'tiered_price' | 'buy_x_get_y';

export interface Promotion {
  id: string;
  name: string;
  type: PromotionType;
  isActive: boolean;
  
  // เงื่อนไขสินค้าหลัก (รองรับหลาย SKU)
  targetSkus: string[]; 
  
  // สำหรับ Tiered Price (ซื้อ A จำนวน X ได้ราคา Z)
  tiers?: { minQty: number; price: number }[];
  
  // สำหรับ Buy X Get Y (ซื้อครบ X แถม Y)
  requiredQty?: number;
  freeSku?: string; // SKU ของแถม
  freeQty?: number; // จำนวนที่แถม
}
