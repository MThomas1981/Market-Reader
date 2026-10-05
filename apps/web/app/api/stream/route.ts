import { instrumentFor, normalizeSymbol } from '@market-reader/core';
import { tradeHub, type Trade } from '@/lib/realtime';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// Vercel ends a function after this many seconds; the browser's EventSource reconnects by itself.
export const maxDuration = 60;

const streamable = (symbol: string) => {
  const i = instrumentFor(symbol);
  return i.country === 'US' && (i.assetClass === 'stock' || i.assetClass === 'etf' || i.assetClass === 'index');
};

/**
 * Real-time trades as Server-Sent Events: /api/stream?symbols=AAPL,MSFT
 *   event: ready   {symbols, source}
 *   event: trades  [{s, p, t, v}, ...]   at most 4 times a second, newest trade per symbol
 *   event: status  {state, error}
 * Returns 204 when no Finnhub key is set; the app then keeps refreshing prices every few seconds instead.
 */
export async function GET(req: Request) {
  const hub = tradeHub();
  const raw = new URL(req.url).searchParams.get('symbols') ?? '';
  const symbols = [...new Set(raw.split(',').filter(Boolean).map(normalizeSymbol))].filter(streamable).slice(0, 25);
  if (!hub || symbols.length === 0) return new Response(null, { status: 204 });

  const enc = new TextEncoder();
  let close = () => {};
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      let open = true;
      const write = (chunk: string) => {
        if (!open) return;
        try {
          controller.enqueue(enc.encode(chunk));
        } catch {
          close();
        }
      };
      const send = (event: string, data: unknown) => write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

      write('retry: 2000\n\n');
      send('ready', { symbols, source: 'Finnhub real-time trades' });
      const known = symbols.map((s) => hub.latest.get(s)).filter((t): t is Trade => !!t);
      if (known.length) send('trades', known);

      const pending = new Map<string, Trade>();
      const unsubscribe = hub.subscribe(symbols, (t) => pending.set(t.s, t));
      let lastState = '';
      const flush = setInterval(() => {
        if (pending.size) {
          send('trades', [...pending.values()]);
          pending.clear();
        }
        const state = `${hub.state}|${hub.lastError ?? ''}`;
        if (state !== lastState) {
          lastState = state;
          send('status', { state: hub.state, error: hub.lastError });
        }
      }, 250);
      const heartbeat = setInterval(() => write(': keep-alive\n\n'), 15_000);
      const stop = setTimeout(() => close(), (maxDuration - 5) * 1000);

      close = () => {
        if (!open) return;
        open = false;
        clearInterval(flush);
        clearInterval(heartbeat);
        clearTimeout(stop);
        unsubscribe();
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      };
      req.signal.addEventListener('abort', () => close());
    },
    cancel() {
      close();
    },
  });

  return new Response(body, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-store, no-transform',
      'Content-Encoding': 'none',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
