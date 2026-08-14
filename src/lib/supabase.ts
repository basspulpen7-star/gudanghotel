import { createClient } from '@supabase/supabase-js';

const rawUrl = (import.meta.env.VITE_SUPABASE_URL || '').trim();
const rawKey = (import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim();

// Ensure clean base URL without trailing slashes or accidental subpaths (e.g. /auth/v1, /rest/v1)
export const supabaseUrl = rawUrl
  .replace(/\/+$/, '')
  .replace(/\/(auth|rest|storage)\/v\d+.*$/i, '');

export const supabaseKey = rawKey;

if (!supabaseUrl || !supabaseKey) {
  const msg = 'Missing Supabase credentials. Please check your environment variables (VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY).';
  console.error(msg);
}

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

