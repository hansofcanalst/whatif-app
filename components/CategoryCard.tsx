import React from 'react';
import { Pressable, Text, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import { Category } from '@/constants/categories';
import { colors, radii, spacing, typography } from '@/constants/theme';
import { CategoryIcon } from './CategoryIcon';
import { GlyphTile } from './ui/GlyphTile';
import { ProBadge } from './ui/ProBadge';
import { useCardEntrance, usePressScale } from '@/hooks/useMotion';

interface CategoryCardProps {
  category: Category;
  onPress: (category: Category) => void;
  locked?: boolean;
  /**
   * 0-based position in the grid. Drives a staggered entrance —
   * 40ms per card, capped at 280ms total. When omitted (or when
   * the system has prefers-reduced-motion enabled), entrance is
   * a no-op and the card is fully visible immediately.
   */
  entryIndex?: number;
}

// FRAME category card — flat surface-800 body, rounded-xl corner, subtle
// border. Icon sits in an accent-tinted tile so the cards read as a
// toolkit grid rather than a row of buttons. Locked state shows a
// violet PRO label-tag in the corner.
//
// Motion:
//   - Spring-physics press: scale → 0.94 on press-in, springs back to 1
//     on release. Replaces the static transform that snapped without
//     bounce — the spring feels tactile.
//   - Staggered entrance: translateY(10) + opacity(0) → settled. 40ms
//     stagger between cards in the grid. Honors the system
//     reduced-motion setting (animation skipped, card is fully visible
//     immediately).
//
// Both motion behaviors live in shared hooks (see hooks/useMotion.ts)
// so CategoryCard, ResultCard, and Button stay synchronized without
// duplicating the shared-value plumbing.
export function CategoryCard({ category, onPress, locked, entryIndex = 0 }: CategoryCardProps) {
  // Composed accessibility label so screen readers announce
  // "Race Swap. See yourself as a different race. Pro." rather than
  // dumping each Text node separately. The `locked` state informs the
  // user that activation will hit the paywall.
  const a11yLabel = locked
    ? `${category.label}. ${category.description}. Pro feature.`
    : `${category.label}. ${category.description}.`;

  const { scale, onPressIn, onPressOut } = usePressScale({ pressedScale: 0.94 });
  const { enterY, enterOpacity } = useCardEntrance({ index: entryIndex });

  const containerStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }, { translateY: enterY.value }],
    opacity: enterOpacity.value,
  }));

  return (
    <Animated.View style={[styles.cardWrap, containerStyle]}>
      <Pressable
        onPress={() => onPress(category)}
        onPressIn={onPressIn}
        onPressOut={onPressOut}
        accessibilityRole="button"
        accessibilityLabel={a11yLabel}
        style={({ pressed }) => [styles.card, pressed && styles.pressedBorder]}
      >
        <GlyphTile size={44}>
          <CategoryIcon categoryId={category.id} size={22} />
        </GlyphTile>
        <View style={{ flex: 1 }}>
          <Text style={styles.label}>{category.label}</Text>
          <Text style={styles.desc} numberOfLines={2}>
            {category.description}
          </Text>
        </View>
        {locked ? <ProBadge size="sm" style={styles.lockPosition} /> : null}
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  // Outer wrapper carries the entrance + press transforms so the inner
  // Pressable can keep its rendering as-is. flex:1 propagates from the
  // grid layout above to the Animated.View, then through to the card.
  cardWrap: { flex: 1 },
  card: {
    flex: 1,
    aspectRatio: 1,
    borderRadius: radii.xl,
    backgroundColor: colors.bgCard,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  // Press feedback now has two layers: scale (Reanimated, on the
  // wrapper via usePressScale) and a border tint (RN's pressed style,
  // on the Pressable). The border tint is instant — there's no spring
  // needed for a color change — so we keep it on the static style
  // hook rather than duplicating it through a shared value.
  pressedBorder: {
    borderColor: 'rgba(124, 58, 237, 0.4)',
  },
  label: { ...typography.h3, color: colors.textPrimary, fontSize: 16 },
  desc: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
  // Position-only — visual chrome lives in <ProBadge size="sm">.
  lockPosition: {
    position: 'absolute',
    top: spacing.sm,
    right: spacing.sm,
  },
});
