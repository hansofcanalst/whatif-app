import React from 'react';
import { Pressable, Image, Text, View, StyleSheet, ActivityIndicator } from 'react-native';
import { colors, radii, spacing, typography } from '@/constants/theme';

interface ResultCardProps {
  /** Image URL when the tile has resolved. Omit for pending/failed tiles. */
  imageURL?: string;
  label: string;
  /**
   * Tile lifecycle state. When absent (back-compat), the tile behaves
   * like the old always-complete version. The streaming /generate/results
   * screen always passes an explicit status.
   */
  status?: 'pending' | 'complete' | 'failed';
  /** Error message shown on failed tiles. */
  error?: string;
  /**
   * Text shown under the spinner on pending tiles. The streaming results
   * screen passes a rotating flavor line ("Consulting the multiverse…")
   * so the waiting tile has some personality; when omitted we fall back
   * to the plain "Generating…" label used by the gallery/detail screens.
   */
  pendingCaption?: string;
  onPress: () => void;
}

// FRAME result thumbnail — rounded-xl card on surface-800 with a subtle
// border. Label rides along the bottom in a gradient-less dark bar so
// the image itself keeps the visual weight.
//
// When `status` is 'pending', the card shows a centered spinner in
// place of the image (still pressable but the press is a no-op — the
// parent should early-return on tap). When 'failed', a subdued error
// glyph plus the error message replaces the image.
export function ResultCard({ imageURL, label, status = 'complete', error, pendingCaption, onPress }: ResultCardProps) {
  const disabled = status !== 'complete';
  const content = (() => {
    if (status === 'pending') {
      return (
        <View style={styles.placeholder}>
          <ActivityIndicator color={colors.accent} />
          <Text style={styles.placeholderCaption} numberOfLines={2}>
            {pendingCaption ?? 'Generating…'}
          </Text>
        </View>
      );
    }
    if (status === 'failed') {
      return (
        <View style={styles.placeholder}>
          <Text style={styles.failedGlyph}>!</Text>
          <Text style={styles.placeholderCaption} numberOfLines={2}>
            {error ?? 'Failed'}
          </Text>
        </View>
      );
    }
    return <Image source={{ uri: imageURL }} style={styles.image} />;
  })();

  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      style={({ pressed }) => [
        styles.card,
        pressed && !disabled && styles.pressed,
        status === 'failed' && styles.cardFailed,
      ]}
    >
      {content}
      <View style={styles.overlay}>
        <Text style={styles.label} numberOfLines={1}>
          {label}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    aspectRatio: 1,
    borderRadius: radii.xl,
    overflow: 'hidden',
    backgroundColor: colors.bgCard,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardFailed: {
    borderColor: 'rgba(239, 68, 68, 0.35)',
  },
  pressed: { opacity: 0.9, transform: [{ scale: 0.98 }] },
  image: { width: '100%', height: '100%' },
  placeholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  placeholderCaption: {
    ...typography.caption,
    color: colors.textMuted,
    textAlign: 'center',
  },
  failedGlyph: {
    fontSize: 28,
    fontWeight: '800',
    color: 'rgba(239, 68, 68, 0.7)',
  },
  overlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: spacing.sm,
    backgroundColor: 'rgba(9,9,13,0.85)',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.06)',
  },
  label: { ...typography.caption, color: colors.textPrimary, fontWeight: '700' },
});
