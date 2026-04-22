import React from 'react';
import { View, StyleSheet } from 'react-native';
import { ResultCard } from './ResultCard';
import { GenerationResult } from '@/lib/firestore';
import { spacing } from '@/constants/theme';

interface ResultsGridProps {
  results: GenerationResult[];
  onSelect: (index: number) => void;
  columns?: number;
}

export function ResultsGrid({ results, onSelect, columns = 2 }: ResultsGridProps) {
  const rows: Array<Array<{ r: GenerationResult; i: number }>> = [];
  for (let i = 0; i < results.length; i += columns) {
    rows.push(
      results.slice(i, i + columns).map((r, j) => ({ r, i: i + j })),
    );
  }
  return (
    <View style={styles.grid}>
      {rows.map((row, i) => (
        <View key={i} style={styles.row}>
          {row.map(({ r, i: idx }) => (
            <ResultCard key={idx} imageURL={r.imageURL} label={r.label} onPress={() => onSelect(idx)} />
          ))}
          {row.length < columns ? <View style={{ flex: columns - row.length }} /> : null}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { gap: spacing.md },
  row: { flexDirection: 'row', gap: spacing.md },
});
