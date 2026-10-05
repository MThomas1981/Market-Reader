import { useCallback, useEffect, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, Text } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import type { Instrument, Quote } from '@market-reader/core';
import { api } from '../../lib/api';
import { useWatchlist } from '../../lib/watchlist';
import { useTheme } from '../../lib/theme';
import { Card, ErrorNote, Loading, QuoteRow } from '../../components/ui';

export default function Watchlist() {
  const t = useTheme();
  const { list, remove, error: saveError } = useWatchlist();
  const [quotes, setQuotes] = useState<Map<string, Quote>>(new Map());
  const [insts, setInsts] = useState<Map<string, Instrument>>(new Map());
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!list || list.length === 0) return;
    try {
      const r = await api.quotes(list);
      setQuotes(new Map(r.quotes.map((q) => [q.symbol, q])));
      setInsts(new Map(r.instruments.map((i) => [i.symbol, i])));
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [list]);

  useEffect(() => {
    load();
    const timer = setInterval(load, 30_000);
    return () => clearInterval(timer);
  }, [load]);

  if (!list) return <Loading />;

  return (
    <ScrollView
      contentContainerStyle={{ padding: 16 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
    >
      {error && <ErrorNote message={error} onRetry={load} />}
      {saveError && <Text style={{ color: t.down, marginBottom: 12 }}>{saveError}</Text>}
      <Card foot={<Text style={{ fontSize: 12, color: t.slate }}>Refreshes every 30 seconds. Signed in, it syncs with the web app.</Text>}>
        {list.length === 0 && (
          <Text style={{ padding: 16, color: t.slate }}>Your watchlist is empty. Open any quote and tap the star to add it.</Text>
        )}
        {list.map((s, i) => (
          <QuoteRow
            key={s}
            quote={quotes.get(s)}
            instrument={insts.get(s) ?? { symbol: s, name: '', assetClass: 'stock', exchange: '', currency: 'USD', country: '' }}
            first={i === 0}
            right={
              <Pressable onPress={() => remove(s)} accessibilityLabel={`Remove ${s}`} hitSlop={10}>
                <Ionicons name="close" size={18} color={t.slate} />
              </Pressable>
            }
          />
        ))}
      </Card>
    </ScrollView>
  );
}
