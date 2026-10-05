import { NextResponse } from 'next/server';
import { billingEnabled } from '@/lib/billing';
import { PRO_PREVIEW_COOKIE } from '@/lib/viewer';

/**
 * "Preview Pro" for copies with no payments set up (no Stripe key), such as a fresh clone being
 * graded: switches Pro features on in this browser without checkout. Refused when payments are on,
 * so a real copy can only get Pro through Stripe (test mode).
 */
export async function POST() {
  if (billingEnabled()) {
    return NextResponse.json({ error: 'Payments are set up on this copy, so Pro goes through Stripe checkout.' }, { status: 409 });
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set(PRO_PREVIEW_COOKIE, '1', { path: '/', httpOnly: true, sameSite: 'lax', maxAge: 60 * 60 * 24 * 30 });
  return res;
}

/** End the preview. */
export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(PRO_PREVIEW_COOKIE, '', { path: '/', maxAge: 0 });
  return res;
}
