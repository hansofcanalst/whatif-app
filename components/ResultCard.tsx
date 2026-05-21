import React from 'react';
import { Pressable, Image, Text, View, StyleSheet } from 'react-native';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import { Sparkles } from 'lucide-react-native';
import { SkeletonTile } from '@/components/ui/PulseIndicators';
import { useCardEntrance, usePressScale } from '@/hooks/useMotion';
import { colors, radii, spacing, typography } from '@/constants/theme';

interface ResultCardProps {
  /** Image URL when the tile has resolved. Omit for pending/failed tiles. */
  imageURL?: string;
  label: string;
  /**
   * Tile lifecycle state. When absent (back-compat), the tile behaves
   * like the old always-complete version. The streaming /generate/results
   * screen always passes an explicit status.
   */
  status?: 'pending' | 'complete' | 'failed';
  /** Error message shown on failed tiles. */
  error?: string;
  /**
   * Text shown under the spinner on pending tiles. The streaming results
   * screen passes a rotating flavor line ("Consulting the multiverse…")
   * so the waiting tile has some personality; when omitted we fall back
   * to the plain "Generating…" label used by the gallery/detail screens.
   */
  pendingCaption?: string;
  /**
   * 0-based position in the grid. Drives a staggered entrance (50ms
   * per tile, capped at 350ms total). When omitted (or when the
   * system has reduced-motion enabled), entrance is a no-op.
   */
  entryIndex?: number;
  onPress: () => void;
}

// FRAME result thumbnail — rounded-xl card on surface-800 with a subtle
// border. Label rides along the bottom in a gradient-less dark bar so
// the image itself keeps the visual weight.
//
// When `status` is 'pending', the card shows a centered spinner in
// place of the image (still pressable but the press is a no-op — the
// parent should early-return on tap). When 'failed', a subdued error
// glyph plus the error message replaces the image.
export function ResultCard({
  imageURL,
  label,
  status = 'complete',
  error,
  pendingCaption,
  entryIndex = 0,
  onPress,
}: ResultCardProps) {
  const disabled = status !== 'complete';

  // Motion: shared hooks from hooks/useMotion.ts. 50ms stagger here
  // vs. 40ms on CategoryCard because the result grid usually has
  // fewer tiles (2–6) and a slightly longer stagger reads better when
  // the cards are larger. 12px translate distance (vs. 10 on cards)
  // for the same reason.
  const { scale, onPressIn, onPressOut } = usePressScale({ pressedScale: 0.96, disabled });
  const { enterY, enterOpacity } = useCardEntrance({
    index: entryIndex,
    stagger: 50,
    maxDelay: 350,
    distance: 12,
    duration: 300,
  });

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }, { translateY: enterY.value }],
    opacity: enterOpacity.value,
  }));
  const content = (() => {
    if (status === 'pending') {
      // SkeletonTile gives us the pulsing card surface; the inner
      // stack overlays the FRAME glyph + flavor caption so the tile
      // reads as "this slot is alive and working" instead of an
      // empty rectangle. Sparkles is the same brand mark used in
      // the PRO badge and watermark — keeps the loading state in
      // the same visual family as the rest of the app.
      return (
        <SkeletonTile style={styles.skeletonFill}>
          <Sparkles
            size={20}
            color={colors.accentText}
            strokeWidth={2}
            opacity={0.7}
          />
          <Text style={styles.placeholderCaption} numberOfLines={2}>
            {pendingCaption ?? 'Generating…'}
          </Text>
        </SkeletonTile>
      );
    }
    if (status === 'failed') {
      return (
        <View style={styles.placeholder}>
          <Text style={styles.failedGlyph}>!</Text>
          <Text style={styles.placeholderCaption} numberOfLines={2}>
            {error ?? 'Failed'}
          </Text>
        </View>
      );
    }
    return <Image source={{ uri: imageURL }} style={styles.image} />;
  })();

  // Compose an a11y label that includes both the variant name and the
  // current state so screen readers announce e.g. "Black, generating"
  // or "Middle Eastern, failed: model returned no image" rather than
  // just the visible label without context. Disabled state also rides
  // through to assistive tech so VoiceOver can correctly indicate
  // non-interactive tiles.
  const a11yLabel = (() => {
    if (status === 'pending') return `${label}, generating`;
    if (status === 'failed') return `${label}, failed${error ? `: ${error}` : ''}`;
    return label;
  })();

  return (
    <Animated.View style={[styles.cardWrap, animatedStyle]}>
      <Pressable
        onPress={disabled ? undefined : onPress}
        onPressIn={onPressIn}
        onPressOut={onPressOut}
        accessibilityRole={disabled ? 'image' : 'button'}
        accessibilityLabel={a11yLabel}
        accessibilityState={{ disabled, busy: status === 'pending' }}
        style={[styles.card, status === 'failed' && styles.cardFailed]}
      >
        {content}
        <View style={styles.overlay}>
          <Text style={styles.label} numberOfLines={1}>
            {label}
          </Text>
        </View>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  // Wrapper carries the entrance + press transforms; the Pressable
  // inner keeps the visual card chrome. flex:1 propagates through so
  // the grid layout still sizes each tile correctly.
  cardWrap: { flex: 1 },
  card: {
    flex: 1,
    aspectRatio: 1,
    borderRadius: radii.xl,
    overflow: 'hidden',
    backgroundColor: colors.bgCard,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardFailed: {
    borderColor: 'rgba(239, 68, 68, 0.35)',
  },
  image: { width: '100%', height: '100%' },
  // SkeletonTile is borderless by default but the outer card already
  // owns a border — clear ours so we don't double-up.
  skeletonFill: {
    flex: 1,
    width: '100%',
    borderRadius: 0,
    borderWidth: 0,
    paddingHorizontal: spacing.md,
  },
  placeholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  placeholderCaption: {
    ...typography.caption,
    color: colors.textMuted,
    textAlign: 'center',
  },
  failedGlyph: {
    fontSize: 28,
    fontWeight: '800',
    color: 'rgba(239, 68, 68, 0.7)',
  },
  overlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: spacing.sm,
    backgroundColor: 'rgba(9,9,13,0.85)',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.06)',
  },
  label: { ...typography.caption, color: colors.textPrimary, fontWeight: '700' },
});
