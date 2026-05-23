// Feature Carousel — marketing hero with a 3D-fan image stack.
//
// Adapted from the shadcn/Tailwind reference design (a Next.js component
// using <div>/<img>/Tailwind classes/lucide-react). This implementation
// is the React Native port:
//
//   - RN primitives (View/Text/Image/Pressable) instead of DOM elements
//   - StyleSheet + FRAME theme tokens instead of Tailwind
//   - Reanimated SharedValues + useAnimatedStyle for the 3D transforms
//     and interpolation (CSS transitions don't exist in RN)
//   - lucide-react-native for chevrons (the rest of the app uses it)
//   - Same source compiles to native (iOS/Android) AND the web export
//     via Expo's metro-web bundler
//
// Why React Native instead of the original Tailwind component:
//   The app is React-Native-first with web as a secondary Expo Web
//   export of the same code. Adding Tailwind/shadcn would create a
//   dual styling system (Tailwind on web, RN StyleSheet on native)
//   and the carousel would only render on web. The RN port works on
//   both surfaces with one source.
//
// Visual recipe:
//   - Background: two soft violet radial blobs (FRAME accent washes,
//     not the demo's blue/purple mix — keeps us in-palette).
//   - Title + subtitle stack centered. Title accepts a ReactNode so
//     consumers can nest a colored Text span for the accent word.
//   - Card stack: each image rendered as an absolutely-positioned
//     card. Position/scale/rotateY/opacity computed from
//     `index - progress`, with shortest-path wrap so cycling from the
//     last back to the first doesn't fly across the whole stack.
//   - Chevron nav buttons (lucide) with dark translucent pill bg —
//     match the BeforeAfterSlider's label pills.
//
// Motion:
//   - 500ms eased interpolation between cards via withTiming.
//   - Autoplay defaults to 4s, restarts when the user nav-clicks (so
//     manual navigation doesn't fight the timer firing 0.5s later).
//   - prefers-reduced-motion disables both autoplay and the timing
//     animation (cards snap to position instead).

import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  Pressable,
  AccessibilityInfo,
  useWindowDimensions,
  type ViewStyle,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
  type SharedValue,
} from 'react-native-reanimated';
import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import { colors, radii, spacing, typography } from '@/constants/theme';

export interface FeatureCarouselImage {
  src: string;
  alt: string;
}

interface FeatureCarouselProps {
  /** Hero title. Accepts a ReactNode so callers can mix accent and
   *  default colors via nested <Text> spans. */
  title: React.ReactNode;
  /** Plain-text subtitle below the title. */
  subtitle: string;
  /** Images to cycle through. ≥3 recommended for the 3D-fan layout to
   *  read (with 1 or 2 the side cards collapse). */
  images: FeatureCarouselImage[];
  /** Container style override. */
  style?: ViewStyle;
  /** Autoplay interval in ms. Pass `null` to disable. Default 4000. */
  autoplayMs?: number | null;
}

// Card sizing scales with viewport width. Two breakpoints match the
// Tailwind reference (md:w-64 ~= 256, default w-48 ~= 192).
const CARD_W_SM = 168;
const CARD_H_SM = 320;
const CARD_W_LG = 240;
const CARD_H_LG = 420;

