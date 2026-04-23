import React from 'react';
import { Pressable, Text, StyleSheet, View } from 'react-native';
import { Category } from '@/constants/categories';
import { colors, radii, spacing, typography } from '@/constants/theme';

interface CategoryCardProps {
  category: Category;
  onPress: (category: Category) => void;
  locked?: boolean;
}

// FRAME category card — flat surface-800 body, rounded-xl corner, subtle
// border. Emoji sits in an accent-tinted tile so the cards read as a
// toolkit grid rather than a row of buttons. Locked state shows a
// violet PRO label-tag in the corner.
export function CategoryCard({ category, onPress, locked }: CategoryCardProps) {
  return (
    <Pressable onPress={() => onPress(category)} style={({ pressed }) => [styles.card, pressed && styles.pressed]}>
      <View style={styles.emojiTile}>
        <Text style={styles.emoji}>{category.emoji}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.label}>{category.label}</Text>
        <Text style={styles.desc} numberOfLines={2}>
          {category.description}
        </Text>
      </View>
      {locked ? (
        <View style={styles.lock}>
          <Text style={styles.lockText}>PRO ✦</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    aspectRatio: 1,
    borderRadius: radii.xl,
    backgroundColor: colors.bgCard,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  pressed: {
    transform: [{ scale: 0.97 }],
    borderColor: 'rgba(124, 58, 237, 0.4)',
  },
  emojiTile: {
    width: 44,
    height: 44,
    borderRadius: radii.lg,
    backgroundColor: colors.accentDim,
    borderWidth: 1,
    borderColor: 'rgba(124, 58, 237, 0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emoji: { fontSize: 24 },
  label: { ...typography.h3, color: colors.textPrimary, fontSize: 16 },
  desc: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
  lock: {
    position: 'absolute',
    top: spacing.sm,
    right: spacing.sm,
    backgroundColor: colors.accentDim,
    paddingVertical: 2,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: 'rgba(124, 58, 237, 0.4)',
  },
  lockText: {
    ...typography.label,
    color: colors.accentText,
    fontSize: 9,
    letterSpacing: 1.5,
  },
});
