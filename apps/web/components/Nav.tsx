'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export function Nav({ signedIn, pro, accounts }: { signedIn: boolean; pro: boolean; accounts: boolean }) {
  const path = usePathname();
  const cur = (p: string) => (path === p ? 'page' : undefined);
  return (
    <nav className="nav" aria-label="Main">
      <Link href="/" aria-current={cur('/')}>Markets</Link>
      <Link href="/dashboard" aria-current={cur('/dashboard')}>Dashboard</Link>
      {signedIn && <Link href="/history" aria-current={cur('/history')} className="nav-optional">History</Link>}
      {!pro && <Link href="/pricing" aria-current={cur('/pricing')} className="nav-optional">Pro</Link>}
      {accounts && (signedIn ? (
        <Link href="/account" aria-current={cur('/account')} className="nav-account">
          Account{pro && <span className="pro-badge">Pro</span>}
        </Link>
      ) : (
        <Link href="/auth/sign-in" aria-current={cur('/auth/sign-in')}>Sign in</Link>
      ))}
      {!signedIn && pro && (
        <Link href="/account" aria-current={cur('/account')} className="nav-account">
          Your plan<span className="pro-badge">Pro</span>
        </Link>
      )}
    </nav>
  );
}
