import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useGeneration } from '@/hooks/useGeneration';
import { colors, radii, spacing, typography } from '@/constants/theme';
import { config } from '@/constants/config';

/**
 * FRAME label-tag — a compact pill rendered in violet-600/15 with
 * violet-300 text. PRO users see the accent-tinted tag; free users see
 * the same tag shape in a neutral surface-800 tone so it still fits the
 * top bar without shouting for attention.
 */
export function GenerationCounter() {
  const { remaining, isPro } = useGeneration();

  if (isPro) {
    return (
      <View style={styles.proBadge}>
        <Text style={styles.proText}>PRO ✦</Text>
      </View>
    );
  }

  const used = config.freeGenerationCap - remaining;
  return (
    <View style={styles.badge}>
      <Text style={styles.text}>
        {used}/{config.freeGenerationCap} FREE
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 1,
    borderRadius: radii.pill,
    backgroundColor: colors.bgCard,
    borderWidth: 1,
    borderColor: colors.border,
  },
  text: {
    ...typography.label,
    color: colors.textSecondary,
    fontSize: 10,
  },
  proBadge: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 1,
    borderRadius: radii.pill,
    backgroundColor: colors.accentDim,
    borderWidth: 1,
    borderColor: 'rgba(124, 58, 237, 0.3)',
  },
  proText: {
    ...typography.label,
    color: colors.accentText,
    fontSize: 10,
    letterSpacing: 1.5,
  },
});
