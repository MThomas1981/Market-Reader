import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { formatNumber, formatPercent, type RiskReturn } from '@market-reader/core';
import { ApiError, api } from '../lib/api';
import { useTheme } from '../lib/theme';
import { Card } from './ui';

/** Pro: a year of risk and return. Hidden for other plans (the forecast card already shows what Pro adds). */
export function AnalysisCard({ symbol }: { symbol: string }) {
  const t = useTheme();
  const [s, setS] = useState<RiskReturn | null>(null);
  const [hasBenchmark, setHasBenchmark] = useState(false);

  useEffect(() => {
    setS(null);
    api.analysis(symbol)
      .then((r) => { setS(r.stats); setHasBenchmark(!!r.benchmark); })
      .catch((e) => { if (!(e instanceof ApiError && e.status === 402)) setS(null); });
  }, [symbol]);

  if (!s) return null;
  const rows: [string, string][] = [
    ['Return, past year', formatPercent(s.totalReturnPct)],
    ...(hasBenchmark ? [['Vs. S&P 500', formatPercent(s.relativeReturnPct)] as [string, string]] : []),
    ['Volatility', formatPercent(s.annualVolatilityPct, false)],
    ['Deepest drop', formatPercent(s.maxDrawdownPct)],
    ['Best / worst day', `${formatPercent(s.bestDayPct)} / ${formatPercent(s.worstDayPct)}`],
    ...(s.beta !== null ? [['Beta vs. S&P 500', formatNumber(s.beta, 2)] as [string, string]] : []),
    ['Sharpe ratio', s.sharpe === null ? '—' : formatNumber(s.sharpe, 2)],
    ['RSI (14 day)', s.rsi14 === null ? '—' : formatNumber(s.rsi14, 0)],
  ];
  return (
    <Card title="Deeper analysis">
      {rows.map(([k, v], i) => (
        <View key={k} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 10, borderTopWidth: i ? 1 : 0, borderTopColor: t.ruleSoft }}>
          <Text style={{ color: t.slate }}>{k}</Text>
          <Text style={{ color: t.ink, fontWeight: '600', fontVariant: ['tabular-nums'] }}>{v}</Text>
        </View>
      ))}
    </Card>
  );
}
