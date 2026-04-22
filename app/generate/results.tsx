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
        <Text style={styles.title}>Your What Ifs</Text>
        <View style={{ width: 40 }} />
      </View>
      {category ? <Text style={styles.subtitle}>{category.emoji} {category.label}</Text> : null}
      <ScrollView contentContainerStyle={styles.content}>
        <ResultsGrid results={currentResults} onSelect={onSelect} />
        <View style={styles.actions}>
          <Button label="Generate More" variant="secondary" onPress={() => router.back()} style={{ flex: 1 }} />
          <Button label="Done" onPress={() => router.replace('/(tabs)/gallery')} style={{ flex: 1 }} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: spacing.lg },
  close: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  closeText: { color: colors.textPrimary, fontSize: 22 },
  title: { ...typography.h2, color: colors.textPrimary },
  subtitle: { ...typography.body, color: colors.textSecondary, textAlign: 'center', marginBottom: spacing.md },
  content: { padding: spacing.xl, gap: spacing.xl, paddingBottom: spacing.xxxl },
  actions: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.lg },
});
