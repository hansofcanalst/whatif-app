import React, { useEffect, useState } from 'react';
import { Modal, View, Text, StyleSheet, Pressable, ScrollView } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import type { PurchasesOffering, PurchasesPackage } from 'react-native-purchases';
import { Button } from './Button';
import { useSubscription } from '@/hooks/useSubscription';
import { useToast } from './Toast';
import { colors, radii, spacing, typography } from '@/constants/theme';

interface PaywallModalProps {
  visible: boolean;
  onClose: () => void;
}

const FEATURES = [
  '✅ Unlimited generations',
  '✅ All categories unlocked',
  '✅ Priority generation speed',
  '✅ No watermarks',
];

export function PaywallModal({ visible, onClose }: PaywallModalProps) {
  const { offerings, purchase, restore } = useSubscription();
  const { show } = useToast();
  const [current, setCurrent] = useState<PurchasesOffering | null>(null);
  const [selected, setSelected] = useState<PurchasesPackage | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!visible) return;
    (async () => {
      const o = await offerings();
      setCurrent(o);
      const monthly = o?.monthly ?? o?.availablePackages?.[0] ?? null;
      setSelected(monthly);
    })();
  }, [visible, offerings]);

  const handleSubscribe = async () => {
    if (!selected) return;
    setBusy(true);
    try {
      await purchase(selected);
      show('Welcome to Pro ✦', 'success');
      onClose();
    } catch (e: any) {
      if (!e?.userCancelled) show('Purchase failed. Try again.', 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleRestore = async () => {
    try {
      await restore();
      show('Purchases restored.', 'success');
    } catch {
      show('Nothing to restore.', 'info');
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <Pressable onPress={onClose} style={styles.closeBtn}>
            <Text style={styles.closeText}>✕</Text>
          </Pressable>
          <ScrollView contentContainerStyle={{ paddingBottom: spacing.xxl }}>
            <LinearGradient
              colors={[colors.gradientStart, colors.gradientEnd]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.badge}
            >
              <Text style={styles.badgeText}>PRO ✦</Text>
            </LinearGradient>
            <Text style={styles.title}>Unlock Unlimited What Ifs</Text>
            <View style={styles.features}>
              {FEATURES.map((f) => (
                <Text key={f} style={styles.feature}>
                  {f}
                </Text>
              ))}
            </View>
            <View style={styles.plans}>
              {current?.availablePackages?.map((pkg) => {
                const isSel = selected?.identifier === pkg.identifier;
                const isBest = pkg.packageType === 'MONTHLY';
                return (
                  <Pressable
                    key={pkg.identifier}
                    onPress={() => setSelected(pkg)}
                    style={[styles.plan, isSel && styles.planSelected]}
                  >
                    {isBest ? (
                      <View style={styles.bestBadge}>
                        <Text style={styles.bestText}>BEST VALUE</Text>
                      </View>
                    ) : null}
                    <Text style={styles.planName}>{pkg.product.title}</Text>
                    <Text style={styles.planPrice}>{pkg.product.priceString}</Text>
                  </Pressable>
                );
              })}
            </View>
            <Button label="Subscribe" onPress={handleSubscribe} loading={busy} style={{ marginTop: spacing.lg }} />
            <Pressable onPress={handleRestore} style={{ marginTop: spacing.md }}>
              <Text style={styles.restore}>Restore Purchases</Text>
            </Pressable>
            <Text style={styles.fine}>
              Subscription renews automatically. Cancel anytime in your app store settings.
            </Text>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.bgElevated,
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
    padding: spacing.xl,
    maxHeight: '90%',
  },
  closeBtn: { position: 'absolute', top: spacing.lg, right: spacing.lg, zIndex: 2, padding: spacing.sm },
  closeText: { color: colors.textSecondary, fontSize: 22 },
  badge: { alignSelf: 'flex-start', paddingHorizontal: spacing.md, paddingVertical: spacing.xs, borderRadius: radii.pill },
  badgeText: { ...typography.tiny, color: colors.textPrimary, letterSpacing: 2 },
  title: { ...typography.h1, color: colors.textPrimary, marginTop: spacing.md },
  features: { marginTop: spacing.xl, gap: spacing.sm },
  feature: { ...typography.body, color: colors.textPrimary },
  plans: { marginTop: spacing.xl, gap: spacing.md },
  plan: {
    backgroundColor: colors.bgCard,
    borderRadius: radii.lg,
    padding: spacing.lg,
    borderWidth: 2,
    borderColor: colors.border,
  },
  planSelected: { borderColor: colors.accent },
  planName: { ...typography.h3, color: colors.textPrimary },
  planPrice: { ...typography.body, color: colors.textSecondary, marginTop: 2 },
  bestBadge: {
    position: 'absolute',
    top: -10,
    right: spacing.lg,
    backgroundColor: colors.accent,
    paddingVertical: 2,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.pill,
  },
  bestText: { ...typography.tiny, color: colors.textPrimary },
  restore: { ...typography.caption, color: colors.textSecondary, textAlign: 'center', textDecorationLine: 'underline' },
  fine: { ...typography.tiny, color: colors.textMuted, textAlign: 'center', marginTop: spacing.lg },
});
