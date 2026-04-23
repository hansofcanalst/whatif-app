import { Tabs } from 'expo-router';
import { Text } from 'react-native';
import { colors } from '@/constants/theme';

// Tab-bar glyphs — emoji rendered through Text so Expo Router's default
// icon API keeps working. `focused` dials the opacity, and the active
// tint is set on the label via `tabBarActiveTintColor` below.
function icon(emoji: string) {
  return ({ focused }: { focused: boolean }) => (
    <Text style={{ fontSize: 20, opacity: focused ? 1 : 0.55 }}>{emoji}</Text>
  );
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        // FRAME tab bar — sits on surface-700 with a subtle top border so
        // it reads as chrome rather than part of the content. Labels pick
        // up the FRAME accent when active, muted when idle.
        tabBarStyle: {
          backgroundColor: colors.bgElevated,
          borderTopColor: colors.border,
          borderTopWidth: 1,
          height: 64,
          paddingBottom: 8,
          paddingTop: 8,
        },
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.textSecondary,
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '700',
          letterSpacing: 0.8,
          textTransform: 'uppercase',
        },
      }}
    >
      <Tabs.Screen name="home" options={{ title: 'Home', tabBarIcon: icon('◆') }} />
      <Tabs.Screen name="gallery" options={{ title: 'Gallery', tabBarIcon: icon('▦') }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile', tabBarIcon: icon('○') }} />
    </Tabs>
  );
}
