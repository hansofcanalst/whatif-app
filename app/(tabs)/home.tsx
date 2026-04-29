import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, SafeAreaView, ActivityIndicator, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { PhotoUploader } from '@/components/PhotoUploader';
import { CategoryGrid } from '@/components/CategoryGrid';
import { GenerationCounter } from '@/components/GenerationCounter';
import { HomeOnboardingCard } from '@/components/HomeOnboardingCard';
import { PeopleSelector } from '@/components/PeopleSelector';
import { PaywallModal } from '@/components/ui/PaywallModal';
import { ConsentModal } from '@/components/ConsentModal';
import { useToast } from '@/components/ui/Toast';
import { useGenerationStore } from '@/stores/generationStore';
import { useSubscriptionStore } from '@/stores/subscriptionStore';
import { Category } from '@/constants/categories';
import { PickedImage } from '@/hooks/useImagePicker';
import { requestDetection } from '@/lib/detect';
import { hashBase64, getCachedDetection, cacheDetection } from '@/lib/detectionCache';
import { colors, fontFamily, layout, radii, spacing, typography } from '@/constants/theme';

export default function Home() {
  const router = useRouter();
  const { show } = useToast();
  const {
    selectedPhotoUri,
    selectedPhotoBase64,
    setPhoto,
    detectionStatus,
    detectedPeople,
    selectedPersonIds,
    safetyVerdict,
    setDetectionStatus,
    setDetectedPeople,
    setSafetyVerdict,
    togglePersonSelected,
    setAllPersonSelection,
  } = useGenerationStore();
  const { isActive: isPro } = useSubscriptionStore();
  const [paywall, setPaywall] = useState(false);

  // Consent gate for premium (likeness-remix) categories. Tracked in a
  // useRef rather than state because the acknowledgment shouldn't cause a
  // re-render when flipped, and it's deliberately component-local (not
  // persisted) — a fresh launch re-prompts the user. See ConsentModal.tsx
  // for the rationale.
  const hasConsentedRef = useRef(false);
  const [consentVisible, setConsentVisible] = useState(false);
  const [pendingCategoryId, setPendingCategoryId] = useState<string | null>(null);

  // True when the detection step flagged any visible person as a minor.
  // Premium categories (celebrity/political mashups, ethnicity blending)
  // are hard-blocked when this is true — no paywall bypass, no consent
  // override. Non-premium categories (race/gender/age) remain available.
  const containsMinor = useMemo(
    () => detectedPeople.some((p) => p.appearsUnder18),
    [detectedPeople],
  );

  // Derive `image` from the store rather than holding it in local useState.
  //
  // Why: Home unmounts when the user navigates into /generate/[id] and the
  // result screen, but the store retains the photo + detectedPeople. When
  // the user navigates back and Home remounts, local state resets to null
  // while the store still says detectionStatus === 'ready' with detectedPeople
  // in it. The old `image!.uri` inside the PeopleSelector JSX then threw
  // "Cannot read properties of null (reading 'uri')" because showSelector
  // evaluated true but `image` was null.
  //
  // Making `image` a derived view over the store means: (a) remounts show
  // the correct UI immediately, and (b) there's one source of truth for
  // "what photo are we working with" — no more sync drift between local
  // state and store state.
  //
  // width/height are 0 here because the store doesn't persist them and
  // nothing downstream of Home actually reads them (PhotoUploader only
  // reads .uri; runDetection only reads .base64). Keeping PickedImage's
  // shape lets the existing props on PhotoUploader / runDetection keep
  // their types without widening them.
  const image = useMemo<PickedImage | null>(
    () =>
      selectedPhotoUri && selectedPhotoBase64
        ? { uri: selectedPhotoUri, base64: selectedPhotoBase64, width: 0, height: 0 }
        : null,
    [selectedPhotoUri, selectedPhotoBase64],
  );

  // Run detection against the in-memory base64. Exported as a callback so
  // the "Try again" button on the failure state can re-run it without
  // forcing the user to re-pick the file. The cancellation token makes the
  // currently-in-flight run a no-op if a newer one starts before it
  // resolves — same guarantee as the useEffect version.
  //
  // Cache lookup: when the user re-picks the same photo (different tempfile
  // uri, identical bytes — common when trying multiple categories), we
  // short-circuit to the cached result. Skips the Gemini call *and* the
  // "Detecting people…" spinner, which would otherwise flash over a result
  // we already have. `force` bypasses the cache — used by the "Try again"
  // button after a failure, so a genuinely broken detection run can be
  // retried without getting served a cached empty/partial result.
  const runDetection = useCallback(
    (img: PickedImage, force = false) => {
      let cancelled = false;
      const hash = hashBase64(img.base64);
      if (!force) {
        const cached = getCachedDetection(hash);
        if (cached) {
          // Apply synchronously, same tick — no spinner flash.
          setDetectedPeople(cached.people);
          setSafetyVerdict(cached.safety);
          setDetectionStatus('ready');
          return () => {
            cancelled = true;
          };
        }
      }
      setDetectionStatus('detecting');
      requestDetection(img.base64)
        .then((res) => {
          if (cancelled) return;
          cacheDetection(hash, res.people, res.safety ?? null);
          setDetectedPeople(res.people);
          // Persist safety verdict alongside people. The home screen's
          // category-tap handler reads this; a "blocked" verdict
          // refuses generation with the model's reason. "flagged" and
          // "safe" both allow generation (flagged shows a warning).
          // The safety field is optional in the response — older
          // server builds didn't return it; defaults to undefined.
          setSafetyVerdict(res.safety ?? null);
          setDetectionStatus('ready');
        })
        .catch((e) => {
          if (cancelled) return;
          // Detection failure is non-fatal — user can still generate on the
          // full image. Log + mark failed; the UI offers a retry. We do
          // NOT cache the failure — next attempt should go to the network.
          console.warn('[home] detection failed', e);
          setDetectedPeople([]);
          setSafetyVerdict(null);
          setDetectionStatus('failed');
        });
      return () => {
        cancelled = true;
      };
    },
    [setDetectionStatus, setDetectedPeople, setSafetyVerdict],
  );

  // Kick off people detection whenever a new photo lands. We key the effect
  // on `image` only — NOT on `detectionStatus`. Including status in the deps
  // caused a race: setDetectionStatus('detecting') re-triggers the effect,
  // which runs the previous effect's cleanup (cancelled = true) before the
  // fetch resolves, so the success handler bails out and the UI sticks on
  // "Detecting people…" forever.
  //
  // On remount (e.g. user navigated back from /result), the store may already
  // hold a completed or in-flight detection for this exact photo. Running
  // detection again in that case would burn a redundant Gemini call and
  // flash the "Detecting people…" spinner over a result we already have.
  // Read status from the store imperatively (getState, not a subscription)
  // so it doesn't get added to the deps and re-introduce the race above.
  useEffect(() => {
    if (!image) return;
    const status = useGenerationStore.getState().detectionStatus;
    if (status === 'ready' || status === 'detecting') return;
    const cancel = runDetection(image);
    return cancel;
  }, [image, runDetection]);

  const handlePicked = (img: PickedImage | null) => {
    // Store is the single source of truth now; setPhoto also resets
    // detectionStatus/detectedPeople when the uri actually changes (see
    // generationStore.setPhoto).
    setPhoto(img?.uri ?? null, img?.base64 ?? null);
  };

  const navigateToCategory = useCallback(
    (categoryId: string) => {
      // NOTE: do NOT call setPhoto here. The photo already went into the store
      // in handlePicked; calling setPhoto again wipes detectedPeople + selection
      // (see generationStore.setPhoto), which then makes useGeneration send
      // totalPeopleInImage:undefined and the server falls back to the singular
      // BASE prompt — the root cause of "only one person transforms" in
      // multi-person photos.
      router.push(`/generate/${categoryId}`);
    },
    [router],
  );

  const handleSelect = (category: Category) => {
    if (!image) {
      show('Upload a photo first.', 'error');
      return;
    }
    if (detectionStatus === 'detecting') {
      show('Still detecting people — hang on a sec.', 'info');
      return;
    }
    // Hard-block on safety verdict before any other gate. The
    // detection step's safety classifier is conservative on "blocked"
    // (false positives annoy users; false negatives are worse) and
    // its reason is user-facing. Bail with the model-supplied
    // explanation rather than a generic "this isn't allowed".
    if (safetyVerdict?.decision === 'blocked') {
      show(`Can't transform this photo: ${safetyVerdict.reason}`, 'error');
      return;
    }
    if (detectedPeople.length > 1 && selectedPersonIds.length === 0) {
      show('Pick at least one person to transform.', 'error');
      return;
    }

    // Premium-category gates, applied in strict order:
    //   1. Minor hard-block: celebrity/political/ethnicity mashups on a
    //      photo that contains anyone the detector flagged as under-18 is
    //      never allowed, regardless of subscription status.
    //   2. Paywall: non-Pro users hit the upsell first, same as before.
    //   3. Consent modal: once per session, confirm they have the rights
    //      and intent to re-mix the depicted person's likeness.
    // The order matters — we don't want a non-Pro user acknowledging
    // consent and then hitting the paywall, and we don't want any user
    // paying for Pro only to discover the minor block after.
    if (category.isPremium) {
      if (containsMinor) {
        show(
          'Celebrity, political, and ethnicity-blend transformations aren\'t available when the photo includes a minor.',
          'error',
        );
        return;
      }
      if (!isPro) {
        setPaywall(true);
        return;
      }
      if (!hasConsentedRef.current) {
        setPendingCategoryId(category.id);
        setConsentVisible(true);
        return;
      }
    }

    navigateToCategory(category.id);
  };

  const handleConsentConfirm = () => {
    hasConsentedRef.current = true;
    setConsentVisible(false);
    const id = pendingCategoryId;
    setPendingCategoryId(null);
    if (id) navigateToCategory(id);
  };

  const handleConsentClose = () => {
    setConsentVisible(false);
    setPendingCategoryId(null);
  };

  // Gate on `image` too, not just detection state. With `image` now derived
  // from the store this is technically redundant (setPhoto(null) clears
  // detectionStatus), but keeping it makes the JSX below type-narrow cleanly
  // — `image.uri` inside the conditional no longer needs a non-null assertion.
  const showSelector =
    !!image && detectionStatus === 'ready' && detectedPeople.length > 1;

  return (
    <SafeAreaView style={styles.safe}>
      {/* FRAME header — mono wordmark on the left, compact label-tag on
          the right. Sits on the page bg (not elevated) so it reads as
          "document chrome" rather than a toolbar. */}
      <View style={styles.topBar}>
        <Text style={styles.logo}>What<Text style={styles.logoAccent}>If</Text></Text>
        <GenerationCounter />
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        {/* FRAME hero — three-word tagline where the verb lives in the
            accent. Short copy, tight leading, reads as a tool tagline. */}
        <View style={styles.hero}>
          <Text style={styles.heroTitle}>
            Drop. Analyze. <Text style={styles.heroAccent}>Edit.</Text>
          </Text>
          <Text style={styles.heroSub}>
            Upload a photo and see yourself across the multiverse.
          </Text>
        </View>

        {/* First-run welcome card. Self-gated by AsyncStorage — only
            renders for users who haven't dismissed it before, otherwise
            returns null. Lives between the hero and the photo uploader
            so it points at the very next thing the user should do. */}
        <HomeOnboardingCard />

        <PhotoUploader image={image} onPicked={handlePicked} />

        {image && detectionStatus === 'detecting' ? (
          <View style={styles.statusRow}>
            <ActivityIndicator color={colors.accent} />
            <Text style={styles.statusText}>Detecting people…</Text>
          </View>
        ) : null}

        {image && detectionStatus === 'failed' ? (
          <View style={styles.retryRow}>
            <Text style={styles.statusTextMuted}>
              Couldn't detect people. Try again — this usually clears in a few seconds.
            </Text>
            <Pressable
              onPress={() => runDetection(image, true)}
              style={({ pressed }) => [styles.retryButton, pressed && styles.retryButtonPressed]}
            >
              <Text style={styles.retryButtonText}>Try again</Text>
            </Pressable>
          </View>
        ) : null}

        {image && detectionStatus === 'ready' && detectedPeople.length === 0 ? (
          <Text style={styles.statusTextMuted}>
            No people found — we'll transform the whole image.
          </Text>
        ) : null}

        {showSelector && image ? (
          <View style={styles.selectorWrap}>
            <Text style={styles.sectionLabel}>
              People · {detectedPeople.length} detected
            </Text>
            <Text style={styles.selectorTitle}>Pick who to transform</Text>
            <PeopleSelector
              imageUri={image.uri}
              people={detectedPeople}
              selectedIds={selectedPersonIds}
              onToggle={togglePersonSelected}
              onSelectAll={() => setAllPersonSelection(true)}
              onSelectNone={() => setAllPersonSelection(false)}
            />
          </View>
        ) : null}

        <View style={styles.categorySection}>
          <Text style={styles.sectionLabel}>Transformations</Text>
          <Text style={styles.sectionTitle}>Pick a direction</Text>
          <View style={{ height: spacing.md }} />
          <CategoryGrid onSelect={handleSelect} isPro={isPro} />
        </View>
      </ScrollView>
      <PaywallModal visible={paywall} onClose={() => setPaywall(false)} />
      <ConsentModal
        visible={consentVisible}
        onConfirm={handleConsentConfirm}
        onClose={handleConsentClose}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  // JetBrains Mono wordmark — "What" in off-white, "If" in accent for the
  // FRAME brand-split look.
  logo: {
    fontFamily: fontFamily.mono,
    fontSize: 20,
    fontWeight: '800',
    color: colors.textPrimary,
    letterSpacing: -0.5,
  },
  logoAccent: { color: colors.accent },
  // Cap the scroll content to the app's phone-ish reading width on wide
  // viewports (desktop web). Without the cap, the hero headline and
  // section labels stretched full-width while self-capped children
  // (PhotoUploader, CategoryGrid) stayed at layout.maxContentWidth —
  // producing a ragged left/right edge on desktop. Centering the content
  // container fixes the alignment for every section at once.
  content: {
    padding: spacing.xl,
    gap: spacing.xl,
    paddingBottom: spacing.xxxl,
    width: '100%',
    maxWidth: layout.maxContentWidth + spacing.xl * 2,
    alignSelf: 'center',
  },
  hero: { gap: spacing.sm },
  heroTitle: {
    fontSize: 34,
    fontWeight: '800',
    color: colors.textPrimary,
    letterSpacing: -1.2,
    lineHeight: 40,
  },
  heroAccent: { color: colors.accent },
  heroSub: {
    ...typography.body,
    color: colors.textSecondary,
    lineHeight: 22,
  },
  sectionLabel: {
    ...typography.label,
    color: colors.textLabel,
    marginBottom: spacing.xs,
  },
  sectionTitle: { ...typography.h2, color: colors.textPrimary },
  categorySection: { gap: 2 },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    alignSelf: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radii.pill,
    backgroundColor: colors.bgCard,
    borderWidth: 1,
    borderColor: colors.border,
  },
  statusText: { ...typography.caption, color: colors.textSecondary },
  statusTextMuted: {
    ...typography.caption,
    color: colors.textMuted,
    textAlign: 'center',
  },
  retryRow: {
    alignSelf: 'center',
    alignItems: 'center',
    gap: spacing.sm,
  },
  retryButton: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radii.lg,
    backgroundColor: colors.bgCard,
    borderWidth: 1,
    borderColor: colors.border,
  },
  retryButtonPressed: {
    borderColor: 'rgba(124, 58, 237, 0.4)',
    transform: [{ scale: 0.97 }],
  },
  retryButtonText: {
    ...typography.label,
    color: colors.textPrimary,
    fontSize: 12,
    letterSpacing: 1.2,
  },
  selectorWrap: { gap: spacing.sm },
  selectorTitle: {
    ...typography.h3,
    color: colors.textPrimary,
  },
});
