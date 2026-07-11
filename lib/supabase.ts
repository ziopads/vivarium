import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// Server-only. Returns a service-role Supabase client when the env vars are
// present, else null (in which case the app runs against the local JSON files).
// The service-role key bypasses RLS, so this must never be imported into a
// client component.
let client: SupabaseClient | null = null;
let resolved = false;

export function getSupabase(): SupabaseClient | null {
  if (resolved) return client;
  resolved = true;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (url && key) {
    client = createClient(url, key, { auth: { persistSession: false } });
  }
  return client;
}
