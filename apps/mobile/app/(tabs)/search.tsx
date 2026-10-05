import { useEffect, useState } from 'react';
import { FlatList, Pressable, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { normalizeSymbol, symbolToPath, type SearchResult } from '@market-reader/core';
import { api } from '../../lib/api';
import { useTheme } from '../../lib/theme';

const KIND: Record<string, string> = { stock: 'Stock', etf: 'ETF', crypto: 'Crypto', forex: 'Currency', index: 'Index' };

export default function Search() {
  const t = useTheme();
  const [q, setQ] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!q.trim()) {
      setResults([]);
      return;
    }
    let live = true;
    const timer = setTimeout(() => {
      api.search(q)
        .then((r) => live && (setResults(r.results), setError(null)))
        .catch((e: Error) => live && setError(e.message));
    }, 200);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [q]);

  const open = (symbol: string) => router.push(`/quote/${symbolToPath(symbol)}`);

  return (
    <View style={{ flex: 1, padding: 16 }}>
      <TextInput
        value={q}
        onChangeText={setQ}
        placeholder="Company, ticker, coin or currency"
        placeholderTextColor={t.slate}
        autoCapitalize="characters"
        autoCorrect={false}
        returnKeyType="search"
        onSubmitEditing={() => q.trim() && open(results[0]?.symbol ?? normalizeSymbol(q))}
        style={{ height: 44, borderRadius: 22, paddingHorizontal: 16, backgroundColor: t.paper, borderWidth: 1, borderColor: t.rule, color: t.ink, fontSize: 16 }}
        accessibilityLabel="Search"
      />
      {error && <Text style={{ color: t.down, marginTop: 12 }}>{error}</Text>}
      <FlatList
        style={{ marginTop: 12 }}
        data={results}
        keyExtractor={(r) => r.symbol}
        keyboardShouldPersistTaps="handled"
        renderItem={({ item, index }) => (
          <Pressable onPress={() => open(item.symbol)} style={({ pressed }) => ({ flexDirection: 'row', gap: 12, paddingVertical: 12, paddingHorizontal: 4, borderTopWidth: index ? 1 : 0, borderTopColor: t.ruleSoft, backgroundColor: pressed ? t.accentTint : 'transparent' })}>
            <Text style={{ width: 90, fontWeight: '600', color: t.ink }}>{item.symbol}</Text>
            <Text style={{ flex: 1, color: t.ink }} numberOfLines={1}>{item.name}</Text>
            <Text style={{ color: t.slate, fontSize: 12 }}>{KIND[item.assetClass] ?? item.assetClass}</Text>
          </Pressable>
        )}
        ListEmptyComponent={q ? null : <Text style={{ color: t.slate, marginTop: 8 }}>Try AAPL, Tesla, bitcoin or EURUSD.</Text>}
      />
    </View>
  );
}
