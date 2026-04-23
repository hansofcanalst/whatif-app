import React, { useState } from 'react';
import { View, Image, Text, StyleSheet, LayoutChangeEvent } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { colors, layout, radii, typography } from '@/constants/theme';

interface BeforeAfterSliderProps {
  beforeURL: string;
  afterURL: string;
  height?: number;
  snapBack?: boolean;
}

export function BeforeAfterSlider({ beforeURL, afterURL, height, snapBack = false }: BeforeAfterSliderProps) {
  const [width, setWidth] = useState(0);
  const translateX = useSharedValue(0);
  const startX = useSharedValue(0);

  const onLayout = (e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    setWidth(w);
    translateX.value = w / 2;
  };

  // Pan gesture is attached to the ENTIRE container, not just the 36x36
  // handle. Attaching it to the handle meant the click-box traveled with
  // the handle and got clipped by the container's `overflow: hidden` near
  // x=0 and x=width — which is exactly the "hard to grab at the edges" bug
  // the user reported. onBegin snaps translateX to the tap location so
  // tapping anywhere in the slider also jumps the divider there; onUpdate
  // then tracks the drag relative to that anchor.
  const pan = Gesture.Pan()
    .onBegin((e) => {
      const next = Math.max(0, Math.min(width, e.x));
      startX.value = next;
      translateX.value = next;
    })
    .onUpdate((e) => {
      const next = startX.value + e.translationX;
      translateX.value = Math.max(0, Math.min(width, next));
    })
    .onEnd(() => {
      if (snapBack) translateX.value = withSpring(width / 2);
    });

  const afterStyle = useAnimatedStyle(() => ({
    width: translateX.value,
  }));
  const dividerStyle = useAnimatedStyle(() => ({
    left: translateX.value - 1,
  }));
  const handleStyle = useAnimatedStyle(() => ({
    left: translateX.value - 18,
  }));

  return (
    <GestureDetector gesture={pan}>
      <View style={[styles.container, height ? { height } : null]} onLayout={onLayout}>
        <Image source={{ uri: beforeURL }} style={styles.image} resizeMode="cover" />
        <Animated.View style={[styles.clipped, afterStyle]}>
          <Image source={{ uri: afterURL }} style={[styles.image, { width }]} resizeMode="cover" />
        </Animated.View>
        {/* All visual overlays use pointerEvents="none" so the gesture falls
            through to the container underneath — otherwise the handle and
            label pills would eat taps in their own bounds. */}
        <Animated.View style={[styles.divider, dividerStyle]} pointerEvents="none" />
        <Animated.View style={[styles.handle, handleStyle]} pointerEvents="none">
          <Text style={styles.handleIcon}>⇆</Text>
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
  divider: { position: 'absolute', top: 0, bottom: 0, width: 2, backgroundColor: colors.accent },
  handle: {
    position: 'absolute',
    top: '50%',
    marginTop: -18,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.textPrimary,
  },
  handleIcon: { fontSize: 16, color: colors.textPrimary, fontWeight: '900' },
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
