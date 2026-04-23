import React from 'react';
import { View, StyleSheet } from 'react-native';
import { CategoryCard } from './CategoryCard';
import { CATEGORIES, Category } from '@/constants/categories';
import { layout, spacing } from '@/constants/theme';

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
  // Cap the grid to the same phone-ish width PhotoUploader and
  // BeforeAfterSlider use. Without this cap, on wide (desktop web)
  // viewports the 1:1 cards balloon to ~400px squares because flex:1
  // takes half the ScrollView width each. `alignSelf: 'center'` keeps
  // the grid centered on the page when the viewport is wider than the
  // cap — same pattern every other top-level component follows.
  grid: {
    gap: spacing.md,
    width: '100%',
    maxWidth: layout.maxContentWidth,
    alignSelf: 'center',
  },
  row: { flexDirection: 'row', gap: spacing.md },
});
