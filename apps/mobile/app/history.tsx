import { useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { Link, Stack } from 'expo-router';
import { formatPrice, symbolToPath } from '@market-reader/core';
import { api, type HistoryItem } from '../lib/api';
import { useTheme } from '../lib/theme';
import { Card, ChangePill, ErrorNote, Loading } from '../components/ui';

export default function HistoryScreen() {
  const t = useTheme();
  const [items, setItems] = useState<HistoryItem[] | null>(null);
  const [plan, setPlan] = useState<string>('free');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.myHistory().then((r) => { setItems(r.items); setPlan(r.plan); }).catch((e: Error) => setError(e.message));
  }, []);

  return (
    <ScrollView contentContainerStyle={{ padding: 16 }}>
      <Stack.Screen options={{ title: 'Your stock history' }} />
      {error && <ErrorNote message={error} />}
      {!items && !error && <Loading />}
      {items && (
        <Card foot={plan !== 'pro' ? <Text style={{ fontSize: 12, color: t.slate }}>Free keeps your 10 most recent stocks. Pro keeps everything.</Text> : undefined}>
          {items.length === 0 && <Text style={{ padding: 16, color: t.slate }}>Nothing yet. Open any stock and it will appear here.</Text>}
          {items.map((it, i) => (
            <Link key={it.symbol} href={`/quote/${symbolToPath(it.symbol)}`} asChild>
              <Pressable style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderTopWidth: i ? 1 : 0, borderTopColor: t.ruleSoft }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: t.ink, fontWeight: '600' }}>{it.symbol}{it.saved ? ' ★' : ''}</Text>
                  <Text style={{ color: t.slate, fontSize: 12 }}>
                    First looked {new Date(it.firstSeenAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} at {formatPrice(it.firstPrice, it.currency)}
                  </Text>
                </View>
                <Text style={{ color: t.ink, fontVariant: ['tabular-nums'] }}>{formatPrice(it.price, it.currency)}</Text>
                {it.changeSinceFirstPct !== null && <ChangePill pct={it.changeSinceFirstPct} />}
              </Pressable>
            </Link>
          ))}
        </Card>
      )}
    </ScrollView>
  );
}
