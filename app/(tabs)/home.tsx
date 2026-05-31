import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  SafeAreaView,
  Pressable,
  Alert,
  Platform,
  RefreshControl,
} from 'react-native';
import { useRouter } from 'expo-router';
import { PhotoUploader } from '@/components/PhotoUploader';
import { CategoryGrid } from '@/components/CategoryGrid';
import { GenerationCounter } from '@/components/GenerationCounter';
import { HomeOnboardingCard } from '@/components/HomeOnboardingCard';
import { PeopleSelector } from '@/components/PeopleSelector';
import { TrendingCarousel } from '@/components/TrendingCarousel';
import { PaywallModal } from '@/components/ui/PaywallModal';
import { ConsentModal } from '@/components/ConsentModal';
import { ScanLine } from '@/components/ui/PulseIndicators';
import { useToast } from '@/components/ui/Toast';
import { useGenerationStore } from '@/stores/generationStore';
import { useSubscriptionStore } from '@/stores/subscriptionStore';
import { Category } from '@/constants/categories';
import { PickedImage } from '@/hooks/useImagePicker';
import { requestDetection } from '@/lib/detect';
import { hashBase64, getCachedDetection, cacheDetection } from '@/lib/detectionCache';
import {
  loadTrendsStaleWhileRevalidate,
  fetchTrendsFromFirestore,
  persistCachedTrends,
  isTrendLive,
  type TrendingDoc,
} from '@/lib/trends';
import { useGeneration } from '@/hooks/useGeneration';
import { V1_MONETIZATION_ENABLED } from '@/constants/config';
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

  // Single chokepoint for every paywall trigger on this screen. With v1
  // monetization OFF (V1_MONETIZATION_ENABLED=false) the paywall must
  // never appear, so we surface a soft, non-commercial toast instead of
  // opening PaywallModal. When monetization is re-enabled in v1.1 this
  // opens the sheet exactly as before. Routing all triggers through here
  // keeps their behavior identical.
  const showPaywall = useCallback(() => {
    if (!V1_MONETIZATION_ENABLED) {
      show("You've reached your free Me Buts. More coming soon!", 'info');
      return;
    }
    setPaywall(true);
  }, [show]);

  // Trending state. We seed from AsyncStorage so the carousel renders
  // instantly on cold launch (offline-safe), then refresh in the
  // background. Pull-to-refresh re-runs the same fetch. Date-window
  // filtering is applied client-side via isTrendLive — Firestore can't
  // model the compound (active && startDate <= now && endDate >= now)
  // predicate in a single index without overconstraining the query,
  // and the trend set is tiny so client filtering is cheap.
  const [trends, setTrends] = useState<TrendingDoc[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const visibleTrends = useMemo(() => trends.filter((t) => isTrendLive(t)), [trends]);
  const { start: startGeneration } = useGeneration();

  // Consent gate for premium (likeness-remix) categories. Tracked in a
  // useRef rather than state because the acknowledgment shouldn't cause a
  // re-render when flipped, and it's deliberately component-local (not
  // persisted) — a fresh launch re-prompts the user. See ConsentModal.tsx
  // for the rationale.
  const hasConsentedRef = useRef(false);
  const [consentVisible, setConsentVisible] = useState(false);
  const [pendingCategoryId, setPendingCategoryId] = useState<string | null>(null);
  // Set when a premium TREND requires the consent modal — we route the
  // confirm handler to startTrendGeneration with this trend, distinct
  // from pendingCategoryId which routes to the subcategory picker.
  const [pendingTrend, setPendingTrend] = useState<TrendingDoc | null>(null);

  // Tracks whether the user has explicitly acknowledged a "flagged"
  // safety verdict for the currently-loaded photo. We don't want to
  // re-prompt on every category tap once they've said yes — but we DO
  // want to re-prompt for a fresh photo. Reset whenever the photo
  // changes (the safetyVerdict effect below handles that).
  const safetyAcknowledgedRef = useRef(false);
  useEffect(() => {
    // Any time the verdict changes (new photo, re-detect after retry),
    // reset the acknowledgment flag. Also covers the case where a
    // re-detection upgrades 'flagged' → 'safe' or vice versa.
    safetyAcknowledgedRef.current = false;
  }, [safetyVerdict]);

  // True when the detection step flagged any visible person as a minor.
  // Premium categories (currently just ethnicity-blend) are hard-blocked
  // when this is true — no paywall bypass, no consent override. The
  // server independently re-verifies via runPeopleDetection so a
  // modified client can't bypass this check.
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

  // Stale-while-revalidate trends loader. Runs once on mount: cached
  // entries paint synchronously, then a network fetch (if it succeeds)
  // overwrites them and updates AsyncStorage for the next launch.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { cached, refresh } = await loadTrendsStaleWhileRevalidate();
        if (!cancelled && cached.length > 0) setTrends(cached);
        const fresh = await refresh;
        if (!cancelled) setTrends(fresh);
      } catch (e) {
        console.warn('[home] trends load failed', e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Pull-to-refresh: re-fetch trends and persist. We do NOT clear
  // the existing list while refreshing — the spinner overlay is
  // enough feedback. On failure, the user keeps the cards they were
  // already looking at.
  const onRefreshTrends = useCallback(async () => {
    setRefreshing(true);
    try {
      const fresh = await fetchTrendsFromFirestore();
      setTrends(fresh);
      await persistCachedTrends(fresh);
    } catch (e) {
      console.warn('[home] trend refresh failed', e);
      show("Couldn't refresh trends. Try again in a sec.", 'error');
    } finally {
      setRefreshing(false);
    }
  }, [show]);

  // Trend-tap handler. Mirrors handleSelect for static categories
  // (photo, detection, safety, minor, premium, consent gates) but
  // dispatches directly into the generation pipeline once the gates
  // clear — there's no subcategory picker for trends because each
  // trend is a single one-shot prompt.
  const startTrendGeneration = useCallback(
    (trend: TrendingDoc) => {
      if (!image) return;
      startGeneration({
        imageBase64: image.base64,
        categoryId: 'trending',
        subcategoryIds: [trend.id],
        trendId: trend.id,
        trendLabel: trend.label,
        onPaywall: showPaywall,
        onReady: () => router.push('/generate/results'),
      });
    },
    [image, router, startGeneration],
  );

  const handleTrendSelect = useCallback(
    (trend: TrendingDoc) => {
      if (!image) {
        show('Upload a photo first.', 'error');
        return;
      }
      if (detectionStatus === 'detecting') {
        show('Still detecting people — hang on a sec.', 'info');
        return;
      }
      if (safetyVerdict?.decision === 'blocked') {
        show(`Can't transform this photo: ${safetyVerdict.reason}`, 'error');
        return;
      }
      if (
        safetyVerdict?.decision === 'flagged' &&
        !safetyAcknowledgedRef.current
      ) {
        const proceed = () => {
          safetyAcknowledgedRef.current = true;
          handleTrendSelect(trend);
        };
        const title = 'Heads up';
        const message = `${safetyVerdict.reason}\n\nDo you want to continue?`;
        if (Platform.OS === 'web') {
          if (typeof window !== 'undefined' && window.confirm(`${title}\n\n${message}`)) {
            proceed();
          }
          return;
        }
        Alert.alert(title, message, [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Continue', onPress: proceed },
        ]);
        return;
      }
      if (detectedPeople.length > 1 && selectedPersonIds.length === 0) {
        show('Pick at least one person to transform.', 'error');
        return;
      }

      // Premium + sensitive trends apply the same gates as premium
      // categories. Sensitive (minor-gated) trends additionally
      // hard-block when a minor is detected — server re-verifies,
      // so the client gate is for UX only.
      if (trend.sensitiveCategory && containsMinor) {
        show("This trend isn't available on photos that include a minor.", 'error');
        return;
      }
      if (trend.isPremium) {
        if (containsMinor) {
          show(
            "This trend isn't available when the photo includes a minor.",
            'error',
          );
          return;
        }
        if (!isPro) {
          showPaywall();
          return;
        }
        if (!hasConsentedRef.current) {
          // Trends can be premium-and-likeness-sensitive too; reuse
          // the consent modal so the contract with the user is the
          // same as for ethnicity-blend. We stash the trend by id in
          // pendingCategoryId so the existing confirm handler can
          // route correctly.
          setPendingTrend(trend);
          setConsentVisible(true);
          return;
        }
      }

      startTrendGeneration(trend);
    },
    [
      image,
      detectionStatus,
      safetyVerdict,
      detectedPeople.length,
      selectedPersonIds.length,
      containsMinor,
      isPro,
      show,
      startTrendGeneration,
    ],
  );

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
    // 'flagged' is a soft warning — the classifier saw something
    // questionable but isn't refusing. Surface a confirm dialog with
    // the model's reason and let the user decide. Once acknowledged
    // for this photo, don't re-prompt on subsequent category taps —
    // tracked in safetyAcknowledgedRef and reset whenever the verdict
    // changes (new photo, re-detect).
    if (
      safetyVerdict?.decision === 'flagged' &&
      !safetyAcknowledgedRef.current
    ) {
      const proceed = () => {
        safetyAcknowledgedRef.current = true;
        // Re-run handleSelect with the same category so the rest of
        // the gates (people selection, premium, consent) still run.
        // Calling handleSelect directly would re-hit this branch —
        // but acknowledgedRef is now true, so it falls through.
        handleSelect(category);
      };
      const title = 'Heads up';
      const message = `${safetyVerdict.reason}\n\nDo you want to continue?`;
      if (Platform.OS === 'web') {
        // RNW Alert.alert collapses to OK/Cancel without honoring the
        // destructive style. window.confirm is the cleaner fallback —
        // matches the existing pattern in profile/gallery delete flows.
        if (typeof window !== 'undefined' && window.confirm(`${title}\n\n${message}`)) {
          proceed();
        }
        return;
      }
      Alert.alert(title, message, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Continue', onPress: proceed },
      ]);
      return;
    }
    if (detectedPeople.length > 1 && selectedPersonIds.length === 0) {
      show('Pick at least one person to transform.', 'error');
      return;
    }

    // Premium-category gates, applied in strict order:
    //   1. Minor hard-block: premium mashups on a photo that contains
    //      anyone the detector flagged as under-18 is never allowed,
    //      regardless of subscription status. Server re-verifies.
    //   2. Paywall: non-Pro users hit the upsell first, same as before.
    //   3. Consent modal: once per session, confirm they have the rights
    //      and intent to re-mix the depicted person's likeness.
    // The order matters — we don't want a non-Pro user acknowledging
    // consent and then hitting the paywall, and we don't want any user
    // paying for Pro only to discover the minor block after.
    if (category.isPremium) {
      if (containsMinor) {
        show(
          "Ethnicity-blend transformations aren't available when the photo includes a minor.",
          'error',
        );
        return;
      }
      if (!isPro) {
        showPaywall();
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
    const trend = pendingTrend;
    setPendingCategoryId(null);
    setPendingTrend(null);
    if (trend) {
      startTrendGeneration(trend);
    } else if (id) {
      navigateToCategory(id);
    }
  };

  const handleConsentClose = () => {
    setConsentVisible(false);
    setPendingCategoryId(null);
    setPendingTrend(null);
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
        <Text style={styles.logo}>Me <Text style={styles.logoAccent}>But</Text></Text>
        <GenerationCounter />
      </View>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefreshTrends}
            tintColor={colors.accent}
            colors={[colors.accent]}
          />
        }
      >
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

        {/* Trending This Week carousel — remote-updatable from Firestore,
            rendered above the photo uploader so users see the hook
            first. Empty list (no trends published or all out-of-window)
            renders nothing; the rest of the home screen is unchanged. */}
        <TrendingCarousel
          trends={visibleTrends}
          isPro={isPro}
          onSelect={handleTrendSelect}
        />

        <PhotoUploader image={image} onPicked={handlePicked} />

        {image && detectionStatus === 'detecting' ? (
          <View style={styles.statusRow}>
            <ScanLine width={28} height={3} />
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
              accessibilityRole="button"
              accessibilityLabel="Retry people detection"
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
