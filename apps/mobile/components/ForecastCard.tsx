import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { formatPercent, formatPrice, type Horizon } from '@market-reader/core';
import { API_URL, api, type ForecastResponse } from '../lib/api';
import { useTheme } from '../lib/theme';
import { Card } from './ui';

const LABEL: Record<Horizon, string> = { '1D': '1 day', '1W': '1 week', '1M': '1 month', '3M': '3 months', '6M': '6 months' };

/** Price-range estimates as a ladder: thin bar 80% range, thick bar 50% range, dot middle estimate. */
export function ForecastCard({ symbol, currency, forex }: { symbol: string; currency: string; forex: boolean }) {
  const t = useTheme();
  const [data, setData] = useState<ForecastResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setData(null);
    api.forecast(symbol).then(setData).catch((e: Error) => setError(e.message));
  }, [symbol]);

  const price = (v: number) => formatPrice(v, currency, { forex });
  if (error) return <Card title="Where the price could be"><Text style={{ padding: 14, color: t.slate }}>{error}</Text></Card>;
  if (!data) return null;

  const lo = Math.min(data.lastPrice, ...data.points.map((p) => p.wideLow));
  const hi = Math.max(data.lastPrice, ...data.points.map((p) => p.wideHigh));
  const pct = (v: number) => `${((v - lo) / (hi - lo || 1)) * 100}%` as const;

  return (
    <Card
      title="Where the price could be"
      foot={
        <Text style={{ fontSize: 12, color: t.slate }}>
          Statistical ranges from a year of price swings ({formatPercent(data.annualVolatility * 100, false)} yearly volatility), not predictions. Not financial advice.
        </Text>
      }
    >
      {data.cagr && (
        <View style={{ padding: 12, flexDirection: 'row', gap: 12, borderBottomWidth: 1, borderBottomColor: t.ruleSoft }}>
          <View
            style={{
              width: 44, height: 44, borderRadius: 8, alignItems: 'center', justifyContent: 'center', borderWidth: 1,
              backgroundColor: !data.cagr.grade ? t.fog : 'AB'.includes(data.cagr.grade) ? t.upTint : data.cagr.grade === 'C' ? t.fog : t.downTint,
              borderColor: !data.cagr.grade ? t.rule : 'AB'.includes(data.cagr.grade) ? t.up : data.cagr.grade === 'C' ? t.rule : t.down,
            }}
          >
            <Text style={{ fontSize: 22, fontWeight: '700', color: !data.cagr.grade ? t.slate : 'AB'.includes(data.cagr.grade) ? t.up : data.cagr.grade === 'C' ? t.ink : t.down }}>
              {data.cagr.grade ?? '–'}
            </Text>
          </View>
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={{ color: t.ink, fontWeight: '600' }}>CAGR rating{data.cagr.grade ? `: ${data.cagr.label}` : ''}</Text>
            <Text style={{ color: t.slate, fontSize: 13 }}>{data.cagr.summary}</Text>
            <Text style={{ color: t.slate, fontSize: 12 }}>
              {data.cagr.periods.map((p) => `${p.years}y ${p.cagrPct === null ? '—' : `${p.cagrPct >= 0 ? '+' : '−'}${Math.abs(p.cagrPct).toFixed(1)}%`}`).join('  ·  ')}
            </Text>
            {data.trend && data.trend.longRunWeight > 0 && (
              <Text style={{ color: t.slate, fontSize: 12 }}>
                Projected trend {data.trend.projectedAnnualPct.toFixed(1)}% a year, {Math.round(data.trend.longRunWeight * 100)}% based on the long-run CAGR.
              </Text>
            )}
          </View>
        </View>
      )}
      {data.points.map((p, i) => (
        <View key={p.horizon} style={{ padding: 12, borderTopWidth: i ? 1 : 0, borderTopColor: t.ruleSoft, gap: 6 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text style={{ color: t.ink, fontWeight: '600' }}>{LABEL[p.horizon]}</Text>
            <Text style={{ color: t.slate, fontSize: 13 }}>{price(p.likelyLow)} – {price(p.likelyHigh)}, {Math.round(p.probUp * 100)}% chance higher</Text>
          </View>
          <View style={{ height: 16, justifyContent: 'center' }}>
            <View style={{ position: 'absolute', left: pct(data.lastPrice), top: -2, bottom: -2, borderLeftWidth: 1, borderStyle: 'dashed', borderColor: t.slate }} />
            <View style={{ position: 'absolute', left: pct(p.wideLow), width: `${((p.wideHigh - p.wideLow) / (hi - lo || 1)) * 100}%`, height: 4, borderRadius: 2, backgroundColor: t.accent, opacity: 0.3 }} />
            <View style={{ position: 'absolute', left: pct(p.likelyLow), width: `${((p.likelyHigh - p.likelyLow) / (hi - lo || 1)) * 100}%`, height: 10, borderRadius: 5, backgroundColor: t.accent, opacity: 0.6 }} />
            <View style={{ position: 'absolute', left: pct(p.median), marginLeft: -6, width: 12, height: 12, borderRadius: 6, borderWidth: 3, borderColor: t.accent, backgroundColor: t.paper }} />
          </View>
        </View>
      ))}
      {data.accuracy && data.accuracy.length > 0 && (
        <Text style={{ padding: 12, borderTopWidth: 1, borderTopColor: t.ruleSoft, color: t.ink, fontSize: 13 }}>
          Track record: real prices ended inside the wide range{' '}
          {data.accuracy.map((a) => `${Math.round(a.wideHitRate * 100)}% (${LABEL[a.horizon]})`).join(', ')}. About 80% is on target.
        </Text>
      )}
      {data.locked.length > 0 && (
        <Pressable onPress={() => WebBrowser.openBrowserAsync(`${API_URL}/pricing`)} style={{ padding: 12, borderTopWidth: 1, borderTopColor: t.ruleSoft, backgroundColor: t.accentTint }}>
          <Text style={{ color: t.accent, fontWeight: '600' }}>
            {data.locked.map((h) => LABEL[h]).join(', ')} estimates are part of Pro. Learn more
          </Text>
        </Pressable>
      )}
    </Card>
  );
}
