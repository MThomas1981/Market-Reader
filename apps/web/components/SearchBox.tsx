'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { normalizeSymbol, type SearchResult } from '@market-reader/core';
import { quoteHref } from './bits';

const KIND: Record<string, string> = { stock: 'Stock', etf: 'ETF', crypto: 'Crypto', forex: 'Currency', index: 'Index' };

export function SearchBox() {
  const router = useRouter();
  const listId = useId();
  const [q, setQ] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!q.trim()) {
      setResults([]);
      return;
    }
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`, { signal: ctrl.signal });
        const data = (await res.json()) as { results?: SearchResult[] };
        setResults(data.results ?? []);
        setActive(0);
        setOpen(true);
      } catch {
        /* typing again cancels the previous request */
      }
    }, 180);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [q]);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const go = (symbol: string) => {
    setOpen(false);
    setQ('');
    router.push(quoteHref(symbol));
  };

  return (
    <div className="search" ref={boxRef}>
      <svg className="search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-3.5-3.5" />
      </svg>
      <label htmlFor={`${listId}-input`} className="visually-hidden">Search stocks, ETFs, crypto and currencies</label>
      <input
        id={`${listId}-input`}
        type="search"
        placeholder="Search a company, ticker, coin or currency"
        value={q}
        autoComplete="off"
        role="combobox"
        aria-expanded={open && results.length > 0}
        aria-controls={listId}
        aria-activedescendant={open && results[active] ? `${listId}-${active}` : undefined}
        onChange={(e) => setQ(e.target.value)}
        onFocus={() => results.length && setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setActive((a) => Math.min(a + 1, results.length - 1));
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActive((a) => Math.max(a - 1, 0));
          } else if (e.key === 'Enter') {
            e.preventDefault();
            const pick = results[active]?.symbol ?? (q.trim() ? normalizeSymbol(q) : '');
            if (pick) go(pick);
          } else if (e.key === 'Escape') {
            setOpen(false);
          }
        }}
      />
      {open && results.length > 0 && (
        <ul className="search-results" id={listId} role="listbox">
          {results.map((r, i) => (
            <li key={r.symbol} id={`${listId}-${i}`} role="option" aria-selected={i === active}>
              <a href={quoteHref(r.symbol)} onClick={(e) => { e.preventDefault(); go(r.symbol); }}>
                <span className="sym">{r.symbol}</span>
                <span>{r.name}</span>
                <span className="kind">{KIND[r.assetClass] ?? r.assetClass}</span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
