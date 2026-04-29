import React from 'react';
import { View, StyleSheet } from 'react-native';
import { ResultCard } from './ResultCard';
import { GenerationResult } from '@/lib/firestore';
import type { GenerationSlot } from '@/stores/generationStore';
import { spacing } from '@/constants/theme';

interface GridItem {
  label: string;
  status: 'pending' | 'complete' | 'failed';
  imageURL?: string;
  error?: string;
}

interface ResultsGridProps {
  /**
   * Completed-only shape — used by the gallery/result detail screens
   * that read a finished generation. Equivalent to passing an all-
   * `complete` slots array.
   */
  results?: GenerationResult[];
  /**
   * Slot shape — used by /generate/results to render progressively as
   * the NDJSON stream fills tiles in. Takes precedence over `results`
   * when both are passed (shouldn't happen in practice).
   */
  slots?: GenerationSlot[];
  /**
   * Called with the 0-based index of the pressed tile. Only invoked
   * for `complete` tiles — the ResultCard disables presses for
   * pending/failed.
   */
  onSelect: (index: number) => void;
  columns?: number;
  /**
   * Caption shown under the spinner on pending tiles. Plumbed from
   * /generate/results so every in-flight tile shares the same rotating
   * flavor line ("Consulting the multiverse…") in sync.
   */
  pendingCaption?: string;
}

export function ResultsGrid({ results, slots, onSelect, columns = 2, pendingCaption }: ResultsGridProps) {
  // Normalize both inputs to the same shape so the layout code below
  // doesn't care which one the caller passed.
  const items: GridItem[] = slots
    ? slots.map((s) => ({
        label: s.label,
        status: s.status,
        imageURL: s.result?.imageURL,
        error: s.error,
      }))
    : (results ?? []).map((r) => ({
        label: r.label,
        status: 'complete' as const,
        imageURL: r.imageURL,
      }));

  const rows: Array<Array<{ item: GridItem; i: number }>> = [];
  for (let i = 0; i < items.length; i += columns) {
    rows.push(
      items.slice(i, i + columns).map((item, j) => ({ item, i: i + j })),
    );
  }

  // When the ENTIRE grid is one partial row (e.g. a single-variant
  // run), we center the tile by splitting the leftover flex into
  // equal spacers on each side. For multi-row grids with a partial
  // last row (e.g. 5 items in 2 columns = 2 full rows + 1 lone tile),
  // we keep the original left-align behavior — that matches Western
  // reading order and keeps tile widths visually consistent down the
  // grid. The single-row case is the only one where left-aligning
  // looks like a layout bug rather than an intentional choice.
  const singleRowGrid = rows.length === 1;

  return (
    <View style={styles.grid}>
      {rows.map((row, rowIdx) => {
        const missing = columns - row.length;
        const centerThisRow = singleRowGrid && missing > 0;
        return (
          <View key={rowIdx} style={styles.row}>
            {centerThisRow ? <View style={{ flex: missing / 2 }} /> : null}
            {row.map(({ item, i }) => (
              <ResultCard
                key={i}
                imageURL={item.imageURL}
                label={item.label}
                status={item.status}
                error={item.error}
                pendingCaption={pendingCaption}
                onPress={() => onSelect(i)}
              />
            ))}
            {missing > 0 ? (
              <View style={{ flex: centerThisRow ? missing / 2 : missing }} />
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { gap: spacing.md },
  row: { flexDirection: 'row', gap: spacing.md },
});
