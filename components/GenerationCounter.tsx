import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useGeneration } from '@/hooks/useGeneration';
import { colors, radii, spacing, typography } from '@/constants/theme';
import { config } from '@/constants/config';

export function GenerationCounter() {
  const { remaining, isPro } = useGeneration();

  if (isPro) {
    return (
      <LinearGradient
        colors={[colors.gradientStart, colors.gradientEnd]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.proBadge}
      >
        <Text style={styles.proText}>PRO ✦</Text>
      </LinearGradient>
    );
  }

  const used = config.freeGenerationCap - remaining;
  return (
    <View style={styles.badge}>
      <Text style={styles.text}>
        {used}/{config.freeGenerationCap} free
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radii.pill,
    backgroundColor: colors.bgCard,
    borderWidth: 1,
    borderColor: colors.border,
  },
  text: { ...typography.tiny, color: colors.textPrimary },
  proBadge: { paddingHorizontal: spacing.md, paddingVertical: spacing.xs, borderRadius: radii.pill },
  proText: { ...typography.tiny, color: colors.textPrimary, letterSpacing: 2 },
});
