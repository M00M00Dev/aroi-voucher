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

// Voucher expiry rule (owner decision 2026-10-02): 3 months from the issue date.
export function threeMonthsFrom(isoDate: string): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1 + 3, d));
  // Clamp month overflow (e.g. 30 Nov + 3 months -> 28 Feb, not 2 Mar)
  if (dt.getUTCDate() !== d) dt.setUTCDate(0);
  return dt.toISOString().slice(0, 10);
}

// YYYY-MM-DD -> DD/MM/YYYY
export function displayDate(isoDate: string): string {
  const [y, m, d] = isoDate.split('-');
  return `${d}/${m}/${y}`;
}
