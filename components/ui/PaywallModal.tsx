import React, { useEffect, useState } from 'react';
import { Modal, View, Text, StyleSheet, Pressable, ScrollView } from 'react-native';
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
  'Unlimited generations',
  'All categories unlocked',
  'Priority generation speed',
  'No watermarks',
];

/**
 * FRAME-styled paywall bottom sheet. The sheet itself sits on surface-700
 * with a top radius xxl; inside we use a muted page-label, a big h1 pitch,
 * a checkmark feature list, and two package cards that toggle between
 * neutral and accent-tinted selected states. The flat purple CTA keeps
 * the button language consistent with the rest of the app.
 */
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
          <View style={styles.handleBar} />
          <Pressable onPress={onClose} style={styles.closeBtn} hitSlop={8}>
            <Text style={styles.closeText}>✕</Text>
          </Pressable>
          <ScrollView contentContainerStyle={{ paddingBottom: spacing.xxl }}>
            <View style={styles.badge}>
              <Text style={styles.badgeText}>PRO ✦</Text>
            </View>
            <Text style={styles.title}>Unlock Unlimited What Ifs</Text>
            <Text style={styles.subtitle}>
              See yourself in every corner of the multiverse — no caps, no watermarks.
            </Text>

            <View style={styles.features}>
              {FEATURES.map((f) => (
                <View key={f} style={styles.featureRow}>
                  <View style={styles.check}>
                    <Text style={styles.checkIcon}>✓</Text>
                  </View>
                  <Text style={styles.feature}>{f}</Text>
                </View>
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

            <Button
              label="Subscribe"
              onPress={handleSubscribe}
              loading={busy}
              style={{ marginTop: spacing.lg }}
            />
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
    borderTopLeftRadius: radii.xxl,
    borderTopRightRadius: radii.xxl,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: colors.border,
    padding: spacing.xl,
    paddingTop: spacing.lg,
    maxHeight: '90%',
  },
  handleBar: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    alignSelf: 'center',
    marginBottom: spacing.md,
  },
  closeBtn: { position: 'absolute', top: spacing.lg, right: spacing.lg, zIndex: 2, padding: spacing.sm },
  closeText: { color: colors.textSecondary, fontSize: 18 },
  badge: {
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 1,
    borderRadius: radii.pill,
    backgroundColor: colors.accentDim,
    borderWidth: 1,
    borderColor: 'rgba(124, 58, 237, 0.3)',
  },
  badgeText: { ...typography.label, color: colors.accentText, fontSize: 11, letterSpacing: 2 },
  title: { ...typography.h1, color: colors.textPrimary, marginTop: spacing.md, letterSpacing: -0.8 },
  subtitle: { ...typography.body, color: colors.textSecondary, marginTop: spacing.sm, lineHeight: 22 },

  features: { marginTop: spacing.xl, gap: spacing.sm },
  featureRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  check: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.accentDim,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkIcon: { color: colors.accentText, fontSize: 12, fontWeight: '800' },
  feature: { ...typography.body, color: colors.textPrimary },

  plans: { marginTop: spacing.xl, gap: spacing.md },
  plan: {
    backgroundColor: colors.bgCard,
    borderRadius: radii.xl,
    padding: spacing.lg,
    borderWidth: 2,
    borderColor: colors.border,
  },
  planSelected: {
    borderColor: 'rgba(124, 58, 237, 0.5)',
    backgroundColor: colors.accentDim,
  },
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
  bestText: { ...typography.label, color: '#ffffff', fontSize: 9, letterSpacing: 1.5 },

  restore: { ...typography.caption, color: colors.textSecondary, textAlign: 'center', textDecorationLine: 'underline' },
  fine: { ...typography.tiny, color: colors.textMuted, textAlign: 'center', marginTop: spacing.lg },
});
