import { NextResponse } from 'next/server';
import { getViewer } from '@/lib/viewer';
import { authEnabled } from '@/lib/supabase/config';

/** The current user, their plan and its limits. Guests get plan "anonymous". */
export async function GET(req: Request) {
  const v = await getViewer(req);
  return NextResponse.json({ user: v.user, plan: v.plan, limits: v.limits, accounts: authEnabled() }, { headers: { 'Cache-Control': 'no-store' } });
}
