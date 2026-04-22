import React from 'react';
import { View, StyleSheet } from 'react-native';
import { CategoryCard } from './CategoryCard';
import { CATEGORIES, Category } from '@/constants/categories';
import { spacing } from '@/constants/theme';

interface CategoryGridProps {
  onSelect: (category: Category) => void;
  isPro: boolean;
}

export function CategoryGrid({ onSelect, isPro }: CategoryGridProps) {
  const rows: Category[][] = [];
  for (let i = 0; i < CATEGORIES.length; i += 2) {
    rows.push(CATEGORIES.slice(i, i + 2));
  }
  return (
    <View style={styles.grid}>
      {rows.map((row, i) => (
        <View key={i} style={styles.row}>
          {row.map((c) => (
            <CategoryCard key={c.id} category={c} onPress={onSelect} locked={c.isPremium && !isPro} />
          ))}
          {row.length === 1 ? <View style={{ flex: 1 }} /> : null}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { gap: spacing.md },
  row: { flexDirection: 'row', gap: spacing.md },
});
