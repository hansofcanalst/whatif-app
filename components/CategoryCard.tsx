import React from 'react';
import { Pressable, Text, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Category } from '@/constants/categories';
import { colors, radii, spacing, typography } from '@/constants/theme';

interface CategoryCardProps {
  category: Category;
  onPress: (category: Category) => void;
  locked?: boolean;
}

export function CategoryCard({ category, onPress, locked }: CategoryCardProps) {
  return (
    <Pressable onPress={() => onPress(category)} style={({ pressed }) => [styles.card, pressed && styles.pressed]}>
      <LinearGradient
        colors={[colors.bgCard, colors.bgElevated]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.gradient}
      >
        <Text style={styles.emoji}>{category.emoji}</Text>
        <Text style={styles.label}>{category.label}</Text>
        <Text style={styles.desc} numberOfLines={2}>
          {category.description}
        </Text>
        {locked ? (
          <View style={styles.lock}>
            <Text style={styles.lockText}>🔒 PRO</Text>
          </View>
        ) : null}
      </LinearGradient>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { flex: 1, aspectRatio: 1, borderRadius: radii.lg, overflow: 'hidden' },
  pressed: { transform: [{ scale: 0.97 }] },
  gradient: {
    flex: 1,
    padding: spacing.lg,
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.lg,
  },
  emoji: { fontSize: 40 },
  label: { ...typography.h3, color: colors.textPrimary },
  desc: { ...typography.caption, color: colors.textSecondary },
  lock: {
    position: 'absolute',
    top: spacing.sm,
    right: spacing.sm,
    backgroundColor: colors.accent,
    paddingVertical: 2,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.pill,
  },
  lockText: { ...typography.tiny, color: colors.textPrimary },
});
