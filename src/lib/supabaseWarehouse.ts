import { createClient } from '@supabase/supabase-js';

const DEFAULT_WAREHOUSE_URL = 'https://qdsieavuhgvxrqtaytlt.supabase.co';
const DEFAULT_WAREHOUSE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFkc2llYXZ1aGd2eHJxdGF5dGx0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ1MTM2NjAsImV4cCI6MjA5MDA4OTY2MH0.XFKs74H9-KsMI_3ZkvnfhovBKtjNftwmzZ9Iuv-BLUI';

const rawUrl = (
  import.meta.env.VITE_WAREHOUSE_SUPABASE_URL ||
  import.meta.env.VITE_SUPABASE_URL ||
  DEFAULT_WAREHOUSE_URL
).trim();

const rawKey = (
  import.meta.env.VITE_WAREHOUSE_SUPABASE_ANON_KEY ||
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  DEFAULT_WAREHOUSE_KEY
).trim();

// Ensure clean base URL without trailing slashes or subpaths
export const warehouseUrl = rawUrl
  .replace(/\/+$/, '')
  .replace(/\/(auth|rest|storage)\/v\d+.*$/i, '');

export const warehouseKey = rawKey;

// Diagnostic log as required
console.log('[AUTH CLIENT]', warehouseUrl);

if (!warehouseUrl || !warehouseKey) {
  console.error('[AUTH CLIENT ERROR] Supabase Warehouse credentials missing. VITE_WAREHOUSE_SUPABASE_ANON_KEY is required.');
}

export const warehouseSupabase = createClient(warehouseUrl, warehouseKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

