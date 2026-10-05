import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { PLANS, type Plan, type PlanLimits } from '@market-reader/core';
import { authEnabled } from './supabase/config';
import { supabaseForToken, supabaseServer } from './supabase/server';
import { cookies } from 'next/headers';
import { decodeGuestPro, guestProActive, PRO_COOKIE, type GuestPro } from './guest-pro';
import { billingEnabled } from './billing';

/** Set by "Preview Pro" on copies where payments aren't set up (no Stripe key), e.g. a fresh clone being graded. */
export const PRO_PREVIEW_COOKIE = 'mr_pro_preview';

type Client = SupabaseClient;

export interface Viewer {
  user: { id: string; email: string | null } | null;
  plan: Plan;
  limits: PlanLimits;
  /** Supabase client acting as this user (null for guests or when accounts are off) */
  db: Client | null;
  /** Pro bought without an account (Stripe test mode), kept in a signed cookie */
  guestPro?: GuestPro;
  /** Pro features switched on for free because this copy has no payments set up */
  proPreview?: boolean;
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

async function cookie(req: Request | undefined, name: string): Promise<string | undefined> {
  const raw = readCookie(req, name);
  if (raw !== undefined || req) return raw;
  try {
    return (await cookies()).get(name)?.value;
  } catch {
    return undefined; // not in a request
  }
}

/** Pro preview applies only while payments are off on this copy; with a Stripe key, Pro must be bought. */
async function previewingPro(req?: Request) {
  return !billingEnabled() && (await cookie(req, PRO_PREVIEW_COOKIE)) === '1';
}

/** A visitor without an account, on Pro if this browser holds a valid, still-active Pro purchase. */
async function guest(req?: Request): Promise<Viewer> {
  const pro = decodeGuestPro(await cookie(req, PRO_COOKIE));
  if (pro && (await guestProActive(pro))) return { user: null, plan: 'pro', limits: PLANS.pro, db: null, guestPro: pro };
  if (await previewingPro(req)) return { user: null, plan: 'pro', limits: PLANS.pro, db: null, proPreview: true };
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
    const preview = planData !== 'pro' && (await previewingPro(req));
    const plan: Plan = planData === 'pro' || preview ? 'pro' : 'free';
    return { user: { id: data.user.id, email: data.user.email ?? null }, plan, limits: PLANS[plan], db, proPreview: preview || undefined };
  } catch {
    return guest(req);
  }
}
