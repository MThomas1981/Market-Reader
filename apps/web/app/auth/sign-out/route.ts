import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';
import { authEnabled } from '@/lib/supabase/config';

export async function POST(req: Request) {
  if (authEnabled()) await (await supabaseServer()).auth.signOut();
  return NextResponse.redirect(new URL('/', req.url), { status: 303 });
}
