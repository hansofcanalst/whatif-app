import React from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import { colors, radii, spacing } from '@/constants/theme';

interface CardProps {
  children: React.ReactNode;
  style?: ViewStyle;
}

/**
 * FRAME .card pattern — surface-800 body, subtle border, xl corner radius.
 * FRAME uses cards as the primary surface for stacked content (profile
 * rows, plan panels, result thumbnails). Padding matches the FRAME
 * default; pass `style` to override or add margins without losing the
 * base surface treatment.
 */
export function Card({ children, style }: CardProps) {
  return <View style={[styles.card, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.bgCard,
    borderRadius: radii.xl,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
});
