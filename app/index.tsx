import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { colors, fontFamily, spacing, typography } from '@/constants/theme';

// Splash screen rendered by Expo Router before AuthGate decides where
// to send the user. Pre-mount: the OS-controlled splash (icon + bg
// color) is still up. Once React mounts, this is the first frame — so
// it's the brand's first impression. The FRAME wordmark + tagline
// keeps us in the same visual family as the home / auth screens
// instead of a bare ActivityIndicator that reads as a system loader.
export default function Index() {
  return (
    <View style={styles.container}>
      <View style={styles.brand}>
        <Text style={styles.logo}>
          What<Text style={styles.logoAccent}>If</Text>
        </Text>
        <Text style={styles.tagline}>Loading the multiverse…</Text>
      </View>
      <LoadingSpinner taglines={false} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bg,
    gap: spacing.xxl,
  },
  brand: { alignItems: 'center', gap: spacing.xs },
  logo: {
    fontFamily: fontFamily.mono,
    fontSize: 32,
    fontWeight: '800',
    color: colors.textPrimary,
    letterSpacing: -1,
  },
  logoAccent: { color: colors.accent },
  tagline: { ...typography.caption, color: colors.textSecondary },
});
