import React, { useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { colors, spacing, typography } from '@/constants/theme';

const TAGLINES = [
  'Rewriting your DNA…',
  'Consulting the multiverse…',
  'Breaking the space-time continuum…',
  'Your other self is loading…',
  'Shuffling timelines…',
];

interface LoadingSpinnerProps {
  taglines?: boolean;
}

export function LoadingSpinner({ taglines = true }: LoadingSpinnerProps) {
  const spin = useSharedValue(0);
  const [idx, setIdx] = React.useState(0);

  useEffect(() => {
    spin.value = withRepeat(withTiming(1, { duration: 1500, easing: Easing.linear }), -1);
  }, [spin]);

  useEffect(() => {
    if (!taglines) return;
    const t = setInterval(() => setIdx((i) => (i + 1) % TAGLINES.length), 2200);
    return () => clearInterval(t);
  }, [taglines]);

  const style = useAnimatedStyle(() => ({
    transform: [{ rotate: `${spin.value * 360}deg` }],
  }));

  return (
    <View style={styles.container}>
      <Animated.View style={[styles.ring, style]} />
      {taglines ? <Text style={styles.tagline}>{TAGLINES[idx]}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: 'center', justifyContent: 'center', gap: spacing.xl },
  ring: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 4,
    borderColor: colors.border,
    borderTopColor: colors.accent,
  },
  tagline: { ...typography.body, color: colors.textSecondary, textAlign: 'center' },
});
