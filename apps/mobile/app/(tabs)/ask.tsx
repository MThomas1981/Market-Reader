import { useRef, useState } from 'react';
import { KeyboardAvoidingView, Linking, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { api, API_URL, type Source } from '../../lib/api';
import { serif, useTheme } from '../../lib/theme';

interface Turn { role: 'user' | 'assistant'; content: string; sources?: Source[]; error?: boolean }

const SUGGESTIONS = ['What’s moving the market today?', 'How has bitcoin done this month?', 'Compare NVDA and AMD over the past year'];

export default function Ask() {
  const t = useTheme();
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const scroll = useRef<ScrollView>(null);

  const ask = async (text: string) => {
    const q = text.trim();
    if (!q || busy) return;
    const history = [...turns.filter((x) => !x.error), { role: 'user' as const, content: q }];
    setTurns((x) => [...x, { role: 'user', content: q }]);
    setDraft('');
    setBusy(true);
    try {
      const r = await api.ask(history.map(({ role, content }) => ({ role, content })));
      setTurns((x) => [...x, { role: 'assistant', content: r.answer, sources: r.sources }]);
    } catch (e) {
      setTurns((x) => [...x, { role: 'assistant', content: (e as Error).message, error: true }]);
    } finally {
      setBusy(false);
      setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 50);
    }
  };

  const openSource = (url: string) => Linking.openURL(url.startsWith('http') ? url : `${API_URL}${url}`);

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={90}>
      <ScrollView ref={scroll} contentContainerStyle={{ padding: 16, gap: 14 }}>
        {turns.length === 0 && (
          <>
            <Text style={{ color: t.slate }}>Ask about any stock, fund, coin or currency. Answers use Market Reader&rsquo;s data and list their sources.</Text>
            {SUGGESTIONS.map((s) => (
              <Pressable key={s} onPress={() => ask(s)} style={{ borderWidth: 1, borderColor: t.rule, backgroundColor: t.paper, borderRadius: 10, padding: 12 }}>
                <Text style={{ color: t.ink }}>{s}</Text>
              </Pressable>
            ))}
          </>
        )}
        {turns.map((m, i) =>
          m.role === 'user' ? (
            <View key={i} style={{ alignSelf: 'flex-end', maxWidth: '85%', backgroundColor: t.paper, borderRadius: 14, padding: 12 }}>
              <Text style={{ color: t.ink }}>{m.content}</Text>
            </View>
          ) : (
            <View key={i}>
              <Text style={m.error ? { color: t.down } : { fontFamily: serif, fontSize: 17, lineHeight: 25, color: t.ink }}>{m.content}</Text>
              {m.sources?.map((s) => (
                <Pressable key={s.id} onPress={() => openSource(s.url)}>
                  <Text style={{ color: t.accent, fontSize: 13, marginTop: 6 }} numberOfLines={1}>[{s.id}] {s.title}</Text>
                </Pressable>
              ))}
            </View>
          ),
        )}
        {busy && <Text style={{ color: t.slate }}>Researching…</Text>}
      </ScrollView>
      <View style={{ flexDirection: 'row', gap: 8, padding: 12, borderTopWidth: 1, borderTopColor: t.rule, backgroundColor: t.paper }}>
        <TextInput
          value={draft}
          onChangeText={setDraft}
          placeholder="Ask a question about the markets"
          placeholderTextColor={t.slate}
          style={{ flex: 1, minHeight: 40, maxHeight: 120, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: t.fog, color: t.ink }}
          multiline
          accessibilityLabel="Your question"
        />
        <Pressable onPress={() => ask(draft)} disabled={busy || !draft.trim()} style={{ backgroundColor: t.accent, opacity: busy || !draft.trim() ? 0.5 : 1, borderRadius: 10, paddingHorizontal: 16, justifyContent: 'center' }}>
          <Text style={{ color: '#fff', fontWeight: '600' }}>Ask</Text>
        </Pressable>
      </View>
      <Text style={{ fontSize: 11, color: t.slate, textAlign: 'center', paddingBottom: 6, backgroundColor: t.paper }}>Not financial advice.</Text>
    </KeyboardAvoidingView>
  );
}
