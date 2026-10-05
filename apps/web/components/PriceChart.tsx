'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ColorType, CrosshairMode, LineStyle, createChart,
  type DeepPartial, type IChartApi, type ChartOptions, type UTCTimestamp,
} from 'lightweight-charts';
import {
  DEFAULT_MA_LINES, RANGES, bollinger, formatPercent, formatPrice, lookbackFor, macd, maLabel, movingAverage,
  newYorkClock, resolutionFor, rsi, sanitizeLines, visibleIndex,
  type AssetClass, type MALine, type Range, type Series,
} from '@market-reader/core';
import { PRICE_EVENT, type PriceEventDetail } from '@/lib/stream';
import { useHistory } from '@/lib/useHistory';
import { SourceTag } from './bits';
import { MAMenu } from './MAMenu';

type Extra = 'bollinger' | 'rsi' | 'macd';
const EXTRAS: { id: Extra; label: string; color: string }[] = [
  { id: 'bollinger', label: 'Bollinger', color: '#7d8796' },
  { id: 'rsi', label: 'RSI', color: '#2f45c8' },
  { id: 'macd', label: 'MACD', color: '#2f45c8' },
];

const STORE = 'market-reader.chart.v2';

function load(): { lines: MALine[]; extras: Extra[] } {
  try {
    const raw = JSON.parse(localStorage.getItem(STORE) ?? 'null');
    return {
      lines: sanitizeLines(raw?.lines),
      extras: Array.isArray(raw?.extras) ? raw.extras.filter((x: string) => EXTRAS.some((e) => e.id === x)) : [],
    };
  } catch {
    return { lines: DEFAULT_MA_LINES, extras: [] };
  }
}

function save(lines: MALine[], extras: Set<Extra>) {
  try {
    localStorage.setItem(STORE, JSON.stringify({ lines, extras: [...extras] }));
  } catch {
    /* private mode: settings last for this visit only */
  }
}

