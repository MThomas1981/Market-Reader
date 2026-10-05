import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { PLANS, type Plan, type PlanLimits } from '@market-reader/core';
import { authEnabled } from './supabase/config';
import { supabaseForToken, supabaseServer } from './supabase/server';
import { cookies } from 'next/headers';
import { decodeGuestPro, guestProActive, PRO_COOKIE, type GuestPro } from './guest-pro';

type Client = SupabaseClient;

export interface Viewer {
  user: { id: string; email: string | null } | null;
  plan: Plan;
  limits: PlanLimits;
  /** Supabase client acting as this user (null for guests or when accounts are off) */
  db: Client | null;
  /** Pro bought without an account (Stripe test mode), kept in a signed cookie */
  guestPro?: GuestPro;
}

const anonymous = (): Viewer => ({ user: null, plan: 'anonymous', limits: PLANS.anonymous, db: null });

function readCookie(req: Request | undefined, name: string): string | undefined {
  const header = req?.headers.get('cookie');
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return undefined;
}

/** A visitor without an account, on Pro if this browser holds a valid, still-active Pro purchase. */
async function guest(req?: Request): Promise<Viewer> {
  let raw = readCookie(req, PRO_COOKIE);
  if (raw === undefined && !req) {
    try {
      raw = (await cookies()).get(PRO_COOKIE)?.value;
    } catch {
      /* not in a request */
    }
  }
  const pro = decodeGuestPro(raw);
  if (pro && (await guestProActive(pro))) return { user: null, plan: 'pro', limits: PLANS.pro, db: null, guestPro: pro };
  return anonymous();
}

/**
 * Who is asking, and on which plan. Web pages use the session cookie;
 * the mobile app sends `Authorization: Bearer <supabase access token>`.
 */
export async function getViewer(req?: Request): Promise<Viewer> {
  if (!authEnabled()) return guest(req);
  try {
    const auth = req?.headers.get('authorization');
    const token = auth?.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : null;
    const db: Client = token ? supabaseForToken(token) : await supabaseServer();
    const { data, error } = token ? await db.auth.getUser(token) : await db.auth.getUser();
    if (error || !data.user) return guest(req);
    const { data: planData } = await db.rpc('current_plan');
    const plan: Plan = planData === 'pro' ? 'pro' : 'free';
    return { user: { id: data.user.id, email: data.user.email ?? null }, plan, limits: PLANS[plan], db };
  } catch {
    return guest(req);
  }
}
