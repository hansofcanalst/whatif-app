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

  const pan = Gesture.Pan()
    .onBegin(() => {
      startX.value = translateX.value;
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
    <View style={[styles.container, height ? { height } : null]} onLayout={onLayout}>
      <Image source={{ uri: beforeURL }} style={styles.image} resizeMode="cover" />
      <Animated.View style={[styles.clipped, afterStyle]}>
        <Image source={{ uri: afterURL }} style={[styles.image, { width }]} resizeMode="cover" />
      </Animated.View>
      <Animated.View style={[styles.divider, dividerStyle]} />
      <GestureDetector gesture={pan}>
        <Animated.View style={[styles.handle, handleStyle]}>
          <Text style={styles.handleIcon}>⇆</Text>
        </Animated.View>
      </GestureDetector>
      <View style={[styles.labelPill, { left: 12 }]}>
        <Text style={styles.labelText}>BEFORE</Text>
      </View>
      <View style={[styles.labelPill, { right: 12 }]}>
        <Text style={styles.labelText}>AFTER</Text>
      </View>
    </View>
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