function cssVar(name: string) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function withAlpha(hex: string, alpha: number) {
  const h = hex.replace('#', '');
  if (h.length !== 6) return hex;
  const n = parseInt(h, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

const toLine = (times: number[], values: Series) =>
  values.flatMap((v, i) => (v === null || !Number.isFinite(v) ? [] : [{ time: times[i] as UTCTimestamp, value: v }]));

const dateLabel = (sec: number, intraday: boolean) =>
  new Date(sec * 1000).toLocaleString('en-US', intraday
    ? { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' }
    : { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });

/**
 * Interactive price chart.
 * - Range buttons pick both the span and the bar size (1D 5-minute … MAX weekly).
 * - Moving averages (SMA/EMA, any period) are calculated over the full fetched series, which includes a
 *   lookback buffer as long as the longest active line, then the chart is trimmed to the visible range,
 *   so every line starts at the left edge instead of after a blank warm-up gap.
 */
export function PriceChart({ symbol, assetClass = 'stock', currency = 'USD', initialRange = '1M' }: { symbol: string; assetClass?: AssetClass; currency?: string; initialRange?: Range }) {
  const [range, setRange] = useState<Range>(initialRange);
  const [kind, setKind] = useState<'area' | 'candles'>('area');
  const [lines, setLines] = useState<MALine[]>(DEFAULT_MA_LINES);
  const [extras, setExtras] = useState<Set<Extra>>(new Set());
  const [ready, setReady] = useState(false);
  const mainRef = useRef<HTMLDivElement>(null);
  const rsiRef = useRef<HTMLDivElement>(null);
  const macdRef = useRef<HTMLDivElement>(null);
  const legendRef = useRef<HTMLDivElement>(null);

  // Saved chart settings (after mount, so the server render and first client render match).
  useEffect(() => {
    const s = load();
    setLines(s.lines);
    setExtras(new Set(s.extras));
    setReady(true);
  }, []);
  useEffect(() => {
    if (ready) save(lines, extras);
  }, [lines, extras, ready]);

  const activeLines = useMemo(() => lines.filter((l) => l.on), [lines]);
  const lookback = lookbackFor(lines, { bollinger: extras.has('bollinger'), rsi: extras.has('rsi'), macd: extras.has('macd') });
  const { data, error, loading } = useHistory(symbol, range, lookback);

  // Everything derived from the full series; `vi` is where the visible range starts.
  const calc = useMemo(() => {
    if (!data || data.candles.length === 0) return null;
    const all = data.candles;
    const vi = visibleIndex(all, data.visibleFrom);
    const closes = all.map((k) => k.close);
    const ma = activeLines.map((l) => ({ line: l, values: movingAverage(l.type, closes, l.period) }));
    const visible = all.slice(vi);
    const first = visible[0].open || visible[0].close;
    const change = visible.length > 1 ? ((visible[visible.length - 1].close - first) / first) * 100 : null;
    const intraday = data.resolution ? /minute|hour/.test(data.resolution) : range === '1D' || range === '5D';
    // Lines that still can't start at the left edge (not enough history exists before the range).
    const late = ma.flatMap(({ line, values }) => {
      if (values[vi] !== null) return [];
      const start = values.findIndex((v, i) => i >= vi && v !== null);
      return [start === -1
        ? `${maLabel(line)} needs ${line.period} bars; this view has ${all.length}.`
        : `${maLabel(line)} starts ${dateLabel(all[start].time, intraday)}: not enough earlier history.`];
    });
    return { all, vi, closes, ma, visible, change, intraday, late };
  }, [data, activeLines, range]);

  useEffect(() => {
    if (!calc || !mainRef.current) return;
    const { all, vi, closes, ma, visible, intraday } = calc;
    const c = {
      paper: cssVar('--paper'), slate: cssVar('--slate'), rule: cssVar('--rule'), soft: cssVar('--rule-soft'),
      up: cssVar('--up'), down: cssVar('--down'), accent: cssVar('--accent'), ink: cssVar('--ink'),
    };
    const base: DeepPartial<ChartOptions> = {
      autoSize: true,
      layout: { background: { type: ColorType.Solid, color: c.paper }, textColor: c.slate, fontFamily: getComputedStyle(document.body).fontFamily, fontSize: 12 },
      grid: { vertLines: { color: c.soft }, horzLines: { color: c.soft } },
      rightPriceScale: { borderColor: c.rule },
      timeScale: { borderColor: c.rule, timeVisible: intraday, secondsVisible: false },
      crosshair: { mode: CrosshairMode.Normal },
    };
    const cut = (s: Series) => s.slice(vi);
    const times = visible.map((k) => k.time);
    const rising = visible[visible.length - 1].close >= (visible[0].open || visible[0].close);
    const trend = rising ? c.up : c.down;
    const charts: IChartApi[] = [];

    // The price axis, its high/low margins and the crosshair label show the stock's currency ($330.00).
    const money = (v: number) => formatPrice(v, currency, { forex: assetClass === 'forex' });
    const main = createChart(mainRef.current, { ...base, localization: { priceFormatter: money } });
    charts.push(main);
    const last = { ...visible[visible.length - 1] };
    let pushBar: (bar: typeof last) => void;
    if (kind === 'candles') {
      const s = main.addCandlestickSeries({ upColor: c.up, downColor: c.down, wickUpColor: c.up, wickDownColor: c.down, borderVisible: false });
      s.setData(visible.map((k) => ({ time: k.time as UTCTimestamp, open: k.open, high: k.high, low: k.low, close: k.close })));
      pushBar = (b) => s.update({ time: b.time as UTCTimestamp, open: b.open, high: b.high, low: b.low, close: b.close });
    } else {
      const s = main.addAreaSeries({ lineColor: trend, topColor: withAlpha(trend, 0.22), bottomColor: withAlpha(trend, 0.01), lineWidth: 2 });
      s.setData(visible.map((k) => ({ time: k.time as UTCTimestamp, value: k.close })));
      pushBar = (b) => s.update({ time: b.time as UTCTimestamp, value: b.close });
    }
    if (visible.some((k) => k.volume > 0)) {
      const v = main.addHistogramSeries({ priceFormat: { type: 'volume' }, priceScaleId: 'vol', lastValueVisible: false, priceLineVisible: false });
      main.priceScale('vol').applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
      v.setData(visible.map((k, i) => {
        const prev = all[vi + i - 1];
        return { time: k.time as UTCTimestamp, value: k.volume, color: withAlpha(prev && k.close < prev.close ? c.down : c.up, 0.35) };
      }));
    }
    const overlay = (values: Series, color: string, style = LineStyle.Solid, width: 1 | 2 = 1) => {
      const s = main.addLineSeries({ color, lineWidth: width, lineStyle: style, lastValueVisible: false, priceLineVisible: false, crosshairMarkerVisible: false });
      s.setData(toLine(times, cut(values)));
      return s;
    };

    // Moving averages: SMA solid, EMA dashed, each in its own color, with a live legend.
    const maSeries: { line: MALine; values: Series }[] = ma.map(({ line, values }) => {
      overlay(values, line.color, line.type === 'EMA' ? LineStyle.Dashed : LineStyle.Solid, 2);
      return { line, values };
    });
    if (extras.has('bollinger')) {
      const b = bollinger(closes);
      overlay(b.upper, '#7d8796', LineStyle.Dotted);
      overlay(b.middle, '#7d8796', LineStyle.Dotted);
      overlay(b.lower, '#7d8796', LineStyle.Dotted);
    }

    const legend = legendRef.current;
    const writeLegend = (index: number) => {
      if (!legend) return;
      legend.replaceChildren(...maSeries.map(({ line, values }) => {
        const el = document.createElement('span');
        const v = values[index];
        el.style.color = line.color;
        el.textContent = `${maLabel(line)} ${v === null || v === undefined ? '—' : money(v)}`;
        return el;
      }));
    };
    writeLegend(all.length - 1);
    main.subscribeCrosshairMove((p) => {
      if (p.time === undefined) return writeLegend(all.length - 1);
      const i = all.findIndex((k) => k.time === (p.time as number));
      writeLegend(i === -1 ? all.length - 1 : i);
    });
    main.timeScale().fitContent();

    // Follow the live price from the top of the page, so the chart's last point matches it.
    const step = visible.length > 1 ? visible[visible.length - 1].time - visible[visible.length - 2].time : 300;
    const follow = (e: Event) => {
      const d = (e as CustomEvent<PriceEventDetail>).detail;
      const at = Math.floor(d.time / 1000);
      if (d.symbol !== symbol || !(d.price > 0) || at < last.time) return;
      let time = last.time;
      if (intraday) {
        if (at >= last.time + step) time = last.time + step * Math.floor((at - last.time) / step);
      } else if (step <= 3 * 86_400) {
        const day = (sec: number) => Date.parse(`${newYorkClock(sec * 1000).date}T00:00:00Z`);
        const days = Math.round((day(at) - day(last.time)) / 86_400_000);
        if (days > 0) time = last.time + days * 86_400;
      }
      if (time !== last.time) Object.assign(last, { time, open: last.close, high: d.price, low: d.price, close: d.price, volume: 0 });
      else Object.assign(last, { close: d.price, high: Math.max(last.high, d.price), low: Math.min(last.low, d.price) });
      try {
        pushBar(last);
      } catch {
        /* the chart was replaced */
      }
    };
    window.addEventListener(PRICE_EVENT, follow);

    const sub = (el: HTMLDivElement | null) => {
      if (!el) return null;
      const ch = createChart(el, { ...base, timeScale: { ...base.timeScale, visible: false } });
      charts.push(ch);
      main.timeScale().subscribeVisibleLogicalRangeChange((r) => r && ch.timeScale().setVisibleLogicalRange(r));
      return ch;
    };
    if (extras.has('rsi')) {
      const ch = sub(rsiRef.current);
      if (ch) {
        const s = ch.addLineSeries({ color: c.accent, lineWidth: 1, priceLineVisible: false });
        s.setData(toLine(times, cut(rsi(closes))));
        s.createPriceLine({ price: 70, color: c.down, lineStyle: LineStyle.Dashed, lineWidth: 1, axisLabelVisible: false, title: '' });
        s.createPriceLine({ price: 30, color: c.up, lineStyle: LineStyle.Dashed, lineWidth: 1, axisLabelVisible: false, title: '' });
      }
    }
    if (extras.has('macd')) {
      const ch = sub(macdRef.current);
      if (ch) {
        const m = macd(closes);
        const hist = cut(m.histogram);
        ch.addHistogramSeries({ priceLineVisible: false, lastValueVisible: false })
          .setData(hist.flatMap((v, i) => (v === null ? [] : [{ time: times[i] as UTCTimestamp, value: v, color: withAlpha(v >= 0 ? c.up : c.down, 0.5) }])));
        ch.addLineSeries({ color: c.accent, lineWidth: 1, priceLineVisible: false }).setData(toLine(times, cut(m.line)));
        ch.addLineSeries({ color: '#d18b1f', lineWidth: 1, priceLineVisible: false }).setData(toLine(times, cut(m.signal)));
      }
    }
    const r = main.timeScale().getVisibleLogicalRange();
    if (r) charts.slice(1).forEach((ch) => ch.timeScale().setVisibleLogicalRange(r));

    return () => {
      window.removeEventListener(PRICE_EVENT, follow);
      charts.forEach((ch) => ch.remove());
    };
  }, [calc, kind, extras, symbol, currency, assetClass]);

  const toggleExtra = (id: Extra) =>
    setExtras((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const toggleLine = (id: string) => setLines((ls) => ls.map((l) => (l.id === id ? { ...l, on: !l.on } : l)));

  const resolution = data?.resolution ?? resolutionFor(range, assetClass).label;
  const showMsg = (loading && !calc) || (!loading && error);

  return (
    <section className="surface chart-box" aria-label="Price chart">
      <div className="chart-toolbar">
        <div className="segmented" role="group" aria-label="Time range">
          {RANGES.map((r) => (
            <button key={r} type="button" aria-pressed={r === range} onClick={() => setRange(r)} title={`${r}: ${resolutionFor(r, assetClass).label}`}>
              {r}
            </button>
          ))}
        </div>
        <div className="segmented" role="group" aria-label="Chart type">
          <button type="button" aria-pressed={kind === 'area'} onClick={() => setKind('area')}>Line</button>
          <button type="button" aria-pressed={kind === 'candles'} onClick={() => setKind('candles')}>Candles</button>
        </div>
      </div>
      <div className="range-change">
        {calc?.change !== null && calc?.change !== undefined && (
          <span className={calc.change >= 0 ? 'up' : 'down'}>
            {formatPercent(calc.change)}{' '}
            <span className="muted" style={{ fontWeight: 400 }}>over {range === 'MAX' ? 'all available history' : range === 'YTD' ? 'the year to date' : `the past ${range}`}</span>
          </span>
        )}
        <span className="muted" style={{ fontWeight: 400 }}> · {resolution}{loading && calc ? ' · loading more history…' : ''}</span>
      </div>
      <div className="chart-main" ref={mainRef}>
        <div className="ma-legend" ref={legendRef} aria-hidden />
        {showMsg && <div className="chart-msg" role="status">{loading ? 'Loading prices…' : `Couldn’t load this chart. ${error}`}</div>}
      </div>
      {extras.has('rsi') && <div className="chart-sub" ref={rsiRef}><span className="chart-sub-label">RSI 14</span></div>}
      {extras.has('macd') && <div className="chart-sub" ref={macdRef}><span className="chart-sub-label">MACD 12, 26, 9</span></div>}
      <div className="indicators" role="group" aria-label="Indicators">
        {lines.map((l) => (
          <button key={l.id} type="button" className="chip" aria-pressed={l.on} onClick={() => toggleLine(l.id)} title={`${l.type === 'EMA' ? 'Exponential' : 'Simple'} moving average, ${l.period} bars`}>
            <span className={`swatch${l.type === 'EMA' ? ' dashed' : ''}`} style={{ background: l.color, color: l.color }} aria-hidden />
            {maLabel(l)}
          </button>
        ))}
        <MAMenu lines={lines} onChange={setLines} />
        {EXTRAS.map((x) => (
          <button key={x.id} type="button" className="chip" aria-pressed={extras.has(x.id)} onClick={() => toggleExtra(x.id)}>
            <span className="swatch" style={{ background: x.color }} aria-hidden />
            {x.label}
          </button>
        ))}
        {data && <span style={{ marginLeft: 'auto', alignSelf: 'center' }}><SourceTag source={data.source} /></span>}
      </div>
      {(data?.note || (calc && calc.late.length > 0)) && (
        <p className="muted" style={{ fontSize: 12.5, margin: '6px 2px 0' }}>
          {[data?.note, ...(calc?.late ?? [])].filter(Boolean).join(' ')}
        </p>
      )}
    </section>
  );
}
