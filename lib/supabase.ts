import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Server-only Supabase client for the vouchers table (aroi-core-db). Uses the
// service-role key — the table has RLS on with no anon policies, so this must
// never be imported from a client component.
let client: SupabaseClient | null = null;

export function supabase(): SupabaseClient {
  if (client) return client;
  const url = process.env.SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) throw new Error('Supabase is not configured');
  client = createClient(url, key, { auth: { persistSession: false } });
  return client;
}

// Today's calendar date in Melbourne, as YYYY-MM-DD.
export function melbourneToday(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Australia/Melbourne' }).format(new Date());
}
