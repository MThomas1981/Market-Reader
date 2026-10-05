'use client';

import { useEffect, useState } from 'react';
import { symbolToPath } from '@market-reader/core';

interface Source { id: string; title: string; url: string }
interface Brief { available: boolean; answer?: string; sources?: Source[]; error?: string }

/** Strip [S1] markers for the lede; the sources are listed underneath. */
const clean = (s: string) => s.replace(/\s*\[S\d+\]/g, '');

export function AiBrief({ symbol }: { symbol: string }) {
  const [brief, setBrief] = useState<Brief | null>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    setBrief(null);
    fetch(`/api/ai/brief/${symbolToPath(symbol)}`, { signal: ctrl.signal })
      .then((r) => r.json())
      .then((b: Brief) => setBrief(b))
      .catch((e: Error) => e.name !== 'AbortError' && setBrief({ available: true, error: 'The summary didn’t load.' }));
    return () => ctrl.abort();
  }, [symbol]);

  if (brief && !brief.available) {
    return (
      <aside className="brief" aria-label="AI summary">
        <div className="brief-label">Today, in brief</div>
        <p className="muted" style={{ fontSize: 16 }}>Add an <code>ANTHROPIC_API_KEY</code> to your .env file to get a short AI summary of each move here.</p>
      </aside>
    );
  }

  return (
    <aside className={`brief${brief ? '' : ' loading'}`} aria-label="AI summary" aria-busy={!brief}>
      <div className="brief-label">Today, in brief</div>
      <p>{!brief ? 'Reading today’s price action and news…' : brief.error ? brief.error : clean(brief.answer ?? '')}</p>
      {brief?.sources && brief.sources.length > 0 && (
        <div className="sources">
          {brief.sources.map((s) => (
            <a key={s.id} className="source-chip" href={s.url} target={s.url.startsWith('http') ? '_blank' : undefined} rel="noopener noreferrer" title={s.title}>
              {s.title}
            </a>
          ))}
        </div>
      )}
    </aside>
  );
}
