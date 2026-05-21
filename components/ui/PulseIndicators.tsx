// Branded indeterminate indicators for the FRAME visual system.
//
// Why these exist:
//   React Native's built-in ActivityIndicator is the spinning iOS
//   wheel / Android material spinner. It reads as platform chrome,
//   not the app's brand — exactly the "generic AI slop" tell the
//   UI/UX audit flagged. These primitives replace it everywhere the
//   loading state is part of the brand surface (status pills, tile
//   placeholders), while keeping the small inline ActivityIndicator
//   uses inside Button/Modal where the chrome read is fine.
//
// Two components:
//   - <ScanLine /> — Tight horizontal track with an accent segment
//     that sweeps back and forth. Semantic fit for "Detecting
//     people…" (the AI is literally scanning the photo). Designed
//     for inline use in a status pill — width is configurable but
//     defaults to 24px.
//
//   - <SkeletonTile /> — Full-rectangle placeholder with a pulsing
//     accent overlay and a faint center glyph slot for an optional
//     icon (e.g. <Sparkles />). Replaces ActivityIndicator inside
//     tile placeholders (ResultCard pending state, prompt-eval
//     pending tile).
//
// Performance:
//   Both run a single shared Reanimated value driving transform/
//   opacity only — no layout reads, no width/height animations.
//   Per the FRAME / RN perf rules: transform + opacity are the
//   only animation properties that stay on the UI thread without
//   layout thrash.
//
// Reduced motion:
//   Both honor the system prefers-reduced-motion setting. When
//   enabled, the sweep/pulse falls back to a static state (segment
//   parked at center / pulse at midpoint opacity) — the user still
//   sees the loading shape but no animation.

import React, { useEffect } from 'react';
import { View, StyleSheet, AccessibilityInfo, type ViewStyle } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withSequence,
  Easing,
} from 'react-native-reanimated';
import { colors, radii } from '@/constants/theme';

// ───────────────────────────────────────────────────────────────────
// ScanLine
// ───────────────────────────────────────────────────────────────────

interface ScanLineProps {
  /** Track width in px. Default 24 — fits inside a status pill. */
  width?: number;
  /** Track height (and segment height). Default 3. */
  height?: number;
  /** Cycle duration in ms. Default 1100. */
  duration?: number;
}

export function ScanLine({ width = 24, height = 3, duration = 1100 }: ScanLineProps) {
  const t = useSharedValue(0);
  const [reduceMotion, setReduceMotion] = React.useState(false);

  // Subscribe to the system reduced-motion preference so the
  // animation doesn't fight accessibility. AccessibilityInfo's
  // 'reduceMotionChanged' event covers runtime toggles too.
  useEffect(() => {
    let cancelled = false;
    AccessibilityInfo.isReduceMotionEnabled?.().then((v) => {
      if (!cancelled) setReduceMotion(!!v);
    });
    const sub = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      setReduceMotion,
    );
    return () => {
      cancelled = true;
      sub?.remove();
    };
  }, []);

  useEffect(() => {
    if (reduceMotion) {
      t.value = 0.5;
      return;
    }
    // Ping-pong sweep: 0 → 1 → 0. withSequence keeps the easing
    // crisp at the endpoints (ease-in-out feels like a physical
    // scan head decelerating before reversing).
    t.value = withRepeat(
      withSequence(
        withTiming(1, { duration, easing: Easing.inOut(Easing.quad) }),
        withTiming(0, { duration, easing: Easing.inOut(Easing.quad) }),
      ),
      -1,
      false,
    );
  }, [reduceMotion, duration, t]);

  // Segment is 35% of the track. Slides from 0 to (width - segmentWidth).
  const segmentWidth = Math.max(6, Math.round(width * 0.35));
  const segmentStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: t.value * (width - segmentWidth) }],
  }));

  return (
    <View
      style={[styles.scanTrack, { width, height, borderRadius: height / 2 }]}
      accessibilityRole="progressbar"
      accessibilityLabel="Loading"
    >
      <Animated.View
        style={[
          styles.scanSegment,
          { width: segmentWidth, height, borderRadius: height / 2 },
          segmentStyle,
        ]}
      />
    </View>
  );
}

// ───────────────────────────────────────────────────────────────────
// SkeletonTile
// ───────────────────────────────────────────────────────────────────

interface SkeletonTileProps {
  /** Optional icon component rendered faintly behind the pulse. */
  children?: React.ReactNode;
  /** Override container styling — used to size/shape the tile. */
  style?: ViewStyle;
  /** Pulse duration in ms. Default 1600. */
  duration?: number;
}

export function SkeletonTile({ children, style, duration = 1600 }: SkeletonTileProps) {
  const t = useSharedValue(0);
  const [reduceMotion, setReduceMotion] = React.useState(false);

  useEffect(() => {
    let cancelled = false;
    AccessibilityInfo.isReduceMotionEnabled?.().then((v) => {
      if (!cancelled) setReduceMotion(!!v);
    });
    const sub = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      setReduceMotion,
    );
    return () => {
      cancelled = true;
      sub?.remove();
    };
  }, []);

  useEffect(() => {
    if (reduceMotion) {
      t.value = 0.5;
      return;
    }
    // Symmetric pulse — fade in, fade out, repeat. Ease-in-out
    // because the eye notices linear opacity changes (they feel
    // mechanical); ease-in-out reads as breathing.
    t.value = withRepeat(
      withSequence(
        withTiming(1, { duration, easing: Easing.inOut(Easing.quad) }),
        withTiming(0, { duration, easing: Easing.inOut(Easing.quad) }),
      ),
      -1,
      false,
    );
  }, [reduceMotion, duration, t]);

  // Pulse overlay opacity sweeps 0.05 → 0.22 → 0.05. Subtle enough
  // to feel like ambient activity, strong enough to differentiate
  // a loading tile from a generic dark surface.
  const overlayStyle = useAnimatedStyle(() => ({
    opacity: 0.05 + t.value * 0.17,
  }));

  return (
    <View
      style={[styles.skelBase, style]}
      accessibilityRole="progressbar"
      accessibilityLabel="Loading"
    >
      <Animated.View
        pointerEvents="none"
        style={[StyleSheet.absoluteFillObject, styles.skelOverlay, overlayStyle]}
      />
      {children ? <View style={styles.skelCenter}>{children}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  // ScanLine: muted track in the FRAME border color so the segment
  // reads against it without competing with the surface card.
  scanTrack: {
    backgroundColor: colors.border,
    overflow: 'hidden',
  },
  scanSegment: {
    backgroundColor: colors.accent,
  },
  // SkeletonTile: violet-tinted base with a pulsing accent overlay
  // sized to fill the parent. Container ships with a rounded-xl
  // corner by default — callers can override via `style`.
  skelBase: {
    backgroundColor: colors.bgCard,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.xl,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  skelOverlay: {
    backgroundColor: colors.accent,
  },
  skelCenter: { alignItems: 'center', justifyContent: 'center', gap: 8 },
});
