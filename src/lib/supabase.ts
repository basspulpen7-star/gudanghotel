import { warehouseSupabase, warehouseUrl, warehouseKey } from './supabaseWarehouse';

// Re-export Warehouse Supabase Client for Warehouse database tables
export { warehouseSupabase, warehouseUrl, warehouseKey };

// Compatibility export pointing directly to Warehouse Supabase Client
export const supabase = warehouseSupabase;
export const supabaseUrl = warehouseUrl;
export const supabaseKey = warehouseKey;
