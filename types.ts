
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
  isFree?: boolean;
  originalPrice?: number;
  promotionApplied?: string;
}

export type LogisticsProvider = 'Anuchit' | 'Meexai' | 'Rungarun' | 'Other' | 'None';

// 7-Step Order Status
export type OrderStatus = 
  | 'Pending'    // 1. รอชำระ
  | 'Paid'       // 2. ชำระแล้ว
  | 'Packing'    // 3. กำลังแพ็ค
  | 'Ready'      // 4. พร้อมส่ง
  | 'Shipped'    // 5. ส่งแล้ว
  | 'Delivered'  // 6. ถึงผู้รับ
  | 'Completed'; // 7. สำเร็จ

export interface SaleRecord {
  id: string;
  items: CartItem[];
  total: number;
  subtotal?: number;
  discountValue?: number;
  discountType?: 'amount' | 'percent';
  date: string;
  timestamp: number;
  paymentMethod: 'cash' | 'qr' | 'transfer';
  status: OrderStatus;
  customerName?: string;
  customerPhone?: string;
  customerAddress?: string;
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
  targetSkus: string[]; 
  tiers?: { minQty: number; price: number }[];
  requiredQty?: number;
  freeSku?: string;
  freeQty?: number;
}
