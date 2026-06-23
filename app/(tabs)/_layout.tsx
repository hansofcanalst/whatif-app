import { Tabs } from 'expo-router';
import { Home, Images, User, type LucideIcon } from 'lucide-react-native';
import { colors } from '@/constants/theme';
import { ConsentGate } from '@/components/ConsentGate';

// Tab-bar glyphs — lucide SVG icons rendered through Expo Router's icon
// callback. The unfocused state pulls in textSecondary; focused picks
// up the FRAME violet via tabBarActiveTintColor (the color prop the
// router passes to tabBarIcon already reflects that, but we tint
// manually so the icon and label transition together visually). 2px
// stroke matches CategoryIcon and the other line-icon glyphs across
// the app so the tab bar reads as the same family.
function icon(Icon: LucideIcon) {
  return ({ focused }: { focused: boolean }) => (
    <Icon
      size={22}
      color={focused ? colors.accent : colors.textSecondary}
      strokeWidth={focused ? 2.5 : 2}
    />
  );
}

export default function TabsLayout() {
  return (
    <ConsentGate>
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
        <Tabs.Screen name="home" options={{ title: 'Home', tabBarIcon: icon(Home) }} />
        <Tabs.Screen name="gallery" options={{ title: 'Gallery', tabBarIcon: icon(Images) }} />
        <Tabs.Screen name="profile" options={{ title: 'Profile', tabBarIcon: icon(User) }} />
      </Tabs>
    </ConsentGate>
  );
}
