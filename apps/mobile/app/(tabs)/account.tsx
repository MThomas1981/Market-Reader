import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { Link } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { PLAN_FEATURES, PLANS, type Plan } from '@market-reader/core';
import { API_URL, api } from '../../lib/api';
import { accountsEnabled, supabase, useSession } from '../../lib/supabase';
import { resetWatchlistSync } from '../../lib/watchlist';
import { useTheme } from '../../lib/theme';
import { Card } from '../../components/ui';

export default function Account() {
  const t = useTheme();
  const { session, ready } = useSession();
  const [plan, setPlan] = useState<Plan>('anonymous');

  const loadPlan = useCallback(() => {
    api.me().then((m) => setPlan(m.plan)).catch(() => {});
  }, []);
  useEffect(() => {
    loadPlan();
    resetWatchlistSync();
  }, [session, loadPlan]);

  if (!ready) return null;
  const input = { height: 44, borderRadius: 10, paddingHorizontal: 12, backgroundColor: t.paper, borderWidth: 1, borderColor: t.rule, color: t.ink, fontSize: 16 } as const;

  return (
    <ScrollView contentContainerStyle={{ padding: 16 }}>
      {!accountsEnabled ? (
        <Card><Text style={{ padding: 16, color: t.slate }}>Accounts aren&rsquo;t set up in this build yet. Add EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY to apps/mobile/.env.</Text></Card>
      ) : session ? (
        <Card title="Your account">
          <Row label="Email" value={session.user.email ?? ''} />
          <Row label="Plan" value={plan === 'pro' ? 'Pro' : 'Free'} />
          <View style={{ padding: 14, gap: 10, borderTopWidth: 1, borderTopColor: t.ruleSoft }}>
            <Link href="/history" asChild>
              <Pressable><Text style={{ color: t.accent, fontWeight: '600' }}>Your stock history</Text></Pressable>
            </Link>
            <Pressable onPress={() => WebBrowser.openBrowserAsync(`${API_URL}/${plan === 'pro' ? 'account' : 'pricing'}`).then(loadPlan)}>
              <Text style={{ color: t.accent, fontWeight: '600' }}>{plan === 'pro' ? 'Manage your plan on the web' : 'Learn about Pro on the web'}</Text>
            </Pressable>
            <Pressable onPress={() => supabase?.auth.signOut()}>
              <Text style={{ color: t.down, fontWeight: '600' }}>Sign out</Text>
            </Pressable>
          </View>
        </Card>
      ) : (
        <SignIn input={input} />
      )}

      <Card title="Plans">
        {PLAN_FEATURES.map((f, i) => (
          <View key={f.feature} style={{ padding: 12, borderTopWidth: i ? 1 : 0, borderTopColor: t.ruleSoft, gap: 2 }}>
            <Text style={{ color: t.ink, fontWeight: '600' }}>{f.feature}</Text>
            <Text style={{ color: t.slate, fontSize: 13 }}>Free: {f.free}   Pro: {f.pro}</Text>
          </View>
        ))}
      </Card>
      <Text style={{ fontSize: 12, color: t.slate, textAlign: 'center' }}>Pro is ${PLANS.pro.priceMonthlyUsd} a month.</Text>
    </ScrollView>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', padding: 14, borderTopWidth: label === 'Email' ? 0 : 1, borderTopColor: t.ruleSoft }}>
      <Text style={{ color: t.slate }}>{label}</Text>
      <Text style={{ color: t.ink, fontWeight: '600' }}>{value}</Text>
    </View>
  );
}

/** Email sign-in with a 6-digit code (no links to tap on the phone). */
function SignIn({ input }: { input: object }) {
  const t = useTheme();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const send = async () => {
    setBusy(true);
    setError(null);
    const { error: err } = await supabase!.auth.signInWithOtp({ email: email.trim() });
    setBusy(false);
    if (err) setError(err.message);
    else setSent(true);
  };
  const verify = async () => {
    setBusy(true);
    setError(null);
    const { error: err } = await supabase!.auth.verifyOtp({ email: email.trim(), token: code.trim(), type: 'email' });
    setBusy(false);
    if (err) setError('That code didn’t work. Check it, or send a new one.');
  };

  return (
    <Card title="Sign in">
      <View style={{ padding: 14, gap: 10 }}>
        <Text style={{ color: t.slate }}>Sync your watchlist with the web and keep a history of the stocks you look at.</Text>
        <TextInput style={input} value={email} onChangeText={setEmail} placeholder="Email" placeholderTextColor={t.slate} autoCapitalize="none" keyboardType="email-address" autoComplete="email" editable={!sent} />
        {sent && (
          <TextInput style={input} value={code} onChangeText={setCode} placeholder="6-digit code from the email" placeholderTextColor={t.slate} keyboardType="number-pad" autoComplete="one-time-code" maxLength={6} />
        )}
        <Pressable onPress={sent ? verify : send} disabled={busy || !email.includes('@') || (sent && code.length < 6)} style={{ backgroundColor: t.accent, borderRadius: 10, padding: 12, alignItems: 'center', opacity: busy ? 0.6 : 1 }}>
          <Text style={{ color: '#fff', fontWeight: '600' }}>{busy ? 'One moment…' : sent ? 'Sign in' : 'Email me a code'}</Text>
        </Pressable>
        {sent && <Pressable onPress={() => { setSent(false); setCode(''); }}><Text style={{ color: t.accent }}>Use a different email</Text></Pressable>}
        {error && <Text style={{ color: t.down }}>{error}</Text>}
      </View>
    </Card>
  );
}
