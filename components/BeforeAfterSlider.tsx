import React, { useState } from 'react';
import { View, Image, Text, StyleSheet, LayoutChangeEvent } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import { colors, layout, radii, typography } from '@/constants/theme';

interface BeforeAfterSliderProps {
  beforeURL: string;
  afterURL: string;
  height?: number;
  snapBack?: boolean;
}

// Slider handle dimensions. 48×48 is the reference design's size — big
// enough to read as a tactile control without dominating the image. The
// margin offsets below (handle position, divider line offset, etc.)
// derive from this constant so any future resize stays consistent.
const HANDLE_SIZE = 48;
const HANDLE_RADIUS = HANDLE_SIZE / 2;
// Scale value when the user is actively dragging — same 1.10 the
// reference uses. Driven by a single shared value through withSpring
// so the bounce-out on release feels tactile.
const HANDLE_PRESSED_SCALE = 1.1;
// Dark chevron color on the off-white handle. Mirrors the reference's
// `text-gray-700` (#374151). Hex literal because the theme doesn't
// expose a neutral mid-dark gray — every "dark" token in the FRAME
// palette is violet-tinted and too cool against off-white.
const HANDLE_ICON_COLOR = '#374151';

export function BeforeAfterSlider({ beforeURL, afterURL, height, snapBack = false }: BeforeAfterSliderProps) {
  const [width, setWidth] = useState(0);
  const translateX = useSharedValue(0);
  const startX = useSharedValue(0);
  // Drag-active scale + shadow intensity. Driven by gesture onBegin /
  // onEnd so the handle visibly responds the instant the user picks
  // it up. Without this the handle felt anchored / dead; with it the
  // surface reads as a tactile control.
  const pressed = useSharedValue(0);

  const onLayout = (e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    setWidth(w);
    translateX.value = w / 2;
  };

  // Pan gesture is attached to the ENTIRE container, not just the
  // handle. Attaching it to the handle meant the click-box traveled
  // with the handle and got clipped by the container's `overflow:
  // hidden` near x=0 and x=width — exactly the "hard to grab at the
  // edges" bug. onBegin snaps translateX to the tap location so
  // tapping anywhere in the slider also jumps the divider there;
  // onUpdate tracks the drag relative to that anchor.
  const pan = Gesture.Pan()
    .onBegin((e) => {
      const next = Math.max(0, Math.min(width, e.x));
      startX.value = next;
      translateX.value = next;
      // Spring tuning: a touch springier than the press-scale used on
      // buttons (damping 14 vs 18) because the user can hold the
      // handle for an arbitrarily long time and a too-stiff response
      // looks anchored. The release spring (onEnd) uses the same
      // softness for visual symmetry.
      pressed.value = withSpring(1, { damping: 14, stiffness: 240 });
    })
    .onUpdate((e) => {
      const next = startX.value + e.translationX;
      translateX.value = Math.max(0, Math.min(width, next));
    })
    .onEnd(() => {
      pressed.value = withSpring(0, { damping: 14, stiffness: 220 });
      if (snapBack) translateX.value = withSpring(width / 2);
    });

  const afterStyle = useAnimatedStyle(() => ({
    width: translateX.value,
  }));
  const dividerStyle = useAnimatedStyle(() => ({
    left: translateX.value - 1,
  }));
  const handleStyle = useAnimatedStyle(() => {
    // Interpolate the scale + shadow intensity from `pressed` (0..1).
    // Done inline rather than via `interpolate()` because the math is
    // trivial and the JS-thread call cost is meaningful when this is
    // recomputed on every gesture frame.
    const scale = 1 + (HANDLE_PRESSED_SCALE - 1) * pressed.value;
    return {
      left: translateX.value - HANDLE_RADIUS,
      transform: [{ scale }],
      // Shadow opacity ramps from 0.25 (idle) to 0.5 (active). On
      // native, iOS picks this up via `shadowOpacity`; Android uses
      // the static elevation in the base style (animating elevation
      // is unreliable). On web, RN-Web applies it via box-shadow.
      shadowOpacity: 0.25 + 0.25 * pressed.value,
      shadowRadius: 8 + 8 * pressed.value,
    };
  });

  return (
    <GestureDetector gesture={pan}>
      <View style={[styles.container, height ? { height } : null]} onLayout={onLayout}>
        <Image source={{ uri: beforeURL }} style={styles.image} resizeMode="cover" />
        <Animated.View style={[styles.clipped, afterStyle]}>
          <Image source={{ uri: afterURL }} style={[styles.image, { width }]} resizeMode="cover" />
        </Animated.View>
        {/* All visual overlays use pointerEvents="none" so the gesture
            falls through to the container underneath — otherwise the
            handle and label pills would eat taps in their own bounds. */}
        <Animated.View style={[styles.divider, dividerStyle]} pointerEvents="none" />
        <Animated.View style={[styles.handle, handleStyle]} pointerEvents="none">
          {/* Chevron pair (ChevronLeft + ChevronRight) replaces the
              previous single ArrowLeftRight icon. Two outward-pointing
              chevrons read more clearly as "drag in either direction"
              than a single double-headed arrow — the reference design
              uses two SVG <line>s for the same reason. Slight negative
              gap so the chevron tips overlap a touch, mimicking the
              dense "><" shape from the reference. */}
          <View style={styles.handleIconRow}>
            <ChevronLeft
              size={18}
              color={HANDLE_ICON_COLOR}
              strokeWidth={2.5}
            />
            <ChevronRight
              size={18}
              color={HANDLE_ICON_COLOR}
              strokeWidth={2.5}
            />
          </View>
        </Animated.View>
        <View style={[styles.labelPill, { left: 12 }]} pointerEvents="none">
          <Text style={styles.labelText}>BEFORE</Text>
        </View>
        <View style={[styles.labelPill, { right: 12 }]} pointerEvents="none">
          <Text style={styles.labelText}>AFTER</Text>
        </View>
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    maxWidth: layout.maxContentWidth,
    alignSelf: 'center',
    aspectRatio: 1,
    borderRadius: radii.xxl,
    overflow: 'hidden',
    backgroundColor: colors.bgCard,
    borderWidth: 1,
    borderColor: colors.border,
    position: 'relative',
  },
  image: { width: '100%', height: '100%', position: 'absolute' },
  clipped: { height: '100%', overflow: 'hidden', position: 'absolute', left: 0, top: 0 },
  // Divider line — kept at the brand violet so the slider still reads
  // as "ours" even with the cleaner white handle. The handle pulls
  // visual weight to the center; the violet line is the brand mark.
  divider: { position: 'absolute', top: 0, bottom: 0, width: 2, backgroundColor: colors.accent },
  handle: {
    position: 'absolute',
    top: '50%',
    marginTop: -HANDLE_RADIUS,
    width: HANDLE_SIZE,
    height: HANDLE_SIZE,
    borderRadius: HANDLE_RADIUS,
    // White handle (reference design) — reads as a neutral focal
    // point against any image content. The shadow + scale-on-drag
    // do the work of communicating "interactive surface" so we
    // don't need a colored fill or border to signal it.
    backgroundColor: colors.textPrimary,
    alignItems: 'center',
    justifyContent: 'center',
    // Drop shadow + Android elevation. Shadow values are also
    // animated (see handleStyle) on iOS / web; elevation is the
    // static Android stand-in.
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 6,
  },
  // Row container for the two chevrons inside the handle. Negative
  // marginHorizontal pulls the chevron tips closer together so they
  // read as a single "><" affordance instead of two separated icons.
  handleIconRow: {
    flexDirection: 'row',
    alignItems: 'center',
    // The lucide chevrons have built-in stroke padding; pull them
    // together by 6px so they sit at the same visual density as the
    // reference's two SVG <line> elements.
    marginHorizontal: -3,
  },
  labelPill: {
    position: 'absolute',
    top: 12,
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: radii.pill,
    backgroundColor: 'rgba(9,9,13,0.75)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  labelText: { ...typography.label, color: colors.textPrimary, fontSize: 10 },
});
