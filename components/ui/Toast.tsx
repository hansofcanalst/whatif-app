import React, { createContext, useCallback, useContext, useState } from 'react';
import { Text, StyleSheet } from 'react-native';
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
      {items.map((item) => (
        <Animated.View
          key={item.id}
          entering={FadeInUp}
          exiting={FadeOutUp}
          style={[styles.toast, { backgroundColor: kindColor(item.kind) }]}
        >
          <Text style={styles.text}>{item.message}</Text>
        </Animated.View>
      ))}
    </Ctx.Provider>
  );
}

export function useToast() {
  return useContext(Ctx);
}

function kindColor(k: ToastKind) {
  if (k === 'error') return colors.danger;
  if (k === 'success') return colors.success;
  return colors.bgElevated;
}

const styles = StyleSheet.create({
  toast: {
    position: 'absolute',
    top: 60,
    alignSelf: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.pill,
    maxWidth: '90%',
  },
  text: { ...typography.bodyBold, color: colors.textPrimary },
});
