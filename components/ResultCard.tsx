import React from 'react';
import { Pressable, Image, Text, View, StyleSheet } from 'react-native';
import { colors, radii, spacing, typography } from '@/constants/theme';

interface ResultCardProps {
  imageURL: string;
  label: string;
  onPress: () => void;
}

export function ResultCard({ imageURL, label, onPress }: ResultCardProps) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.card, pressed && styles.pressed]}>
      <Image source={{ uri: imageURL }} style={styles.image} />
      <View style={styles.overlay}>
        <Text style={styles.label} numberOfLines={1}>
          {label}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { flex: 1, aspectRatio: 1, borderRadius: radii.lg, overflow: 'hidden', backgroundColor: colors.bgCard },
  pressed: { opacity: 0.9 },
  image: { width: '100%', height: '100%' },
  overlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: spacing.sm,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  label: { ...typography.caption, color: colors.textPrimary, fontWeight: '700' },
});
