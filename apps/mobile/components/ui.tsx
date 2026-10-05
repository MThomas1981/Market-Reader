import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Link } from 'expo-router';
import { DEMO_SOURCE, formatPercent, formatPrice, symbolToPath, type Instrument, type Quote } from '@market-reader/core';
import { useTheme } from '../lib/theme';

export function Card({ title, children, foot }: { title?: string; children: ReactNode; foot?: ReactNode }) {
  const t = useTheme();
  return (
    <View style={{ marginBottom: 20 }}>
      {title && <Text style={[styles.cardTitle, { color: t.ink }]}>{title}</Text>}
      <View style={[styles.card, { backgroundColor: t.paper, borderColor: t.rule }]}>{children}</View>
      {foot && <View style={{ marginTop: 6 }}>{foot}</View>}
    </View>
  );
}

export function ChangePill({ pct }: { pct: number }) {
  const t = useTheme();
  const up = pct > 0;
  const down = pct < 0;
  return (
    <View style={[styles.pill, { backgroundColor: up ? t.upTint : down ? t.downTint : t.fog }]}>
      <Text style={[styles.pillText, { color: up ? t.up : down ? t.down : t.slate }]}>{formatPercent(pct)}</Text>
    </View>
  );
}

export function QuoteRow({ quote, instrument, first, right }: { quote?: Quote; instrument?: Instrument; first?: boolean; right?: ReactNode }) {
  const t = useTheme();
  const symbol = quote?.symbol ?? instrument?.symbol ?? '';
  const fx = instrument?.assetClass === 'forex';
  return (
    <Link href={`/quote/${symbolToPath(symbol)}`} asChild>
      <Pressable style={({ pressed }) => [styles.row, { borderTopColor: t.ruleSoft, borderTopWidth: first ? 0 : 1, backgroundColor: pressed ? t.fog : 'transparent' }]}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[styles.sym, { color: t.ink }]}>{symbol}</Text>
          <Text style={{ color: t.slate, fontSize: 13 }} numberOfLines={1}>{instrument?.name ?? ''}</Text>
        </View>
        <Text style={[styles.price, { color: t.ink }]}>{quote ? formatPrice(quote.price, quote.currency, { forex: fx }) : '…'}</Text>
        {quote ? <ChangePill pct={quote.changePercent} /> : <View style={{ width: 80 }} />}
        {right}
      </Pressable>
    </Link>
  );
}

export function SourceNote({ source }: { source?: string }) {
  const t = useTheme();
  if (!source) return null;
  const demo = source === DEMO_SOURCE;
  return (
    <Text style={{ fontSize: 12, color: demo ? t.down : t.slate, fontWeight: demo ? '600' : '400' }}>
      {demo ? '● Demo data, not real prices' : `● ${source}`}
    </Text>
  );
}

export function Loading({ label = 'Loading…' }: { label?: string }) {
  const t = useTheme();
  return (
    <View style={{ padding: 32, alignItems: 'center', gap: 8 }}>
      <ActivityIndicator color={t.accent} />
      <Text style={{ color: t.slate }}>{label}</Text>
    </View>
  );
}

export function ErrorNote({ message, onRetry }: { message: string; onRetry?: () => void }) {
  const t = useTheme();
  return (
    <View style={{ padding: 20, gap: 10 }}>
      <Text style={{ color: t.down }}>{message}</Text>
      {onRetry && (
        <Pressable onPress={onRetry} style={[styles.btn, { borderColor: t.rule }]}>
          <Text style={{ color: t.accent, fontWeight: '600' }}>Try again</Text>
        </Pressable>
      )}
    </View>
  );
}

export const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 10, overflow: 'hidden' },
  cardTitle: { fontSize: 15, fontWeight: '600', marginBottom: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 11 },
  sym: { fontWeight: '600', fontSize: 15 },
  price: { fontVariant: ['tabular-nums'], fontSize: 15 },
  pill: { minWidth: 80, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, alignItems: 'flex-end' },
  pillText: { fontWeight: '600', fontSize: 13, fontVariant: ['tabular-nums'] },
  btn: { alignSelf: 'flex-start', borderWidth: 1, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8 },
});
