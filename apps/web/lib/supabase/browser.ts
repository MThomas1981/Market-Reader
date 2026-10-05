'use client';

import { createBrowserClient } from '@supabase/ssr';
import { SUPABASE_ANON_KEY, SUPABASE_URL, authEnabled } from './config';

export function supabaseBrowser() {
  if (!authEnabled()) throw new Error('Accounts aren’t set up yet. Add the Supabase keys to .env.local.');
  return createBrowserClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}
