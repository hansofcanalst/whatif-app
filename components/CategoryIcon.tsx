import React from 'react';
import {
  Globe,
  ArrowLeftRight,
  Hourglass,
  ShieldHalf,
  Dna,
  type LucideIcon,
} from 'lucide-react-native';
import { colors } from '@/constants/theme';

// Map each Category.id to its FRAME-style glyph. Emoji-as-icon was the
// biggest single piece of visual slop in the home grid: emoji render at
// the OS's color/style, fight the dark surface, and break the
// monochrome accent palette. Lucide line glyphs are flat, 2px-stroke,
// and inherit the brand violet — they sit inside the accent-tinted tile
// instead of competing with it.
// Note: political-mashup and celebrity-mashup were removed in the
// pre-launch safety pass; their entries (Landmark + Star) are gone too.
// Add a new mapping if a future category lands.
const ICON_MAP: Record<string, LucideIcon> = {
  'race-swap': Globe,
  'gender-swap': ArrowLeftRight,
  'age-transform': Hourglass,
  'military-forces': ShieldHalf,
  'ethnicity-blend': Dna,
};

interface CategoryIconProps {
  categoryId: string;
  size?: number;
  color?: string;
  strokeWidth?: number;
}

export function CategoryIcon({
  categoryId,
  size = 22,
  color = colors.accentText,
  strokeWidth = 2,
}: CategoryIconProps) {
  const Icon = ICON_MAP[categoryId];
  if (!Icon) return null;
  return <Icon size={size} color={color} strokeWidth={strokeWidth} />;
}
