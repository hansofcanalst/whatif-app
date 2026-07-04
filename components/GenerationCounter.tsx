import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useGeneration } from '@/hooks/useGeneration';
import { ProBadge } from '@/components/ui/ProBadge';
import { colors, radii, spacing, typography } from '@/constants/theme';
import { config } from '@/constants/config';

/**
 * FRAME label-tag — a compact pill showing generations used out of the
 * allowance, in a neutral surface-800 tone so it fits the top bar
 * without shouting for attention.
 */
export function GenerationCounter() {
  const { remaining, isPro } = useGeneration();

  if (isPro) return <ProBadge size="md" />;

  const used = config.freeGenerationCap - remaining;
  return (
    <View style={styles.badge}>
      <Text style={styles.text}>
        {used} of {config.freeGenerationCap} used
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
});
