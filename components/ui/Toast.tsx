import React, { createContext, useCallback, useContext, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Animated, { FadeInUp, FadeOutUp } from 'react-native-reanimated';
import { colors, radii, spacing, typography } from '@/constants/theme';

type ToastKind = 'info' | 'error' | 'success';
interface ToastItem {
  id: number;
  message: string;
  kind: ToastKind;
}
interface ToastCtx {
  show: (message: string, kind?: ToastKind) => void;
}

const Ctx = createContext<ToastCtx>({ show: () => {} });

/**
 * FRAME error/info banner pattern:
 *   - Errors use the red-500/10 tint over a red-500/30 border with red-400
 *     text. This matches FRAME's inline alert look, rather than a solid
 *     red pill that reads as "shout".
 *   - Success uses the accent-tinted card for consistency.
 *   - Info falls back to surface-700 with subtle border.
 *
 * Toasts stack in insertion order, anchored to the top of the screen.
 */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const show = useCallback((message: string, kind: ToastKind = 'info') => {
    const id = Date.now() + Math.random();
    setItems((prev) => [...prev, { id, message, kind }]);
    setTimeout(() => {
      setItems((prev) => prev.filter((i) => i.id !== id));
    }, 3200);
  }, []);

  return (
    <Ctx.Provider value={{ show }}>
      {children}
      {items.map((item, i) => {
        const palette = kindPalette(item.kind);
        return (
          <Animated.View
            key={item.id}
            entering={FadeInUp}
            exiting={FadeOutUp}
            style={[
              styles.toast,
              {
                top: 60 + i * 56,
                backgroundColor: palette.bg,
                borderColor: palette.border,
              },
            ]}
          >
            <View style={[styles.dot, { backgroundColor: palette.dot }]} />
            <Text style={[styles.text, { color: palette.text }]}>{item.message}</Text>
          </Animated.View>
        );
      })}
    </Ctx.Provider>
  );
}

export function useToast() {
  return useContext(Ctx);
}

function kindPalette(k: ToastKind) {
  if (k === 'error') {
    return {
      bg: colors.dangerBg,
      border: colors.dangerBorder,
      text: colors.dangerText,
      dot: colors.danger,
    };
  }
  if (k === 'success') {
    return {
      bg: colors.accentDim,
      border: 'rgba(124, 58, 237, 0.3)',
      text: colors.accentText,
      dot: colors.accent,
    };
  }
  return {
    bg: colors.bgElevated,
    border: colors.border,
    text: colors.textPrimary,
    dot: colors.textSecondary,
  };
}

const styles = StyleSheet.create({
  toast: {
    position: 'absolute',
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.lg,
    borderWidth: 1,
    maxWidth: '90%',
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  text: { ...typography.caption, fontWeight: '600' },
});
