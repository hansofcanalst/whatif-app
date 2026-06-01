import { useCallback } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { useGenerationStore, type GenerationSlot } from '@/stores/generationStore';
import { useSubscriptionStore } from '@/stores/subscriptionStore';
import {
  streamGeneration,
  QuotaExceededError,
  GenerationHttpError,
  type GenerationEvent,
  type GenerateResponseItem,
} from '@/lib/gemini';
import { config } from '@/constants/config';
import { getCategory } from '@/constants/categories';

export interface StartGenerationArgs {
  imageBase64: string;
  categoryId: string;
  subcategoryIds: string[];
  // Optional opt-in styling add-ons. Keyed by subcategoryId, value is
  // the list of accessory ids the user ticked. Forwarded to the server
  // verbatim and resolved into prompt snippets there.
  modifiers?: Record<string, string[]>;
  // Remote-trend opt-in. When set the server uses the trend's
  // canonical promptTemplate (NEVER one we send). `categoryId` should
  // be 'trending' and `subcategoryIds` should be [trendId] when this
  // is used — the home screen builds the request that way. See
  // lib/trends.ts for the full security posture.
  trendId?: string;
  // Display label for the slot when a trend is selected. The slot
  // pre-renders from useGeneration; without this we'd fall back to
  // showing the trendId string on the pending tile.
  trendLabel?: string;
  onPaywall: () => void;
  // Invoked as soon as the server accepts the request and the NDJSON
  // stream has opened. The caller uses this to navigate to the results
  // screen BEFORE any results land, so the skeleton tiles render
  // immediately instead of after the full generation completes. If the
  // request is rejected up-front (auth, quota, 413), this is never
  // called and `start` resolves with null like before.
  onReady?: () => void;
}

/**
 * Resolve category subcategory metadata so we can pre-populate the slot
 * list with stable labels before any stream events arrive. Falls back to
 * the subcategoryId if the category isn't found (shouldn't happen — the
 * home screen is the only entry point and it always passes real ids).
 */
function buildInitialSlots(
  categoryId: string,
  subcategoryIds: string[],
  trendLabel: string | undefined,
): GenerationSlot[] {
  const category = getCategory(categoryId);
  return subcategoryIds.map((id, index) => {
    // For a trend generation, the single slot label comes from the
    // trend doc; the static category lookup misses (category 'trending'
    // isn't in CATEGORIES and shouldn't be) and we'd otherwise show
    // the raw trendId on the pending tile.
    const sub = category?.subcategories.find((s) => s.id === id);
    return {
      index,
      subcategoryId: id,
      label: sub?.label ?? trendLabel ?? id,
      status: 'pending' as const,
    };
  });
}

