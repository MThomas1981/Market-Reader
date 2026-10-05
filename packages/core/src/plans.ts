import type { Horizon } from './forecast';

/** What each plan includes. The server enforces these; the apps use them to show what's locked. */
export type Plan = 'anonymous' | 'free' | 'pro';

export interface PlanLimits {
  label: string;
  priceMonthlyUsd: number;
  forecastHorizons: Horizon[];
  forecastBacktest: boolean;
  deepAnalysis: boolean;
  aiQuestionsPerDay: number;
  aiWebSearch: boolean;
  watchlistSymbols: number;
  syncedWatchlist: boolean;
  /** How many past stock selections (views and saves) are kept */
  historyItems: number;
}

export const PLANS: Record<Plan, PlanLimits> = {
  anonymous: {
    label: 'Guest', priceMonthlyUsd: 0, forecastHorizons: ['1D', '1W'], forecastBacktest: false, deepAnalysis: false,
    aiQuestionsPerDay: 3, aiWebSearch: false, watchlistSymbols: 10, syncedWatchlist: false, historyItems: 0,
  },
  free: {
    label: 'Free', priceMonthlyUsd: 0, forecastHorizons: ['1D', '1W'], forecastBacktest: false, deepAnalysis: false,
    aiQuestionsPerDay: 5, aiWebSearch: false, watchlistSymbols: 10, syncedWatchlist: true, historyItems: 10,
  },
  pro: {
    label: 'Pro', priceMonthlyUsd: 20, forecastHorizons: ['1D', '1W', '1M', '3M', '6M'], forecastBacktest: true, deepAnalysis: true,
    aiQuestionsPerDay: 100, aiWebSearch: true, watchlistSymbols: 500, syncedWatchlist: true, historyItems: 5000,
  },
};

/** Plan comparison rows for pricing screens. */
export const PLAN_FEATURES: { feature: string; free: string; pro: string }[] = [
  { feature: 'Quotes, charts, indicators and news', free: 'Yes', pro: 'Yes' },
  { feature: 'Price range estimates', free: '1 day and 1 week', pro: '1 day to 6 months, with track record' },
  { feature: 'Deeper analysis: risk, drawdowns, beta vs. S&P 500', free: '—', pro: 'Yes' },
  { feature: 'Saved stock history, with performance since you looked', free: 'Last 10', pro: 'Everything, kept for good' },
  { feature: 'Watchlist synced across web and phone', free: 'Up to 10 symbols', pro: 'Up to 500 symbols' },
  { feature: 'AI assistant questions per day', free: '5', pro: '100, plus web search' },
];
