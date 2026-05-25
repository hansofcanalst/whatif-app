// "Trending This Week" horizontal carousel for the home screen. Renders
// remote-updatable trend cards fetched from Firestore — see lib/trends.ts
// for the data layer and PROJECT_OVERVIEW.md for the system overview.
//
// FRAME styling notes:
//   - Page background reads as a flat surface (#09090d). Each trend
//     card layers a vivid linear gradient (trend.gradientColors) under
//     a translucent panel so the card pops without abandoning the
//     dark-mode mood.
//   - Title row uses uppercase tracking-widest section label + a 🔥
//     accent — same pattern as the existing "Transformations" header
//     on the home screen.
//   - PRO badge (top-right of each card) mirrors the existing premium
//     CategoryCard treatment so users see one consistent affordance
//     for Pro-gated content across both surfaces.
//
// Pull-to-refresh is wired at the home-screen level (Home's ScrollView
// RefreshControl). This component is a controlled view: `onSelect`
// and `trends` are owned by Home so it can sync with the photo / gates
// flow.

import React from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  StyleSheet,
  Platform,
} from 'react-native';
import type { TrendingDoc } from '@/lib/trends';
import { colors, fontFamily, radii, spacing, typography } from '@/constants/theme';

interface TrendingCarouselProps {
  trends: TrendingDoc[];
  isPro: boolean;
  onSelect: (trend: TrendingDoc) => void;
}

/**
 * Build the inline-style gradient background for a trend card. RN's
 * StyleSheet doesn't accept linear-gradient as a value, so on web we
 * pass a CSS string (cast through `any` because RNW types don't expose
 * it). On native we fall back to the first gradient color as a flat
 * fill — visually acceptable for the launch, and a future expo-linear-
 * gradient swap is local to this component.
 */
function gradientStyle(colorsArr: string[]): Record<string, unknown> {
  if (colorsArr.length === 0) return { backgroundColor: colors.accent };
  if (Platform.OS === 'web') {
    return {
      backgroundImage: `linear-gradient(135deg, ${colorsArr.join(', ')})`,
      backgroundColor: colorsArr[0], // fallback if backgroundImage strips
    };
  }
  // Native fallback: solid color. Swap for expo-linear-gradient if a
  // true gradient ever becomes table stakes — kept off the dep list
  // until then to avoid yet another native module.
  return { backgroundColor: colorsArr[0] };
}

export function TrendingCarousel({ trends, isPro, onSelect }: TrendingCarouselProps) {
  if (trends.length === 0) return null;

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <Text style={styles.sectionLabel}>Trending This Week 🔥</Text>
        <Text style={styles.sectionTitle}>Ride the moment</Text>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scroller}
        // Slight overshoot on iOS so the last card peeks off the right
        // edge — signals "swipe for more" without a chevron.
        decelerationRate="fast"
      >
        {trends.map((t) => {
          const locked = t.isPremium && !isPro;
          return (
            <Pressable
              key={t.id}
              onPress={() => onSelect(t)}
              accessibilityRole="button"
              accessibilityLabel={`Try the ${t.label} trend`}
              accessibilityHint={t.subtitle}
              style={({ pressed }) => [
                styles.card,
                gradientStyle(t.gradientColors),
                pressed && styles.cardPressed,
              ]}
            >
              {/* Dark overlay so light gradient choices still read text
                  cleanly. Layered above the gradient, below the content. */}
              <View pointerEvents="none" style={styles.scrim} />

              {t.isPremium ? (
                <View style={styles.proBadge}>
                  <Text style={styles.proBadgeText}>PRO</Text>
                </View>
              ) : null}

              <View style={styles.cardContent}>
                <Text style={styles.emoji}>{t.emoji}</Text>
                <View style={styles.titleBlock}>
                  <Text style={styles.cardLabel} numberOfLines={1}>
                    {t.label}
                  </Text>
                  {t.subtitle ? (
                    <Text style={styles.cardSubtitle} numberOfLines={2}>
                      {t.subtitle}
                    </Text>
                  ) : null}
                </View>
                {locked ? (
                  <View style={styles.lockedTag}>
                    <Text style={styles.lockedTagText}>Unlock with Pro</Text>
                  </View>
                ) : (
                  <View style={styles.cta}>
                    <Text style={styles.ctaText}>Try this →</Text>
                  </View>
                )}
              </View>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const CARD_WIDTH = 220;
const CARD_HEIGHT = 260;

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  header: { gap: 2 },
  sectionLabel: {
    ...typography.label,
    color: colors.textLabel,
    marginBottom: spacing.xs,
  },
  sectionTitle: { ...typography.h2, color: colors.textPrimary },
  scroller: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xs,
    gap: spacing.md,
  },
  card: {
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    borderRadius: radii.xxl,
    overflow: 'hidden',
    padding: spacing.lg,
    justifyContent: 'flex-end',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  cardPressed: {
    transform: [{ scale: 0.97 }],
    opacity: 0.92,
  },
  scrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.28)',
  },
  cardContent: {
    flex: 1,
    justifyContent: 'space-between',
  },
  emoji: {
    fontSize: 44,
    lineHeight: 52,
    // The default font-rendering on RN can leave emoji glyphs slightly
    // off-baseline inside a flex layout — capping line height tightens
    // the vertical rhythm of the card.
  },
  titleBlock: {
    gap: spacing.xs,
    marginTop: spacing.md,
  },
  cardLabel: {
    fontSize: 20,
    fontWeight: '800',
    color: '#ffffff',
    letterSpacing: -0.5,
  },
  cardSubtitle: {
    fontSize: 13,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.86)',
    lineHeight: 18,
  },
  proBadge: {
    position: 'absolute',
    top: spacing.md,
    right: spacing.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radii.pill,
    backgroundColor: 'rgba(0,0,0,0.4)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.4)',
  },
  proBadgeText: {
    color: '#ffffff',
    fontFamily: fontFamily.mono,
    fontWeight: '700',
    fontSize: 10,
    letterSpacing: 1.5,
  },
  cta: {
    marginTop: spacing.md,
    alignSelf: 'flex-start',
    paddingVertical: 6,
    paddingHorizontal: spacing.md,
    borderRadius: radii.pill,
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.32)',
  },
  ctaText: {
    color: '#ffffff',
    fontFamily: fontFamily.mono,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  lockedTag: {
    marginTop: spacing.md,
    alignSelf: 'flex-start',
    paddingVertical: 6,
    paddingHorizontal: spacing.md,
    borderRadius: radii.pill,
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
  },
  lockedTagText: {
    color: '#ffffff',
    fontFamily: fontFamily.mono,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
});
