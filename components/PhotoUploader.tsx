import React from 'react';
import { Pressable, View, Text, Image, StyleSheet } from 'react-native';
import { useImagePicker, PickedImage } from '@/hooks/useImagePicker';
import { colors, layout, radii, spacing, typography } from '@/constants/theme';

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

  const handleRemove = () => onPicked(null);

  if (image) {
    return (
      <View style={styles.container}>
        <View style={styles.imageWrap}>
          <Image source={{ uri: image.uri }} style={styles.image} />
          <Pressable
            onPress={handleRemove}
            style={styles.removeBtn}
            hitSlop={8}
            accessibilityLabel="Remove photo"
          >
            <Text style={styles.removeText}>✕</Text>
          </Pressable>
        </View>
        <View style={styles.actionsRow}>
          <Pressable onPress={handlePress} style={styles.actionBtn}>
            <Text style={styles.actionText}>Change photo</Text>
          </Pressable>
          <Pressable onPress={handleRemove} style={[styles.actionBtn, styles.removeActionBtn]}>
            <Text style={[styles.actionText, styles.removeActionText]}>Remove</Text>
          </Pressable>
        </View>
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
  container: {
    width: '100%',
    maxWidth: layout.maxContentWidth,
    alignSelf: 'center',
    alignItems: 'center',
    gap: spacing.md,
  },
  imageWrap: {
    width: '100%',
    position: 'relative',
  },
  image: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: radii.lg,
    backgroundColor: colors.bgCard,
  },
  removeBtn: {
    position: 'absolute',
    top: spacing.sm,
    right: spacing.sm,
    width: 32,
    height: 32,
    borderRadius: radii.pill,
    backgroundColor: 'rgba(0,0,0,0.7)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  removeText: { color: colors.textPrimary, fontSize: 16, fontWeight: '800', lineHeight: 18 },
  actionsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  actionBtn: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.pill,
    backgroundColor: colors.bgCard,
    borderWidth: 1,
    borderColor: colors.border,
  },
  actionText: { ...typography.bodyBold, color: colors.textPrimary },
  removeActionBtn: { borderColor: colors.danger },
  removeActionText: { color: colors.danger },
  empty: {
    width: '100%',
    maxWidth: layout.maxContentWidth,
    alignSelf: 'center',
    aspectRatio: 1,
    borderRadius: radii.lg,
    // FRAME drop-zone: subtle gray dashed border at rest on the input-tinted
    // surface. The accent (purple) is reserved for active / focus states.
    borderWidth: 2,
    borderColor: colors.borderDashed,
    borderStyle: 'dashed',
    backgroundColor: colors.bgInput,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  cameraIcon: { fontSize: 56 },
  emptyTitle: { ...typography.h2, color: colors.textPrimary },
  emptySub: { ...typography.caption, color: colors.textSecondary },
});
