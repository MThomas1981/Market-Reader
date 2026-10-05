import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import Link from 'next/link';
import { Newsreader, Public_Sans } from 'next/font/google';
import { SearchBox } from '@/components/SearchBox';
import { Nav } from '@/components/Nav';
import { Assistant } from '@/components/Assistant';
import { Toaster } from '@/components/Toaster';
import { getViewer } from '@/lib/viewer';
import { authEnabled } from '@/lib/supabase/config';
import './globals.css';

const sans = Public_Sans({ subsets: ['latin'], variable: '--font-public-sans', display: 'swap' });
const serif = Newsreader({ subsets: ['latin'], variable: '--font-newsreader', display: 'swap', weight: ['400', '500', '600'] });

export const metadata: Metadata = {
  title: { default: 'Market Reader', template: '%s · Market Reader' },
  description: 'Research stocks, ETFs, crypto and currencies with charts, news and an AI assistant that cites its sources.',
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#17202b' },
  ],
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const viewer = await getViewer();
  return (
    <html lang="en" className={`${sans.variable} ${serif.variable}`}>
      <body>
        <header className="masthead">
          <div className="masthead-inner">
            <Link href="/" className="wordmark" aria-label="Market Reader home">
              <span className="wordmark-mark" aria-hidden />
              Market Reader
            </Link>
            <SearchBox />
            <Nav signedIn={!!viewer.user} pro={viewer.plan === 'pro'} accounts={authEnabled()} />
          </div>
        </header>
        <main className="page">{children}</main>
        <footer className="footer">
          <div className="footer-inner">
            <span>
              <strong>Student project.</strong> Market Reader is a hypothetical app built for a senior-level college finance course. It is not a
              real service, nothing here is financial advice, and payments run in Stripe test mode only. <Link href="/about">About this project</Link>
            </span>
            <span>Prices may be delayed. Data from Finnhub, Massive, CoinGecko and Frankfurter (ECB reference rates) where configured; anything marked demo data is made up.</span>
          </div>
        </footer>
        <Assistant />
        <Toaster />
      </body>
    </html>
  );
}
