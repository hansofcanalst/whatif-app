import React, { useMemo } from 'react';
import { View, Text, StyleSheet, SafeAreaView, ScrollView, Pressable, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { ResultsGrid } from '@/components/ResultsGrid';
import { Button } from '@/components/ui/Button';
import { useGenerationStore } from '@/stores/generationStore';
import { getCategory } from '@/constants/categories';
import { colors, radii, spacing, typography } from '@/constants/theme';

export default function ResultsScreen() {
  const router = useRouter();
  const {
    currentResults,
    currentGenerationId,
    currentCategoryId,
    generationSlots,
    generationInFlight,
  } = useGenerationStore();
  const category = currentCategoryId ? getCategory(currentCategoryId) : null;

  // Prefer slots when the stream is active or has produced any slots —
  // the slot shape carries pending/failed status the plain results list
  // can't express. Fall back to currentResults so this screen still
  // works if someone wires it up for a non-streaming code path.
  const usingSlots = generationInFlight || generationSlots.length > 0;

  // Progress summary (X of N complete, K failed). Only shown while the
  // stream is running — once complete, the grid itself is the status.
  const progress = useMemo(() => {
    const total = generationSlots.length;
    const complete = generationSlots.filter((s) => s.status === 'complete').length;
    const failed = generationSlots.filter((s) => s.status === 'failed').length;
    return { total, complete, failed };
  }, [generationSlots]);

  const onSelect = (idx: number) => {
    // Defer tile taps until the stream is done. Mid-stream, the
    // Firestore/localGallery record hasn't been written yet, so the
    // /result/[id] detail screen (which reads from those stores) would
    // land on an empty document. Once the stream closes, both writes
    // have happened and navigation works normally.
    if (generationInFlight) return;
    if (!currentGenerationId) return;
    router.push(`/result/${currentGenerationId}?idx=${idx}`);
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Pressable onPress={() => router.replace('/(tabs)/home')} style={styles.close}>
          <Text style={styles.closeText}>✕</Text>
        </Pressable>
        <View style={styles.headerTitle}>
          <Text style={styles.headerLabel}>Results</Text>
          <Text style={styles.title}>Your What Ifs</Text>
        </View>
        <View style={{ width: 40 }} />
      </View>
      {category ? (
        <View style={styles.categoryTag}>
          <Text style={styles.categoryText}>
            {category.emoji} {category.label}
          </Text>
        </View>
      ) : null}

      {/* Streaming progress strip. Shown only while the NDJSON stream
          is still open. Disappears once the server sends `done`, at
          which point the grid itself communicates the final state. */}
      {generationInFlight ? (
        <View style={styles.progressStrip}>
          <ActivityIndicator color={colors.accent} />
          <Text style={styles.progressText}>
            {progress.complete}/{progress.total} ready
            {progress.failed > 0 ? ` · ${progress.failed} failed` : ''}
          </Text>
        </View>
      ) : null}

      <ScrollView contentContainerStyle={styles.content}>
        {usingSlots ? (
          <ResultsGrid slots={generationSlots} onSelect={onSelect} />
        ) : (
          <ResultsGrid results={currentResults} onSelect={onSelect} />
        )}
        <View style={styles.actions}>
          <Button
            label="Generate More"
            variant="secondary"
            onPress={() => router.back()}
            style={{ flex: 1 }}
            disabled={generationInFlight}
          />
          <Button
            label="Done"
            onPress={() => router.replace('/(tabs)/gallery')}
            style={{ flex: 1 }}
            disabled={generationInFlight}
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerTitle: { alignItems: 'center' },
  headerLabel: {
    ...typography.label,
    color: colors.textLabel,
    fontSize: 10,
    marginBottom: 2,
  },
  close: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  closeText: { color: colors.textPrimary, fontSize: 20 },
  title: { ...typography.h3, color: colors.textPrimary },
  categoryTag: {
    alignSelf: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: 999,
    backgroundColor: colors.accentDim,
    borderWidth: 1,
    borderColor: 'rgba(124, 58, 237, 0.3)',
    marginTop: spacing.md,
  },
  categoryText: { ...typography.caption, color: colors.accentText, fontWeight: '700' },
  progressStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radii.pill,
    backgroundColor: colors.bgCard,
    borderWidth: 1,
    borderColor: colors.border,
    alignSelf: 'center',
    marginTop: spacing.md,
  },
  progressText: { ...typography.caption, color: colors.textSecondary, fontWeight: '600' },
  content: { padding: spacing.xl, gap: spacing.xl, paddingBottom: spacing.xxxl },
  actions: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.lg },
});
