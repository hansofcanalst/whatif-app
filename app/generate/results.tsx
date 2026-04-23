import React from 'react';
import { View, Text, StyleSheet, SafeAreaView, ScrollView, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { ResultsGrid } from '@/components/ResultsGrid';
import { Button } from '@/components/ui/Button';
import { useGenerationStore } from '@/stores/generationStore';
import { getCategory } from '@/constants/categories';
import { colors, spacing, typography } from '@/constants/theme';

export default function ResultsScreen() {
  const router = useRouter();
  const { currentResults, currentGenerationId, currentCategoryId } = useGenerationStore();
  const category = currentCategoryId ? getCategory(currentCategoryId) : null;

  const onSelect = (idx: number) => {
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
      <ScrollView contentContainerStyle={styles.content}>
        <ResultsGrid results={currentResults} onSelect={onSelect} />
        <View style={styles.actions}>
          <Button
            label="Generate More"
            variant="secondary"
            onPress={() => router.back()}
            style={{ flex: 1 }}
          />
          <Button
            label="Done"
            onPress={() => router.replace('/(tabs)/gallery')}
            style={{ flex: 1 }}
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
  content: { padding: spacing.xl, gap: spacing.xl, paddingBottom: spacing.xxxl },
  actions: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.lg },
});
