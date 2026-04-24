import { useCallback } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { useGenerationStore, type GenerationSlot } from '@/stores/generationStore';
import { useSubscriptionStore } from '@/stores/subscriptionStore';
import {
  streamGeneration,
  persistLocalGeneration,
  QuotaExceededError,
  type GenerationEvent,
  type GenerateResponseItem,
} from '@/lib/gemini';
import { config } from '@/constants/config';
import { getCategory } from '@/constants/categories';

export interface StartGenerationArgs {
  imageBase64: string;
  categoryId: string;
  subcategoryIds: string[];
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
): GenerationSlot[] {
  const category = getCategory(categoryId);
  return subcategoryIds.map((id, index) => {
    const sub = category?.subcategories.find((s) => s.id === id);
    return {
      index,
      subcategoryId: id,
      label: sub?.label ?? id,
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
    return userDoc.freeGenerationsUsed < config.freeGenerationCap;
  }, [isActive, userDoc]);

  const remaining = userDoc
    ? Math.max(0, config.freeGenerationCap - userDoc.freeGenerationsUsed)
    : 0;

  const start = useCallback(
    async ({
      imageBase64,
      categoryId,
      subcategoryIds,
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
      initSlots(buildInitialSlots(categoryId, subcategoryIds));

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
        const msg = e instanceof Error ? e.message : 'Generation failed.';
        setError(msg);
        // Any pending slots become failures so the user sees what went
        // wrong rather than an infinite spinner. We also invoke onReady
        // in case the error came before any events — the results screen
        // is a better place to show the error than the prior screen.
        const { generationSlots } = useGenerationStore.getState();
        for (const slot of generationSlots) {
          if (slot.status === 'pending') failSlot(slot.index, msg);
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

      // In local-dev mode, the route only returned data URIs; upload
      // them to Storage and write the Firestore generation doc so the
      // Gallery tab populates. In prod, the Cloud Function already
      // handled this server-side, so this is a no-op on the happy path
      // (persistLocalGeneration short-circuits when there's no auth).
      let finalResponse = { generationId, results };
      const { isLocalDev } = resolveIsLocalDev();
      if (isLocalDev && results.length > 0) {
        try {
          finalResponse = await persistLocalGeneration(req, finalResponse);
        } catch (e) {
          console.warn('[useGeneration] local persistence failed:', e);
        }
      }

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
            categoryLabel: category?.label ?? categoryId,
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

// Single source of truth for "are we hitting the local Expo Router route
// or a deployed Cloud Function" at the hook layer. Mirrors the check in
// lib/gemini.ts' resolveEndpoint so local-dev persistence logic only
// runs in local-dev. Kept here as a tiny helper because exporting it
// from gemini.ts just to avoid a 3-line duplicate felt like churn.
function resolveIsLocalDev(): { isLocalDev: boolean } {
  const base = config.cloudFunctions.baseURL?.trim();
  return { isLocalDev: !base };
}
