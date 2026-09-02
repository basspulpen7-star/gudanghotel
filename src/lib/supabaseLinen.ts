import { warehouseSupabase, warehouseUrl, warehouseKey } from './supabaseWarehouse';

// Point Linen Supabase Client to Warehouse database to consolidate into one database project
export const linenUrl = warehouseUrl;
export const linenKey = warehouseKey;
export const supabaseLinen = warehouseSupabase;

console.log('[LINEN CLIENT CONSOLIDATED] Now using Warehouse Supabase Project');
