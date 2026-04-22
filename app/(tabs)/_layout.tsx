import { Tabs } from 'expo-router';
import { Text } from 'react-native';
import { colors } from '@/constants/theme';

function icon(emoji: string) {
  return ({ focused }: { focused: boolean }) => (
    <Text style={{ fontSize: 22, opacity: focused ? 1 : 0.5 }}>{emoji}</Text>
  );
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: colors.bgElevated,
          borderTopColor: colors.border,
          borderTopWidth: 1,
        },
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.textMuted,
      }}
    >
      <Tabs.Screen name="home" options={{ title: 'Home', tabBarIcon: icon('🏠') }} />
      <Tabs.Screen name="gallery" options={{ title: 'Gallery', tabBarIcon: icon('🖼️') }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile', tabBarIcon: icon('👤') }} />
    </Tabs>
  );
}
