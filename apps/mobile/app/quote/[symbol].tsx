import { useCallback, useEffect, useState } from 'react';
import { Linking, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import {
  RANGES, formatChange, formatCompact, formatNumber, formatPercent, formatPrice, normalizeSymbol, timeAgo,
  type EarningsResult, type History, type Instrument, type NewsItem, type Profile, type Quote, type Range,
} from '@market-reader/core';
import { api, type Source } from '../../lib/api';
import { useWatchlist } from '../../lib/watchlist';
import { serif, useTheme } from '../../lib/theme';
import { LineChart } from '../../components/LineChart';
import { Card, ErrorNote, Loading, SourceNote } from '../../components/ui';
import { ForecastCard } from '../../components/ForecastCard';
import { AnalysisCard } from '../../components/AnalysisCard';

export default function QuoteScreen() {
  const t = useTheme();
  const { symbol: raw } = useLocalSearchParams<{ symbol: string }>();
  const symbol = normalizeSymbol(String(raw ?? ''));
  const { list, toggle, error: watchError } = useWatchlist();
  const [quote, setQuote] = useState<{ instrument: Instrument; quote: Quote } | null>(null);
  const [profile, setProfile] = useState<{ profile: Profile; earnings: EarningsResult[] } | null>(null);
  const [history, setHistory] = useState<History | null>(null);
  const [range, setRange] = useState<Range>('1M');
  const [news, setNews] = useState<NewsItem[]>([]);
  const [brief, setBrief] = useState<{ available: boolean; answer?: string; sources?: Source[]; error?: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      setQuote(await api.quote(symbol));
      setError(null);
    } catch (e) {
      setError((e as Error).message);
      return;
    }
    api.profile(symbol).then(setProfile).catch(() => {});
    api.news(symbol).then((r) => setNews(r.news.slice(0, 6))).catch(() => {});
    api.brief(symbol).then(setBrief).catch(() => setBrief(null));
    api.recordView(symbol);
  }, [symbol]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    setHistory(null);
    api.history(symbol, range).then(setHistory).catch(() => setHistory(null));
  }, [symbol, range]);

  if (error) return <ErrorNote message={error} onRetry={load} />;
  if (!quote) return <Loading />;

  const q = quote.quote;
  const inst = quote.instrument;
  const fx = inst.assetClass === 'forex';
  const watching = list?.includes(symbol) ?? false;
  const s = profile?.profile.stats;
  const rangePct = history && history.candles.length > 1
    ? ((history.candles[history.candles.length - 1].close - (history.candles[0].open || history.candles[0].close)) / (history.candles[0].open || history.candles[0].close)) * 100
    : null;
  const stats: [string, string][] = [
    ['Previous close', formatPrice(q.previousClose, q.currency, { forex: fx })],
    ['Day range', q.low != null && q.high != null ? `${formatNumber(q.low)} – ${formatNumber(q.high)}` : '—'],
    ['52-week range', s?.week52Low != null && s?.week52High != null ? `${formatNumber(s.week52Low)} – ${formatNumber(s.week52High)}` : '—'],
    ...(fx ? [] : [['Market cap', s?.marketCap ? formatCompact(s.marketCap) : '—'] as [string, string]]),
    ...(inst.assetClass === 'stock' ? [['P/E ratio', s?.peRatio != null ? formatNumber(s.peRatio, 2) : '—'] as [string, string], ['Dividend yield', s?.dividendYield != null ? formatPercent(s.dividendYield, false) : '—'] as [string, string]] : []),
  ];

  return (
    <ScrollView
      contentContainerStyle={{ padding: 16 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
    >
      <Stack.Screen
        options={{
          title: symbol,
          headerRight: () => (
            <Pressable onPress={() => toggle(symbol)} accessibilityLabel={watching ? 'Remove from watchlist' : 'Add to watchlist'} hitSlop={10}>
              <Ionicons name={watching ? 'star' : 'star-outline'} size={22} color={t.accent} />
            </Pressable>
          ),
        }}
      />
      <Text style={{ color: t.slate, fontSize: 13 }}>{inst.exchange}</Text>
      <Text style={{ fontFamily: serif, fontSize: 26, fontWeight: '600', color: t.ink }}>{profile?.profile.name || inst.name}</Text>
      <Text style={{ fontSize: 40, fontWeight: '600', color: t.ink, marginTop: 6, fontVariant: ['tabular-nums'] }}>{formatPrice(q.price, q.currency, { forex: fx })}</Text>
      <Text style={{ fontSize: 17, fontWeight: '600', color: q.change >= 0 ? t.up : t.down }}>
        {formatChange(q.change, fx ? 4 : Math.abs(q.price) < 1 ? undefined : 2)} ({formatPercent(q.changePercent)}) {inst.assetClass === 'crypto' ? 'past 24 hours' : 'today'}
      </Text>
      <View style={{ marginTop: 4, marginBottom: 16 }}><SourceNote source={q.source} /></View>
      {watchError && <Text style={{ color: t.down, marginBottom: 12 }}>{watchError}</Text>}

      {brief?.available && (
        <View style={{ borderLeftWidth: 3, borderLeftColor: t.accent, backgroundColor: t.paper, padding: 14, borderRadius: 8, marginBottom: 20 }}>
          <Text style={{ color: t.accent, fontWeight: '600', fontSize: 13, marginBottom: 4 }}>Today, in brief</Text>
          <Text style={{ fontFamily: serif, fontSize: 17, lineHeight: 25, color: t.ink }}>
            {brief.error ?? (brief.answer ?? '').replace(/\s*\[S\d+\]/g, '')}
          </Text>
        </View>
      )}

      <Card>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4, padding: 8 }}>
          {RANGES.map((r) => (
            <Pressable key={r} onPress={() => setRange(r)} style={{ paddingHorizontal: 9, paddingVertical: 5, borderRadius: 6, backgroundColor: r === range ? t.accentTint : 'transparent' }}>
              <Text style={{ fontSize: 13, fontWeight: '600', color: r === range ? t.accent : t.slate }}>{r}</Text>
            </Pressable>
          ))}
        </View>
        {rangePct !== null && (
          <Text style={{ paddingHorizontal: 12, fontSize: 13, fontWeight: '600', color: rangePct >= 0 ? t.up : t.down }}>{formatPercent(rangePct)} over {range}</Text>
        )}
        <View style={{ padding: 8 }}>{history ? <LineChart candles={history.candles} /> : <Loading label="Loading chart…" />}</View>
      </Card>

      <ForecastCard symbol={symbol} currency={q.currency} forex={fx} />
      <AnalysisCard symbol={symbol} />

      <Card title="Key numbers">
        {stats.map(([k, v], i) => (
          <View key={k} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 10, borderTopWidth: i ? 1 : 0, borderTopColor: t.ruleSoft }}>
            <Text style={{ color: t.slate }}>{k}</Text>
            <Text style={{ color: t.ink, fontWeight: '600', fontVariant: ['tabular-nums'] }}>{v}</Text>
          </View>
        ))}
      </Card>

      {news.length > 0 && (
        <Card title={`News about ${symbol}`}>
          {news.map((n, i) => (
            <Pressable key={n.id} onPress={() => Linking.openURL(n.url)} style={{ padding: 14, borderTopWidth: i ? 1 : 0, borderTopColor: t.ruleSoft }}>
              <Text style={{ fontFamily: serif, fontSize: 16, lineHeight: 21, color: t.ink }}>{n.headline}</Text>
              <Text style={{ fontSize: 12, color: t.slate, marginTop: 4 }}>{n.source}, {timeAgo(n.publishedAt)}</Text>
            </Pressable>
          ))}
        </Card>
      )}
      <Text style={{ fontSize: 12, color: t.slate, textAlign: 'center' }}>For research only. Not financial advice.</Text>
    </ScrollView>
  );
}
