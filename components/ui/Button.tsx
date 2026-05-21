import React from 'react';
import { Pressable, Text, StyleSheet, ActivityIndicator, ViewStyle, TextStyle } from 'react-native';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { usePressScale } from '@/hooks/useMotion';
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
 *
 * Motion:
 *   - Spring-physics press scale (0.96 → 1.0). Replaces the snappy static
 *     `transform: [{ scale: 0.97 }]` we used before. Two-stage tuning
 *     matches the CategoryCard / ResultCard pattern so all pressable
 *     surfaces in the app feel like the same family of objects. The
 *     spring here is slightly stiffer than the card variants because
 *     buttons are smaller and benefit from a snappier feel; a too-loose
 *     spring on a small CTA reads as "jiggly".
 *   - Haptic on press impact (medium). Native only — expo-haptics no-ops
 *     on web. Subtle enough to confirm tap without competing with
 *     gestural feedback elsewhere in the app.
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
  // Slightly stiffer spring than the card variants — buttons are
  // smaller and benefit from a snappier feel. A too-loose spring on a
  // small CTA reads as "jiggly". See hooks/useMotion.ts for the
  // tuning rationale.
  const { scale, onPressIn, onPressOut } = usePressScale({
    pressedScale: 0.96,
    springIn: { damping: 18, stiffness: 380 },
    springOut: { damping: 14, stiffness: 260 },
    disabled: !!disabled || !!loading,
  });

  const handlePress = () => {
    if (disabled || loading) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    onPress();
  };

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

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
    <Animated.View style={[styles.wrap, style, animatedStyle]}>
      <Pressable
        onPress={handlePress}
        onPressIn={onPressIn}
        onPressOut={onPressOut}
        // Accessibility: every Button reports as a button to assistive
        // tech and uses its visible label as the screen-reader name. The
        // `disabled` + `busy` states map to ARIA `aria-disabled` and
        // `aria-busy` on web, and to UIAccessibilityTrait analogs on
        // native. This satisfies the App Store accessibility checklist
        // without needing per-callsite labels.
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ disabled: !!disabled, busy: !!loading }}
        style={[
          styles.base,
          {
            backgroundColor: bg,
            borderColor: border,
            borderWidth: variant === 'primary' ? 0 : 1,
          },
          disabled && styles.disabled,
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
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  // Wrapper carries the animated scale so the visual chrome lives on
  // the inner Pressable. Callers pass `style` through (forwarded to
  // the wrapper) so flex: 1 / margin tweaks still work — the inner
  // base style handles all the visual layout.
  wrap: {},
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
});
