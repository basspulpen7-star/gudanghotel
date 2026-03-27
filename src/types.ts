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
  role: string;
  avatar_url?: string;
}
