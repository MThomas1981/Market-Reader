import { Tabs } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTheme } from '../../lib/theme';

export default function TabsLayout() {
  const t = useTheme();
  const icon = (name: keyof typeof Ionicons.glyphMap) => ({ color, size }: { color: string; size: number }) => (
    <Ionicons name={name} color={color} size={size} />
  );
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: t.accent,
        tabBarInactiveTintColor: t.slate,
        tabBarStyle: { backgroundColor: t.paper, borderTopColor: t.rule },
        headerStyle: { backgroundColor: t.paper },
        headerTitleStyle: { color: t.ink, fontFamily: 'Georgia', fontSize: 20 },
        sceneStyle: { backgroundColor: t.fog },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Markets', tabBarIcon: icon('pulse') }} />
      <Tabs.Screen name="search" options={{ title: 'Search', tabBarIcon: icon('search') }} />
      <Tabs.Screen name="watchlist" options={{ title: 'Watchlist', tabBarIcon: icon('star') }} />
      <Tabs.Screen name="ask" options={{ title: 'Ask', tabBarIcon: icon('chatbubble-ellipses') }} />
      <Tabs.Screen name="account" options={{ title: 'Account', tabBarIcon: icon('person-circle') }} />
    </Tabs>
  );
}
