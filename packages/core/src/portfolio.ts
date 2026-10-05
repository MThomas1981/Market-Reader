/** Portfolio maths: turns a list of buy/sell/dividend transactions into holdings (average-cost method). */

export interface Transaction {
  id?: number | string;
  symbol: string;
  type: 'buy' | 'sell' | 'dividend';
  quantity: number;
  /** Price per unit for buys and sells; total amount received for dividends */
  price: number;
  fee?: number;
  tradedAt: string;
}

export interface Holding {
  symbol: string;
  quantity: number;
  /** Average cost per unit of the shares still held, fees included */
  averageCost: number;
  costBasis: number;
  realizedGain: number;
  dividends: number;
}

export interface HoldingValue extends Holding {
  price: number | null;
  marketValue: number | null;
  unrealizedGain: number | null;
  unrealizedGainPct: number | null;
  dayChange: number | null;
  weight: number | null;
}

const EPS = 1e-9;

export function computeHoldings(transactions: Transaction[]): Holding[] {
  const sorted = [...transactions].sort((a, b) => a.tradedAt.localeCompare(b.tradedAt));
  const book = new Map<string, Holding>();
  for (const t of sorted) {
    const h = book.get(t.symbol) ?? { symbol: t.symbol, quantity: 0, averageCost: 0, costBasis: 0, realizedGain: 0, dividends: 0 };
    const fee = t.fee ?? 0;
    if (t.type === 'buy') {
      h.costBasis += t.quantity * t.price + fee;
      h.quantity += t.quantity;
    } else if (t.type === 'sell') {
      const qty = Math.min(t.quantity, h.quantity);
      const avg = h.quantity > EPS ? h.costBasis / h.quantity : 0;
      h.realizedGain += qty * t.price - fee - qty * avg;
      h.costBasis -= qty * avg;
      h.quantity -= qty;
    } else {
      h.dividends += t.price * (t.quantity || 1) - fee;
    }
    if (h.quantity < EPS) {
      h.quantity = 0;
      h.costBasis = 0;
    }
    h.averageCost = h.quantity > EPS ? h.costBasis / h.quantity : 0;
    book.set(t.symbol, h);
  }
  return [...book.values()];
}

/** Value holdings at current prices. `quotes` maps symbol → { price, change } (change = today's change per unit). */
export function valueHoldings(holdings: Holding[], quotes: Map<string, { price: number; change: number }>) {
  const open = holdings.filter((h) => h.quantity > 0);
  const rows: HoldingValue[] = open.map((h) => {
    const q = quotes.get(h.symbol);
    const marketValue = q ? q.price * h.quantity : null;
    const unrealizedGain = marketValue !== null ? marketValue - h.costBasis : null;
    return {
      ...h,
      price: q?.price ?? null,
      marketValue,
      unrealizedGain,
      unrealizedGainPct: unrealizedGain !== null && h.costBasis > 0 ? (unrealizedGain / h.costBasis) * 100 : null,
      dayChange: q ? q.change * h.quantity : null,
      weight: null,
    };
  });
  const total = rows.reduce((a, r) => a + (r.marketValue ?? 0), 0);
  for (const r of rows) r.weight = total > 0 && r.marketValue !== null ? (r.marketValue / total) * 100 : null;
  const cost = rows.reduce((a, r) => a + r.costBasis, 0);
  const dayChange = rows.reduce((a, r) => a + (r.dayChange ?? 0), 0);
  return {
    rows: rows.sort((a, b) => (b.marketValue ?? 0) - (a.marketValue ?? 0)),
    totalValue: total,
    totalCost: cost,
    totalGain: total - cost,
    totalGainPct: cost > 0 ? ((total - cost) / cost) * 100 : null,
    dayChange,
    dayChangePct: total - dayChange > 0 ? (dayChange / (total - dayChange)) * 100 : null,
    realizedGain: holdings.reduce((a, h) => a + h.realizedGain, 0),
    dividends: holdings.reduce((a, h) => a + h.dividends, 0),
  };
}
