import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, SafeAreaView, ScrollView, Pressable } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { BeforeAfterSlider } from '@/components/BeforeAfterSlider';
import { ShareSheet } from '@/components/ShareSheet';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { useGenerationStore } from '@/stores/generationStore';
import { getGeneration, GenerationDoc } from '@/lib/firestore';
import { getCategory } from '@/constants/categories';
import { colors, radii, spacing, typography } from '@/constants/theme';

export default function ResultScreen() {
  const { id, idx } = useLocalSearchParams<{ id: string; idx?: string }>();
  const router = useRouter();
  const idxNum = idx ? parseInt(idx, 10) : 0;
  const { currentGenerationId, currentResults } = useGenerationStore();
  const [doc, setDoc] = useState<GenerationDoc | null>(null);

  useEffect(() => {
    if (!id) return;
    if (id === currentGenerationId && currentResults.length > 0) {
      return;
    }
    (async () => {
      const d = await getGeneration(id);
      if (d) setDoc(d);
    })();
  }, [id, currentGenerationId, currentResults.length]);

  const results = doc?.results ?? currentResults;
  const original = doc?.originalImageURL ?? useGenerationStore.getState().selectedPhotoUri;
  const categoryId = doc?.categoryId ?? useGenerationStore.getState().currentCategoryId ?? '';
  const current = results[idxNum];

  if (!current || !original) {
    return (
      <SafeAreaView style={[styles.safe, styles.center]}>
        <LoadingSpinner taglines={false} />
      </SafeAreaView>
    );
  }

  const category = getCategory(categoryId);

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.back}>
          <Text style={styles.backText}>←</Text>
        </Pressable>
        <View style={styles.headerTitle}>
          <Text style={styles.headerLabel}>Result</Text>
          <Text style={styles.title} numberOfLines={1}>
            {category?.label ?? 'Transformation'}
          </Text>
        </View>
        <View style={{ width: 40 }} />
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <BeforeAfterSlider beforeURL={original} afterURL={current.imageURL} />
        <View style={styles.captionCard}>
          <Text style={styles.captionLabel}>What If</Text>
          <Text style={styles.caption}>
            {category?.label ?? ''} <Text style={styles.captionArrow}>→</Text> {current.label}
          </Text>
        </View>
        <ShareSheet
          imageURL={current.imageURL}
          categoryLabel={category?.label ?? ''}
          subcategoryLabel={current.label}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  center: { alignItems: 'center', justifyContent: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerTitle: { alignItems: 'center', flex: 1 },
  headerLabel: {
    ...typography.label,
    color: colors.textLabel,
    fontSize: 10,
    marginBottom: 2,
  },
  back: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  backText: { color: colors.textPrimary, fontSize: 26 },
  title: { ...typography.h3, color: colors.textPrimary, textAlign: 'center' },
  content: { padding: spacing.xl, gap: spacing.lg, paddingBottom: spacing.xxxl },
  captionCard: {
    backgroundColor: colors.bgCard,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    alignItems: 'center',
    gap: 2,
  },
  captionLabel: { ...typography.label, color: colors.textLabel, fontSize: 10 },
  caption: { ...typography.bodyBold, color: colors.textPrimary, textAlign: 'center' },
  captionArrow: { color: colors.accent },
});
