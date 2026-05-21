// Shared motion primitives for the FRAME design system.
//
// Two hooks extracted from the duplicated motion blocks that landed in
// CategoryCard / ResultCard / Button. The patterns were ~40 LOC each
// with identical structure (shared values, AccessibilityInfo check,
// spring/timing config) and only tuning numbers varying — the kind of
// subtle duplication that drifts between copies if left unchecked.
//
// Hooks:
//   - usePressScale: spring-physics scale animation tied to press
//     in/out handlers. Reusable for any pressable surface that wants
//     the "tactile shrink on press" feel without writing the shared
//     value plumbing every time.
//   - useCardEntrance: staggered fade-in + translate-up animation for
//     grid tiles. Respects prefers-reduced-motion and caps the per-tile
//     delay so the last tile in a long list doesn't feel sluggish.
//
// Both hooks intentionally return raw SharedValues rather than a
// pre-composed AnimatedStyle. The consumer combines them into a single
// useAnimatedStyle so RN-Reanimated's single-style-per-View constraint
// is honored (two separate animated styles each setting `transform`
// would overwrite each other). The 3-line composition at each call
// site is small enough that abstracting it further would obscure
// what's actually being transformed.

import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';
import {
  useSharedValue,
  withSpring,
  withTiming,
  withDelay,
  type SharedValue,
} from 'react-native-reanimated';

// ───────────────────────────────────────────────────────────────────
// usePressScale
// ───────────────────────────────────────────────────────────────────

interface UsePressScaleOptions {
  /** Scale value the surface drops to on press-in. Default 0.96. */
  pressedScale?: number;
  /** Spring config for the press-in phase. Default mirrors the FRAME
   *  Button: damping 16 / stiffness 320 — fast, controlled compression. */
  springIn?: { damping: number; stiffness: number };
  /** Spring config for the release. Default damping 12 / stiffness 220
   *  — slightly bouncier than the press-in so the release feels
   *  responsive without being jiggly. */
  springOut?: { damping: number; stiffness: number };
  /** When true, the press handlers are no-ops so disabled surfaces
   *  don't react to taps even if the underlying Pressable still fires
   *  them (some platforms do, depending on hitSlop). */
  disabled?: boolean;
}

interface UsePressScaleReturn {
  /** SharedValue that the consumer should read in useAnimatedStyle to
   *  drive the scale transform. */
  scale: SharedValue<number>;
  onPressIn: () => void;
  onPressOut: () => void;
}

const DEFAULT_SPRING_IN = { damping: 16, stiffness: 320 };
const DEFAULT_SPRING_OUT = { damping: 12, stiffness: 220 };

export function usePressScale({
  pressedScale = 0.96,
  springIn = DEFAULT_SPRING_IN,
  springOut = DEFAULT_SPRING_OUT,
  disabled = false,
}: UsePressScaleOptions = {}): UsePressScaleReturn {
  const scale = useSharedValue(1);

  const onPressIn = () => {
    if (disabled) return;
    scale.value = withSpring(pressedScale, springIn);
  };
  const onPressOut = () => {
    if (disabled) return;
    scale.value = withSpring(1, springOut);
  };

  return { scale, onPressIn, onPressOut };
}

// ───────────────────────────────────────────────────────────────────
// useCardEntrance
// ───────────────────────────────────────────────────────────────────

interface UseCardEntranceOptions {
  /** 0-based position in the grid. Drives the staggered delay. */
  index: number;
  /** Per-tile delay in ms. Default 40. ResultCard uses 50 for slightly
   *  larger tiles where a longer stagger reads better. */
  stagger?: number;
  /** Maximum total delay in ms. Beyond this, additional tiles still
   *  enter but at the cap — prevents the last tile in a long list
   *  from lagging visibly. Default 280. */
  maxDelay?: number;
  /** Distance the tile translates up from on entrance. Default 10. */
  distance?: number;
  /** Animation duration in ms (for the opacity fade). The translate
   *  uses a spring; only the fade is duration-bound. Default 280. */
  duration?: number;
}

interface UseCardEntranceReturn {
  /** SharedValue driving the translateY transform. Starts at `distance`,
   *  springs to 0. */
  enterY: SharedValue<number>;
  /** SharedValue driving the opacity. Starts at 0, fades to 1. */
  enterOpacity: SharedValue<number>;
}

export function useCardEntrance({
  index,
  stagger = 40,
  maxDelay = 280,
  distance = 10,
  duration = 280,
}: UseCardEntranceOptions): UseCardEntranceReturn {
  // Initial values: 0/1 (settled) so reduced-motion users see the card
  // in its final state immediately, and so a re-render mid-animation
  // doesn't flash a hidden card. The motion-enabled branch resets to
  // the entrance values inside the effect before kicking off the
  // animations.
  const enterY = useSharedValue(0);
  const enterOpacity = useSharedValue(1);
  // Tracked but not used externally — exposed only so future debug UIs
  // can introspect whether motion was disabled at mount.
  const [, setReduceMotion] = useState(false);

  useEffect(() => {
    let cancelled = false;
    AccessibilityInfo.isReduceMotionEnabled?.().then((reduce) => {
      if (cancelled) return;
      setReduceMotion(reduce);
      if (reduce) return;
      const delay = Math.min(index * stagger, maxDelay);
      enterY.value = distance;
      enterOpacity.value = 0;
      enterY.value = withDelay(delay, withSpring(0, { damping: 14, stiffness: 130 }));
      enterOpacity.value = withDelay(delay, withTiming(1, { duration }));
    });
    return () => {
      cancelled = true;
    };
    // Run-once-on-mount semantics. Including the option values in deps
    // would re-run the animation on prop changes, which would cause a
    // re-render mid-scroll to "re-enter" the tile from below. Not what
    // we want.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { enterY, enterOpacity };
}
