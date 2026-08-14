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

export interface UserProfile {
  id: string;
  full_name: string;
  role: 'admin' | 'staff';
  avatar_url?: string;
  username?: string;
  email?: string;
  created_at?: string;
  updated_at?: string;
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
