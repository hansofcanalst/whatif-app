import React from 'react';
import { Pressable, View, Text, Image, StyleSheet } from 'react-native';
import { useImagePicker, PickedImage } from '@/hooks/useImagePicker';
import { colors, radii, spacing, typography } from '@/constants/theme';

interface PhotoUploaderProps {
  image: PickedImage | null;
  onPicked: (image: PickedImage | null) => void;
}

export function PhotoUploader({ image, onPicked }: PhotoUploaderProps) {
  const { pick } = useImagePicker();

  const handlePress = async () => {
    const res = await pick();
    if (res) onPicked(res);
  };

  if (image) {
    return (
      <View style={styles.container}>
        <Image source={{ uri: image.uri }} style={styles.image} />
        <Pressable onPress={handlePress} style={styles.changeBtn}>
          <Text style={styles.changeText}>Change photo</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <Pressable onPress={handlePress} style={styles.empty}>
      <Text style={styles.cameraIcon}>📷</Text>
      <Text style={styles.emptyTitle}>Upload a photo</Text>
      <Text style={styles.emptySub}>Tap to pick from your camera roll</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { width: '100%', alignItems: 'center', gap: spacing.md },
  image: { width: '100%', aspectRatio: 1, borderRadius: radii.lg, backgroundColor: colors.bgCard },
  changeBtn: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.pill,
    backgroundColor: colors.bgCard,
    borderWidth: 1,
    borderColor: colors.border,
  },
  changeText: { ...typography.bodyBold, color: colors.textPrimary },
  empty: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: radii.lg,
    borderWidth: 2,
    borderColor: colors.accent,
    borderStyle: 'dashed',
    backgroundColor: colors.bgCard,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  cameraIcon: { fontSize: 56 },
  emptyTitle: { ...typography.h2, color: colors.textPrimary },
  emptySub: { ...typography.caption, color: colors.textSecondary },
});
