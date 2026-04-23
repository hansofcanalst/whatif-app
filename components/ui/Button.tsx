import React from 'react';
import { Pressable, Text, StyleSheet, ActivityIndicator, ViewStyle, TextStyle } from 'react-native';
import * as Haptics from 'expo-haptics';
import { colors, radii, spacing, typography } from '@/constants/theme';

type Variant = 'primary' | 'secondary' | 'ghost';

interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: Variant;
  disabled?: boolean;
  loading?: boolean;
  style?: ViewStyle;
  textStyle?: TextStyle;
  icon?: React.ReactNode;
}

/**
 * FRAME button primitive.
 *
 *   primary   — solid violet-600 fill, off-white label, tracking-wide. The
 *               FRAME CTA look: sits on dark surfaces, draws the eye,
 *               rounded-lg corners (not pill — that reads more "app" than
 *               "FRAME tool").
 *   secondary — surface-800 fill with a subtle border. Used for the neutral
 *               action in a pair (e.g. "Generate more" beside a primary
 *               "Done").
 *   ghost     — transparent body with a border-subtle outline; used when
 *               the button sits next to content that already has weight.
 *
 * The gradient primary we used previously has been retired: FRAME primaries
 * are flat violet-600, and a flat CTA reads cleaner against FRAME's quieter
 * surfaces than a two-tone gradient did.
 */
export function Button({
  label,
  onPress,
  variant = 'primary',
  disabled,
  loading,
  style,
  textStyle,
  icon,
}: ButtonProps) {
  const handlePress = () => {
    if (disabled || loading) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    onPress();
  };

  const bg =
    variant === 'primary'
      ? colors.accent
      : variant === 'secondary'
      ? colors.bgCard
      : 'transparent';
  const border =
    variant === 'ghost'
      ? colors.border
      : variant === 'secondary'
      ? colors.border
      : 'transparent';

  const labelColor = variant === 'primary' ? '#ffffff' : colors.textPrimary;

  return (
    <Pressable
      onPress={handlePress}
      style={({ pressed }) => [
        styles.base,
        {
          backgroundColor: bg,
          borderColor: border,
          borderWidth: variant === 'primary' ? 0 : 1,
        },
        disabled && styles.disabled,
        pressed && styles.pressed,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={labelColor} />
      ) : (
        <>
          {icon}
          <Text
            style={[
              styles.label,
              { color: labelColor },
              // Tracking-wide + uppercase on primary CTAs reads as the
              // FRAME "BEGIN ANALYSIS" / "EXPORT FILE" button language.
              variant === 'primary' && styles.labelPrimary,
              textStyle,
            ]}
          >
            {label}
          </Text>
        </>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.md + 2,
    paddingHorizontal: spacing.xl,
    borderRadius: radii.lg,
    gap: spacing.sm,
  },
  label: { ...typography.bodyBold },
  labelPrimary: {
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    fontSize: 13,
  },
  disabled: { opacity: 0.45 },
  pressed: { transform: [{ scale: 0.97 }] },
});