export function useGeneration() {
  const { user, userDoc } = useAuthStore();
  const { isActive } = useSubscriptionStore();
  const {
    setLoading,
    setError,
    setResults,
    appendLocalGeneration,
    initSlots,
    resolveSlot,
    failSlot,
    finishStream,
    clearSlots,
  } = useGenerationStore();

  const canGenerate = useCallback((): boolean => {
    if (isActive) return true;
    if (!userDoc) return false;
    return (userDoc.freeGenerationsUsed ?? 0) < config.freeGenerationCap;
  }, [isActive, userDoc]);

  const remaining = userDoc
    ? Math.max(0, config.freeGenerationCap - (userDoc.freeGenerationsUsed ?? 0))
    : 0;

  const start = useCallback(
    async ({
      imageBase64,
      categoryId,
      subcategoryIds,
      modifiers,
      trendId,
      trendLabel,
      onPaywall,
      onReady,
    }: StartGenerationArgs) => {
      if (!canGenerate()) {
        onPaywall();
        return null;
      }
      setLoading(true);
      setError(null);

      // Initialize the slot list and flip `generationInFlight` on before
      // we open the network socket. The results screen renders off this
      // list, so when the caller navigates in response to `onReady`, the
      // tiles are already there in a pending state.
      initSlots(buildInitialSlots(categoryId, subcategoryIds, trendLabel));

      // Pull selection from the store at call time so we always see the
      // latest user choice without threading it through every caller.
      const { detectedPeople, selectedPersonIds } = useGenerationStore.getState();
      const selectedPeopleLabels =
        detectedPeople.length > 1 && selectedPersonIds.length > 0
          ? detectedPeople
              .filter((p) => selectedPersonIds.includes(p.id))
              .map((p) => p.label)
          : undefined;
      // Forwarded to the server solely for the moderation_log entry.
      // The home screen hard-blocks premium categories when any person
      // is flagged under-18, so this should always be false for premium
      // generations that reach the endpoint — logging it lets us catch
      // bypass attempts after the fact.
      const containsMinor = detectedPeople.some((p) => p.appearsUnder18);

      const req = {
        imageBase64,
        category: categoryId,
        subcategoryIds,
        selectedPeopleLabels,
        totalPeopleInImage: detectedPeople.length || undefined,
        containsMinor,
        modifiers,
        // Forwarded verbatim to the server. The server fetches the
        // canonical prompt by id — sending the prompt itself is never
        // allowed and would be ignored anyway.
        trendId,
      };

      let generationId = '';
      let total = subcategoryIds.length;
      const resultsByIndex: Record<number, GenerateResponseItem> = {};
      let notifiedReady = false;

      const handleEvent = (ev: GenerationEvent) => {
        // Fire `onReady` on the very first event (`start` in happy-path,
        // any other if the server misbehaves). Past that point the
        // stream is alive and navigation is safe.
        if (!notifiedReady) {
          notifiedReady = true;
          onReady?.();
        }
        if (ev.type === 'start') {
          generationId = ev.generationId;
          total = ev.total;
          // Publish the id now so completed tiles are tappable even
          // before the whole stream finishes. currentResults stays
          // empty until aggregation — the results screen renders from
          // `generationSlots` while the stream is open.
          setResults(ev.generationId, []);
        } else if (ev.type === 'result') {
          resultsByIndex[ev.index] = ev.item;
          resolveSlot(ev.index, ev.item);
        } else if (ev.type === 'error') {
          failSlot(ev.index, ev.message);
        } else if (ev.type === 'done') {
          if (!generationId) generationId = ev.generationId;
        }
        // `fatal` is re-thrown by streamGeneration as an Error, so it
        // hits the catch below rather than needing handling here.
      };

      try {
        await streamGeneration(req, handleEvent);
      } catch (e) {
        finishStream();
        if (e instanceof QuotaExceededError) {
          // Drop the just-initialized slots so the results screen
          // doesn't flash skeletons on top of an unrelated paywall.
          clearSlots();
          setLoading(false);
          onPaywall();
          return null;
        }
        // Distinguish a policy refusal (HTTP 403 from the server-side
        // minor gate) from transient failures (5xx, network, fatal
        // events). A 403 is a deliberate, permanent refusal for this
        // photo + category combination — the results screen must mark
        // those slots as terminal so it does NOT offer Try Again, and
        // the user-facing message must not state or imply a minor was
        // detected. Everything else (5xx including the detection-gate
        // 503, network errors, fatal stream events) is transient and
        // keeps the existing retry affordance.
        const isTerminalRefusal =
          e instanceof GenerationHttpError && e.status === 403;
        const slotMessage = isTerminalRefusal
          ? "This transformation isn't available for this photo."
          : e instanceof Error
            ? e.message
            : 'Generation failed.';
        const slotKind: 'transient' | 'terminal' = isTerminalRefusal
          ? 'terminal'
          : 'transient';
        // Top-level error state is read by the picker screen's toast
        // when start() returns before navigation happens. On a 403 we
        // always navigate to /results (via onReady below) so the toast
        // path won't run, but if the request was rejected synchronously
        // before initSlots ever fired, the picker still wants a safe
        // string to show. Use the same neutral copy.
        setError(slotMessage);
        // Any pending slots become failures so the user sees what went
        // wrong rather than an infinite spinner. We also invoke onReady
        // in case the error came before any events — the results screen
        // is a better place to show the error than the prior screen.
        const { generationSlots } = useGenerationStore.getState();
        for (const slot of generationSlots) {
          if (slot.status === 'pending') failSlot(slot.index, slotMessage, slotKind);
        }
        if (!notifiedReady) {
          notifiedReady = true;
          onReady?.();
        }
        setLoading(false);
        return null;
      }

      finishStream();

      // Reassemble aggregated response for persistence + legacy callers.
      const results: GenerateResponseItem[] = [];
      for (let i = 0; i < total; i++) {
        if (resultsByIndex[i]) results.push(resultsByIndex[i]);
      }

      // Local-dev does NOT mirror to Firestore / Storage / users-doc
      // from the client anymore — the deployed rules deny all three
      // (see lib/gemini.ts comment near streamGeneration's local-dev
      // branch). Results are displayed in-session from the data URIs
      // returned by the streaming endpoint and persisted to the
      // AsyncStorage-backed gallery below. For a production-grade
      // Firestore + Storage trail, deploy the Cloud Function and
      // set EXPO_PUBLIC_CLOUD_FUNCTIONS_URL.
      const finalResponse = { generationId, results };

      setResults(finalResponse.generationId, finalResponse.results);

      // Persist to the AsyncStorage-backed gallery. Fire-and-forget:
      // failures are logged inside appendLocalGallery but should never
      // break the happy path — the user already has their results.
      if (finalResponse.results.length > 0) {
        try {
          const category = getCategory(categoryId);
          const originalImageURL = `data:image/jpeg;base64,${imageBase64}`;
          await appendLocalGeneration({
            generationId: finalResponse.generationId,
            userId: user?.uid ?? null,
            categoryId,
            // Trend generations have no entry in the static catalog,
            // so the Gallery falls back to the trend's display label
            // (e.g. "1970s Disco") before resorting to the raw id.
            categoryLabel: category?.label ?? trendLabel ?? categoryId,
            originalImageURL,
            results: finalResponse.results,
          });
        } catch (persistErr) {
          console.warn('[useGeneration] local gallery persist failed', persistErr);
        }
      } else {
        // All slots failed. Surface a summary error for the results screen.
        setError("This one didn't work out — try a different photo or category.");
      }

      setLoading(false);
      return finalResponse;
    },
    [
      canGenerate,
      setLoading,
      setError,
      setResults,
      appendLocalGeneration,
      initSlots,
      resolveSlot,
      failSlot,
      finishStream,
      clearSlots,
      user,
    ],
  );

  return { start, canGenerate, remaining, isPro: isActive };
}
