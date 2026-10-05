import 'server-only';
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import type Stripe from 'stripe';
import { stripe } from './billing';

/**
 * Pro without accounts. When Supabase accounts aren't set up, a paid Stripe Checkout (test mode)
 * unlocks Pro for the browser that paid: the server confirms the payment with Stripe, then stores the
 * subscription in a signed, httpOnly cookie. Every few minutes the server re-checks the subscription
 * with Stripe, so cancelling it ends Pro. No webhook or database is needed.
 */
export const PRO_COOKIE = 'mr_pro';

export interface GuestPro {
  /** Stripe subscription id */
  sub: string;
  /** Stripe customer id */
  cus: string;
  /** When the paid period ends, Unix seconds */
  exp: number;
}

const secret = () =>
  process.env.PRO_COOKIE_SECRET ||
  createHash('sha256').update(`market-reader-pro:${process.env.STRIPE_SECRET_KEY ?? ''}`).digest('hex');

const sign = (data: string) => createHmac('sha256', secret()).update(data).digest('base64url');

export function encodeGuestPro(p: GuestPro): string {
  const data = Buffer.from(JSON.stringify(p)).toString('base64url');
  return `${data}.${sign(data)}`;
}

export function decodeGuestPro(value: string | undefined | null): GuestPro | null {
  if (!value || !process.env.STRIPE_SECRET_KEY) return null;
  const [data, mac] = value.split('.');
  if (!data || !mac) return null;
  const expected = Buffer.from(sign(data));
  const given = Buffer.from(mac);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const p = JSON.parse(Buffer.from(data, 'base64url').toString()) as GuestPro;
    return typeof p.sub === 'string' && typeof p.cus === 'string' && typeof p.exp === 'number' ? p : null;
  } catch {
    return null;
  }
}

/** Period end of a subscription, across Stripe API versions. */
export function periodEnd(sub: Stripe.Subscription): number {
  const raw = sub as unknown as { current_period_end?: number; items?: { data?: { current_period_end?: number }[] } };
  return raw.current_period_end ?? raw.items?.data?.[0]?.current_period_end ?? Math.floor(Date.now() / 1000) + 31 * 86_400;
}

const ACTIVE = new Set(['active', 'trialing', 'past_due']);
const checked = new Map<string, { active: boolean; at: number }>();

/** Is this guest's subscription still active? Asks Stripe at most every 5 minutes; trusts the cookie if Stripe can't be reached. */
export async function guestProActive(p: GuestPro): Promise<boolean> {
  const now = Date.now();
  const hit = checked.get(p.sub);
  if (hit && now - hit.at < 5 * 60_000) return hit.active;
  try {
    const sub = await stripe().subscriptions.retrieve(p.sub);
    const active = ACTIVE.has(sub.status);
    checked.set(p.sub, { active, at: now });
    return active;
  } catch {
    return p.exp * 1000 > now;
  }
}

export function forgetGuestPro(sub: string) {
  checked.set(sub, { active: false, at: Date.now() });
}

export const proCookieOptions = (req: Request, exp: number) => ({
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: new URL(req.url).protocol === 'https:',
  path: '/',
  // Keep it a little past the paid period; Stripe is re-checked anyway.
  maxAge: Math.max(60, exp - Math.floor(Date.now() / 1000) + 7 * 86_400),
});
