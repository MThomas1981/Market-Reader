'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { normalizeSymbol } from '@market-reader/core';

interface Source { id: string; title: string; url: string }
interface Turn { role: 'user' | 'assistant'; content: string; sources?: Source[]; error?: boolean }

function symbolFromPath(path: string | null): string | undefined {
  const m = path?.match(/^\/quote\/([^/]+)/);
  return m ? normalizeSymbol(m[1]) : undefined;
}

export function Assistant() {
  const pathname = usePathname();
  const symbol = symbolFromPath(pathname);
  const [open, setOpen] = useState(false);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [remaining, setRemaining] = useState<number | null>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (open) inputRef.current?.focus();
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [open]);

  useEffect(() => {
    bodyRef.current?.scrollTo({ top: bodyRef.current.scrollHeight });
  }, [turns, busy]);

  const ask = async (question: string) => {
    const q = question.trim();
    if (!q || busy) return;
    const history: Turn[] = [...turns.filter((t) => !t.error), { role: 'user', content: q }];
    setTurns((t) => [...t, { role: 'user', content: q }]);
    setDraft('');
    setBusy(true);
    try {
      const res = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: history.map(({ role, content }) => ({ role, content })), symbol }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'The assistant didn’t answer.');
      setTurns((t) => [...t, { role: 'assistant', content: data.answer, sources: data.sources }]);
      if (typeof data.remaining === 'number') setRemaining(data.remaining);
    } catch (e) {
      setTurns((t) => [...t, { role: 'assistant', content: (e as Error).message, error: true }]);
    } finally {
      setBusy(false);
    }
  };

  const suggestions = symbol
    ? [`Why did ${symbol} move today?`, `How has ${symbol} done this year?`, `What are the key numbers for ${symbol}?`]
    : ['What’s moving the market today?', 'Compare NVDA and AMD over the past year', 'How has bitcoin done this month?'];

  return (
    <>
      {!open && (
        <button type="button" className="ask-fab" onClick={() => setOpen(true)} aria-label="Ask Market Reader">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z" />
          </svg>
          <span>Ask Market Reader</span>
        </button>
      )}
      {open && (
        <div className="drawer" role="dialog" aria-label="Research assistant">
          <div className="drawer-head">
            <h2>Ask Market Reader</h2>
            <button type="button" className="icon-btn" onClick={() => setOpen(false)} aria-label="Close assistant">✕</button>
          </div>
          <div className="drawer-body" ref={bodyRef} aria-live="polite">
            {turns.length === 0 && (
              <>
                <p className="muted" style={{ margin: 0 }}>
                  Ask about any stock, fund, coin or currency. Answers use Market Reader&rsquo;s data and list their sources.
                </p>
                <div className="suggestions">
                  {suggestions.map((s) => (
                    <button key={s} type="button" onClick={() => ask(s)}>{s}</button>
                  ))}
                </div>
              </>
            )}
            {turns.map((t, i) =>
              t.role === 'user' ? (
                <div key={i} className="msg-user">{t.content}</div>
              ) : t.error ? (
                <div key={i} className="msg-error" role="alert">{t.content}</div>
              ) : (
                <div key={i} className="msg-ai">
                  {t.content}
                  {t.sources && t.sources.length > 0 && (
                    <div className="sources">
                      {t.sources.map((s) => (
                        <a key={s.id} className="source-chip" href={s.url} target={s.url.startsWith('http') ? '_blank' : undefined} rel="noopener noreferrer" title={s.title}>
                          [{s.id}] {s.title}
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              ),
            )}
            {busy && <div className="muted" role="status">Researching…</div>}
          </div>
          <form className="drawer-form" onSubmit={(e) => { e.preventDefault(); ask(draft); }}>
            <label htmlFor="ask-input" className="visually-hidden">Your question</label>
            <textarea
              id="ask-input"
              ref={inputRef}
              value={draft}
              placeholder={symbol ? `Ask about ${symbol} or anything else` : 'Ask a question about the markets'}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  ask(draft);
                }
              }}
            />
            <div className="row">
              <span>Not financial advice.{remaining !== null ? ` ${remaining} questions left today.` : ''}</span>
              <button type="submit" className="btn btn-primary" disabled={busy || !draft.trim()}>Ask</button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
