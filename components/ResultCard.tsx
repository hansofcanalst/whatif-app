import React from 'react';
import { Pressable, Image, Text, View, StyleSheet } from 'react-native';
import { colors, radii, spacing, typography } from '@/constants/theme';

interface ResultCardProps {
  imageURL: string;
  label: string;
  onPress: () => void;
}

// FRAME result thumbnail — rounded-xl card on surface-800 with a subtle
// border. Label rides along the bottom in a gradient-less dark bar so
// the image itself keeps the visual weight.
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
  card: {
    flex: 1,
    aspectRatio: 1,
    borderRadius: radii.xl,
    overflow: 'hidden',
    backgroundColor: colors.bgCard,
    borderWidth: 1,
    borderColor: colors.border,
  },
  pressed: { opacity: 0.9, transform: [{ scale: 0.98 }] },
  image: { width: '100%', height: '100%' },
  overlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: spacing.sm,
    backgroundColor: 'rgba(9,9,13,0.85)',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.06)',
  },
  label: { ...typography.caption, color: colors.textPrimary, fontWeight: '700' },
});
