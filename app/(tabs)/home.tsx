import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, SafeAreaView, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { PhotoUploader } from '@/components/PhotoUploader';
import { CategoryGrid } from '@/components/CategoryGrid';
import { GenerationCounter } from '@/components/GenerationCounter';
import { PeopleSelector } from '@/components/PeopleSelector';
import { PaywallModal } from '@/components/ui/PaywallModal';
import { useToast } from '@/components/ui/Toast';
import { useGenerationStore } from '@/stores/generationStore';
import { useSubscriptionStore } from '@/stores/subscriptionStore';
import { Category } from '@/constants/categories';
import { PickedImage } from '@/hooks/useImagePicker';
import { requestDetection } from '@/lib/detect';
import { colors, fontFamily, radii, spacing, typography } from '@/constants/theme';

export default function Home() {
  const router = useRouter();
  const { show } = useToast();
  const {
    setPhoto,
    detectionStatus,
    detectedPeople,
    selectedPersonIds,
    setDetectionStatus,
    setDetectedPeople,
    togglePersonSelected,
    setAllPersonSelection,
  } = useGenerationStore();
  const { isActive: isPro } = useSubscriptionStore();
  const [image, setImage] = useState<PickedImage | null>(null);
  const [paywall, setPaywall] = useState(false);

  // Kick off people detection whenever a new photo lands. We key the effect
  // on `image` only — NOT on `detectionStatus`. Including status in the deps
  // caused a race: setDetectionStatus('detecting') re-triggers the effect,
  // which runs the previous effect's cleanup (cancelled = true) before the
  // fetch resolves, so the success handler bails out and the UI sticks on
  // "Detecting people…" forever. Zustand action references are stable, so
  // they're safe to list without causing re-runs.
  useEffect(() => {
    if (!image) return;
    let cancelled = false;
    setDetectionStatus('detecting');
    requestDetection(image.base64)
      .then((res) => {
        if (cancelled) return;
        setDetectedPeople(res.people);
        setDetectionStatus('ready');
      })
      .catch((e) => {
        if (cancelled) return;
        // Detection failure is non-fatal — user can still generate on the
        // full image. Log + mark failed so we don't retry in a loop.
        console.warn('[home] detection failed', e);
        setDetectedPeople([]);
        setDetectionStatus('failed');
      });
    return () => {
      cancelled = true;
    };
  }, [image, setDetectionStatus, setDetectedPeople]);

  const handlePicked = (img: PickedImage | null) => {
    setImage(img);
    setPhoto(img?.uri ?? null, img?.base64 ?? null);
  };

  const handleSelect = (category: Category) => {
    if (!image) {
      show('Upload a photo first.', 'error');
      return;
    }
    if (category.isPremium && !isPro) {
      setPaywall(true);
      return;
    }
    if (detectionStatus === 'detecting') {
      show('Still detecting people — hang on a sec.', 'info');
      return;
    }
    if (detectedPeople.length > 1 && selectedPersonIds.length === 0) {
      show('Pick at least one person to transform.', 'error');
      return;
    }
    setPhoto(image.uri, image.base64);
    router.push(`/generate/${category.id}`);
  };

  const showSelector = detectionStatus === 'ready' && detectedPeople.length > 1;

  return (
    <SafeAreaView style={styles.safe}>
      {/* FRAME header — mono wordmark on the left, compact label-tag on
          the right. Sits on the page bg (not elevated) so it reads as
          "document chrome" rather than a toolbar. */}
      <View style={styles.topBar}>
        <Text style={styles.logo}>What<Text style={styles.logoAccent}>If</Text></Text>
        <GenerationCounter />
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        {/* FRAME hero — three-word tagline where the verb lives in the
            accent. Short copy, tight leading, reads as a tool tagline. */}
        <View style={styles.hero}>
          <Text style={styles.heroTitle}>
            Drop. Analyze. <Text style={styles.heroAccent}>Edit.</Text>
          </Text>
          <Text style={styles.heroSub}>
            Upload a photo and see yourself across the multiverse.
          </Text>
        </View>

        <PhotoUploader image={image} onPicked={handlePicked} />

        {image && detectionStatus === 'detecting' ? (
          <View style={styles.statusRow}>
            <ActivityIndicator color={colors.accent} />
            <Text style={styles.statusText}>Detecting people…</Text>
          </View>
        ) : null}

        {image && detectionStatus === 'failed' ? (
          <Text style={styles.statusTextMuted}>
            Couldn't detect people — we'll just transform the whole image.
          </Text>
        ) : null}

        {image && detectionStatus === 'ready' && detectedPeople.length === 0 ? (
          <Text style={styles.statusTextMuted}>
            No people found — we'll transform the whole image.
          </Text>
        ) : null}

        {showSelector ? (
          <View style={styles.selectorWrap}>
            <Text style={styles.sectionLabel}>
              People · {detectedPeople.length} detected
            </Text>
            <Text style={styles.selectorTitle}>Pick who to transform</Text>
            <PeopleSelector
              imageUri={image!.uri}
              people={detectedPeople}
              selectedIds={selectedPersonIds}
              onToggle={togglePersonSelected}
              onSelectAll={() => setAllPersonSelection(true)}
              onSelectNone={() => setAllPersonSelection(false)}
            />
          </View>
        ) : null}

        <View style={styles.categorySection}>
          <Text style={styles.sectionLabel}>Transformations</Text>
          <Text style={styles.sectionTitle}>Pick a direction</Text>
          <View style={{ height: spacing.md }} />
          <CategoryGrid onSelect={handleSelect} isPro={isPro} />
        </View>
      </ScrollView>
      <PaywallModal visible={paywall} onClose={() => setPaywall(false)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  // JetBrains Mono wordmark — "What" in off-white, "If" in accent for the
  // FRAME brand-split look.
  logo: {
    fontFamily: fontFamily.mono,
    fontSize: 20,
    fontWeight: '800',
    color: colors.textPrimary,
    letterSpacing: -0.5,
  },
  logoAccent: { color: colors.accent },
  content: { padding: spacing.xl, gap: spacing.xl, paddingBottom: spacing.xxxl },
  hero: { gap: spacing.sm },
  heroTitle: {
    fontSize: 34,
    fontWeight: '800',
    color: colors.textPrimary,
    letterSpacing: -1.2,
    lineHeight: 40,
  },
  heroAccent: { color: colors.accent },
  heroSub: {
    ...typography.body,
    color: colors.textSecondary,
    lineHeight: 22,
  },
  sectionLabel: {
    ...typography.label,
    color: colors.textLabel,
    marginBottom: spacing.xs,
  },
  sectionTitle: { ...typography.h2, color: colors.textPrimary },
  categorySection: { gap: 2 },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    alignSelf: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radii.pill,
    backgroundColor: colors.bgCard,
    borderWidth: 1,
    borderColor: colors.border,
  },
  statusText: { ...typography.caption, color: colors.textSecondary },
  statusTextMuted: {
    ...typography.caption,
    color: colors.textMuted,
    textAlign: 'center',
  },
  selectorWrap: { gap: spacing.sm },
  selectorTitle: {
    ...typography.h3,
    color: colors.textPrimary,
  },
});
