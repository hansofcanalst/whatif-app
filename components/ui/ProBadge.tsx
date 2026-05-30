import React from 'react';
import { View, Text, StyleSheet, type ViewStyle } from 'react-native';
import { Sparkles } from 'lucide-react-native';
import { colors, radii, spacing, typography } from '@/constants/theme';
import { V1_MONETIZATION_ENABLED } from '@/constants/config';

type ProBadgeSize = 'sm' | 'md' | 'lg';

interface ProBadgeProps {
  /** Visual scale. sm fits inside a card corner (9px text + glyph);
   *  md is the standard top-bar / inline pill; lg is the paywall hero
   *  badge. Defaults to md. */
  size?: ProBadgeSize;
  /** Override container styling — used to position the badge absolutely
   *  (e.g. CategoryCard's lock corner). */
  style?: ViewStyle;
}

// FRAME PRO badge — "PRO" wordmark + Sparkles glyph in an accent-tinted
// pill. Extracted from four duplicated implementations across
// CategoryCard (locked corner), GenerationCounter (top-bar), Profile
// (plan card), and PaywallModal (hero). Each call site previously
// reimplemented the same visual recipe with slight per-callsite tweaks
// to font size and sparkles size.
//
// Visual recipe:
//   - Accent-tinted bg (colors.accentDim — violet-600/15)
//   - 1px violet-600/30 border (matches GlyphTile and the other
//     "this is a brand surface" pills)
//   - Pill corner radius (radii.pill)
//   - "PRO" in the FRAME label typography (uppercase, tracked) +
//     inline Sparkles glyph
//
// What's NOT in here on purpose: positioning. CategoryCard wants the
// badge in the top-right corner of the card; GenerationCounter wants
// it as a flex child of the top bar; PaywallModal wants it
// alignSelf:'flex-start'. All three pass their own `style` prop with
// the positional rule; the visual chrome stays consistent.
export function ProBadge({ size = 'md', style }: ProBadgeProps) {
  // V1 stub: render nothing while monetization is disabled. All four
  // call sites (CategoryCard lock corner, GenerationCounter top-bar,
  // Profile plan card, PaywallModal hero) keep their existing layouts
  // and conditional render logic; the badge itself just becomes
  // invisible until V1_MONETIZATION_ENABLED flips back to true.
  // See V1_MONETIZATION_ENABLED in constants/config.ts.
  if (!V1_MONETIZATION_ENABLED) return null;
  const variant = SIZE_VARIANTS[size];
  return (
    <View style={[styles.base, variant.container, style]}>
      <Text style={[styles.text, variant.text]}>PRO</Text>
      <Sparkles
        size={variant.glyphSize}
        color={colors.accentText}
        strokeWidth={2.5}
      />
    </View>
  );
}

const SIZE_VARIANTS: Record<
  ProBadgeSize,
  {
    container: ViewStyle;
    text: { fontSize: number; letterSpacing: number };
    glyphSize: number;
  }
> = {
  sm: {
    container: { paddingVertical: 2, paddingHorizontal: spacing.sm, gap: 4 },
    text: { fontSize: 9, letterSpacing: 1.5 },
    glyphSize: 9,
  },
  md: {
    container: { paddingVertical: spacing.xs + 1, paddingHorizontal: spacing.md, gap: 4 },
    text: { fontSize: 10, letterSpacing: 1.5 },
    glyphSize: 10,
  },
  lg: {
    container: { paddingVertical: spacing.xs + 1, paddingHorizontal: spacing.md, gap: 5 },
    text: { fontSize: 11, letterSpacing: 2 },
    glyphSize: 11,
  },
};

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radii.pill,
    backgroundColor: colors.accentDim,
    borderWidth: 1,
    borderColor: 'rgba(124, 58, 237, 0.3)',
  },
  text: {
    ...typography.label,
    color: colors.accentText,
    fontWeight: '700',
  },
});
