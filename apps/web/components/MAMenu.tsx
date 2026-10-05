'use client';

import { useEffect, useRef, useState } from 'react';
import { DEFAULT_MA_LINES, MA_COLORS, MAX_MA_PERIOD, MIN_MA_PERIOD, clampPeriod, maLabel, type MALine, type MAType } from '@market-reader/core';

/** Popover for moving-average lines: switch on/off, SMA or EMA, period length, color; add or remove lines. */
export function MAMenu({ lines, onChange }: { lines: MALine[]; onChange: (lines: MALine[]) => void }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const active = lines.filter((l) => l.on).length;

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => box.current && !box.current.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', away);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', away);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);

  const update = (id: string, patch: Partial<MALine>) => onChange(lines.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  const add = () => {
    const used = new Set(lines.map((l) => l.color));
    const color = MA_COLORS.find((c) => !used.has(c)) ?? MA_COLORS[lines.length % MA_COLORS.length];
    onChange([...lines, { id: `ma${Date.now().toString(36)}`, type: 'EMA', period: 9, color, on: true }]);
  };

  return (
    <div ref={box} className="relative">
      <button type="button" className="chip" aria-expanded={open} aria-haspopup="dialog" onClick={() => setOpen((o) => !o)}>
        Moving averages{active ? ` (${active})` : ''} <span aria-hidden>▾</span>
      </button>
      {open && (
        <div role="dialog" aria-label="Moving averages" className="ma-menu">
          <div className="mb-2 flex items-baseline justify-between gap-3">
            <strong className="text-sm">Moving averages</strong>
            <span className="text-xs text-muted">Calculated on closing prices</span>
          </div>
          <ul className="grid gap-1.5">
            {lines.map((l) => (
              <li key={l.id} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={l.on}
                  onChange={(e) => update(l.id, { on: e.target.checked })}
                  aria-label={`Show ${maLabel(l)}`}
                  className="h-4 w-4 accent-[var(--accent)]"
                />
                <input
                  type="color"
                  value={l.color}
                  onChange={(e) => update(l.id, { color: e.target.value })}
                  aria-label={`${maLabel(l)} color`}
                  className="h-6 w-7 cursor-pointer rounded border border-rule bg-paper p-0.5"
                />
                <select
                  value={l.type}
                  onChange={(e) => update(l.id, { type: e.target.value as MAType })}
                  aria-label={`${maLabel(l)} type`}
                  className="h-8 rounded-md border border-rule bg-paper px-1.5 text-sm text-ink"
                >
                  <option value="SMA">SMA</option>
                  <option value="EMA">EMA</option>
                </select>
                <PeriodInput value={l.period} label={`${maLabel(l)} period`} onCommit={(period) => update(l.id, { period })} />
                <span className="flex-1 text-xs text-muted">{l.type === 'EMA' ? 'exponential' : 'simple'}</span>
                <button
                  type="button"
                  onClick={() => onChange(lines.filter((x) => x.id !== l.id))}
                  aria-label={`Remove ${maLabel(l)}`}
                  className="rounded px-1.5 text-muted hover:bg-down-tint hover:text-down"
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" className="chip" onClick={add} disabled={lines.length >= 8}>+ Add line</button>
            <button type="button" className="chip" onClick={() => onChange(DEFAULT_MA_LINES)}>Reset to defaults</button>
          </div>
          <p className="mt-2 text-xs text-muted">
            Periods {MIN_MA_PERIOD}–{MAX_MA_PERIOD} bars. Common: 9, 20, 50, 200. Earlier history is loaded automatically so each line starts at the left edge.
          </p>
        </div>
      )}
    </div>
  );
}

/** Number box that accepts free typing and applies a valid period on Enter or when leaving the box. */
function PeriodInput({ value, label, onCommit }: { value: number; label: string; onCommit: (n: number) => void }) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  const commit = () => {
    const n = clampPeriod(Number(draft));
    setDraft(String(n));
    if (n !== value) onCommit(n);
  };
  return (
    <input
      type="number"
      inputMode="numeric"
      min={MIN_MA_PERIOD}
      max={MAX_MA_PERIOD}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === 'Enter' && commit()}
      aria-label={label}
      className="h-8 w-16 rounded-md border border-rule bg-paper px-2 text-sm tabular-nums text-ink"
    />
  );
}
