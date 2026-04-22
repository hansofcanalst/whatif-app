import React, { useState } from 'react';
import { View, Text, ScrollView, StyleSheet, SafeAreaView } from 'react-native';
import { useRouter } from 'expo-router';
import { PhotoUploader } from '@/components/PhotoUploader';
import { CategoryGrid } from '@/components/CategoryGrid';
import { GenerationCounter } from '@/components/GenerationCounter';
import { PaywallModal } from '@/components/ui/PaywallModal';
import { useToast } from '@/components/ui/Toast';
import { useGenerationStore } from '@/stores/generationStore';
import { useSubscriptionStore } from '@/stores/subscriptionStore';
import { Category } from '@/constants/categories';
import { PickedImage } from '@/hooks/useImagePicker';
import { colors, spacing, typography } from '@/constants/theme';

export default function Home() {
  const router = useRouter();
  const { show } = useToast();
  const { setPhoto } = useGenerationStore();
  const { isActive: isPro } = useSubscriptionStore();
  const [image, setImage] = useState<PickedImage | null>(null);
  const [paywall, setPaywall] = useState(false);

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
    // Defensive: store was written in handlePicked, but re-confirm before nav.
    setPhoto(image.uri, image.base64);
    router.push(`/generate/${category.id}`);
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.topBar}>
        <Text style={styles.logo}>What If</Text>
        <GenerationCounter />
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <PhotoUploader image={image} onPicked={handlePicked} />
        <Text style={styles.sectionTitle}>Pick a transformation</Text>
        <CategoryGrid onSelect={handleSelect} isPro={isPro} />
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
  },
  logo: { ...typography.h1, color: colors.textPrimary },
  content: { padding: spacing.xl, gap: spacing.xl, paddingBottom: spacing.xxxl },
  sectionTitle: { ...typography.h2, color: colors.textPrimary },
});
