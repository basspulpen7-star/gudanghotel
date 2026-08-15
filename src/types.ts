export interface Item {
  id: string;
  name: string;
  department: string;
  unit: string;
  initial_stock: number;
  current_stock: number;
  min_stock: number;
  created_at: string;
}

export interface Supplier {
  id: string;
  name: string;
  contact_person: string;
  phone: string;
  address: string;
  category: string;
  user_id: string;
  created_at: string;
}

export interface Transaction {
  id: string;
  item_id: string;
  type: 'IN' | 'OUT';
  quantity: number;
  department?: string;
  notes?: string;
  created_at: string;
  user_id: string;
  items?: Item;
}

export type UserRole = 'admin' | 'staff' | 'hk' | 'logistik';

export interface UserProfile {
  id: string;
  full_name: string;
  role: UserRole | string;
  avatar_url?: string;
  username?: string;
  email?: string;
  created_at?: string;
  updated_at?: string;
}

export interface HKRequestItem {
  id?: string;
  request_id?: string;
  item_id?: string;
  item_name: string;
  quantity: number;
  unit: string;
  notes?: string;
  item?: Item;
}

export interface HKRequest {
  id: string;
  request_number?: string;
  department: string;
  requester_name?: string;
  user_id?: string;
  status: 'MENUNGGU' | 'DIPROSES' | 'SELESAI' | 'DITOLAK' | 'pending' | 'processing' | 'completed' | 'rejected';
  occupancy_count?: number;
  breakfast_pax?: number;
  notes?: string;
  created_at: string;
  items?: HKRequestItem[];
}

export interface BreakfastRecord {
  id?: string;
  date: string;
  rooms_occupied: number;
  breakfast_pax: number;
  notes?: string;
  created_at?: string;
}

export interface PurchaseOrder {
  id: string;
  po_number?: string;
  supplier_id: string;
  status: 'pending' | 'completed' | 'cancelled';
  total_amount: number;
  created_at: string;
  user_id: string;
  supplier?: Supplier;
  items?: PurchaseOrderItem[];
  user_profile?: UserProfile;
}

export interface PurchaseOrderItem {
  id: string;
  purchase_order_id: string;
  item_id: string;
  quantity: number;
  price: number;
  item?: Item;
}