export function FeatureCarousel({
  title,
  subtitle,
  images,
  style,
  autoplayMs = 4000,
}: FeatureCarouselProps) {
  const { width: windowWidth } = useWindowDimensions();
  const isLarge = windowWidth >= 768;
  const cardW = isLarge ? CARD_W_LG : CARD_W_SM;
  const cardH = isLarge ? CARD_H_LG : CARD_H_SM;

  const initialIdx = Math.floor(images.length / 2);
  const [currentIndex, setCurrentIndex] = useState(initialIdx);
  const progress = useSharedValue(initialIdx);
  const [reduceMotion, setReduceMotion] = useState(false);

  // Reduced-motion check. Same pattern as the other motion-aware
  // components (CategoryCard, PulseIndicators). Subscribes to runtime
  // changes too.
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

  // Animate progress toward currentIndex. Reduced-motion users get an
  // instant snap; everyone else gets a 500ms cubic-out tween that
  // mirrors the reference's CSS `transition-all duration-500
  // ease-in-out` feel.
  useEffect(() => {
    progress.value = reduceMotion
      ? currentIndex
      : withTiming(currentIndex, {
          duration: 500,
          easing: Easing.inOut(Easing.cubic),
        });
  }, [currentIndex, reduceMotion, progress]);

  const handleNext = useCallback(() => {
    setCurrentIndex((i) => (i + 1) % images.length);
  }, [images.length]);
  const handlePrev = useCallback(() => {
    setCurrentIndex((i) => (i - 1 + images.length) % images.length);
  }, [images.length]);

  // Autoplay. currentIndex is in the deps so manual nav resets the
  // interval — otherwise a tap could be followed half a second later
  // by the timer firing next again, which looks broken.
  useEffect(() => {
    if (autoplayMs == null || reduceMotion) return;
    const t = setInterval(handleNext, autoplayMs);
    return () => clearInterval(t);
  }, [autoplayMs, handleNext, reduceMotion, currentIndex]);

  return (
    <View style={[styles.container, style]}>
      {/* Decorative gradient blobs. Two violet washes — FRAME accent,
          not the demo's blue/purple mix — for an ambient glow behind
          the card stack. pointerEvents:'none' so they don't intercept
          the nav button taps. */}
      <View style={styles.blobLeft} pointerEvents="none" />
      <View style={styles.blobRight} pointerEvents="none" />

      <View style={styles.content}>
        {/* Headline + subtitle stack */}
        <View style={styles.headerStack}>
          <Text style={[styles.title, isLarge && styles.titleLarge]}>
            {title}
          </Text>
          <Text style={[styles.subtitle, isLarge && styles.subtitleLarge]}>
            {subtitle}
          </Text>
        </View>

        {/* Carousel stage. The card stack lives inside a relative wrapper
            sized to the card height plus headroom; cards position
            themselves absolutely. */}
        <View
          style={[
            styles.stage,
            { height: cardH + spacing.xl, width: '100%' },
          ]}
        >
          {images.map((image, index) => (
            <CarouselCard
              key={`${image.src}-${index}`}
              index={index}
              image={image}
              progress={progress}
              total={images.length}
              cardW={cardW}
              cardH={cardH}
            />
          ))}

          <Pressable
            onPress={handlePrev}
            style={[styles.navBtn, styles.navBtnLeft]}
            accessibilityRole="button"
            accessibilityLabel="Previous image"
            hitSlop={12}
          >
            <ChevronLeft
              size={20}
              color={colors.textPrimary}
              strokeWidth={2.25}
            />
          </Pressable>
          <Pressable
            onPress={handleNext}
            style={[styles.navBtn, styles.navBtnRight]}
            accessibilityRole="button"
            accessibilityLabel="Next image"
            hitSlop={12}
          >
            <ChevronRight
              size={20}
              color={colors.textPrimary}
              strokeWidth={2.25}
            />
          </Pressable>
        </View>
      </View>
    </View>
  );
}

