import { ItemType } from './constants-linen';

export type { ItemType };

export interface RoomItem {
  id: string;
  date: string;
  itemName: ItemType;
  quantity: number;
  roomNumber: string;
  created_at?: string;
}

export interface CleanItem {
  id?: string;
  itemName: ItemType;
  quantity: number;
  updated_at?: string;
}

export interface NewItem {
  id?: string;
  itemName: ItemType;
  quantity: number;
  updated_at?: string;
}

export interface NewItemTransaction {
  id: string;
  date: string;
  itemName: ItemType;
  quantity: number;
  type: 'Stock In' | 'Take to Clean';
  description?: string;
  created_at?: string;
}

export interface IncomingItem {
  id: string;
  date: string;
  itemName: ItemType;
  quantity: number;
  source: 'Laundry' | 'Barang Baru' | string;
  description?: string;
  created_at?: string;
}

export interface OutgoingItem {
  id: string;
  date: string;
  itemName: ItemType;
  quantity: number;
  destination: 'Laundry' | 'Afkir' | string;
  description?: string;
  created_at?: string;
}

export interface LinenState {
  roomItems: RoomItem[];
  cleanItems: CleanItem[];
  newItems: NewItem[];
  newItemTransactions: NewItemTransaction[];
  incomingItems: IncomingItem[];
  outgoingItems: OutgoingItem[];
}
