import { warehouseSupabase } from './supabaseWarehouse';

/**
 * DATABASE ISOLATION NOTICE:
 * Linen Master database (yjmjlxscvwnkoewvielo) has been fully isolated and is protected from external modifications.
 * All Linen operations inside Gudang Alia application now run on Gudang Alia's dedicated database (qdsieavuhgvxrqtaytlt)
 * using the isolated `linen_*` tables.
 */
export const supabaseLinen = warehouseSupabase;

console.log('[DATABASE ISOLATED] Gudang Alia Linen module operates independently on local database (qdsieavuhgvxrqtaytlt). Linen Master database is untouched.');

