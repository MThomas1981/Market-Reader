export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
export const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';

/** Accounts are switched on once the Supabase URL and anon key are in .env.local. */
export const authEnabled = () => Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
