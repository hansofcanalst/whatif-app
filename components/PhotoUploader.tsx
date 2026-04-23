import React from 'react';
import { Pressable, View, Text, Image, StyleSheet } from 'react-native';
import { useImagePicker, PickedImage } from '@/hooks/useImagePicker';
import { colors, layout, radii, spacing, typography } from '@/constants/theme';

interface PhotoUploaderProps {
  image: PickedImage | null;
  onPicked: (image: PickedImage | null) => void;
}

// FRAME drop-zone: rounded-2xl surface, dashed muted border, an accent
// icon tile above a stack of title / hint / format badges. The whole
// surface is tappable; the change / remove actions live below the
// preview once a photo has been picked.
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
      {/* Accent-tinted icon tile — FRAME's drop-zone signature. Lives on
          the deep input surface with a soft violet wash to hint "action". */}
      <View style={styles.iconTile}>
        <Text style={styles.iconGlyph}>↑</Text>
      </View>
      <Text style={styles.emptyTitle}>Drop your photo here</Text>
      <Text style={styles.emptySub}>or tap to browse your camera roll</Text>
      <View style={styles.formats}>
        <View style={styles.formatBadge}>
          <Text style={styles.formatText}>JPG</Text>
        </View>
        <View style={styles.formatBadge}>
          <Text style={styles.formatText}>PNG</Text>
        </View>
        <View style={styles.formatBadge}>
          <Text style={styles.formatText}>HEIC</Text>
        </View>
      </View>
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
    borderRadius: radii.xxl,
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
    borderRadius: radii.lg,
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
    borderRadius: radii.xxl,
    // FRAME drop-zone: muted dashed border on the input-tinted surface.
    // Accent (purple) is reserved for the icon tile + focus / active state.
    borderWidth: 2,
    borderColor: colors.borderDashed,
    borderStyle: 'dashed',
    backgroundColor: colors.bgInput,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.xl,
  },
  iconTile: {
    width: 64,
    height: 64,
    borderRadius: radii.xl,
    backgroundColor: colors.accentDim,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(124, 58, 237, 0.3)',
  },
  iconGlyph: {
    fontSize: 28,
    fontWeight: '900',
    color: colors.accentText,
    lineHeight: 30,
  },
  emptyTitle: {
    ...typography.h3,
    color: colors.textPrimary,
    textAlign: 'center',
  },
  emptySub: {
    ...typography.caption,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  formats: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  formatBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radii.sm,
    backgroundColor: colors.bgCard,
    borderWidth: 1,
    borderColor: colors.border,
  },
  formatText: {
    ...typography.label,
    color: colors.textSecondary,
    fontSize: 10,
    letterSpacing: 1,
  },
});
