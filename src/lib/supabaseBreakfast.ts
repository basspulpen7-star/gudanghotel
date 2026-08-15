import { createClient } from '@supabase/supabase-js';

const DEFAULT_BREAKFAST_URL = 'https://idmaamghpaepgywgyubg.supabase.co';
const DEFAULT_BREAKFAST_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlkbWFhbWdocGFlcGd5d2d5dWJnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ1MTM2NjAsImV4cCI6MjA5MDA4OTY2MH0.placeholder';

const rawUrl = (
  import.meta.env.VITE_BREAKFAST_SUPABASE_URL ||
  DEFAULT_BREAKFAST_URL
).trim();

const rawKey = (
  import.meta.env.VITE_BREAKFAST_SUPABASE_ANON_KEY ||
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  DEFAULT_BREAKFAST_KEY
).trim();

// Ensure clean base URL without trailing slashes or subpaths
export const breakfastUrl = rawUrl
  .replace(/\/+$/, '')
  .replace(/\/(auth|rest|storage)\/v\d+.*$/i, '');

export const breakfastKey = rawKey;

// Diagnostic log as required
console.log('[BREAKFAST CLIENT]', {
  url: breakfastUrl,
  project: 'idmaamghpaepgywgyubg'
});

if (!breakfastUrl || !breakfastKey) {
  console.warn('[BREAKFAST CLIENT NOTICE] Supabase Breakfast credentials missing or incomplete.');
}

// BREAKFAST CLIENT IS READ-ONLY FOR OCCUPANCY.
// DO NOT USE FOR AUTHENTICATION.
export const breakfastSupabase = createClient(breakfastUrl, breakfastKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
});