// Individual card. Reads `progress` to derive its position relative
// to the active index, then maps that to scale + translateX + rotateY
// + opacity. The math chooses the shortest wrap path so e.g. with 5
// cards, animating from idx 0 to idx 4 plays as if 4 = -1 — the card
// slides in from the left rather than flying across all positions.
function CarouselCard({
  index,
  image,
  progress,
  total,
  cardW,
  cardH,
}: {
  index: number;
  image: FeatureCarouselImage;
  progress: SharedValue<number>;
  total: number;
  cardW: number;
  cardH: number;
}) {
  const animStyle = useAnimatedStyle(() => {
    'worklet';
    const raw = index - progress.value;
    let pos = raw;
    const half = total / 2;
    // Shortest-path wrap. Without this, animating across the
    // wraparound point (last → first) plays as a huge slide rather
    // than the visually-correct "next card in".
    if (pos > half) pos -= total;
    if (pos < -half) pos += total;

    const absPos = Math.abs(pos);

    // Scale curve: 1.0 at center, easing down through ~0.85 at
    // adjacent, ~0.7 at next-out, hidden beyond.
    const scale =
      absPos < 0.5
        ? 1 - absPos * 0.3
        : absPos < 1.5
        ? 0.85 - (absPos - 1) * 0.15
        : 0.7;

    // Opacity: solid at center, fading through adjacent, 0 beyond.
    const opacity =
      absPos < 0.5
        ? 1 - absPos * 1.2
        : absPos < 1.5
        ? 0.4 - (absPos - 1) * 0.4
        : 0;

    return {
      transform: [
        { perspective: 1000 },
        { translateX: pos * cardW * 0.45 },
        { scale },
        { rotateY: `${pos * -10}deg` },
      ],
      opacity: Math.max(0, opacity),
      // Center sits on top, adjacent next, others below. Cards with
      // 0 opacity still need a z-index so they don't accidentally
      // catch touch events through the nav buttons.
      zIndex: absPos < 0.5 ? 10 : absPos < 1.5 ? 5 : 1,
    };
  }, [cardW, total]);

  return (
    <Animated.View
      style={[styles.cardWrap, { width: cardW, height: cardH }, animStyle]}
      pointerEvents="none"
      accessible
      accessibilityLabel={image.alt}
      accessibilityRole="image"
    >
      <Image
        source={{ uri: image.src }}
        style={styles.cardImage}
        resizeMode="cover"
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    overflow: 'hidden',
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.lg,
    backgroundColor: 'transparent',
  },
  // Decorative blob washes. Soft violet that picks up the FRAME accent
  // without overpowering the card stack. opacity is split between the
  // base color alpha (15%) and the View itself so the blend stays
  // tasteful on the deep page bg.
  blobLeft: {
    position: 'absolute',
    top: -120,
    left: -120,
    width: 420,
    height: 420,
    borderRadius: 210,
    backgroundColor: 'rgba(124, 58, 237, 0.18)',
    opacity: 0.6,
  },
  blobRight: {
    position: 'absolute',
    top: -80,
    right: -140,
    width: 380,
    height: 380,
    borderRadius: 190,
    backgroundColor: 'rgba(99, 102, 241, 0.15)',
    opacity: 0.55,
  },
  content: {
    width: '100%',
    alignItems: 'center',
    gap: spacing.xl,
  },
  headerStack: {
    alignItems: 'center',
    gap: spacing.sm,
    maxWidth: 720,
  },
  // Title: large on big screens, scaled down for phones. The reference
  // uses text-4xl..6xl Tailwind utilities; we approximate with 28/40px.
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: colors.textPrimary,
    textAlign: 'center',
    letterSpacing: -1,
    lineHeight: 34,
  },
  titleLarge: {
    fontSize: 40,
    lineHeight: 46,
    letterSpacing: -1.5,
  },
  subtitle: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    fontSize: 15,
    lineHeight: 22,
    maxWidth: 520,
  },
  subtitleLarge: {
    fontSize: 17,
    lineHeight: 26,
  },
  stage: {
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  cardWrap: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
    // overflow:hidden on the wrapper so the Image's borderRadius is
    // honored consistently across iOS / Android / web (RN's <Image>
    // borderRadius is unreliable on iOS without overflow:hidden on a
    // parent).
    overflow: 'hidden',
    borderRadius: radii.xxl + 8,
    borderWidth: 2,
    borderColor: 'rgba(240, 240, 245, 0.1)',
    // Drop shadow gives the cards weight against the dark surface.
    // Matches FRAME shadows.card but tuned for the larger card size.
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.5,
    shadowRadius: 32,
    elevation: 12,
    backgroundColor: colors.bgCard,
  },
  cardImage: {
    width: '100%',
    height: '100%',
  },
  navBtn: {
    position: 'absolute',
    top: '50%',
    width: 40,
    height: 40,
    marginTop: -20,
    borderRadius: 20,
    backgroundColor: 'rgba(9, 9, 13, 0.6)',
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 20,
  },
  navBtnLeft: { left: spacing.sm },
  navBtnRight: { right: spacing.sm },
});
