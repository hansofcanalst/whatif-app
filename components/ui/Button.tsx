import React from 'react';
import { Pressable, Text, StyleSheet, ActivityIndicator, ViewStyle, TextStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { colors, radii, spacing, typography } from '@/constants/theme';

type Variant = 'primary' | 'secondary' | 'ghost';

interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: Variant;
  disabled?: boolean;
  loading?: boolean;
  style?: ViewStyle;
  textStyle?: TextStyle;
  icon?: React.ReactNode;
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  disabled,
  loading,
  style,
  textStyle,
  icon,
}: ButtonProps) {
  const handlePress = () => {
    if (disabled || loading) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    onPress();
  };

  const content = (
    <>
      {loading ? (
        <ActivityIndicator color={colors.textPrimary} />
      ) : (
        <>
          {icon}
          <Text style={[styles.label, textStyle]}>{label}</Text>
        </>
      )}
    </>
  );

  if (variant === 'primary') {
    return (
      <Pressable onPress={handlePress} style={({ pressed }) => [styles.wrapper, style, pressed && styles.pressed]}>
        <LinearGradient
          colors={[colors.gradientStart, colors.gradientEnd]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.gradient, disabled && styles.disabled]}
        >
          {content}
        </LinearGradient>
      </Pressable>
    );
  }

  const bg = variant === 'secondary' ? colors.bgCard : 'transparent';
  const border = variant === 'ghost' ? colors.border : 'transparent';
  return (
    <Pressable
      onPress={handlePress}
      style={({ pressed }) => [
        styles.base,
        { backgroundColor: bg, borderColor: border, borderWidth: variant === 'ghost' ? 1 : 0 },
        disabled && styles.disabled,
        pressed && styles.pressed,
        style,
      ]}
    >
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrapper: { borderRadius: radii.pill },
  gradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.md + 2,
    paddingHorizontal: spacing.xl,
    borderRadius: radii.pill,
    gap: spacing.sm,
  },
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.md + 2,
    paddingHorizontal: spacing.xl,
    borderRadius: radii.pill,
    gap: spacing.sm,
  },
  label: { ...typography.bodyBold, color: colors.textPrimary },
  disabled: { opacity: 0.45 },
  pressed: { transform: [{ scale: 0.97 }] },
});
