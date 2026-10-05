import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useTheme } from '../lib/theme';

export default function RootLayout() {
  const t = useTheme();
  return (
    <>
      <StatusBar style="auto" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: t.paper },
          headerTintColor: t.accent,
          headerTitleStyle: { color: t.ink },
          contentStyle: { backgroundColor: t.fog },
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="quote/[symbol]" options={{ title: '' }} />
        <Stack.Screen name="history" options={{ title: 'Your stock history' }} />
      </Stack>
    </>
  );
}
