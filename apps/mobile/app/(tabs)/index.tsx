import { useCallback, useEffect, useState } from 'react';
import { Linking, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { Link } from 'expo-router';
import { INDEX_PROXIES, direction, formatPercent, formatPrice, instrumentFor, symbolToPath, timeAgo, type MarketOverview, type NewsItem } from '@market-reader/core';
import { api } from '../../lib/api';
import { serif, useTheme } from '../../lib/theme';
import { Card, ErrorNote, Loading, QuoteRow, SourceNote } from '../../components/ui';

export default function Markets() {
  const t = useTheme();
  const [data, setData] = useState<MarketOverview | null>(null);
  const [news, setNews] = useState<NewsItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const [o, n] = await Promise.all([api.overview(), api.news().catch(() => ({ news: [] as NewsItem[] }))]);
      setData(o);
      setNews(n.news.slice(0, 8));
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const refresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  if (!data && error) return <ErrorNote message={error} onRetry={load} />;
  if (!data) return <Loading label="Loading markets…" />;

  const quoteList = (title: string, quotes: MarketOverview['gainers'], foot?: string) => (
    <Card title={title} foot={foot ? <Text style={{ fontSize: 12, color: t.slate }}>{foot}</Text> : undefined}>
      {quotes.map((q, i) => <QuoteRow key={q.symbol} quote={q} instrument={instrumentFor(q.symbol)} first={i === 0} />)}
      {quotes.length === 0 && <Text style={{ padding: 14, color: t.slate }}>Nothing to show right now.</Text>}
    </Card>
  );

  return (
    <ScrollView contentContainerStyle={{ padding: 16 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 }}>
        <Text style={{ color: t.slate, fontSize: 13 }}>Updated {timeAgo(data.updatedAt)}</Text>
        <SourceNote source={data.indexes[0]?.source} />
      </View>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', backgroundColor: t.paper, borderColor: t.rule, borderWidth: 1, borderRadius: 10, marginBottom: 20 }}>
        {data.indexes.map((q, i) => (
          <Link key={q.symbol} href={`/quote/${symbolToPath(q.symbol)}`} asChild>
            <Pressable style={{ width: '50%', padding: 14, borderLeftWidth: i % 2 ? 1 : 0, borderTopWidth: i > 1 ? 1 : 0, borderColor: t.ruleSoft }}>
              <Text style={{ fontWeight: '600', color: t.ink }}>{INDEX_PROXIES.find((p) => p.symbol === q.symbol)?.name ?? q.symbol}</Text>
              <Text style={{ fontSize: 12, color: t.slate }}>Tracked by {q.symbol}</Text>
              <Text style={{ fontSize: 20, fontWeight: '600', color: t.ink, marginTop: 4, fontVariant: ['tabular-nums'] }}>{formatPrice(q.price, q.currency)}</Text>
              <Text style={{ color: direction(q.changePercent) === 'up' ? t.up : t.down, fontWeight: '500' }}>{formatPercent(q.changePercent)}</Text>
            </Pressable>
          </Link>
        ))}
      </View>

      {quoteList('Biggest gainers', data.gainers)}
      {quoteList('Biggest losers', data.losers)}
      {quoteList('Crypto', data.crypto, '24-hour change')}
      {quoteList('Currencies', data.forex, 'Daily reference rates')}

      <Card title="Market news">
        {news.length === 0 ? (
          <Text style={{ padding: 14, color: t.slate }}>News appears here once the server has a Finnhub key.</Text>
        ) : (
          news.map((n, i) => (
            <Pressable key={n.id} onPress={() => Linking.openURL(n.url)} style={{ padding: 14, borderTopWidth: i ? 1 : 0, borderTopColor: t.ruleSoft }}>
              <Text style={{ fontFamily: serif, fontSize: 17, lineHeight: 22, color: t.ink }}>{n.headline}</Text>
              <Text style={{ fontSize: 12, color: t.slate, marginTop: 4 }}>{n.source}, {timeAgo(n.publishedAt)}</Text>
            </Pressable>
          ))
        )}
      </Card>
      <Text style={{ fontSize: 12, color: t.slate, textAlign: 'center' }}>For research only. Not financial advice.</Text>
    </ScrollView>
  );
}
