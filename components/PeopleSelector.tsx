import React, { useState } from 'react';
import {
  View,
  Text,
  Image,
  Pressable,
  StyleSheet,
  LayoutChangeEvent,
} from 'react-native';
import type { DetectedPerson } from '@/lib/detect';
import { colors, layout, radii, spacing, typography } from '@/constants/theme';

interface PeopleSelectorProps {
  imageUri: string;
  people: DetectedPerson[];
  selectedIds: number[];
  onToggle: (id: number) => void;
  onSelectAll: () => void;
  onSelectNone: () => void;
}

/**
 * Renders the uploaded photo with a numbered circular marker on each
 * detected person. Tapping a marker toggles that person's selection.
 * Unselected people are dimmed with a semi-transparent overlay drawn
 * over their bbox so the user has a visual confirmation of which ones
 * will / won't be transformed.
 *
 * The image is capped at layout.maxContentWidth and the markers / dim
 * overlays are absolutely positioned in fractional coordinates of the
 * rendered image box, so it works consistently across platforms and
 * screen sizes.
 */
export function PeopleSelector({
  imageUri,
  people,
  selectedIds,
  onToggle,
  onSelectAll,
  onSelectNone,
}: PeopleSelectorProps) {
  const [size, setSize] = useState<{ w: number; h: number }>({ w: 0, h: 0 });

  const onImageLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (width !== size.w || height !== size.h) setSize({ w: width, h: height });
  };

  const allSelected = selectedIds.length === people.length;
  const noneSelected = selectedIds.length === 0;

  return (
    <View style={styles.container}>
      <View style={styles.imageWrap} onLayout={onImageLayout}>
        <Image source={{ uri: imageUri }} style={styles.image} />

        {/* Dim overlays for unselected people. Drawn BEFORE markers so markers
            remain visible and tappable. */}
        {size.w > 0 &&
          people.map((p) => {
            const isSelected = selectedIds.includes(p.id);
            if (isSelected) return null;
            const left = (p.box.xmin / 1000) * size.w;
            const top = (p.box.ymin / 1000) * size.h;
            const width = ((p.box.xmax - p.box.xmin) / 1000) * size.w;
            const height = ((p.box.ymax - p.box.ymin) / 1000) * size.h;
            return (
              <View
                key={`dim-${p.id}`}
                pointerEvents="none"
                style={[
                  styles.dim,
                  { left, top, width, height },
                ]}
              />
            );
          })}

        {/* Numbered markers, centered on each bbox. */}
        {size.w > 0 &&
          people.map((p) => {
            const cx = ((p.box.xmin + p.box.xmax) / 2 / 1000) * size.w;
            const cy = ((p.box.ymin + p.box.ymax) / 2 / 1000) * size.h;
            const isSelected = selectedIds.includes(p.id);
            return (
              <Pressable
                key={`marker-${p.id}`}
                onPress={() => onToggle(p.id)}
                hitSlop={10}
                style={[
                  styles.marker,
                  { left: cx - MARKER_SIZE / 2, top: cy - MARKER_SIZE / 2 },
                  isSelected ? styles.markerSelected : styles.markerUnselected,
                ]}
                accessibilityLabel={`${isSelected ? 'Deselect' : 'Select'} ${p.label}`}
              >
                <Text
                  style={[
                    styles.markerText,
                    isSelected ? styles.markerTextSelected : styles.markerTextUnselected,
                  ]}
                >
                  {p.id}
                </Text>
              </Pressable>
            );
          })}
      </View>

      <View style={styles.row}>
        <Text style={styles.status}>
          {noneSelected
            ? 'Tap a number to pick who to transform'
            : allSelected
            ? `Transforming all ${people.length}`
            : `Transforming ${selectedIds.length} of ${people.length}`}
        </Text>
        <Pressable onPress={allSelected ? onSelectNone : onSelectAll}>
          <Text style={styles.link}>{allSelected ? 'None' : 'All'}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const MARKER_SIZE = 36;

const styles = StyleSheet.create({
  container: {
    width: '100%',
    maxWidth: layout.maxContentWidth,
    alignSelf: 'center',
    gap: spacing.sm,
  },
  imageWrap: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: radii.lg,
    overflow: 'hidden',
    backgroundColor: colors.bgCard,
    position: 'relative',
  },
  image: { width: '100%', height: '100%' },
  dim: {
    position: 'absolute',
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: radii.sm,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  marker: {
    position: 'absolute',
    width: MARKER_SIZE,
    height: MARKER_SIZE,
    borderRadius: MARKER_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    // Subtle drop shadow so markers pop off busy backgrounds.
    shadowColor: '#000',
    shadowOpacity: 0.5,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  markerSelected: {
    backgroundColor: colors.accent,
    borderColor: colors.textPrimary,
  },
  markerUnselected: {
    backgroundColor: 'rgba(20,20,28,0.85)',
    borderColor: 'rgba(255,255,255,0.5)',
  },
  markerText: { fontSize: 16, fontWeight: '800' },
  markerTextSelected: { color: colors.textPrimary },
  markerTextUnselected: { color: colors.textSecondary },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xs,
  },
  status: { ...typography.caption, color: colors.textSecondary, flexShrink: 1 },
  link: { ...typography.caption, color: colors.accent, fontWeight: '700' },
});
