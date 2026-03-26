import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  const msg = 'Missing Supabase credentials. Please check your environment variables (VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY).';
  console.error(msg);
  if (typeof window !== 'undefined') {
    alert(msg);
  }
}

export const supabase = createClient(supabaseUrl || '', supabaseKey || '');
