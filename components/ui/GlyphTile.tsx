import React from 'react';
import { View, StyleSheet, type ViewStyle } from 'react-native';
import { radii } from '@/constants/theme';

interface GlyphTileProps {
  /** Square edge length in px. Sets width, height, and (via the size→radius
   *  scale below) the border radius. */
  size?: number;
  /** Lucide icon (or any node) rendered centered inside the tile. */
  children: React.ReactNode;
  /** Override container styling (e.g. to add `position: absolute`). */
  style?: ViewStyle;
}

// FRAME glyph tile — the accent-tinted square that hosts a lucide icon in
// virtually every "this is a destination / affordance" surface across the
// app: category cards, the photo drop-zone, gallery empty state, the
// welcome onboarding card, the tutorial steps. Extracted from five
// duplicated implementations after a simplify audit flagged the pattern.
//
// Visual recipe (matches the FRAME spec):
//   - violet-600/18 background (slightly punchier than accentDim, which
//     is violet-600/15 — gives the tile enough body to sit cleanly on a
//     dark card)
//   - violet-600/30 1px border
//   - corner radius scales with the tile size: small tiles get radii.lg,
//     medium tiles get radii.xl, large tiles get radii.xxl. This keeps
//     the corner curvature visually consistent — a 28×28 with radius 16
//     looks rounder than a 64×64 with the same radius.
//
// Sizing convention (the call sites in the wild):
//   24 — inline within a label
//   28 — onboarding card glyph
//   44 — category card / standard
//   64 — empty-state hero / drop-zone
//   80 — full-screen tutorial step
export function GlyphTile({ size = 44, children, style }: GlyphTileProps) {
  // Border-radius scale tied to size — see comment block above for why.
  const borderRadius =
    size <= 32 ? radii.lg : size <= 56 ? radii.xl : radii.xxl;
  return (
    <View
      style={[
        styles.base,
        { width: size, height: size, borderRadius },
        style,
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    backgroundColor: 'rgba(124, 58, 237, 0.18)',
    borderWidth: 1,
    borderColor: 'rgba(124, 58, 237, 0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});

// Re-export for code that wants to test against the same color values
// (mostly for visual regression tests if any get added later).
export const GLYPH_TILE_BG = 'rgba(124, 58, 237, 0.18)';
export const GLYPH_TILE_BORDER = 'rgba(124, 58, 237, 0.3)';
